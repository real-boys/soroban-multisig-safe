#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, env, panic, symbol_short, token, Address,
    Bytes, Env, IntoVal, Map, Symbol, Vec,
};


#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[contracterror]
pub enum TreasuryError {
    /// Unauthorized access - caller is not a treasury manager
    Unauthorized = 1,
    /// Insufficient treasury balance
    InsufficientBalance = 2,
    /// Withdrawal limit exceeded
    WithdrawalLimitExceeded = 3,
    /// Time-lock period not expired
    TimeLockNotExpired = 4,
    /// Proposal already exists
    ProposalAlreadyExists = 5,
    /// Proposal does not exist
    ProposalDoesNotExist = 6,
    /// Proposal already expired
    ProposalExpired = 7,
    /// Proposal already executed
    ProposalAlreadyExecuted = 8,
    /// Already voted on proposal
    AlreadyVoted = 9,
    /// Invalid withdrawal limit
    InvalidWithdrawalLimit = 10,
    /// Invalid time-lock period
    InvalidTimeLockPeriod = 11,
    /// Invalid proposal duration
    InvalidProposalDuration = 12,
    /// Manager already exists
    ManagerAlreadyExists = 13,
    /// Manager does not exist
    ManagerDoesNotExist = 14,
    /// Cannot remove last manager
    CannotRemoveLastManager = 15,
    /// Invalid threshold
    InvalidThreshold = 16,
    /// Maximum managers exceeded
    MaximumManagersExceeded = 17,
    /// Invalid asset address
    InvalidAssetAddress = 18,
    /// Transfer failed
    TransferFailed = 19,
    /// Entry archived - storage TTL expired
    EntryArchived = 20,
    /// Insufficient balance for rent
    InsufficientBalanceForRent = 21,
    /// Invalid TTL extension
    InvalidTtlExtension = 22,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryManager {
    pub address: Address,
    pub weight: u32,
    pub joined_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalLimit {
    pub daily_limit: i128,
    pub weekly_limit: i128,
    pub monthly_limit: i128,
    pub last_updated: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeLockConfig {
    pub standard_period: u64,  // Standard time-lock for regular withdrawals
    pub emergency_period: u64, // Shorter period for emergency withdrawals
    pub large_amount_threshold: i128, // Amount threshold for extended time-lock
    pub extended_period: u64,  // Extended time-lock for large amounts
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryProposal {
    pub proposal_id: u64,
    pub proposal_type: ProposalType,
    pub destination: Address,
    pub amount: i128,
    pub asset: Address,
    pub description: Bytes,
    pub created_at: u64,
    pub expires_at: u64,
    pub time_lock_until: u64,
    pub executed: bool,
    pub votes: u32,
    pub required_votes: u32,
    pub creator: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    StandardWithdrawal,
    EmergencyWithdrawal,
    BudgetAllocation,
    ParameterChange,
    ManagerAddition,
    ManagerRemoval,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalRequest {
    pub request_id: u64,
    pub requester: Address,
    pub amount: i128,
    pub asset: Address,
    pub created_at: u64,
    pub time_lock_until: u64,
    pub executed: bool,
    pub proposal_id: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryStats {
    pub total_balance: i128,
    pub daily_withdrawn: i128,
    pub weekly_withdrawn: i128,
    pub monthly_withdrawn: i128,
    pub last_withdrawal_time: u64,
    pub active_proposals: u32,
    pub total_managers: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryConfig {
    pub withdrawal_threshold: i128, // Minimum amount requiring proposal
    pub emergency_threshold: i128,  // Amount threshold for emergency procedures
    pub max_proposal_duration: u64, // Maximum duration for proposals
    pub min_proposal_duration: u64, // Minimum duration for proposals
    pub auto_cleanup_threshold: u32, // Auto-cleanup expired proposals after this count
}

// Event structures
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryInitializedEvent {
    pub managers: Vec<Address>,
    pub threshold: u32,
    pub initialized_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ManagerAddedEvent {
    pub manager: Address,
    pub weight: u32,
    pub added_by: Address,
    pub added_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ManagerRemovedEvent {
    pub manager: Address,
    pub removed_by: Address,
    pub removed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalExecutedEvent {
    pub request_id: u64,
    pub destination: Address,
    pub amount: i128,
    pub asset: Address,
    pub executed_by: Address,
    pub executed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposal_type: ProposalType,
    pub creator: Address,
    pub created_at: u64,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCastEvent {
    pub proposal_id: u64,
    pub voter: Address,
    pub voted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalExecutedEvent {
    pub proposal_id: u64,
    pub executed_by: Address,
    pub executed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LimitsUpdatedEvent {
    pub daily_limit: i128,
    pub weekly_limit: i128,
    pub monthly_limit: i128,
    pub updated_by: Address,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeLockUpdatedEvent {
    pub standard_period: u64,
    pub emergency_period: u64,
    pub large_amount_threshold: i128,
    pub extended_period: u64,
    pub updated_by: Address,
    pub updated_at: u64,
}

// Storage keys
const MANAGERS: Symbol = symbol_short!("T_MANAGERS");
const THRESHOLD: Symbol = symbol_short!("T_THRESHOLD");
const WITHDRAWAL_LIMITS: Symbol = symbol_short!("W_LIMITS");
const TIME_LOCK_CONFIG: Symbol = symbol_short!("T_LOCK_CFG");
const TREASURY_CONFIG: Symbol = symbol_short!("T_CFG");
const PROPOSAL_COUNT: Symbol = symbol_short!("P_COUNT");
const PROPOSALS: Symbol = symbol_short!("PROPOSALS");
const PROPOSAL_VOTES: Symbol = symbol_short!("P_VOTES");
const WITHDRAWAL_REQUESTS: Symbol = symbol_short!("W_REQS");
const TREASURY_STATS: Symbol = symbol_short!("T_STATS");
const LAST_DAILY_RESET: Symbol = symbol_short!("L_DAILY");
const LAST_WEEKLY_RESET: Symbol = symbol_short!("L_WEEKLY");
const LAST_MONTHLY_RESET: Symbol = symbol_short!("L_MONTHLY");

// Event topics
const TREASURY_INITIALIZED_EVENT: Symbol = symbol_short!("T_INIT");
const MANAGER_ADDED_EVENT: Symbol = symbol_short!("M_ADD");
const MANAGER_REMOVED_EVENT: Symbol = symbol_short!("M_REM");
const WITHDRAWAL_EXECUTED_EVENT: Symbol = symbol_short!("W_EXEC");
const PROPOSAL_CREATED_EVENT: Symbol = symbol_short!("P_CREAT");
const VOTE_CAST_EVENT: Symbol = symbol_short!("VOTE_CAST");
const PROPOSAL_EXECUTED_EVENT: Symbol = symbol_short!("P_EXEC");
const LIMITS_UPDATED_EVENT: Symbol = symbol_short!("LIM_UPD");
const TIME_LOCK_UPDATED_EVENT: Symbol = symbol_short!("TL_UPD");

// Constants
const MAX_MANAGERS: u32 = 10;
const MIN_THRESHOLD: u32 = 1;
const MAX_THRESHOLD: u32 = 10;
const MIN_PROPOSAL_DURATION: u64 = 3600; // 1 hour
const MAX_PROPOSAL_DURATION: u64 = 2592000; // 30 days
const DEFAULT_DAILY_LIMIT: i128 = 1000000; // Default daily withdrawal limit
const DEFAULT_WEEKLY_LIMIT: i128 = 5000000; // Default weekly withdrawal limit
const DEFAULT_MONTHLY_LIMIT: i128 = 20000000; // Default monthly withdrawal limit
const DEFAULT_TIME_LOCK_STANDARD: u64 = 86400; // 24 hours
const DEFAULT_TIME_LOCK_EMERGENCY: u64 = 3600; // 1 hour
const DEFAULT_LARGE_AMOUNT_THRESHOLD: i128 = 10000000; // Large amount threshold
const DEFAULT_EXTENDED_TIME_LOCK: u64 = 604800; // 7 days
const SECONDS_PER_DAY: u64 = 86400;
const SECONDS_PER_WEEK: u64 = 604800;
const SECONDS_PER_MONTH: u64 = 2592000;

#[contract]
pub struct TreasuryManager;

#[contractimpl]
impl TreasuryManager {
    /// Initialize the treasury contract with managers and configuration
    pub fn initialize(
        env: Env,
        managers: Vec<Address>,
        threshold: u32,
        withdrawal_limits: WithdrawalLimit,
        time_lock_config: TimeLockConfig,
        treasury_config: TreasuryConfig,
    ) -> Result<(), TreasuryError> {
        // Validate inputs
        if managers.is_empty() || managers.len() as u32 > MAX_MANAGERS {
            return Err(TreasuryError::MaximumManagersExceeded);
        }

        if threshold == 0 || threshold > managers.len() as u32 {
            return Err(TreasuryError::InvalidThreshold);
        }

        // Check for duplicate managers
        for (i, manager) in managers.iter().enumerate() {
            for other_manager in managers.iter().skip(i + 1) {
                if manager == other_manager {
                    return Err(TreasuryError::ManagerAlreadyExists);
                }
            }
        }

        // Validate withdrawal limits
        if withdrawal_limits.daily_limit <= 0
            || withdrawal_limits.weekly_limit <= 0
            || withdrawal_limits.monthly_limit <= 0
        {
            return Err(TreasuryError::InvalidWithdrawalLimit);
        }

        // Validate time-lock configuration
        if time_lock_config.standard_period == 0
            || time_lock_config.emergency_period == 0
            || time_lock_config.extended_period == 0
        {
            return Err(TreasuryError::InvalidTimeLockPeriod);
        }

        // Initialize storage
        let current_time = env.ledger().timestamp();
        
        // Create manager info with default weight of 1
        let manager_infos: Vec<TreasuryManager> = managers
            .iter()
            .enumerate()
            .map(|(i, addr)| TreasuryManager {
                address: addr.clone(),
                weight: 1,
                joined_at: current_time,
            })
            .collect();

        env.storage().instance().set(&MANAGERS, &manager_infos);
        env.storage().instance().set(&THRESHOLD, &threshold);
        env.storage().instance().set(&WITHDRAWAL_LIMITS, &withdrawal_limits);
        env.storage().instance().set(&TIME_LOCK_CONFIG, &time_lock_config);
        env.storage().instance().set(&TREASURY_CONFIG, &treasury_config);

        // Initialize stats
        let stats = TreasuryStats {
            total_balance: 0,
            daily_withdrawn: 0,
            weekly_withdrawn: 0,
            monthly_withdrawn: 0,
            last_withdrawal_time: 0,
            active_proposals: 0,
            total_managers: managers.len() as u32,
        };
        env.storage().instance().set(&TREASURY_STATS, &stats);

        // Initialize reset times
        env.storage().instance().set(&LAST_DAILY_RESET, &current_time);
        env.storage().instance().set(&LAST_WEEKLY_RESET, &current_time);
        env.storage().instance().set(&LAST_MONTHLY_RESET, &current_time);

        // Initialize proposal counter
        env.storage().instance().set(&PROPOSAL_COUNT, &0u64);

        // Emit initialization event
        env.events().publish(
            TREASURY_INITIALIZED_EVENT,
            TreasuryInitializedEvent {
                managers,
                threshold,
                initialized_at: current_time,
            },
        );

        Ok(())
    }

    /// Add a new manager to the treasury
    pub fn add_manager(
        env: Env,
        new_manager: Address,
        weight: u32,
    ) -> Result<(), TreasuryError> {
        let caller = env.current_contract_address();
        
        // Verify caller is a manager
        if !Self::is_manager(&env, &caller) {
            return Err(TreasuryError::Unauthorized);
        }

        let mut managers = Self::get_managers(&env);
        
        // Check if manager already exists
        if managers.iter().any(|m| m.address == new_manager) {
            return Err(TreasuryError::ManagerAlreadyExists);
        }

        // Check maximum managers limit
        if managers.len() as u32 >= MAX_MANAGERS {
            return Err(TreasuryError::MaximumManagersExceeded);
        }

        // Add new manager
        let manager_info = TreasuryManager {
            address: new_manager.clone(),
            weight,
            joined_at: env.ledger().timestamp(),
        };
        managers.push(manager_info);

        env.storage().instance().set(&MANAGERS, &managers);

        // Update stats
        let mut stats = Self::get_stats(&env);
        stats.total_managers = managers.len() as u32;
        env.storage().instance().set(&TREASURY_STATS, &stats);

        // Emit event
        env.events().publish(
            MANAGER_ADDED_EVENT,
            ManagerAddedEvent {
                manager: new_manager,
                weight,
                added_by: caller,
                added_at: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Remove a manager from the treasury
    pub fn remove_manager(
        env: Env,
        manager_to_remove: Address,
    ) -> Result<(), TreasuryError> {
        let caller = env.current_contract_address();
        
        // Verify caller is a manager
        if !Self::is_manager(&env, &caller) {
            return Err(TreasuryError::Unauthorized);
        }

        let mut managers = Self::get_managers(&env);
        
        // Check if manager exists
        let manager_index = managers.iter().position(|m| m.address == manager_to_remove);
        if manager_index.is_none() {
            return Err(TreasuryError::ManagerDoesNotExist);
        }

        // Cannot remove if it would leave no managers
        if managers.len() <= 1 {
            return Err(TreasuryError::CannotRemoveLastManager);
        }

        // Remove manager
        managers.remove(manager_index.unwrap());
        env.storage().instance().set(&MANAGERS, &managers);

        // Update threshold if necessary
        let threshold = Self::get_threshold(&env);
        if threshold > managers.len() as u32 {
            let new_threshold = managers.len() as u32;
            env.storage().instance().set(&THRESHOLD, &new_threshold);
        }

        // Update stats
        let mut stats = Self::get_stats(&env);
        stats.total_managers = managers.len() as u32;
        env.storage().instance().set(&TREASURY_STATS, &stats);

        // Emit event
        env.events().publish(
            MANAGER_REMOVED_EVENT,
            ManagerRemovedEvent {
                manager: manager_to_remove,
                removed_by: caller,
                removed_at: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Create a proposal for treasury action
    pub fn create_proposal(
        env: Env,
        proposal_type: ProposalType,
        destination: Address,
        amount: i128,
        asset: Address,
        description: Bytes,
        duration: u64,
    ) -> Result<u64, TreasuryError> {
        let caller = env.current_contract_address();
        
        // Verify caller is a manager
        if !Self::is_manager(&env, &caller) {
            return Err(TreasuryError::Unauthorized);
        }

        let config = Self::get_treasury_config(&env);
        let current_time = env.ledger().timestamp();

        // Validate duration
        if duration < config.min_proposal_duration || duration > config.max_proposal_duration {
            return Err(TreasuryError::InvalidProposalDuration);
        }

        // Calculate time-lock period
        let time_lock_config = Self::get_time_lock_config(&env);
        let time_lock_period = match proposal_type {
            ProposalType::StandardWithdrawal => {
                if amount >= time_lock_config.large_amount_threshold {
                    time_lock_config.extended_period
                } else {
                    time_lock_config.standard_period
                }
            }
            ProposalType::EmergencyWithdrawal => time_lock_config.emergency_period,
            _ => 0, // No time-lock for non-withdrawal proposals
        };

        // Get proposal ID
        let mut proposal_count = Self::get_proposal_count(&env);
        let proposal_id = proposal_count + 1;
        proposal_count += 1;
        env.storage().instance().set(&PROPOSAL_COUNT, &proposal_count);

        // Calculate expiration and time-lock times
        let expires_at = current_time + duration;
        let time_lock_until = if time_lock_period > 0 {
            current_time + time_lock_period
        } else {
            current_time
        };

        // Create proposal
        let proposal = TreasuryProposal {
            proposal_id,
            proposal_type,
            destination: destination.clone(),
            amount,
            asset: asset.clone(),
            description,
            created_at: current_time,
            expires_at,
            time_lock_until,
            executed: false,
            votes: 0,
            required_votes: Self::get_threshold(&env),
            creator: caller,
        };

        // Store proposal
        let mut proposals = Self::get_proposals(&env);
        proposals.push(proposal.clone());
        env.storage().instance().set(&PROPOSALS, &proposals);

        // Update stats
        let mut stats = Self::get_stats(&env);
        stats.active_proposals = proposals.iter().filter(|p| !p.executed && p.expires_at > current_time).count() as u32;
        env.storage().instance().set(&TREASURY_STATS, &stats);

        // Emit events
        env.events().publish(
            PROPOSAL_CREATED_EVENT,
            ProposalCreatedEvent {
                proposal_id,
                proposal_type,
                creator: caller,
                created_at: current_time,
                expires_at,
            },
        );

        Ok(proposal_id)
    }

    /// Vote on a proposal
    pub fn vote_on_proposal(
        env: Env,
        proposal_id: u64,
    ) -> Result<(), TreasuryError> {
        let caller = env.current_contract_address();
        
        // Verify caller is a manager
        if !Self::is_manager(&env, &caller) {
            return Err(TreasuryError::Unauthorized);
        }

        let mut proposals = Self::get_proposals(&env);
        let proposal_index = proposals.iter().position(|p| p.proposal_id == proposal_id);
        
        if proposal_index.is_none() {
            return Err(TreasuryError::ProposalDoesNotExist);
        }

        let proposal = &mut proposals[proposal_index.unwrap()];
        let current_time = env.ledger().timestamp();

        // Check if proposal is still active
        if proposal.executed {
            return Err(TreasuryError::ProposalAlreadyExecuted);
        }

        if current_time > proposal.expires_at {
            return Err(TreasuryError::ProposalExpired);
        }

        // Check if already voted
        let mut votes = Self::get_proposal_votes(&env, proposal_id);
        if votes.contains(&caller) {
            return Err(TreasuryError::AlreadyVoted);
        }

        // Add vote
        votes.push(caller.clone());
        env.storage().instance().set(&PROPOSAL_VOTES, &proposal_id, &votes);
        
        proposal.votes += 1;
        proposals[proposal_index.unwrap()] = proposal.clone();
        env.storage().instance().set(&PROPOSALS, &proposals);

        // Emit vote event
        env.events().publish(
            VOTE_CAST_EVENT,
            VoteCastEvent {
                proposal_id,
                voter: caller,
                voted_at: current_time,
            },
        );

        // Check if proposal has enough votes to execute
        if proposal.votes >= proposal.required_votes && current_time >= proposal.time_lock_until {
            Self::execute_proposal(env, proposal_id)?;
        }

        Ok(())
    }

    /// Execute a proposal
    pub fn execute_proposal(
        env: Env,
        proposal_id: u64,
    ) -> Result<(), TreasuryError> {
        let caller = env.current_contract_address();
        
        // Verify caller is a manager
        if !Self::is_manager(&env, &caller) {
            return Err(TreasuryError::Unauthorized);
        }

        let mut proposals = Self::get_proposals(&env);
        let proposal_index = proposals.iter().position(|p| p.proposal_id == proposal_id);
        
        if proposal_index.is_none() {
            return Err(TreasuryError::ProposalDoesNotExist);
        }

        let proposal = &mut proposals[proposal_index.unwrap()];
        let current_time = env.ledger().timestamp();

        // Check if proposal can be executed
        if proposal.executed {
            return Err(TreasuryError::ProposalAlreadyExecuted);
        }

        if current_time > proposal.expires_at {
            return Err(TreasuryError::ProposalExpired);
        }

        if proposal.votes < proposal.required_votes {
            return Err(TreasuryError::InsufficientBalance); // Reuse error for insufficient votes
        }

        if current_time < proposal.time_lock_until {
            return Err(TreasuryError::TimeLockNotExpired);
        }

        // Execute proposal based on type
        match proposal.proposal_type {
            ProposalType::StandardWithdrawal | ProposalType::EmergencyWithdrawal => {
                Self::execute_withdrawal(env, proposal)?;
            }
            ProposalType::BudgetAllocation => {
                // Handle budget allocation logic
                Self::execute_withdrawal(env, proposal)?;
            }
            ProposalType::ParameterChange => {
                // Handle parameter change logic
                // This would require additional parameters in the proposal
            }
            ProposalType::ManagerAddition => {
                Self::add_manager(env, proposal.destination, 1)?;
            }
            ProposalType::ManagerRemoval => {
                Self::remove_manager(env, proposal.destination)?;
            }
        }

        // Mark proposal as executed
        proposal.executed = true;
        proposals[proposal_index.unwrap()] = proposal.clone();
        env.storage().instance().set(&PROPOSALS, &proposals);

        // Update stats
        let mut stats = Self::get_stats(&env);
        stats.active_proposals = proposals.iter().filter(|p| !p.executed && p.expires_at > current_time).count() as u32;
        env.storage().instance().set(&TREASURY_STATS, &stats);

        // Emit execution event
        env.events().publish(
            PROPOSAL_EXECUTED_EVENT,
            ProposalExecutedEvent {
                proposal_id,
                executed_by: caller,
                executed_at: current_time,
            },
        );

        Ok(())
    }

    /// Update withdrawal limits
    pub fn update_withdrawal_limits(
        env: Env,
        daily_limit: i128,
        weekly_limit: i128,
        monthly_limit: i128,
    ) -> Result<(), TreasuryError> {
        let caller = env.current_contract_address();
        
        // Verify caller is a manager
        if !Self::is_manager(&env, &caller) {
            return Err(TreasuryError::Unauthorized);
        }

        // Validate limits
        if daily_limit <= 0 || weekly_limit <= 0 || monthly_limit <= 0 {
            return Err(TreasuryError::InvalidWithdrawalLimit);
        }

        if weekly_limit < daily_limit || monthly_limit < weekly_limit {
            return Err(TreasuryError::InvalidWithdrawalLimit);
        }

        // Update limits
        let limits = WithdrawalLimit {
            daily_limit,
            weekly_limit,
            monthly_limit,
            last_updated: env.ledger().timestamp(),
        };
        env.storage().instance().set(&WITHDRAWAL_LIMITS, &limits);

        // Emit event
        env.events().publish(
            LIMITS_UPDATED_EVENT,
            LimitsUpdatedEvent {
                daily_limit,
                weekly_limit,
                monthly_limit,
                updated_by: caller,
                updated_at: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Update time-lock configuration
    pub fn update_time_lock_config(
        env: Env,
        standard_period: u64,
        emergency_period: u64,
        large_amount_threshold: i128,
        extended_period: u64,
    ) -> Result<(), TreasuryError> {
        let caller = env.current_contract_address();
        
        // Verify caller is a manager
        if !Self::is_manager(&env, &caller) {
            return Err(TreasuryError::Unauthorized);
        }

        // Validate configuration
        if standard_period == 0 || emergency_period == 0 || extended_period == 0 {
            return Err(TreasuryError::InvalidTimeLockPeriod);
        }

        if large_amount_threshold <= 0 {
            return Err(TreasuryError::InvalidWithdrawalLimit);
        }

        // Update configuration
        let config = TimeLockConfig {
            standard_period,
            emergency_period,
            large_amount_threshold,
            extended_period,
        };
        env.storage().instance().set(&TIME_LOCK_CONFIG, &config);

        // Emit event
        env.events().publish(
            TIME_LOCK_UPDATED_EVENT,
            TimeLockUpdatedEvent {
                standard_period,
                emergency_period,
                large_amount_threshold,
                extended_period,
                updated_by: caller,
                updated_at: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Get treasury statistics
    pub fn get_treasury_stats(env: Env) -> TreasuryStats {
        Self::get_stats(&env)
    }

    /// Get all active proposals
    pub fn get_active_proposals(env: Env) -> Vec<TreasuryProposal> {
        let proposals = Self::get_proposals(&env);
        let current_time = env.ledger().timestamp();
        proposals
            .into_iter()
            .filter(|p| !p.executed && p.expires_at > current_time)
            .collect()
    }

    /// Get proposal by ID
    pub fn get_proposal(env: Env, proposal_id: u64) -> Option<TreasuryProposal> {
        let proposals = Self::get_proposals(&env);
        proposals.into_iter().find(|p| p.proposal_id == proposal_id)
    }

    /// Check if an address is a manager
    pub fn is_manager(env: &Env, address: &Address) -> bool {
        let managers = Self::get_managers(env);
        managers.iter().any(|m| m.address == *address)
    }

    // Helper functions
    fn execute_withdrawal(env: Env, proposal: &TreasuryProposal) -> Result<(), TreasuryError> {
        let current_time = env.ledger().timestamp();
        
        // Reset withdrawal counters if needed
        Self::reset_withdrawal_counters_if_needed(&env, current_time);

        // Check withdrawal limits
        let limits = Self::get_withdrawal_limits(&env);
        let stats = Self::get_stats(&env);

        if stats.daily_withdrawn + proposal.amount > limits.daily_limit
            || stats.weekly_withdrawn + proposal.amount > limits.weekly_limit
            || stats.monthly_withdrawn + proposal.amount > limits.monthly_limit
        {
            return Err(TreasuryError::WithdrawalLimitExceeded);
        }

        // Execute transfer
        let token_client = token::Client::new(&env, &proposal.asset);
        let contract_balance = token_client.balance(&env.current_contract_address());

        if contract_balance < proposal.amount {
            return Err(TreasuryError::InsufficientBalance);
        }

        // Perform the transfer
        token_client.transfer(
            &env.current_contract_address(),
            &proposal.destination,
            &proposal.amount,
        );

        // Update statistics
        let mut stats = Self::get_stats(&env);
        stats.daily_withdrawn += proposal.amount;
        stats.weekly_withdrawn += proposal.amount;
        stats.monthly_withdrawn += proposal.amount;
        stats.last_withdrawal_time = current_time;
        env.storage().instance().set(&TREASURY_STATS, &stats);

        // Create withdrawal request record
        let mut requests = Self::get_withdrawal_requests(&env);
        let request_id = requests.len() as u64 + 1;
        let withdrawal_request = WithdrawalRequest {
            request_id,
            requester: proposal.creator.clone(),
            amount: proposal.amount,
            asset: proposal.asset.clone(),
            created_at: current_time,
            time_lock_until: proposal.time_lock_until,
            executed: true,
            proposal_id: Some(proposal.proposal_id),
        };
        requests.push(withdrawal_request);
        env.storage().instance().set(&WITHDRAWAL_REQUESTS, &requests);

        // Emit withdrawal event
        env.events().publish(
            WITHDRAWAL_EXECUTED_EVENT,
            WithdrawalExecutedEvent {
                request_id,
                destination: proposal.destination.clone(),
                amount: proposal.amount,
                asset: proposal.asset.clone(),
                executed_by: proposal.creator.clone(),
                executed_at: current_time,
            },
        );

        Ok(())
    }

    fn reset_withdrawal_counters_if_needed(env: &Env, current_time: u64) {
        let mut stats = Self::get_stats(env);
        let mut needs_update = false;

        // Check daily reset
        let last_daily = Self::get_last_daily_reset(env);
        if current_time - last_daily >= SECONDS_PER_DAY {
            stats.daily_withdrawn = 0;
            env.storage().instance().set(&LAST_DAILY_RESET, &current_time);
            needs_update = true;
        }

        // Check weekly reset
        let last_weekly = Self::get_last_weekly_reset(env);
        if current_time - last_weekly >= SECONDS_PER_WEEK {
            stats.weekly_withdrawn = 0;
            env.storage().instance().set(&LAST_WEEKLY_RESET, &current_time);
            needs_update = true;
        }

        // Check monthly reset
        let last_monthly = Self::get_last_monthly_reset(env);
        if current_time - last_monthly >= SECONDS_PER_MONTH {
            stats.monthly_withdrawn = 0;
            env.storage().instance().set(&LAST_MONTHLY_RESET, &current_time);
            needs_update = true;
        }

        if needs_update {
            env.storage().instance().set(&TREASURY_STATS, &stats);
        }
    }

    // Storage getter functions
    fn get_managers(env: &Env) -> Vec<TreasuryManager> {
        env.storage()
            .instance()
            .get(&MANAGERS)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn get_threshold(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&THRESHOLD)
            .unwrap_or(1)
    }

    fn get_withdrawal_limits(env: &Env) -> WithdrawalLimit {
        env.storage()
            .instance()
            .get(&WITHDRAWAL_LIMITS)
            .unwrap_or(WithdrawalLimit {
                daily_limit: DEFAULT_DAILY_LIMIT,
                weekly_limit: DEFAULT_WEEKLY_LIMIT,
                monthly_limit: DEFAULT_MONTHLY_LIMIT,
                last_updated: 0,
            })
    }

    fn get_time_lock_config(env: &Env) -> TimeLockConfig {
        env.storage()
            .instance()
            .get(&TIME_LOCK_CONFIG)
            .unwrap_or(TimeLockConfig {
                standard_period: DEFAULT_TIME_LOCK_STANDARD,
                emergency_period: DEFAULT_TIME_LOCK_EMERGENCY,
                large_amount_threshold: DEFAULT_LARGE_AMOUNT_THRESHOLD,
                extended_period: DEFAULT_EXTENDED_TIME_LOCK,
            })
    }

    fn get_treasury_config(env: &Env) -> TreasuryConfig {
        env.storage()
            .instance()
            .get(&TREASURY_CONFIG)
            .unwrap_or(TreasuryConfig {
                withdrawal_threshold: 1000000,
                emergency_threshold: 5000000,
                max_proposal_duration: MAX_PROPOSAL_DURATION,
                min_proposal_duration: MIN_PROPOSAL_DURATION,
                auto_cleanup_threshold: 100,
            })
    }

    fn get_proposal_count(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&PROPOSAL_COUNT)
            .unwrap_or(0)
    }

    fn get_proposals(env: &Env) -> Vec<TreasuryProposal> {
        env.storage()
            .instance()
            .get(&PROPOSALS)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn get_proposal_votes(env: &Env, proposal_id: u64) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&PROPOSAL_VOTES, &proposal_id)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn get_withdrawal_requests(env: &Env) -> Vec<WithdrawalRequest> {
        env.storage()
            .instance()
            .get(&WITHDRAWAL_REQUESTS)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn get_stats(env: &Env) -> TreasuryStats {
        env.storage()
            .instance()
            .get(&TREASURY_STATS)
            .unwrap_or(TreasuryStats {
                total_balance: 0,
                daily_withdrawn: 0,
                weekly_withdrawn: 0,
                monthly_withdrawn: 0,
                last_withdrawal_time: 0,
                active_proposals: 0,
                total_managers: 0,
            })
    }

    fn get_last_daily_reset(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&LAST_DAILY_RESET)
            .unwrap_or(0)
    }

    fn get_last_weekly_reset(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&LAST_WEEKLY_RESET)
            .unwrap_or(0)
    }

    fn get_last_monthly_reset(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&LAST_MONTHLY_RESET)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests;
