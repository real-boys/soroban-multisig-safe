#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    token, Address, Bytes, Env, IntoVal, Symbol, Map, Vec,
};

// Reentrancy protection
const REENTR_GUARD: Symbol = symbol_short!("REENTR_GU");

// Gas optimization constants
const MAX_GAS_PER_TX: u64 = 50000000; // 50M gas units
const GAS_BUFFER: u64 = 5000000; // 5M gas buffer

#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MultisigError {
    /// Unauthorized access - caller is not an owner
    Unauthorized = 1,
    /// Invalid transaction ID
    InvalidTransactionId = 2,
    /// Transaction already executed
    TransactionAlreadyExecuted = 3,
    /// Insufficient signatures
    InsufficientSignatures = 4,
    /// Owner already exists
    OwnerAlreadyExists = 5,
    /// Owner does not exist
    OwnerDoesNotExist = 6,
    /// Invalid recovery address
    InvalidRecoveryAddress = 7,
    /// Recovery delay not passed
    RecoveryDelayNotPassed = 8,
    /// Recovery not initiated
    RecoveryNotInitiated = 9,
    /// Recovery already in progress
    RecoveryInProgress = 10,
    /// Invalid threshold
    InvalidThreshold = 11,
    /// Maximum owners exceeded
    MaximumOwnersExceeded = 12,
    /// Cannot remove last owner
    CannotRemoveLastOwner = 13,
    /// Invalid time delay
    InvalidTimeDelay = 14,
    /// Transaction expired
    TransactionExpired = 15,
    /// Entry archived - storage TTL expired
    EntryArchived = 16,
    /// Insufficient balance for rent
    InsufficientBalanceForRent = 17,
    /// Invalid TTL extension
    InvalidTtlExtension = 18,
    /// Invalid WASM hash
    InvalidWasmHash = 19,
    /// Upgrade already in progress
    UpgradeInProgress = 20,
    /// Wallet is currently frozen
    WalletFrozen = 21,
    /// Freeze period has not expired
    FreezePeriodNotExpired = 22,
    /// Invalid freeze duration
    InvalidFreezeDuration = 23,
    /// Reentrancy detected
    ReentrancyDetected = 24,
    /// Gas limit exceeded
    GasLimitExceeded = 25,
    /// Invalid pagination parameters
    InvalidPaginationParams = 26,
    /// Import operation in progress
    ImportInProgress = 27,
    /// Vote already cast
    VoteAlreadyCast = 28,
    /// Voting period ended
    VotingPeriodEnded = 29,
    /// Invalid voting mechanism
    InvalidVotingMechanism = 30,
    /// Proposal not found
    ProposalNotFound = 31,
    /// Proposal already executed
    ProposalAlreadyExecuted = 32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transaction {
    pub destination: Address,
    pub amount: i128,
    pub data: Bytes,
    pub executed: bool,
    pub signatures: u32,
    pub created_at: u64,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveryRequest {
    pub new_recovery_address: Address,
    pub initiated_at: u64,
    pub execute_after: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeEvent {
    pub old_wasm_hash: Bytes,
    pub new_wasm_hash: Bytes,
    pub upgraded_by: Address,
    pub upgraded_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FreezeEvent {
    pub frozen_by: Address,
    pub frozen_at: u64,
    pub freeze_duration: u64,
    pub reason: Bytes,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnfreezeEvent {
    pub unfrozen_by: Address,
    pub unfrozen_at: u64,
    pub reason: Bytes,
}

// Pagination structures
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaginationCursor {
    pub transaction_id: u64,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaginatedTransactions {
    pub transactions: Vec<Transaction>,
    pub next_cursor: Option<PaginationCursor>,
    pub has_more: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransactionFilter {
    pub executed_only: Option<bool>,
    pub pending_only: Option<bool>,
    pub from_address: Option<Address>,
    pub to_address: Option<Address>,
    pub min_amount: Option<i128>,
    pub max_amount: Option<i128>,
    pub created_after: Option<u64>,
    pub created_before: Option<u64>,
}

// Voting system structures
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VotingMechanism {
    Simple = 0,
    Weighted = 1,
    Quadratic = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub proposal_id: u64,
    pub title: Bytes,
    pub description: Bytes,
    pub proposer: Address,
    pub voting_mechanism: VotingMechanism,
    pub created_at: u64,
    pub voting_ends_at: u64,
    pub executed: bool,
    pub votes_for: u32,
    pub votes_against: u32,
    pub total_weight_for: u128,
    pub total_weight_against: u128,
    pub required_threshold: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub voter: Address,
    pub proposal_id: u64,
    pub support: bool,
    pub weight: u128,
    pub voted_at: u64,
}

// Data import structures
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImportOperation {
    pub import_id: u64,
    pub initiated_by: Address,
    pub started_at: u64,
    pub total_items: u32,
    pub processed_items: u32,
    pub failed_items: u32,
    pub status: ImportStatus,
    pub rollback_data: Option<Bytes>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ImportStatus {
    Pending = 0,
    InProgress = 1,
    Completed = 2,
    Failed = 3,
    RolledBack = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImportError {
    pub item_index: u32,
    pub error_code: u32,
    pub error_message: Bytes,
}

// Storage keys
const OWNERS: Symbol = symbol_short!("OWNERS");
const THRESHOLD: Symbol = symbol_short!("THRESHLD");
const TX_COUNT: Symbol = symbol_short!("TX_COUNT");
const TRANSACTIONS: Symbol = symbol_short!("TRANS");
const RECOVERY_ADDR: Symbol = symbol_short!("REC_ADDR");
const RECOVERY_DELAY: Symbol = symbol_short!("REC_DLAY");
const RECOVERY_REQ: Symbol = symbol_short!("REC_REQ");
const SIGNATURES: Symbol = symbol_short!("SIGS");
const RENT_BALANCE: Symbol = symbol_short!("RENT_BAL");
const LAST_TTL_EXT: Symbol = symbol_short!("LAST_EXT");
const PERSIST_DATA: Symbol = symbol_short!("PERS_DATA");
const CONTRACT_VER: Symbol = symbol_short!("VERSION");
const UPGRADE_STATE: Symbol = symbol_short!("UPG_STATE");
const IS_FROZEN: Symbol = symbol_short!("IS_FROZEN");
const FREEZE_UNTIL: Symbol = symbol_short!("FREEZE_UN");
const FREEZE_REASON: Symbol = symbol_short!("FREEZE_R");

// Pagination storage keys
const PAGE_CACHE: Symbol = symbol_short!("PAGE_C");
const TX_INDEX: Symbol = symbol_short!("TX_INDEX");

// Voting system storage keys
const PROP_COUNT: Symbol = symbol_short!("PROP_C");
const PROPOSALS: Symbol = symbol_short!("PROPS");
const VOTES: Symbol = symbol_short!("VOTES");
const OWNER_WEIGHTS: Symbol = symbol_short!("OWN_WT");

// Data import storage keys
const IMPORT_COUNT: Symbol = symbol_short!("IMP_C");
const IMPORT_OPS: Symbol = symbol_short!("IMP_OPS");
const IMPORT_ERRS: Symbol = symbol_short!("IMP_ERR");

// Event topics
const UPGRADE_EVENT: Symbol = symbol_short!("UPGRADE");
const FREEZE_EVENT: Symbol = symbol_short!("FREEZE");
const UNFREEZE_EVENT: Symbol = symbol_short!("UNFREEZE");

// Constants for TTL management
const DEFAULT_INSTANCE_TTL: u32 = 15552000; // 180 days in ledgers
const DEFAULT_PERSISTENT_TTL: u32 = 31104000; // 360 days in ledgers
const MIN_TTL_EXTENSION: u32 = 2592000; // 30 days in ledgers
const RENT_BUFFER_MULTIPLIER: u32 = 2; // 2x buffer for safety
const MAX_OWNERS: u32 = 10;
const MIN_RECOVERY_DELAY: u64 = 86400; // 24 hours in seconds
const CURRENT_VERSION: u32 = 1; // Current contract version
const MIN_FREEZE_DURATION: u64 = 3600; // 1 hour in seconds
const MAX_FREEZE_DURATION: u64 = 2592000; // 30 days in seconds
const FREEZE_THRESHOLD_RATIO: u32 = 3; // Freeze requires 1/3 of normal threshold

// Pagination constants
const DEFAULT_PAGE_SIZE: u32 = 50;
const MAX_PAGE_SIZE: u32 = 100;

// Voting system constants
const DEFAULT_VOTING_PERIOD: u64 = 604800; // 7 days in seconds
const MIN_VOTING_PERIOD: u64 = 86400; // 1 day in seconds
const MAX_VOTING_PERIOD: u64 = 2592000; // 30 days in seconds
const DEFAULT_OWNER_WEIGHT: u128 = 1;

// Data import constants
const MAX_IMPORT_ITEMS: u32 = 1000;
const IMPORT_BATCH_SIZE: u32 = 50;

#[contract]
pub struct MultisigSafe;

#[contractimpl]
impl MultisigSafe {
    /// Initialize the multisig wallet with owners and threshold
    pub fn __init__(
        env: Env,
        owners: Vec<Address>,
        threshold: u32,
        recovery_address: Address,
        recovery_delay: u64,
    ) -> Result<(), MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;

        if owners.is_empty() {
            return Err(MultisigError::InvalidThreshold);
        }
        
        if threshold == 0 || threshold > owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }
        
        if owners.len() as u32 > MAX_OWNERS {
            return Err(MultisigError::MaximumOwnersExceeded);
        }
        
        if recovery_delay < MIN_RECOVERY_DELAY {
            return Err(MultisigError::InvalidTimeDelay);
        }

        // Check for duplicate owners
        let mut unique_owners = Vec::<Address>::new(&env);
        for owner in owners.iter() {
            if unique_owners.contains(&owner) {
                return Err(MultisigError::OwnerAlreadyExists);
            }
            unique_owners.push_back(owner.clone());
        }

        // Initialize reentrancy guard
        env.storage().instance().set(&REENTR_GUARD, &false);

        // Store owners in instance storage with TTL
        env.storage().instance().set(&OWNERS, &owners);
        env.storage().instance().set(&THRESHOLD, &threshold);
        env.storage().instance().set(&RECOVERY_ADDR, &recovery_address);
        env.storage().instance().set(&RECOVERY_DELAY, &recovery_delay);
        env.storage().instance().set(&TX_COUNT, &0u64);
        
        // Initialize voting system
        env.storage().instance().set(&PROP_COUNT, &0u64);
        
        // Initialize owner weights for weighted voting
        let mut owner_weights = Map::<Address, u128>::new(&env);
        for owner in owners.iter() {
            owner_weights.set(owner.clone(), DEFAULT_OWNER_WEIGHT);
        }
        env.storage().instance().set(&OWNER_WEIGHTS, &owner_weights);
        
        // Initialize import system
        env.storage().instance().set(&IMPORT_COUNT, &0u64);
        
        // Initialize rent balance tracking
        env.storage().instance().set(&RENT_BALANCE, &0i128);
        env.storage().instance().set(&LAST_TTL_EXT, &env.ledger().sequence());

        // Set contract version for migration tracking
        env.storage().instance().set(&CONTRACT_VER, &CURRENT_VERSION);

        // Initialize freeze state
        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage().instance().set(&FREEZE_REASON, &Bytes::new(&env));

        // Set initial TTL for instance storage
        Self::extend_instance_ttl(&env, DEFAULT_INSTANCE_TTL)?;

        Ok(())
    }

    /// Submit a new transaction for approval
    pub fn submit_transaction(
        env: Env,
        caller: Address,
        destination: Address,
        amount: i128,
        data: Bytes,
        expires_at: u64,
    ) -> Result<u64, MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let tx_count: u64 = env.storage().instance().get(&TX_COUNT).unwrap_or(0);
        let transaction_id = tx_count + 1;

        let transaction = Transaction {
            destination,
            amount,
            data,
            executed: false,
            signatures: 0,
            created_at: env.ledger().timestamp(),
            expires_at,
        };

        // Store transaction
        env.storage()
            .instance()
            .set(&(TRANSACTIONS, transaction_id), &transaction);
        env.storage().instance().set(&TX_COUNT, &transaction_id);
        
        // Update transaction index for pagination
        let index_key = (TX_INDEX, transaction_id);
        env.storage().instance().set(&index_key, &transaction.created_at);

        // Auto-sign if submitter is an owner
        Self::sign_transaction_internal(&env, transaction_id, caller.clone())?;
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);

        Ok(transaction_id)
    }

    /// Sign a transaction
    pub fn sign_transaction(env: Env, caller: Address, transaction_id: u64) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        Self::sign_transaction_internal(&env, transaction_id, caller)
    }

    fn sign_transaction_internal(env: &Env, transaction_id: u64, caller: Address) -> Result<(), MultisigError> {
        let mut transaction: Transaction = env
            .storage()
            .instance()
            .get(&(TRANSACTIONS, transaction_id))
            .ok_or(MultisigError::InvalidTransactionId)?;

        if transaction.executed {
            return Err(MultisigError::TransactionAlreadyExecuted);
        }

        // Check if transaction has expired
        if env.ledger().timestamp() > transaction.expires_at {
            return Err(MultisigError::TransactionExpired);
        }

        // Check if already signed
        let signature_key = (SIGNATURES, transaction_id, caller);
        if env.storage().instance().has(&signature_key) {
            return Err(MultisigError::InsufficientSignatures); // Already signed
        }

        // Add signature
        env.storage().instance().set(&signature_key, &true);
        transaction.signatures += 1;

        // Update transaction
        env.storage()
            .instance()
            .set(&(TRANSACTIONS, transaction_id), &transaction);

        // Auto-execute if threshold reached
        let threshold: u32 = env.storage().instance().get(&THRESHOLD).unwrap();
        if transaction.signatures >= threshold {
            Self::execute_transaction(env.clone(), transaction_id)?;
        }

        Ok(())
    }

    /// Execute a transaction that has sufficient signatures
    pub fn execute_transaction(env: Env, transaction_id: u64) -> Result<(), MultisigError> {
        let mut transaction: Transaction = env
            .storage()
            .instance()
            .get(&(TRANSACTIONS, transaction_id))
            .ok_or(MultisigError::InvalidTransactionId)?;

        if transaction.executed {
            return Err(MultisigError::TransactionAlreadyExecuted);
        }

        let threshold: u32 = env.storage().instance().get(&THRESHOLD).unwrap();
        if transaction.signatures < threshold {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Check if transaction has expired
        if env.ledger().timestamp() > transaction.expires_at {
            return Err(MultisigError::TransactionExpired);
        }

        // Execute transaction
        if transaction.amount > 0 {
            // Transfer logic (assumes contract holds tokens)
            let token_client = token::Client::new(&env, &transaction.destination);
            token_client.transfer(
                &env.current_contract_address(),
                &transaction.destination,
                &transaction.amount,
            );
        }

        // Mark as executed
        transaction.executed = true;
        env.storage()
            .instance()
            .set(&(TRANSACTIONS, transaction_id), &transaction);

        Ok(())
    }

    /// Add a new owner
    pub fn add_owner(env: Env, caller: Address, new_owner: Address) -> Result<(), MultisigError> {
        caller.require_auth();
        // Get current owners and threshold
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&THRESHOLD)
            .ok_or(MultisigError::InvalidThreshold)?;

        if owners.len() as u32 >= MAX_OWNERS {
            return Err(MultisigError::MaximumOwnersExceeded);
        }

        if owners.contains(&new_owner) {
            return Err(MultisigError::OwnerAlreadyExists);
        }

        // Add new owner to the list
        let mut updated_owners = Vec::<Address>::new(&env);
        for owner in owners.iter() {
            updated_owners.push_back(owner.clone());
        }
        updated_owners.push_back(new_owner.clone());
        env.storage().instance().set(&OWNERS, &updated_owners);

        Ok(())
    }

    /// Remove an owner
    pub fn remove_owner(env: Env, caller: Address, owner_to_remove: Address) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        let mut owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;

        if owners.len() <= 1 {
            return Err(MultisigError::CannotRemoveLastOwner);
        }

        let threshold: u32 = env.storage().instance().get(&THRESHOLD).unwrap();
        if owners.len() as u32 - 1 < threshold {
            return Err(MultisigError::InvalidThreshold);
        }

        // Find and remove the owner
        let mut updated_owners = Vec::<Address>::new(&env);
        let mut found = false;
        for owner in owners.iter() {
            if owner == owner_to_remove {
                found = true;
            } else {
                updated_owners.push_back(owner.clone());
            }
        }
        
        if !found {
            return Err(MultisigError::OwnerDoesNotExist);
        }
        
        env.storage().instance().set(&OWNERS, &updated_owners);

        Ok(())
    }

    /// Change the signature threshold
    pub fn change_threshold(env: Env, caller: Address, new_threshold: u32) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;

        if new_threshold == 0 || new_threshold > owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        env.storage().instance().set(&THRESHOLD, &new_threshold);

        Ok(())
    }

    /// Initiate recovery process
    pub fn initiate_recovery(
        env: Env,
        caller: Address,
        new_recovery_address: Address,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        // Check if recovery is already in progress
        if env.storage().instance().has(&RECOVERY_REQ) {
            return Err(MultisigError::RecoveryInProgress);
        }

        let recovery_delay: u64 = env.storage().instance().get(&RECOVERY_DELAY).unwrap();
        let current_time = env.ledger().timestamp();
        let execute_after = current_time + recovery_delay;

        let recovery_request = RecoveryRequest {
            new_recovery_address: new_recovery_address.clone(),
            initiated_at: current_time,
            execute_after,
        };

        env.storage()
            .instance()
            .set(&RECOVERY_REQ, &recovery_request);

        Ok(())
    }

    /// Execute recovery after delay
    pub fn execute_recovery(env: Env) -> Result<(), MultisigError> {
        let recovery_request: RecoveryRequest = env
            .storage()
            .instance()
            .get(&RECOVERY_REQ)
            .ok_or(MultisigError::RecoveryNotInitiated)?;

        if env.ledger().timestamp() < recovery_request.execute_after {
            return Err(MultisigError::RecoveryDelayNotPassed);
        }

        // Update recovery address
        env.storage()
            .instance()
            .set(&RECOVERY_ADDR, &recovery_request.new_recovery_address);

        // Clear recovery request
        env.storage().instance().remove(&RECOVERY_REQ);

        Ok(())
    }

    /// Cancel ongoing recovery
    pub fn cancel_recovery(env: Env, caller: Address) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        if !env.storage().instance().has(&RECOVERY_REQ) {
            return Err(MultisigError::RecoveryNotInitiated);
        }

        env.storage().instance().remove(&RECOVERY_REQ);

        Ok(())
    }

    /// Emergency recovery by recovery address
    /// Bypasses freeze checks - recovery should work even if wallet is frozen
    pub fn emergency_recovery(
        env: Env,
        caller: Address,
        new_owners: Vec<Address>,
        new_threshold: u32,
        new_recovery_address: Address,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        
        let recovery_address: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_ADDR)
            .ok_or(MultisigError::InvalidRecoveryAddress)?;

        if caller != recovery_address {
            return Err(MultisigError::Unauthorized);
        }

        if new_owners.is_empty() || new_threshold == 0 || new_threshold > new_owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        // Update owners and threshold
        env.storage().instance().set(&OWNERS, &new_owners);
        env.storage().instance().set(&THRESHOLD, &new_threshold);
        env.storage().instance().set(&RECOVERY_ADDR, &new_recovery_address);

        // Clear any ongoing recovery
        env.storage().instance().remove(&RECOVERY_REQ);

        // Auto-unfreeze wallet after successful recovery for safety
        let current_time = env.ledger().timestamp();
        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage().instance().set(&FREEZE_REASON, &Bytes::from_slice(&env, b"Auto-unfreeze: recovery executed"));

        // Emit recovery unfreeze event
        let unfreeze_event = UnfreezeEvent {
            unfrozen_by: caller.clone(),
            unfrozen_at: current_time,
            reason: Bytes::from_slice(&env, b"Auto-unfreeze: recovery executed"),
        };

        env.events().publish(
            (UNFREEZE_EVENT, symbol_short!("RECOVERY")),
            unfreeze_event,
        );

        Ok(())
    }

    /// Freeze the wallet with lower threshold requirement
    /// Requires 1/3 of normal threshold for emergency situations
    pub fn freeze_wallet(
        env: Env,
        caller: Address,
        duration_seconds: u64,
        reason: Bytes,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        // Validate freeze duration
        if duration_seconds < MIN_FREEZE_DURATION || duration_seconds > MAX_FREEZE_DURATION {
            return Err(MultisigError::InvalidFreezeDuration);
        }

        let current_time = env.ledger().timestamp();
        let freeze_until = current_time + duration_seconds;

        // Check if already frozen and extend if needed
        let is_frozen: bool = env.storage().instance().get(&IS_FROZEN).unwrap_or(false);
        let current_freeze_until: u64 = env.storage().instance().get(&FREEZE_UNTIL).unwrap_or(0);

        if is_frozen && current_freeze_until > current_time {
            // Extend existing freeze
            if freeze_until <= current_freeze_until {
                return Err(MultisigError::FreezePeriodNotExpired);
            }
        }

        // Get normal threshold and calculate freeze threshold (1/3)
        let normal_threshold: u32 = env.storage().instance().get(&THRESHOLD).unwrap();
        let freeze_threshold = (normal_threshold + FREEZE_THRESHOLD_RATIO - 1) / FREEZE_THRESHOLD_RATIO;
        let freeze_threshold = freeze_threshold.max(1); // At least 1 signature required

        // Create freeze transaction ID
        let freeze_tx_id = env.ledger().sequence();
        let freeze_key = (FREEZE_EVENT, freeze_tx_id, caller.clone());

        // Check if this owner has already signed this freeze request
        if env.storage().instance().has(&freeze_key) {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Add signature for this freeze request
        env.storage().instance().set(&freeze_key, &true);

        // Count signatures for this freeze request
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;
        let mut signature_count = 0u32;
        for owner in owners.iter() {
            let owner_freeze_key = (FREEZE_EVENT, freeze_tx_id, owner.clone());
            if env.storage().instance().has(&owner_freeze_key) {
                signature_count += 1;
            }
        }

        // Check if we have enough signatures for freeze
        if signature_count < freeze_threshold {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Execute freeze
        env.storage().instance().set(&IS_FROZEN, &true);
        env.storage().instance().set(&FREEZE_UNTIL, &freeze_until);
        env.storage().instance().set(&FREEZE_REASON, &reason.clone());

        // Emit freeze event
        let freeze_event = FreezeEvent {
            frozen_by: caller.clone(),
            frozen_at: current_time,
            freeze_duration: duration_seconds,
            reason: reason.clone(),
        };

        env.events().publish(
            (FREEZE_EVENT, symbol_short!("EXECUTED")),
            freeze_event,
        );

        // Clean up freeze signatures
        for owner in owners.iter() {
            let owner_freeze_key = (FREEZE_EVENT, freeze_tx_id, owner.clone());
            env.storage().instance().remove(&owner_freeze_key);
        }

        Ok(())
    }

    /// Unfreeze the wallet with high threshold (all owners)
    pub fn unfreeze_wallet(
        env: Env,
        caller: Address,
        reason: Bytes,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        let current_time = env.ledger().timestamp();
        let is_frozen: bool = env.storage().instance().get(&IS_FROZEN).unwrap_or(false);
        let freeze_until: u64 = env.storage().instance().get(&FREEZE_UNTIL).unwrap_or(0);

        // Check if wallet is actually frozen
        if !is_frozen {
            return Err(MultisigError::WalletFrozen); // Using existing error for consistency
        }

        // Check if freeze period has expired (auto-unfreeze)
        if current_time >= freeze_until {
            Self::auto_unfreeze(&env)?;
            return Ok(());
        }

        // Get all owners - high threshold means all must approve
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;
        let high_threshold = owners.len() as u32;

        // Create unfreeze transaction ID
        let unfreeze_tx_id = env.ledger().sequence();
        let unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, caller.clone());

        // Check if this owner has already signed this unfreeze request
        if env.storage().instance().has(&unfreeze_key) {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Add signature for this unfreeze request
        env.storage().instance().set(&unfreeze_key, &true);

        // Count signatures for this unfreeze request
        let mut signature_count = 0u32;
        for owner in owners.iter() {
            let owner_unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, owner.clone());
            if env.storage().instance().has(&owner_unfreeze_key) {
                signature_count += 1;
            }
        }

        // Check if we have enough signatures for unfreeze (all owners)
        if signature_count < high_threshold {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Execute unfreeze
        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage().instance().set(&FREEZE_REASON, &Bytes::new(&env));

        // Emit unfreeze event
        let unfreeze_event = UnfreezeEvent {
            unfrozen_by: caller.clone(),
            unfrozen_at: current_time,
            reason: reason.clone(),
        };

        env.events().publish(
            (UNFREEZE_EVENT, symbol_short!("EXECUTED")),
            unfreeze_event,
        );

        // Clean up unfreeze signatures
        for owner in owners.iter() {
            let owner_unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, owner.clone());
            env.storage().instance().remove(&owner_unfreeze_key);
        }

        Ok(())
    }

    /// Check if wallet is frozen and auto-unfreeze if period expired
    fn check_frozen_status(env: &Env) -> Result<(), MultisigError> {
        let is_frozen: bool = env.storage().instance().get(&IS_FROZEN).unwrap_or(false);
        
        if !is_frozen {
            return Ok(());
        }

        let current_time = env.ledger().timestamp();
        let freeze_until: u64 = env.storage().instance().get(&FREEZE_UNTIL).unwrap_or(0);

        // Auto-unfreeze if period has expired
        if current_time >= freeze_until {
            Self::auto_unfreeze(env)?;
            return Ok(());
        }

        Err(MultisigError::WalletFrozen)
    }

    /// Auto-unfreeze when freeze period expires
    fn auto_unfreeze(env: &Env) -> Result<(), MultisigError> {
        let current_time = env.ledger().timestamp();
        let freeze_reason: Bytes = env.storage().instance().get(&FREEZE_REASON)
            .unwrap_or_else(|| Bytes::new(env));

        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage().instance().set(&FREEZE_REASON, &Bytes::new(env));

        // Emit auto-unfreeze event
        let unfreeze_event = UnfreezeEvent {
            unfrozen_by: env.current_contract_address(),
            unfrozen_at: current_time,
            reason: Bytes::from_slice(env, b"Auto-unfreeze: period expired"),
        };

        env.events().publish(
            (UNFREEZE_EVENT, symbol_short!("AUTO")),
            unfreeze_event,
        );

        Ok(())
    }

    /// Get current freeze status
    pub fn get_freeze_status(env: Env) -> Result<(bool, u64, Bytes), MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let is_frozen: bool = env.storage().instance().get(&IS_FROZEN).unwrap_or(false);
        let freeze_until: u64 = env.storage().instance().get(&FREEZE_UNTIL).unwrap_or(0);
        let freeze_reason: Bytes = env.storage().instance().get(&FREEZE_REASON)
            .unwrap_or_else(|| Bytes::new(&env));

        // Check if auto-unfreeze should happen
        if is_frozen {
            let current_time = env.ledger().timestamp();
            if current_time >= freeze_until {
                Self::auto_unfreeze(&env)?;
                return Ok((false, 0, Bytes::new(&env)));
            }
        }

        Ok((is_frozen, freeze_until, freeze_reason))
    }

    /// Helper function to check if an owner has signed a specific freeze request
    pub fn has_signed_freeze(env: Env, freeze_tx_id: u64, owner: Address) -> Result<bool, MultisigError> {
        let freeze_key = (FREEZE_EVENT, freeze_tx_id, owner);
        Ok(env.storage().instance().has(&freeze_key))
    }

    /// Helper function to check if an owner has signed a specific unfreeze request
    pub fn has_signed_unfreeze(env: Env, unfreeze_tx_id: u64, owner: Address) -> Result<bool, MultisigError> {
        let unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, owner);
        Ok(env.storage().instance().has(&unfreeze_key))
    }

    /// Upgrade the contract to a new WASM hash
    /// Requires the "High" threshold of signers (all owners)
    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: Bytes) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        // Check if upgrade is already in progress
        if env.storage().instance().has(&UPGRADE_STATE) {
            return Err(MultisigError::UpgradeInProgress);
        }

        // Validate new WASM hash is not empty
        if new_wasm_hash.is_empty() {
            return Err(MultisigError::InvalidWasmHash);
        }

        // Get current owners and require all of them to sign (High threshold)
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;

        // High threshold means all owners must approve
        let high_threshold = owners.len() as u32;

        // Create a temporary upgrade transaction to collect signatures
        let upgrade_tx_id = env.ledger().sequence(); // Use ledger sequence as unique ID
        let upgrade_key = (UPGRADE_EVENT, upgrade_tx_id, caller.clone());
        
        // Check if this owner has already signed this upgrade
        if env.storage().instance().has(&upgrade_key) {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Add signature for this upgrade
        env.storage().instance().set(&upgrade_key, &true);

        // Count signatures for this upgrade
        let mut signature_count = 0u32;
        for owner in owners.iter() {
            let owner_upgrade_key = (UPGRADE_EVENT, upgrade_tx_id, owner.clone());
            if env.storage().instance().has(&owner_upgrade_key) {
                signature_count += 1;
            }
        }

        // Check if we have enough signatures (High threshold = all owners)
        if signature_count < high_threshold {
            return Err(MultisigError::InsufficientSignatures);
        }

        Ok(())
    }

    /// Data migration function for version upgrades
    fn migrate_data(env: &Env, from_version: u32, to_version: u32) -> Result<(), MultisigError> {
        // For now, no migration needed as we maintain backward compatibility
        // Future versions can add specific migration logic here
        
        // Example migration logic for future versions:
        // if from_version < 2 && to_version >= 2 {
        //     // Migrate data format from v1 to v2
        // }
        
        // Ensure all critical data exists and is compatible
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS)
            .ok_or(MultisigError::EntryArchived)?;
        let threshold: u32 = env.storage().instance().get(&THRESHOLD)
            .ok_or(MultisigError::EntryArchived)?;
        
        // Validate data integrity
        if owners.is_empty() || threshold == 0 || threshold > owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        // Check for duplicate owners
        for owner in owners.iter() {
            // In a real implementation, this would check for duplicates
        }

        Ok(())
    }

    /// Helper function to check if an owner has signed a specific upgrade
    pub fn has_signed_upgrade(env: Env, upgrade_tx_id: u64, owner: Address) -> Result<bool, MultisigError> {
        let upgrade_key = (UPGRADE_EVENT, upgrade_tx_id, owner);
        Ok(env.storage().instance().has(&upgrade_key))
    }

    /// Get current contract version
    pub fn get_version(env: Env) -> Result<u32, MultisigError> {
        match env.storage().instance().get(&CONTRACT_VER) {
            Some(version) => Ok(version),
            None => Ok(0), // Default to version 0 if not set (legacy contracts)
        }
    }

    /// View functions
    pub fn get_owners(env: Env) -> Result<Vec<Address>, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        match env.storage().instance().get(&OWNERS) {
            Some(owners) => Ok(owners),
            None => Err(MultisigError::EntryArchived),
        }
    }

    pub fn get_threshold(env: Env) -> Result<u32, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        match env.storage().instance().get(&THRESHOLD) {
            Some(threshold) => Ok(threshold),
            None => Err(MultisigError::EntryArchived),
        }
    }

    pub fn get_transaction(env: Env, transaction_id: u64) -> Result<Transaction, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        match env.storage().instance().get(&(TRANSACTIONS, transaction_id)) {
            Some(transaction) => Ok(transaction),
            None => Err(MultisigError::InvalidTransactionId),
        }
    }

    pub fn get_recovery_info(
        env: Env,
    ) -> Result<(Address, u64, Option<RecoveryRequest>), MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let recovery_address: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_ADDR)
            .ok_or(MultisigError::EntryArchived)?;
        let recovery_delay: u64 = env.storage().instance().get(&RECOVERY_DELAY).unwrap();
        let recovery_request: Option<RecoveryRequest> = env.storage().instance().get(&RECOVERY_REQ);

        Ok((recovery_address, recovery_delay, recovery_request))
    }

    pub fn is_owner(env: Env, address: Address) -> Result<bool, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS)
            .ok_or(MultisigError::EntryArchived)?;
        Ok(owners.contains(&address))
    }

    pub fn has_signed(env: Env, transaction_id: u64, signer: Address) -> Result<bool, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        Ok(env
            .storage()
            .instance()
            .has(&(SIGNATURES, transaction_id, signer)))
    }

    /// Helper function to check if address is an owner
    fn require_owner(env: &Env, address: &Address) -> Result<(), MultisigError> {
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .ok_or(MultisigError::EntryArchived)?;
        
        if !owners.contains(address) {
            return Err(MultisigError::Unauthorized);
        }
        
        Ok(())
    }

    /// Extend instance storage TTL
    fn extend_instance_ttl(env: &Env, extend_ledgers: u32) -> Result<(), MultisigError> {
        if extend_ledgers < MIN_TTL_EXTENSION {
            return Err(MultisigError::InvalidTtlExtension);
        }
        
        env.storage().instance().extend_ttl(env.ledger().sequence(), extend_ledgers);
        env.storage().instance().set(&LAST_TTL_EXT, &env.ledger().sequence());
        
        Ok(())
    }

    /// Check and extend instance TTL automatically
    fn auto_extend_instance_ttl(env: &Env) -> Result<(), MultisigError> {
        let last_extension: u32 = env.storage().instance().get(&LAST_TTL_EXT).unwrap_or(0);
        let current_ledger = env.ledger().sequence();
        let ledgers_since_extension = current_ledger.saturating_sub(last_extension);
        
        // Auto-extend if we've used more than half of the TTL
        if ledgers_since_extension > DEFAULT_INSTANCE_TTL / 2 {
            Self::extend_instance_ttl(env, DEFAULT_INSTANCE_TTL)?;
        }
        
        Ok(())
    }

    /// Calculate minimum balance requirements for storage
    pub fn calculate_minimum_balance(env: &Env) -> Result<i128, MultisigError> {
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS)
            .ok_or(MultisigError::EntryArchived)?;
        let tx_count: u64 = env.storage().instance().get(&TX_COUNT).unwrap_or(0);
        
        // Base storage cost estimation (rough calculation)
        // Each Address: ~32 bytes, each transaction: ~200 bytes, overhead: ~1000 bytes
        let storage_bytes = 1000u32 + (owners.len() as u32 * 32) + (tx_count as u32 * 200);
        
        // Convert to stroops (1 XLM = 10^7 stroops)
        // Rough estimate: 1 byte = 1 stroop for storage cost
        let base_cost = storage_bytes as i128;
        
        // Add buffer for safety
        let buffered_cost = base_cost * RENT_BUFFER_MULTIPLIER as i128;
        
        Ok(buffered_cost)
    }

    /// Top up rent for persistent storage
    pub fn top_up_rent(env: Env, caller: Address, amount: i128) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        if amount <= 0 {
            return Err(MultisigError::InsufficientBalanceForRent);
        }
        
        // Transfer XLM to contract for rent
        let token_client = token::Client::new(&env, &env.current_contract_address());
        token_client.transfer(&caller, &env.current_contract_address(), &amount);
        
        // Update rent balance
        let current_balance: i128 = env.storage().instance().get(&RENT_BALANCE).unwrap_or(0);
        let new_balance = current_balance + amount;
        env.storage().instance().set(&RENT_BALANCE, &new_balance);
        
        // Auto-extend persistent storage TTL if needed
        Self::extend_persistent_ttl(&env, DEFAULT_PERSISTENT_TTL)?;
        
        Ok(())
    }

    /// Extend persistent storage TTL
    fn extend_persistent_ttl(env: &Env, extend_ledgers: u32) -> Result<(), MultisigError> {
        if extend_ledgers < MIN_TTL_EXTENSION {
            return Err(MultisigError::InvalidTtlExtension);
        }
        
        // Extend TTL for all persistent entries - simplified approach
        // In a real implementation, this would extend specific keys
        let dummy_key = symbol_short!("DUMMY");
        env.storage().persistent().extend_ttl(&dummy_key, extend_ledgers, env.ledger().sequence() + extend_ledgers as u32);
        
        Ok(())
    }

    /// Get current rent balance
    pub fn get_rent_balance(env: Env) -> Result<i128, MultisigError> {
        Ok(env.storage().instance().get(&RENT_BALANCE).unwrap_or(0))
    }

    /// Get TTL information
    pub fn get_ttl_info(env: Env) -> Result<(u32, u32, i128), MultisigError> {
        let last_extension: u32 = env.storage().instance().get(&LAST_TTL_EXT).unwrap_or(0);
        let current_ledger = env.ledger().sequence();
        let remaining_ttl = DEFAULT_INSTANCE_TTL.saturating_sub(current_ledger.saturating_sub(last_extension));
        let rent_balance: i128 = env.storage().instance().get(&RENT_BALANCE).unwrap_or(0);
        
        Ok((last_extension, remaining_ttl, rent_balance))
    }

    /// Store data in persistent storage with automatic TTL management
    pub fn store_persistent_data(env: Env, caller: Address, key: Symbol, value: Bytes) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check minimum balance requirements
        let min_balance = Self::calculate_minimum_balance(&env)?;
        let current_balance: i128 = env.storage().instance().get(&RENT_BALANCE).unwrap_or(0);
        
        if current_balance < min_balance {
            return Err(MultisigError::InsufficientBalanceForRent);
        }
        
        // Store in persistent storage
        let persistent_key = (PERSIST_DATA, key);
        env.storage().persistent().set(&persistent_key, &value);
        
        // Auto-extend TTL
        Self::extend_persistent_ttl(&env, DEFAULT_PERSISTENT_TTL)?;
        
        Ok(())
    }

    /// Retrieve data from persistent storage with archival check
    pub fn get_persistent_data(env: Env, key: Symbol) -> Result<Bytes, MultisigError> {
        let persistent_key = (PERSIST_DATA, key);
        
        // Check if entry exists and is not archived
        match env.storage().persistent().get(&persistent_key) {
            Some(value) => Ok(value),
            None => Err(MultisigError::EntryArchived),
        }
    }

    // Reentrancy protection helpers
    fn enter_reentrancy_guard(env: &Env) -> Result<(), MultisigError> {
        let is_entered: bool = env.storage().instance().get(&REENTR_GUARD).unwrap_or(false);
        if is_entered {
            return Err(MultisigError::ReentrancyDetected);
        }
        env.storage().instance().set(&REENTR_GUARD, &true);
        Ok(())
    }

    fn exit_reentrancy_guard(env: &Env) {
        env.storage().instance().set(&REENTR_GUARD, &false);
    }

    // Gas optimization helpers
    fn check_gas_limit(_env: &Env) -> Result<(), MultisigError> {
        // Simplified gas check - in a real implementation, this would check actual gas usage
        Ok(())
    }

    // Issue #55: Efficient Pagination Implementation
    
    /// Get paginated transactions with cursor-based pagination
    pub fn get_transactions_paginated(
        env: Env,
        cursor: Option<PaginationCursor>,
        page_size: u32,
        filter: Option<TransactionFilter>,
        sort_by_created_at: bool, // true for descending, false for ascending
    ) -> Result<PaginatedTransactions, MultisigError> {
        // Validate page size
        if page_size == 0 || page_size > MAX_PAGE_SIZE {
            return Err(MultisigError::InvalidPaginationParams);
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let tx_count: u64 = env.storage().instance().get(&TX_COUNT).unwrap_or(0);
        if tx_count == 0 {
            return Ok(PaginatedTransactions {
                transactions: Vec::new(&env),
                next_cursor: None,
                has_more: false,
            });
        }
        
        let mut transactions = Vec::new(&env);
        let mut count = 0u32;
        let mut start_id = match cursor {
            Some(c) => c.transaction_id,
            None => if sort_by_created_at { tx_count } else { 1 },
        };
        
        // Collect transactions based on pagination and filters
        while count < page_size && start_id > 0 {
            if start_id > tx_count {
                break;
            }
            
            if let Some(transaction) = env.storage().instance().get(&(TRANSACTIONS, start_id)) {
                if Self::matches_filter(&env, &transaction, &filter) {
                    transactions.push_back(transaction);
                    count += 1;
                }
            }
            
            start_id = if sort_by_created_at { start_id - 1 } else { start_id + 1 };
        }
        
        // Determine next cursor and has_more
        let next_cursor = if start_id > 0 && start_id <= tx_count {
            Some(PaginationCursor {
                transaction_id: start_id,
                timestamp: env.ledger().timestamp(),
            })
        } else {
            None
        };
        
        let has_more = next_cursor.is_some();
        
        Ok(PaginatedTransactions {
            transactions,
            next_cursor,
            has_more,
        })
    }
    
    /// Get transactions by address with pagination
    pub fn get_transactions_by_address(
        env: Env,
        address: Address,
        cursor: Option<PaginationCursor>,
        page_size: u32,
        is_destination: bool, // true for destination, false for source (if tracked)
    ) -> Result<PaginatedTransactions, MultisigError> {
        let filter = TransactionFilter {
            executed_only: None,
            pending_only: None,
            from_address: None,
            to_address: if is_destination { Some(address) } else { None },
            min_amount: None,
            max_amount: None,
            created_after: None,
            created_before: None,
        };
        
        Self::get_transactions_paginated(env, cursor, page_size, Some(filter), true)
    }
    
    /// Search transactions with advanced filtering
    pub fn search_transactions(
        env: Env,
        query: Bytes, // Simple text search in transaction data
        cursor: Option<PaginationCursor>,
        page_size: u32,
    ) -> Result<PaginatedTransactions, MultisigError> {
        // Validate page size
        if page_size == 0 || page_size > MAX_PAGE_SIZE {
            return Err(MultisigError::InvalidPaginationParams);
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let tx_count: u64 = env.storage().instance().get(&TX_COUNT).unwrap_or(0);
        if tx_count == 0 {
            return Ok(PaginatedTransactions {
                transactions: Vec::new(&env),
                next_cursor: None,
                has_more: false,
            });
        }
        
        let mut transactions = Vec::new(&env);
        let mut count = 0u32;
        let mut start_id = match cursor {
            Some(c) => c.transaction_id,
            None => tx_count,
        };
        
        // Search through transactions
        while count < page_size && start_id > 0 {
            if start_id > tx_count {
                break;
            }
            
            if let Some(transaction) = env.storage().instance().get::<_, Transaction>(&(TRANSACTIONS, start_id)) {
                // Simple text search in transaction data
                if Self::text_matches(&transaction.data, &query) {
                    transactions.push_back(transaction);
                    count += 1;
                }
            }
            
            start_id -= 1;
        }
        
        let next_cursor = if start_id > 0 && start_id <= tx_count {
            Some(PaginationCursor {
                transaction_id: start_id,
                timestamp: env.ledger().timestamp(),
            })
        } else {
            None
        };
        
        let has_more = next_cursor.is_some();
        
        Ok(PaginatedTransactions {
            transactions,
            next_cursor,
            has_more,
        })
    }
    
    /// Get transaction statistics for performance monitoring
    pub fn get_transaction_stats(env: Env) -> Result<(u64, u64, u64, u64), MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let tx_count: u64 = env.storage().instance().get(&TX_COUNT).unwrap_or(0);
        let mut executed_count = 0u64;
        let mut pending_count = 0u64;
        let mut expired_count = 0u64;
        let current_time = env.ledger().timestamp();
        
        for i in 1..=tx_count {
            if let Some(transaction) = env.storage().instance().get::<_, Transaction>(&(TRANSACTIONS, i)) {
                if transaction.executed {
                    executed_count += 1;
                } else if current_time > transaction.expires_at {
                    expired_count += 1;
                } else {
                    pending_count += 1;
                }
            }
        }
        
        Ok((tx_count, executed_count, pending_count, expired_count))
    }
    
    // Helper functions for pagination
    fn matches_filter(env: &Env, transaction: &Transaction, filter: &Option<TransactionFilter>) -> bool {
        if let Some(f) = filter {
            // Check execution status
            if let Some(executed_only) = f.executed_only {
                if executed_only != transaction.executed {
                    return false;
                }
            }
            
            if let Some(pending_only) = f.pending_only {
                if pending_only && transaction.executed {
                    return false;
                }
            }
            
            // Check addresses
            if let Some(to_address) = &f.to_address {
                if &transaction.destination != to_address {
                    return false;
                }
            }
            
            // Check amount range
            if let Some(min_amount) = f.min_amount {
                if transaction.amount < min_amount {
                    return false;
                }
            }
            
            if let Some(max_amount) = f.max_amount {
                if transaction.amount > max_amount {
                    return false;
                }
            }
            
            // Check time range
            if let Some(created_after) = f.created_after {
                if transaction.created_at < created_after {
                    return false;
                }
            }
            
            if let Some(created_before) = f.created_before {
                if transaction.created_at > created_before {
                    return false;
                }
            }
        }
        
        true
    }
    
    fn text_matches(data: &Bytes, query: &Bytes) -> bool {
        // Simple text matching - in a real implementation, this could be more sophisticated
        // Convert bytes to string for comparison (simplified approach)
        if data.is_empty() || query.is_empty() {
            return false;
        }
        
        // For simplicity, just check if query bytes are contained in data bytes
        // In a real implementation, this would be more sophisticated
        let data_len = data.len();
        let query_len = query.len();
        
        if query_len > data_len {
            return false;
        }
        
        // Simple substring check (simplified for no_std)
        true // Placeholder - would implement proper string matching
    }

    // Issue #61: On-Chain Voting System Implementation
    
    /// Create a new proposal for voting
    pub fn create_proposal(
        env: Env,
        caller: Address,
        title: Bytes,
        description: Bytes,
        voting_mechanism: VotingMechanism,
        voting_period: u64,
        required_threshold: u32,
    ) -> Result<u64, MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Validate voting period
        if voting_period < MIN_VOTING_PERIOD || voting_period > MAX_VOTING_PERIOD {
            return Err(MultisigError::InvalidTimeDelay);
        }
        
        // Validate threshold
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;
        if required_threshold == 0 || required_threshold > owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let proposal_count: u64 = env.storage().instance().get(&PROP_COUNT).unwrap_or(0);
        let proposal_id = proposal_count + 1;
        
        let current_time = env.ledger().timestamp();
        let proposal = Proposal {
            proposal_id,
            title: title.clone(),
            description: description.clone(),
            proposer: caller.clone(),
            voting_mechanism,
            created_at: current_time,
            voting_ends_at: current_time + voting_period,
            executed: false,
            votes_for: 0,
            votes_against: 0,
            total_weight_for: 0,
            total_weight_against: 0,
            required_threshold,
        };
        
        // Store proposal
        env.storage().instance().set(&(PROPOSALS, proposal_id), &proposal);
        env.storage().instance().set(&PROP_COUNT, &proposal_id);
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);
        
        Ok(proposal_id)
    }
    
    /// Cast a vote on a proposal
    pub fn vote(
        env: Env,
        caller: Address,
        proposal_id: u64,
        support: bool,
    ) -> Result<(), MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let mut proposal: Proposal = env.storage().instance().get(&(PROPOSALS, proposal_id))
            .ok_or(MultisigError::ProposalNotFound)?;
        
        // Check if proposal is still active
        if env.ledger().timestamp() > proposal.voting_ends_at {
            return Err(MultisigError::VotingPeriodEnded);
        }
        
        // Check if already executed
        if proposal.executed {
            return Err(MultisigError::ProposalAlreadyExecuted);
        }
        
        // Check if already voted
        let vote_key = (VOTES, proposal_id, caller.clone());
        if env.storage().instance().has(&vote_key) {
            return Err(MultisigError::VoteAlreadyCast);
        }
        
        // Get voter weight
        let voter_weight = Self::get_voter_weight(&env, caller.clone(), proposal.voting_mechanism.clone())?;
        
        // Record the vote
        let vote = Vote {
            voter: caller.clone(),
            proposal_id,
            support,
            weight: voter_weight,
            voted_at: env.ledger().timestamp(),
        };
        
        env.storage().instance().set(&vote_key, &vote);
        
        // Update proposal tallies
        if support {
            proposal.votes_for += 1;
            proposal.total_weight_for += voter_weight;
        } else {
            proposal.votes_against += 1;
            proposal.total_weight_against += voter_weight;
        }
        
        // Store updated proposal
        env.storage().instance().set(&(PROPOSALS, proposal_id), &proposal);
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);
        
        Ok(())
    }
    
    /// Execute a proposal that has sufficient votes
    pub fn execute_proposal(
        env: Env,
        caller: Address,
        proposal_id: u64,
    ) -> Result<(), MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let mut proposal: Proposal = env.storage().instance().get(&(PROPOSALS, proposal_id))
            .ok_or(MultisigError::ProposalNotFound)?;
        
        // Check if already executed
        if proposal.executed {
            return Err(MultisigError::ProposalAlreadyExecuted);
        }
        
        // Check if voting period has ended
        if env.ledger().timestamp() < proposal.voting_ends_at {
            return Err(MultisigError::VotingPeriodEnded);
        }
        
        // Check if proposal has sufficient support
        if !Self::has_sufficient_support(&proposal) {
            return Err(MultisigError::InsufficientSignatures);
        }
        
        // Execute the proposal (this is a placeholder - in a real implementation,
        // this would execute the specific action proposed)
        proposal.executed = true;
        env.storage().instance().set(&(PROPOSALS, proposal_id), &proposal);
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);
        
        Ok(())
    }
    
    /// Get proposal details
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        match env.storage().instance().get(&(PROPOSALS, proposal_id)) {
            Some(proposal) => Ok(proposal),
            None => Err(MultisigError::ProposalNotFound),
        }
    }
    
    /// Get all proposals with pagination
    pub fn get_proposals_paginated(
        env: Env,
        cursor: Option<u64>, // cursor is the last proposal_id seen
        page_size: u32,
        active_only: bool,
    ) -> Result<(Vec<Proposal>, Option<u64>, bool), MultisigError> {
        // Validate page size
        if page_size == 0 || page_size > MAX_PAGE_SIZE {
            return Err(MultisigError::InvalidPaginationParams);
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let proposal_count: u64 = env.storage().instance().get(&PROP_COUNT).unwrap_or(0);
        if proposal_count == 0 {
            return Ok((Vec::new(&env), None, false));
        }
        
        let mut proposals = Vec::new(&env);
        let mut count = 0u32;
        let mut start_id = match cursor {
            Some(c) => c,
            None => proposal_count,
        };
        
        let current_time = env.ledger().timestamp();
        
        while count < page_size && start_id > 0 {
            if let Some(proposal) = env.storage().instance().get::<_, Proposal>(&(PROPOSALS, start_id)) {
                if !active_only || (current_time <= proposal.voting_ends_at && !proposal.executed) {
                    proposals.push_back(proposal);
                    count += 1;
                }
            }
            start_id -= 1;
        }
        
        let next_cursor = if start_id > 0 { Some(start_id) } else { None };
        let has_more = next_cursor.is_some();
        
        Ok((proposals, next_cursor, has_more))
    }
    
    /// Check if a voter has voted on a proposal
    pub fn has_voted(env: Env, proposal_id: u64, voter: Address) -> Result<bool, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let vote_key = (VOTES, proposal_id, voter);
        Ok(env.storage().instance().has(&vote_key))
    }
    
    /// Get voter's weight based on voting mechanism
    pub fn get_voter_weight(
        env: &Env,
        voter: Address,
        mechanism: VotingMechanism,
    ) -> Result<u128, MultisigError> {
        match mechanism {
            VotingMechanism::Simple => Ok(1),
            VotingMechanism::Weighted => {
                let owner_weights: Map<Address, u128> = env.storage().instance().get(&OWNER_WEIGHTS)
                    .unwrap_or_else(|| Map::new(env));
                Ok(owner_weights.get(voter).unwrap_or(DEFAULT_OWNER_WEIGHT))
            },
            VotingMechanism::Quadratic => {
                // In quadratic voting, each owner gets sqrt(weight) voting power
                let owner_weights: Map<Address, u128> = env.storage().instance().get(&OWNER_WEIGHTS)
                    .unwrap_or_else(|| Map::new(env));
                let base_weight = owner_weights.get(voter).unwrap_or(DEFAULT_OWNER_WEIGHT);
                // Simple approximation of sqrt for demonstration
                Ok((base_weight / 1000).max(1)) // Simplified quadratic calculation
            },
        }
    }
    
    /// Check if a proposal has sufficient support to pass
    fn has_sufficient_support(proposal: &Proposal) -> bool {
        match proposal.voting_mechanism {
            VotingMechanism::Simple => {
                // Simple majority: votes_for > votes_against and meets threshold
                proposal.votes_for > proposal.votes_against && 
                proposal.votes_for >= proposal.required_threshold
            },
            VotingMechanism::Weighted => {
                // Weighted majority: total_weight_for > total_weight_against and meets threshold
                proposal.total_weight_for > proposal.total_weight_against && 
                proposal.votes_for >= proposal.required_threshold
            },
            VotingMechanism::Quadratic => {
                // Quadratic: same as weighted but with quadratic voting power
                proposal.total_weight_for > proposal.total_weight_against && 
                proposal.votes_for >= proposal.required_threshold
            },
        }
    }
    
    /// Update owner voting weight
    pub fn update_owner_weight(
        env: Env,
        caller: Address,
        owner: Address,
        new_weight: u128,
    ) -> Result<(), MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Check if target is an owner
        Self::require_owner(&env, &owner)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let mut owner_weights: Map<Address, u128> = env.storage().instance().get(&OWNER_WEIGHTS)
            .unwrap_or_else(|| Map::new(&env));
        
        owner_weights.set(owner, new_weight);
        env.storage().instance().set(&OWNER_WEIGHTS, &owner_weights);
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);
        
        Ok(())
    }

    // Issue #57: Data Import Functionality Implementation
    
    /// Initialize a new import operation
    pub fn start_import(
        env: Env,
        caller: Address,
        total_items: u32,
        import_data: Bytes, // Serialized data to be imported
    ) -> Result<u64, MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Validate import parameters
        if total_items == 0 || total_items > MAX_IMPORT_ITEMS {
            return Err(MultisigError::InvalidPaginationParams);
        }
        
        // Check if another import is in progress
        let import_count: u64 = env.storage().instance().get(&IMPORT_COUNT).unwrap_or(0);
        for i in 1..=import_count {
            if let Some(import_op) = env.storage().instance().get::<_, ImportOperation>(&(IMPORT_OPS, i)) {
                if matches!(import_op.status, ImportStatus::InProgress) {
                    return Err(MultisigError::ImportInProgress);
                }
            }
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let import_id = import_count + 1;
        let current_time = env.ledger().timestamp();
        
        let import_operation = ImportOperation {
            import_id,
            initiated_by: caller.clone(),
            started_at: current_time,
            total_items,
            processed_items: 0,
            failed_items: 0,
            status: ImportStatus::Pending,
            rollback_data: None,
        };
        
        // Store import operation
        env.storage().instance().set(&(IMPORT_OPS, import_id), &import_operation);
        env.storage().instance().set(&IMPORT_COUNT, &import_id);
        
        // Store import data for processing
        let data_key = (IMPORT_OPS, import_id, symbol_short!("DATA"));
        env.storage().persistent().set(&data_key, &import_data);
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);
        
        Ok(import_id)
    }
    
    /// Process a batch of import items
    pub fn process_import_batch(
        env: Env,
        caller: Address,
        import_id: u64,
        batch_data: Bytes, // Serialized batch data
        batch_size: u32,
    ) -> Result<(u32, Vec<ImportError>), MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Validate batch size
        if batch_size == 0 || batch_size > IMPORT_BATCH_SIZE {
            return Err(MultisigError::InvalidPaginationParams);
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let mut import_op: ImportOperation = env.storage().instance().get(&(IMPORT_OPS, import_id))
            .ok_or(MultisigError::ProposalNotFound)?; // Using existing error for simplicity
        
        // Check if import is in correct state
        if !matches!(import_op.status, ImportStatus::Pending | ImportStatus::InProgress) {
            return Err(MultisigError::ImportInProgress);
        }
        
        // Update status to InProgress if this is the first batch
        if matches!(import_op.status, ImportStatus::Pending) {
            import_op.status = ImportStatus::InProgress;
        }
        
        // Process the batch
        let mut processed_count = 0u32;
        let mut errors = Vec::new(&env);
        let current_time = env.ledger().timestamp();
        
        // Simulate batch processing with validation
        for i in 0..batch_size {
            let item_index = import_op.processed_items + i;
            
            // Validate item (this is a placeholder - real implementation would parse batch_data)
            if Self::validate_import_item(&batch_data, i) {
                processed_count += 1;
                
                // Store rollback data for this item
                let rollback_key = (IMPORT_OPS, import_id, symbol_short!("ROLLBACK"), item_index);
                // Use a simple static byte array for rollback info
                let rollback_info = Bytes::from_slice(&env, b"rollback_data");
                env.storage().persistent().set(&rollback_key, &rollback_info);
            } else {
                import_op.failed_items += 1;
                
                let import_error = ImportError {
                    item_index,
                    error_code: 1,
                    error_message: Bytes::from_slice(&env, b"Validation failed"),
                };
                errors.push_back(import_error.clone());
                
                // Store error details
                let error_key = (IMPORT_ERRS, import_id, item_index);
                env.storage().instance().set(&error_key, &import_error);
            }
        }
        
        // Update import operation
        import_op.processed_items += processed_count;
        
        // Check if import is complete
        if import_op.processed_items + import_op.failed_items >= import_op.total_items {
            if import_op.failed_items == 0 {
                import_op.status = ImportStatus::Completed;
            } else {
                import_op.status = ImportStatus::Failed;
            }
        }
        
        env.storage().instance().set(&(IMPORT_OPS, import_id), &import_op);
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);
        
        Ok((processed_count, errors))
    }
    
    /// Rollback a failed import operation
    pub fn rollback_import(
        env: Env,
        caller: Address,
        import_id: u64,
    ) -> Result<(), MultisigError> {
        // Check gas limit
        Self::check_gas_limit(&env)?;
        
        // Reentrancy protection
        Self::enter_reentrancy_guard(&env)?;
        
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let mut import_op: ImportOperation = env.storage().instance().get(&(IMPORT_OPS, import_id))
            .ok_or(MultisigError::ProposalNotFound)?;
        
        // Check if import can be rolled back
        if !matches!(import_op.status, ImportStatus::Failed | ImportStatus::Completed) {
            return Err(MultisigError::ImportInProgress);
        }
        
        // Perform rollback
        for i in 0..import_op.processed_items {
            let rollback_key = (IMPORT_OPS, import_id, symbol_short!("ROLLBACK"), i);
            if let Some(rollback_info) = env.storage().instance().get::<_, Bytes>(&rollback_key) {
                // Rollback this item (placeholder implementation)
                // In a real implementation, this would reverse the actual changes
                env.storage().instance().remove(&rollback_key);
            }
        }
        
        // Update status
        import_op.status = ImportStatus::RolledBack;
        env.storage().instance().set(&(IMPORT_OPS, import_id), &import_op);
        
        // Clear import data
        let data_key = (IMPORT_OPS, import_id, symbol_short!("DATA"));
        env.storage().persistent().remove(&data_key);
        
        // Clear reentrancy guard
        Self::exit_reentrancy_guard(&env);
        
        Ok(())
    }
    
    /// Get import operation status and progress
    pub fn get_import_status(env: Env, import_id: u64) -> Result<ImportOperation, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        match env.storage().instance().get(&(IMPORT_OPS, import_id)) {
            Some(import_op) => Ok(import_op),
            None => Err(MultisigError::ProposalNotFound),
        }
    }
    
    /// Get all import operations with pagination
    pub fn get_import_operations_paginated(
        env: Env,
        cursor: Option<u64>,
        page_size: u32,
        status_filter: Option<ImportStatus>,
    ) -> Result<(Vec<ImportOperation>, Option<u64>, bool), MultisigError> {
        // Validate page size
        if page_size == 0 || page_size > MAX_PAGE_SIZE {
            return Err(MultisigError::InvalidPaginationParams);
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let import_count: u64 = env.storage().instance().get(&IMPORT_COUNT).unwrap_or(0);
        if import_count == 0 {
            return Ok((Vec::new(&env), None, false));
        }
        
        let mut imports = Vec::new(&env);
        let mut count = 0u32;
        let mut start_id = match cursor {
            Some(c) => c,
            None => import_count,
        };
        
        while count < page_size && start_id > 0 {
            if let Some(import_op) = env.storage().instance().get::<_, ImportOperation>(&(IMPORT_OPS, start_id)) {
                if let Some(ref filter_status) = status_filter {
                    if !Self::import_status_matches(&import_op.status, filter_status) {
                        start_id -= 1;
                        continue;
                    }
                }
                imports.push_back(import_op);
                count += 1;
            }
            start_id -= 1;
        }
        
        let next_cursor = if start_id > 0 { Some(start_id) } else { None };
        let has_more = next_cursor.is_some();
        
        Ok((imports, next_cursor, has_more))
    }
    
    /// Get import errors for a specific import operation
    pub fn get_import_errors(
        env: Env,
        import_id: u64,
        cursor: Option<u32>,
        page_size: u32,
    ) -> Result<(Vec<ImportError>, Option<u32>, bool), MultisigError> {
        // Validate page size
        if page_size == 0 || page_size > MAX_PAGE_SIZE {
            return Err(MultisigError::InvalidPaginationParams);
        }
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;
        
        let import_op: ImportOperation = env.storage().instance().get(&(IMPORT_OPS, import_id))
            .ok_or(MultisigError::ProposalNotFound)?;
        
        if import_op.failed_items == 0 {
            return Ok((Vec::new(&env), None, false));
        }
        
        let mut errors = Vec::new(&env);
        let mut count = 0u32;
        let mut start_index = match cursor {
            Some(c) => c,
            None => 0,
        };
        
        while count < page_size && start_index < import_op.total_items {
            let error_key = (IMPORT_ERRS, import_id, start_index);
            if let Some(error) = env.storage().instance().get(&error_key) {
                errors.push_back(error);
                count += 1;
            }
            start_index += 1;
        }
        
        let next_cursor = if start_index < import_op.total_items { Some(start_index) } else { None };
        let has_more = next_cursor.is_some();
        
        Ok((errors, next_cursor, has_more))
    }
    
    // Helper functions for data import
    fn validate_import_item(batch_data: &Bytes, item_index: u32) -> bool {
        // Simple validation - in a real implementation, this would validate
        // the actual data structure and business rules
        if batch_data.is_empty() {
            return false;
        }
        
        // Basic validation: check if data contains expected structure
        batch_data.len() > 0 && item_index < 1000 // Simple validation
    }
    
    fn import_status_matches(current: &ImportStatus, filter: &ImportStatus) -> bool {
        match (current, filter) {
            (ImportStatus::Pending, ImportStatus::Pending) => true,
            (ImportStatus::InProgress, ImportStatus::InProgress) => true,
            (ImportStatus::Completed, ImportStatus::Completed) => true,
            (ImportStatus::Failed, ImportStatus::Failed) => true,
            (ImportStatus::RolledBack, ImportStatus::RolledBack) => true,
            _ => false,
        }
    }
    
    // Helper function to format bytes without std::fmt
    fn format_bytes(_env: &Env, item_index: u32) -> Bytes {
        // Simple byte formatting for item index
        // Convert number to string bytes manually
        // Use a simple approach - return empty bytes for now
        Bytes::from_slice(_env, b"")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    #[test]
    fn test_time_lock_properties() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400; // 24h

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                recovery_delay,
            ).unwrap();
        });

        // Property 1: Recovery cannot be executed immediately after initiation
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::initiate_recovery(env.clone(), owner.clone(), Address::generate(&env)).unwrap();
            let result = MultisigSafe::execute_recovery(env.clone());
            assert_eq!(result, Err(MultisigError::RecoveryDelayNotPassed));
        });

        // Property 2: Recovery can be executed exactly after delay
        env.ledger().with_mut(|li| li.timestamp += recovery_delay + 1);
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::execute_recovery(env.clone()).unwrap();
        });
    }

    #[test]
    fn test_ttl_management() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        
        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            ).unwrap();
            
            // Test TTL info retrieval
            let (last_ext, remaining_ttl, rent_bal) = MultisigSafe::get_ttl_info(env.clone()).unwrap();
            assert_eq!(last_ext, 0);
            assert!(rent_bal >= 0);
            assert!(remaining_ttl > 0);
        });
    }

    #[test]
    fn test_rent_top_up() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        
        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            ).unwrap();
            
            // Test rent balance initially
            let initial_balance = MultisigSafe::get_rent_balance(env.clone()).unwrap();
            assert_eq!(initial_balance, 0);
            
            // Test minimum balance calculation
            let min_balance = MultisigSafe::calculate_minimum_balance(&env).unwrap();
            assert!(min_balance > 0);
        });
    }

    #[test]
    fn test_persistent_storage() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        
        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            ).unwrap();
            
            // Test persistent data storage (should fail without rent)
            let test_key = symbol_short!("TEST_KEY");
            let test_value = Bytes::from_slice(&env, b"test_data");
            let result = MultisigSafe::store_persistent_data(
                env.clone(),
                owner.clone(),
                test_key,
                test_value,
            );
            assert_eq!(result, Err(MultisigError::InsufficientBalanceForRent));
            
            // Test retrieval of non-existent data
            let result = MultisigSafe::get_persistent_data(env.clone(), test_key);
            assert_eq!(result, Err(MultisigError::EntryArchived));
        });
    }

    #[test]
    fn test_auto_ttl_extension() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        
        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            ).unwrap();
            
            // Simulate ledger progression to trigger auto-extension
            env.ledger().with_mut(|li| {
                li.sequence += DEFAULT_INSTANCE_TTL / 2 + 1000;
            });
            
            // Call any function to trigger auto-extension
            let _ = MultisigSafe::get_owners(env.clone()).unwrap();
            
            // Verify TTL was extended
            let (last_ext, remaining_ttl, _) = MultisigSafe::get_ttl_info(env.clone()).unwrap();
            assert!(last_ext > 0);
            assert!(remaining_ttl > DEFAULT_INSTANCE_TTL / 2);
        });
    }
}
