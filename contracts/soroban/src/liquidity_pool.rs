#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PoolError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientLiquidity = 4,
    SlippageExceeded = 5,
    ZeroLiquidity = 6,
    InsufficientShares = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolConfig {
    pub token_a: Address,
    pub token_b: Address,
    pub fee_bps: u32,
    pub admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolState {
    pub reserve_a: i128,
    pub reserve_b: i128,
    pub total_shares: i128,
    pub fees_a: i128, // accumulated fees in token_a
    pub fees_b: i128,
}

const CONFIG: Symbol = symbol_short!("CONFIG");
const STATE: Symbol = symbol_short!("STATE");
const SHARES: Symbol = symbol_short!("SHARES");
const IL_TRACK: Symbol = symbol_short!("IL_TRACK"); // impermanent loss tracking per LP

#[contract]
pub struct LiquidityPool;

#[contractimpl]
impl LiquidityPool {
    pub fn initialize(env: Env, admin: Address, token_a: Address, token_b: Address, fee_bps: u32) -> Result<(), PoolError> {
        if env.storage().instance().has(&CONFIG) {
            return Err(PoolError::AlreadyInitialized);
        }
        env.storage().instance().set(&CONFIG, &PoolConfig { token_a, token_b, fee_bps, admin });
        env.storage().instance().set(&STATE, &PoolState { reserve_a: 0, reserve_b: 0, total_shares: 0, fees_a: 0, fees_b: 0 });
        Ok(())
    }

    /// Add liquidity; returns LP shares minted
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
        min_shares: i128,
    ) -> Result<i128, PoolError> {
        provider.require_auth();
        if amount_a <= 0 || amount_b <= 0 {
            return Err(PoolError::InvalidAmount);
        }
        let config: PoolConfig = env.storage().instance().get(&CONFIG).ok_or(PoolError::NotInitialized)?;
        let mut state: PoolState = env.storage().instance().get(&STATE).ok_or(PoolError::NotInitialized)?;

        let shares = if state.total_shares == 0 {
            // Initial liquidity: shares = sqrt(a * b) approximated as geometric mean
            Self::sqrt(amount_a * amount_b)
        } else {
            // Proportional to existing reserves
            let shares_a = amount_a * state.total_shares / state.reserve_a;
            let shares_b = amount_b * state.total_shares / state.reserve_b;
            shares_a.min(shares_b)
        };

        if shares < min_shares {
            return Err(PoolError::SlippageExceeded);
        }

        token::Client::new(&env, &config.token_a).transfer(&provider, &env.current_contract_address(), &amount_a);
        token::Client::new(&env, &config.token_b).transfer(&provider, &env.current_contract_address(), &amount_b);

        state.reserve_a += amount_a;
        state.reserve_b += amount_b;
        state.total_shares += shares;

        let provider_shares: i128 = env.storage().instance().get(&(SHARES, provider.clone())).unwrap_or(0);
        env.storage().instance().set(&(SHARES, provider.clone()), &(provider_shares + shares));

        // Record entry price ratio for IL tracking (reserve_a / reserve_b * 1e9)
        let entry_ratio = amount_a * 1_000_000_000 / amount_b;
        env.storage().instance().set(&(IL_TRACK, provider), &entry_ratio);

        env.storage().instance().set(&STATE, &state);
        Ok(shares)
    }

    /// Remove liquidity; returns (amount_a, amount_b) returned
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        shares: i128,
        min_a: i128,
        min_b: i128,
    ) -> Result<(i128, i128), PoolError> {
        provider.require_auth();
        if shares <= 0 {
            return Err(PoolError::InvalidAmount);
        }
        let config: PoolConfig = env.storage().instance().get(&CONFIG).ok_or(PoolError::NotInitialized)?;
        let mut state: PoolState = env.storage().instance().get(&STATE).ok_or(PoolError::NotInitialized)?;

        let provider_shares: i128 = env.storage().instance().get(&(SHARES, provider.clone())).unwrap_or(0);
        if shares > provider_shares {
            return Err(PoolError::InsufficientShares);
        }

        let amount_a = shares * state.reserve_a / state.total_shares;
        let amount_b = shares * state.reserve_b / state.total_shares;

        if amount_a < min_a || amount_b < min_b {
            return Err(PoolError::SlippageExceeded);
        }

        state.reserve_a -= amount_a;
        state.reserve_b -= amount_b;
        state.total_shares -= shares;

        env.storage().instance().set(&(SHARES, provider.clone()), &(provider_shares - shares));
        env.storage().instance().set(&STATE, &state);

        token::Client::new(&env, &config.token_a).transfer(&env.current_contract_address(), &provider, &amount_a);
        token::Client::new(&env, &config.token_b).transfer(&env.current_contract_address(), &provider, &amount_b);

        Ok((amount_a, amount_b))
    }

    /// Swap token_a for token_b (or vice versa); returns amount out
    pub fn swap(
        env: Env,
        trader: Address,
        token_in: Address,
        amount_in: i128,
        min_out: i128,
    ) -> Result<i128, PoolError> {
        trader.require_auth();
        if amount_in <= 0 {
            return Err(PoolError::InvalidAmount);
        }
        let config: PoolConfig = env.storage().instance().get(&CONFIG).ok_or(PoolError::NotInitialized)?;
        let mut state: PoolState = env.storage().instance().get(&STATE).ok_or(PoolError::NotInitialized)?;

        if state.reserve_a == 0 || state.reserve_b == 0 {
            return Err(PoolError::ZeroLiquidity);
        }

        let fee = amount_in * config.fee_bps as i128 / 10000;
        let amount_in_after_fee = amount_in - fee;

        let (reserve_in, reserve_out, token_out) = if token_in == config.token_a {
            (state.reserve_a, state.reserve_b, config.token_b.clone())
        } else {
            (state.reserve_b, state.reserve_a, config.token_a.clone())
        };

        // Constant product: (x + dx)(y - dy) = xy  =>  dy = y*dx / (x + dx)
        let amount_out = reserve_out * amount_in_after_fee / (reserve_in + amount_in_after_fee);

        if amount_out < min_out {
            return Err(PoolError::SlippageExceeded);
        }

        token::Client::new(&env, &token_in).transfer(&trader, &env.current_contract_address(), &amount_in);
        token::Client::new(&env, &token_out).transfer(&env.current_contract_address(), &trader, &amount_out);

        if token_in == config.token_a {
            state.reserve_a += amount_in;
            state.reserve_b -= amount_out;
            state.fees_a += fee;
        } else {
            state.reserve_b += amount_in;
            state.reserve_a -= amount_out;
            state.fees_b += fee;
        }

        env.storage().instance().set(&STATE, &state);
        Ok(amount_out)
    }

    /// Returns impermanent loss in bps for a provider (current vs entry ratio)
    pub fn impermanent_loss_bps(env: Env, provider: Address) -> i128 {
        let state: PoolState = match env.storage().instance().get(&STATE) {
            Some(s) => s,
            None => return 0,
        };
        let entry_ratio: i128 = match env.storage().instance().get(&(IL_TRACK, provider)) {
            Some(r) => r,
            None => return 0,
        };
        if state.reserve_b == 0 || entry_ratio == 0 {
            return 0;
        }
        let current_ratio = state.reserve_a * 1_000_000_000 / state.reserve_b;
        // IL = 2*sqrt(r)/(1+r) - 1 where r = current/entry
        // Approximated as: IL_bps ≈ (r - 1)^2 / (2 * r) * 10000 for small deviations
        let r = current_ratio * 10000 / entry_ratio; // r in bps units (10000 = 1.0)
        if r == 10000 {
            return 0;
        }
        let diff = r - 10000;
        diff * diff / (2 * r)
    }

    pub fn get_state(env: Env) -> Result<PoolState, PoolError> {
        env.storage().instance().get(&STATE).ok_or(PoolError::NotInitialized)
    }

    pub fn get_shares(env: Env, provider: Address) -> i128 {
        env.storage().instance().get(&(SHARES, provider)).unwrap_or(0)
    }

    fn sqrt(n: i128) -> i128 {
        if n <= 0 { return 0; }
        let mut x = n;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + n / x) / 2;
        }
        x
    }
}
