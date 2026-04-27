#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StakingError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    NothingStaked = 5,
    LockupNotExpired = 6,
    InsufficientBalance = 7,
    EarlyWithdrawPenalty = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolConfig {
    pub stake_token: Address,
    pub reward_token: Address,
    pub reward_rate_bps: u32,   // annual reward rate in basis points
    pub lockup_period: u64,     // seconds
    pub early_penalty_bps: u32, // penalty for early withdrawal in bps
    pub admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeInfo {
    pub amount: i128,
    pub staked_at: u64,
    pub last_claim_at: u64,
    pub accumulated_rewards: i128,
}

const CONFIG: Symbol = symbol_short!("CONFIG");
const TOTAL_STAKED: Symbol = symbol_short!("TOT_STAKE");
const STAKE: Symbol = symbol_short!("STAKE");

#[contract]
pub struct StakingPool;

#[contractimpl]
impl StakingPool {
    pub fn initialize(
        env: Env,
        stake_token: Address,
        reward_token: Address,
        reward_rate_bps: u32,
        lockup_period: u64,
        early_penalty_bps: u32,
        admin: Address,
    ) -> Result<(), StakingError> {
        if env.storage().instance().has(&CONFIG) {
            return Err(StakingError::AlreadyInitialized);
        }

        let config = PoolConfig { stake_token, reward_token, reward_rate_bps, lockup_period, early_penalty_bps, admin };
        env.storage().instance().set(&CONFIG, &config);
        env.storage().instance().set(&TOTAL_STAKED, &0i128);
        Ok(())
    }

    /// Stake tokens into the pool
    pub fn stake(env: Env, staker: Address, amount: i128) -> Result<(), StakingError> {
        staker.require_auth();
        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }
        let config: PoolConfig = env.storage().instance().get(&CONFIG).ok_or(StakingError::NotInitialized)?;

        // Settle pending rewards before modifying stake
        let mut info = Self::get_or_default_stake(&env, &staker);
        let now = env.ledger().timestamp();
        info.accumulated_rewards += Self::calc_rewards(&info, &config, now);
        info.last_claim_at = now;
        info.amount += amount;
        if info.staked_at == 0 {
            info.staked_at = now;
        }

        token::Client::new(&env, &config.stake_token)
            .transfer(&staker, &env.current_contract_address(), &amount);

        let total: i128 = env.storage().instance().get(&TOTAL_STAKED).unwrap_or(0);
        env.storage().instance().set(&TOTAL_STAKED, &(total + amount));
        env.storage().instance().set(&(STAKE, staker), &info);
        Ok(())
    }

    /// Unstake tokens; applies penalty if lockup not expired
    pub fn unstake(env: Env, staker: Address, amount: i128, force: bool) -> Result<(), StakingError> {
        staker.require_auth();
        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }
        let config: PoolConfig = env.storage().instance().get(&CONFIG).ok_or(StakingError::NotInitialized)?;
        let mut info: StakeInfo = env.storage().instance().get(&(STAKE, staker.clone())).ok_or(StakingError::NothingStaked)?;

        if amount > info.amount {
            return Err(StakingError::InsufficientBalance);
        }

        let now = env.ledger().timestamp();
        let locked_until = info.staked_at + config.lockup_period;
        let early = now < locked_until;

        if early && !force {
            return Err(StakingError::LockupNotExpired);
        }

        // Settle rewards
        info.accumulated_rewards += Self::calc_rewards(&info, &config, now);
        info.last_claim_at = now;
        info.amount -= amount;

        let mut payout = amount;
        if early {
            let penalty = amount * config.early_penalty_bps as i128 / 10000;
            payout -= penalty;
            // Penalty stays in contract as reserve
        }

        token::Client::new(&env, &config.stake_token)
            .transfer(&env.current_contract_address(), &staker, &payout);

        let total: i128 = env.storage().instance().get(&TOTAL_STAKED).unwrap_or(0);
        env.storage().instance().set(&TOTAL_STAKED, &(total - amount));
        env.storage().instance().set(&(STAKE, staker), &info);
        Ok(())
    }

    /// Claim accumulated rewards with compound option
    pub fn claim_rewards(env: Env, staker: Address, compound: bool) -> Result<i128, StakingError> {
        staker.require_auth();
        let config: PoolConfig = env.storage().instance().get(&CONFIG).ok_or(StakingError::NotInitialized)?;
        let mut info: StakeInfo = env.storage().instance().get(&(STAKE, staker.clone())).ok_or(StakingError::NothingStaked)?;

        let now = env.ledger().timestamp();
        let rewards = info.accumulated_rewards + Self::calc_rewards(&info, &config, now);
        if rewards <= 0 {
            return Ok(0);
        }

        info.accumulated_rewards = 0;
        info.last_claim_at = now;

        if compound && config.stake_token == config.reward_token {
            info.amount += rewards;
            let total: i128 = env.storage().instance().get(&TOTAL_STAKED).unwrap_or(0);
            env.storage().instance().set(&TOTAL_STAKED, &(total + rewards));
        } else {
            token::Client::new(&env, &config.reward_token)
                .transfer(&env.current_contract_address(), &staker, &rewards);
        }

        env.storage().instance().set(&(STAKE, staker), &info);
        Ok(rewards)
    }

    pub fn get_stake(env: Env, staker: Address) -> Option<StakeInfo> {
        env.storage().instance().get(&(STAKE, staker))
    }

    pub fn get_total_staked(env: Env) -> i128 {
        env.storage().instance().get(&TOTAL_STAKED).unwrap_or(0)
    }

    pub fn pending_rewards(env: Env, staker: Address) -> i128 {
        let config: PoolConfig = match env.storage().instance().get(&CONFIG) {
            Some(c) => c,
            None => return 0,
        };
        let info: StakeInfo = match env.storage().instance().get(&(STAKE, staker)) {
            Some(i) => i,
            None => return 0,
        };
        info.accumulated_rewards + Self::calc_rewards(&info, &config, env.ledger().timestamp())
    }

    fn get_or_default_stake(env: &Env, staker: &Address) -> StakeInfo {
        env.storage().instance().get(&(STAKE, staker.clone())).unwrap_or(StakeInfo {
            amount: 0,
            staked_at: 0,
            last_claim_at: 0,
            accumulated_rewards: 0,
        })
    }

    /// Simple linear reward: amount * rate_bps / 10000 * elapsed_seconds / seconds_per_year
    fn calc_rewards(info: &StakeInfo, config: &PoolConfig, now: u64) -> i128 {
        if info.amount == 0 || info.last_claim_at == 0 {
            return 0;
        }
        let elapsed = now.saturating_sub(info.last_claim_at) as i128;
        const SECONDS_PER_YEAR: i128 = 31_536_000;
        info.amount * config.reward_rate_bps as i128 * elapsed / 10000 / SECONDS_PER_YEAR
    }
}
