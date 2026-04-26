#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol, Vec};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SplitterError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidShares = 4,
    NothingToWithdraw = 5,
    BelowMinimum = 6,
    WithdrawalsLocked = 7,
    RecipientNotFound = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Recipient {
    pub address: Address,
    pub shares: u32, // proportional shares out of total_shares
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitterConfig {
    pub admin: Address,
    pub token: Address,
    pub total_shares: u32,
    pub min_withdrawal: i128,
    pub locked: bool,
}

const CONFIG: Symbol = symbol_short!("CONFIG");
const RECIPIENTS: Symbol = symbol_short!("RECIPS");
const BALANCE: Symbol = symbol_short!("BALANCE");
const WITHDRAWN: Symbol = symbol_short!("WTHDRWN");

#[contract]
pub struct PaymentSplitter;

#[contractimpl]
impl PaymentSplitter {
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        recipients: Vec<Recipient>,
        min_withdrawal: i128,
    ) -> Result<(), SplitterError> {
        if env.storage().instance().has(&CONFIG) {
            return Err(SplitterError::AlreadyInitialized);
        }
        if recipients.is_empty() {
            return Err(SplitterError::InvalidShares);
        }

        let mut total_shares: u32 = 0;
        for r in recipients.iter() {
            if r.shares == 0 {
                return Err(SplitterError::InvalidShares);
            }
            total_shares += r.shares;
        }

        env.storage().instance().set(&CONFIG, &SplitterConfig {
            admin,
            token,
            total_shares,
            min_withdrawal,
            locked: false,
        });
        env.storage().instance().set(&RECIPIENTS, &recipients);
        env.storage().instance().set(&BALANCE, &0i128);
        Ok(())
    }

    /// Deposit tokens into the splitter
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), SplitterError> {
        from.require_auth();
        let config: SplitterConfig = env.storage().instance().get(&CONFIG).ok_or(SplitterError::NotInitialized)?;

        token::Client::new(&env, &config.token)
            .transfer(&from, &env.current_contract_address(), &amount);

        let bal: i128 = env.storage().instance().get(&BALANCE).unwrap_or(0);
        env.storage().instance().set(&BALANCE, &(bal + amount));
        Ok(())
    }

    /// Recipient withdraws their proportional share of accumulated balance
    pub fn withdraw(env: Env, recipient: Address) -> Result<i128, SplitterError> {
        recipient.require_auth();
        let config: SplitterConfig = env.storage().instance().get(&CONFIG).ok_or(SplitterError::NotInitialized)?;
        if config.locked {
            return Err(SplitterError::WithdrawalsLocked);
        }

        let recipients: Vec<Recipient> = env.storage().instance().get(&RECIPIENTS).ok_or(SplitterError::NotInitialized)?;
        let rec = recipients.iter().find(|r| r.address == recipient).ok_or(SplitterError::RecipientNotFound)?;

        let total_deposited: i128 = env.storage().instance().get(&BALANCE).unwrap_or(0);
        let already_withdrawn: i128 = env.storage().instance().get(&(WITHDRAWN, recipient.clone())).unwrap_or(0);

        let entitled = total_deposited * rec.shares as i128 / config.total_shares as i128;
        let available = entitled - already_withdrawn;

        if available <= 0 {
            return Err(SplitterError::NothingToWithdraw);
        }
        if available < config.min_withdrawal {
            return Err(SplitterError::BelowMinimum);
        }

        env.storage().instance().set(&(WITHDRAWN, recipient.clone()), &(already_withdrawn + available));

        token::Client::new(&env, &config.token)
            .transfer(&env.current_contract_address(), &recipient, &available);

        Ok(available)
    }

    /// Admin locks/unlocks withdrawals
    pub fn set_locked(env: Env, locked: bool) -> Result<(), SplitterError> {
        let mut config: SplitterConfig = env.storage().instance().get(&CONFIG).ok_or(SplitterError::NotInitialized)?;
        config.admin.require_auth();
        config.locked = locked;
        env.storage().instance().set(&CONFIG, &config);
        Ok(())
    }

    pub fn pending(env: Env, recipient: Address) -> i128 {
        let config: SplitterConfig = match env.storage().instance().get(&CONFIG) {
            Some(c) => c,
            None => return 0,
        };
        let recipients: Vec<Recipient> = match env.storage().instance().get(&RECIPIENTS) {
            Some(r) => r,
            None => return 0,
        };
        let rec = match recipients.iter().find(|r| r.address == recipient) {
            Some(r) => r,
            None => return 0,
        };
        let total: i128 = env.storage().instance().get(&BALANCE).unwrap_or(0);
        let withdrawn: i128 = env.storage().instance().get(&(WITHDRAWN, recipient)).unwrap_or(0);
        let entitled = total * rec.shares as i128 / config.total_shares as i128;
        (entitled - withdrawn).max(0)
    }

    pub fn get_config(env: Env) -> Result<SplitterConfig, SplitterError> {
        env.storage().instance().get(&CONFIG).ok_or(SplitterError::NotInitialized)
    }
}
