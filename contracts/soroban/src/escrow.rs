#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Symbol, Vec};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidState = 5,
    DisputeAlreadyOpen = 6,
    NoDisputeOpen = 7,
    ArbitratorAlreadyVoted = 8,
    InsufficientArbitratorVotes = 9,
    EscrowNotExpired = 10,
    EscrowExpired = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Pending,
    Funded,
    Disputed,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowData {
    pub depositor: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub amount: i128,
    pub fee_bps: u32,
    pub state: EscrowState,
    pub created_at: u64,
    pub release_after: u64,
    pub arbitrators: Vec<Address>,
    pub required_votes: u32,
    pub release_votes: u32,
    pub refund_votes: u32,
}

const ESCROW: Symbol = symbol_short!("ESCROW");
const VOTED: Symbol = symbol_short!("VOTED");
const FEE_COLLECTOR: Symbol = symbol_short!("FEE_COL");

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize escrow between depositor and beneficiary with optional arbitrators
    pub fn initialize(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
        fee_bps: u32,
        release_after: u64,
        arbitrators: Vec<Address>,
        required_votes: u32,
        fee_collector: Address,
    ) -> Result<(), EscrowError> {
        if env.storage().instance().has(&ESCROW) {
            return Err(EscrowError::AlreadyInitialized);
        }
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let escrow = EscrowData {
            depositor,
            beneficiary,
            token,
            amount,
            fee_bps,
            state: EscrowState::Pending,
            created_at: env.ledger().timestamp(),
            release_after,
            arbitrators,
            required_votes,
            release_votes: 0,
            refund_votes: 0,
        };

        env.storage().instance().set(&ESCROW, &escrow);
        env.storage().instance().set(&FEE_COLLECTOR, &fee_collector);
        Ok(())
    }

    /// Depositor funds the escrow
    pub fn fund(env: Env) -> Result<(), EscrowError> {
        let mut escrow: EscrowData = env.storage().instance().get(&ESCROW).ok_or(EscrowError::NotInitialized)?;
        if !matches!(escrow.state, EscrowState::Pending) {
            return Err(EscrowError::InvalidState);
        }

        escrow.depositor.require_auth();

        let client = token::Client::new(&env, &escrow.token);
        client.transfer(&escrow.depositor, &env.current_contract_address(), &escrow.amount);

        escrow.state = EscrowState::Funded;
        env.storage().instance().set(&ESCROW, &escrow);
        Ok(())
    }

    /// Release funds to beneficiary (depositor or auto-release after timeout)
    pub fn release(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();
        let mut escrow: EscrowData = env.storage().instance().get(&ESCROW).ok_or(EscrowError::NotInitialized)?;
        if !matches!(escrow.state, EscrowState::Funded) {
            return Err(EscrowError::InvalidState);
        }

        let now = env.ledger().timestamp();
        let is_depositor = caller == escrow.depositor;
        let is_auto_release = now >= escrow.release_after;

        if !is_depositor && !is_auto_release {
            return Err(EscrowError::Unauthorized);
        }

        Self::pay_out(&env, &escrow, true)?;
        escrow.state = EscrowState::Released;
        env.storage().instance().set(&ESCROW, &escrow);
        Ok(())
    }

    /// Open a dispute (depositor or beneficiary)
    pub fn dispute(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();
        let mut escrow: EscrowData = env.storage().instance().get(&ESCROW).ok_or(EscrowError::NotInitialized)?;
        if !matches!(escrow.state, EscrowState::Funded) {
            return Err(EscrowError::InvalidState);
        }
        if caller != escrow.depositor && caller != escrow.beneficiary {
            return Err(EscrowError::Unauthorized);
        }
        if env.ledger().timestamp() >= escrow.release_after {
            return Err(EscrowError::EscrowExpired);
        }

        escrow.state = EscrowState::Disputed;
        env.storage().instance().set(&ESCROW, &escrow);
        Ok(())
    }

    /// Arbitrator votes to release or refund
    pub fn arbitrate(env: Env, arbitrator: Address, release: bool) -> Result<(), EscrowError> {
        arbitrator.require_auth();
        let mut escrow: EscrowData = env.storage().instance().get(&ESCROW).ok_or(EscrowError::NotInitialized)?;
        if !matches!(escrow.state, EscrowState::Disputed) {
            return Err(EscrowError::NoDisputeOpen);
        }

        // Check arbitrator is in the list
        if !escrow.arbitrators.contains(&arbitrator) {
            return Err(EscrowError::Unauthorized);
        }

        // Check not already voted
        let vote_key = (VOTED, arbitrator.clone());
        if env.storage().instance().has(&vote_key) {
            return Err(EscrowError::ArbitratorAlreadyVoted);
        }
        env.storage().instance().set(&vote_key, &true);

        if release {
            escrow.release_votes += 1;
        } else {
            escrow.refund_votes += 1;
        }

        if escrow.release_votes >= escrow.required_votes {
            Self::pay_out(&env, &escrow, true)?;
            escrow.state = EscrowState::Released;
        } else if escrow.refund_votes >= escrow.required_votes {
            Self::pay_out(&env, &escrow, false)?;
            escrow.state = EscrowState::Refunded;
        }

        env.storage().instance().set(&ESCROW, &escrow);
        Ok(())
    }

    /// Refund depositor if release_after has passed without release
    pub fn refund_expired(env: Env) -> Result<(), EscrowError> {
        let mut escrow: EscrowData = env.storage().instance().get(&ESCROW).ok_or(EscrowError::NotInitialized)?;
        if !matches!(escrow.state, EscrowState::Funded) {
            return Err(EscrowError::InvalidState);
        }
        if env.ledger().timestamp() < escrow.release_after {
            return Err(EscrowError::EscrowNotExpired);
        }

        Self::pay_out(&env, &escrow, false)?;
        escrow.state = EscrowState::Refunded;
        env.storage().instance().set(&ESCROW, &escrow);
        Ok(())
    }

    pub fn get_escrow(env: Env) -> Result<EscrowData, EscrowError> {
        env.storage().instance().get(&ESCROW).ok_or(EscrowError::NotInitialized)
    }

    fn pay_out(env: &Env, escrow: &EscrowData, to_beneficiary: bool) -> Result<(), EscrowError> {
        let client = token::Client::new(env, &escrow.token);
        let fee = escrow.amount * escrow.fee_bps as i128 / 10000;
        let net = escrow.amount - fee;

        if fee > 0 {
            let fee_collector: Address = env.storage().instance().get(&FEE_COLLECTOR).ok_or(EscrowError::NotInitialized)?;
            client.transfer(&env.current_contract_address(), &fee_collector, &fee);
        }

        let recipient = if to_beneficiary { &escrow.beneficiary } else { &escrow.depositor };
        client.transfer(&env.current_contract_address(), recipient, &net);
        Ok(())
    }
}
