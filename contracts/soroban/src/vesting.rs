#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VestingError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    CliffNotReached = 4,
    NothingToRelease = 5,
    AlreadyRevoked = 6,
    NotRevocable = 7,
    InvalidSchedule = 8,
    MilestoneNotMet = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSchedule {
    pub beneficiary: Address,
    pub token: Address,
    pub total_amount: i128,
    pub released: i128,
    pub start: u64,
    pub cliff: u64,       // seconds after start before any tokens vest
    pub duration: u64,    // total vesting duration in seconds
    pub revocable: bool,
    pub revoked: bool,
    pub admin: Address,
    /// milestone_amount: if > 0, each release requires admin to set milestone_met
    pub milestone_amount: i128,
    pub milestone_met: bool,
}

const SCHEDULE: Symbol = symbol_short!("SCHEDULE");

#[contract]
pub struct VestingContract;

#[contractimpl]
impl VestingContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        beneficiary: Address,
        token: Address,
        total_amount: i128,
        start: u64,
        cliff: u64,
        duration: u64,
        revocable: bool,
        milestone_amount: i128,
    ) -> Result<(), VestingError> {
        if env.storage().instance().has(&SCHEDULE) {
            return Err(VestingError::AlreadyInitialized);
        }
        if duration == 0 || total_amount <= 0 || cliff > duration {
            return Err(VestingError::InvalidSchedule);
        }
        admin.require_auth();

        token::Client::new(&env, &token)
            .transfer(&admin, &env.current_contract_address(), &total_amount);

        env.storage().instance().set(&SCHEDULE, &VestingSchedule {
            beneficiary,
            token,
            total_amount,
            released: 0,
            start,
            cliff,
            duration,
            revocable,
            revoked: false,
            admin,
            milestone_amount,
            milestone_met: false,
        });
        Ok(())
    }

    /// Release vested tokens to beneficiary
    pub fn release(env: Env) -> Result<i128, VestingError> {
        let mut s: VestingSchedule = env.storage().instance().get(&SCHEDULE).ok_or(VestingError::NotInitialized)?;
        if s.revoked {
            return Err(VestingError::AlreadyRevoked);
        }

        let now = env.ledger().timestamp();
        if now < s.start + s.cliff {
            return Err(VestingError::CliffNotReached);
        }

        let vested = Self::vested_amount(&s, now);
        let releasable = vested - s.released;
        if releasable <= 0 {
            return Err(VestingError::NothingToRelease);
        }

        // Milestone check: if milestone_amount set, each tranche requires milestone_met
        if s.milestone_amount > 0 && !s.milestone_met {
            return Err(VestingError::MilestoneNotMet);
        }

        let payout = if s.milestone_amount > 0 {
            releasable.min(s.milestone_amount)
        } else {
            releasable
        };

        s.released += payout;
        if s.milestone_amount > 0 {
            s.milestone_met = false; // reset for next milestone
        }

        token::Client::new(&env, &s.token)
            .transfer(&env.current_contract_address(), &s.beneficiary, &payout);

        env.storage().instance().set(&SCHEDULE, &s);
        Ok(payout)
    }

    /// Admin marks milestone as met
    pub fn set_milestone_met(env: Env) -> Result<(), VestingError> {
        let mut s: VestingSchedule = env.storage().instance().get(&SCHEDULE).ok_or(VestingError::NotInitialized)?;
        s.admin.require_auth();
        s.milestone_met = true;
        env.storage().instance().set(&SCHEDULE, &s);
        Ok(())
    }

    /// Admin revokes vesting; unreleased tokens return to admin
    pub fn revoke(env: Env) -> Result<(), VestingError> {
        let mut s: VestingSchedule = env.storage().instance().get(&SCHEDULE).ok_or(VestingError::NotInitialized)?;
        s.admin.require_auth();
        if !s.revocable {
            return Err(VestingError::NotRevocable);
        }
        if s.revoked {
            return Err(VestingError::AlreadyRevoked);
        }

        let now = env.ledger().timestamp();
        let vested = Self::vested_amount(&s, now);
        let releasable = vested - s.released;

        // Release what's vested to beneficiary
        if releasable > 0 {
            s.released += releasable;
            token::Client::new(&env, &s.token)
                .transfer(&env.current_contract_address(), &s.beneficiary, &releasable);
        }

        // Return remainder to admin
        let remainder = s.total_amount - s.released;
        if remainder > 0 {
            token::Client::new(&env, &s.token)
                .transfer(&env.current_contract_address(), &s.admin, &remainder);
        }

        s.revoked = true;
        env.storage().instance().set(&SCHEDULE, &s);
        Ok(())
    }

    pub fn get_schedule(env: Env) -> Result<VestingSchedule, VestingError> {
        env.storage().instance().get(&SCHEDULE).ok_or(VestingError::NotInitialized)
    }

    pub fn vested(env: Env) -> i128 {
        match env.storage().instance().get::<_, VestingSchedule>(&SCHEDULE) {
            Some(s) => Self::vested_amount(&s, env.ledger().timestamp()),
            None => 0,
        }
    }

    fn vested_amount(s: &VestingSchedule, now: u64) -> i128 {
        if now < s.start + s.cliff {
            return 0;
        }
        let elapsed = now.saturating_sub(s.start) as i128;
        let duration = s.duration as i128;
        if elapsed >= duration {
            s.total_amount
        } else {
            s.total_amount * elapsed / duration
        }
    }
}
