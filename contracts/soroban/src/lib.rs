#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, env, panic, symbol_short, token, Address,
    Bytes, Env, IntoVal, Map, Symbol, Vec,
};

use thiserror::Error;

#[derive(Error, Debug, Clone, Copy, PartialEq, Eq)]
#[contracterror]
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
    /// Proposal already exists
    ProposalAlreadyExists = 24,
    /// Proposal does not exist
    ProposalDoesNotExist = 25,
    /// Proposal already expired
    ProposalExpired = 26,
    /// Proposal already executed
    ProposalAlreadyExecuted = 27,
    /// Already voted on proposal
    AlreadyVoted = 28,
    /// Invalid proposal duration
    InvalidProposalDuration = 29,
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
pub struct SignerInfo {
    pub address: Address,
    pub weight: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ThresholdConfig {
    pub low: u32,     // Low security (e.g., 2-of-3)
    pub medium: u32,  // Medium security (e.g., 3-of-5)
    pub high: u32,    // High security (e.g., 5-of-7)
    pub current: u32, // Currently active threshold
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigChangeEvent {
    pub changed_by: Address,
    pub field: Symbol,
    pub old_value: Bytes,
    pub new_value: Bytes,
    pub changed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnfreezeEvent {
    pub unfrozen_by: Address,
    pub unfrozen_at: u64,
    pub reason: Bytes,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub proposal_id: u64,
    pub destination: Address,
    pub amount: i128,
    pub asset: Address,
    pub created_at: u64,
    pub expires_at: u64,
    pub executed: bool,
    pub votes: u32,
    pub required_votes: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub destination: Address,
    pub amount: i128,
    pub asset: Address,
    pub created_by: Address,
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
pub struct ProposalExpiredEvent {
    pub proposal_id: u64,
    pub expired_at: u64,
}

// Storage keys
const SIGNERS: Symbol = symbol_short!("SIGNERS");
const THRESHOLD_CONFIG: Symbol = symbol_short!("THRESH_CFG");
const OWNERS: Symbol = symbol_short!("OWNERS");
const THRESHOLD: Symbol = symbol_short!("THRESHLD");
const TRANSACTION_COUNT: Symbol = symbol_short!("TX_COUNT");
const TRANSACTIONS: Symbol = symbol_short!("TRANS");
const RECOVERY_ADDRESS: Symbol = symbol_short!("REC_ADDR");
const RECOVERY_DELAY: Symbol = symbol_short!("REC_DLAY");
const RECOVERY_REQUEST: Symbol = symbol_short!("REC_REQ");
const SIGNATURES: Symbol = symbol_short!("SIGS");
const RENT_BALANCE: Symbol = symbol_short!("RENT_BAL");
const LAST_TTL_EXTENSION: Symbol = symbol_short!("LAST_EXT");
const PERSISTENT_DATA: Symbol = symbol_short!("PERS_DATA");
const CONTRACT_VERSION: Symbol = symbol_short!("VERSION");
const UPGRADE_STATE: Symbol = symbol_short!("UPG_STATE");
const IS_FROZEN: Symbol = symbol_short!("IS_FROZEN");
const FREEZE_UNTIL: Symbol = symbol_short!("FREEZE_UNTIL");
const FREEZE_REASON: Symbol = symbol_short!("FREEZE_RSN");
const PROPOSAL_COUNT: Symbol = symbol_short!("PROP_COUNT");
const PROPOSALS: Symbol = symbol_short!("PROPOSALS");
const PROPOSAL_VOTES: Symbol = symbol_short!("PROP_VOTES");
const CLEANUP_THRESHOLD: u64 = 100; // Clean up after 100 expired proposals
const LAST_HEARTBEAT: Symbol = symbol_short!("LAST_HRTBT");
const RECOVERY_PATH_ADDRESS: Symbol = symbol_short!("REC_PATH_ADDR");
const LAST_ACTIVE_LEDGER: Symbol = symbol_short!("LAST_ACTIVE");
const RECOVERY_KEY: Symbol = symbol_short!("RECOVERY_KEY");

// Event topics
const CONFIG_CHANGE_EVENT: Symbol = symbol_short!("CONFIG_CHANGE");
const UPGRADE_EVENT: Symbol = symbol_short!("UPGRADE");
const FREEZE_EVENT: Symbol = symbol_short!("FREEZE");
const UNFREEZE_EVENT: Symbol = symbol_short!("UNFREEZE");
const PROPOSAL_CREATED_EVENT: Symbol = symbol_short!("PROP_CREAT");
const VOTE_CAST_EVENT: Symbol = symbol_short!("VOTE_CAST");
const PROPOSAL_EXECUTED_EVENT: Symbol = symbol_short!("PROP_EXEC");
const PROPOSAL_EXPIRED_EVENT: Symbol = symbol_short!("PROP_EXPIR");

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
const MIN_PROPOSAL_DURATION: u64 = 3600; // 1 hour in seconds
const MAX_PROPOSAL_DURATION: u64 = 2592000; // 30 days in seconds
const RECOVERY_PERIOD: u64 = 2592000; // 30 days in seconds (time-lock period)
const TIME_LOCK_PERIOD: u64 = 15552000; // 180 days in ledgers (6 months)

#[contract]
pub struct MultisigSafe;

#[contractimpl]
impl MultisigSafe {
    /// Initialize multisig wallet with signers and threshold configuration
    pub fn __init__(
        env: Env,
        signers: Vec<Address>,
        threshold_config: ThresholdConfig,
        recovery_address: Address,
        recovery_delay: u64,
        recovery_path_address: Address,
        recovery_key: Address,
    ) -> Result<(), MultisigError> {
        if signers.is_empty() {
            return Err(MultisigError::InvalidThreshold);
        }

        if threshold_config.current == 0 || threshold_config.current > signers.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        if signers.len() as u32 > MAX_OWNERS {
        if threshold == 0 || threshold > owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        if owners.len() as u32 > MAX_OWNERS {
            return Err(MultisigError::MaximumOwnersExceeded);
        }

        if recovery_delay < MIN_RECOVERY_DELAY {
            return Err(MultisigError::InvalidTimeDelay);
        }

        // Check for duplicate signers
        let mut unique_signers = std::collections::HashSet::new();
        for signer in &signers {
            if !unique_signers.insert(signer) {
                return Err(MultisigError::OwnerAlreadyExists);
            }
        }

        // Create signer info with default weight of 1 for each signer
        let signer_infos: Vec<SignerInfo> = signers
            .iter()
            .map(|addr| SignerInfo {
                address: addr.clone(),
                weight: 1u32, // Default weight
            })
            .collect();

        // Store signers and threshold config in persistent storage
        env.storage().persistent().set(&SIGNERS, &signer_infos);
        env.storage()
            .persistent()
            .set(&THRESHOLD_CONFIG, &threshold_config);

        // Store legacy threshold for backward compatibility
        env.storage()
            .instance()
            .set(&THRESHOLD, &threshold_config.current);
        env.storage().instance().set(&OWNERS, &signers);
        // Store owners in instance storage with TTL
        env.storage().instance().set(&OWNERS, &owners);
        env.storage().instance().set(&THRESHOLD, &threshold);
        env.storage()
            .instance()
            .set(&RECOVERY_ADDRESS, &recovery_address);
        env.storage()
            .instance()
            .set(&RECOVERY_DELAY, &recovery_delay);
        env.storage()
            .instance()
            .set(&RECOVERY_PATH_ADDRESS, &recovery_path_address);
        env.storage().instance().set(&RECOVERY_KEY, &recovery_key);
        env.storage().instance().set(&TRANSACTION_COUNT, &0u64);

        // Initialize rent balance tracking
        env.storage().instance().set(&RENT_BALANCE, &0i128);
        env.storage()
            .instance()
            .set(&LAST_TTL_EXTENSION, &env.ledger().sequence());

        // Initialize heartbeat timer
        env.storage()
            .instance()
            .set(&LAST_HEARTBEAT, &env.ledger().timestamp());
        // Initialize time-lock recovery tracking
        env.storage()
            .instance()
            .set(&LAST_ACTIVE_LEDGER, &env.ledger().sequence());

        // Set contract version for migration tracking
        env.storage()
            .instance()
            .set(&CONTRACT_VERSION, &CURRENT_VERSION);

        // Initialize freeze state
        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage()
            .instance()
            .set(&FREEZE_REASON, &Bytes::new(&env));

        // Initialize proposal system
        env.storage().instance().set(&PROPOSAL_COUNT, &0u64);

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
        caller.require_auth();
        Self::require_signer(&env, &caller)?;
        Self::require_owner(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let tx_count: u64 = env
            .storage()
            .instance()
            .get(&TRANSACTION_COUNT)
            .unwrap_or(0);
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
        env.storage()
            .instance()
            .set(&TRANSACTION_COUNT, &transaction_id);

        // Auto-sign if submitter is a signer
        Self::sign_transaction_internal(&env, transaction_id, caller.clone())?;

        Ok(transaction_id)
    }

    /// Sign a transaction
    pub fn sign_transaction(
        env: Env,
        caller: Address,
        transaction_id: u64,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;
        Self::require_owner(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        Self::sign_transaction_internal(&env, transaction_id, caller)
    }

    fn sign_transaction_internal(
        env: &Env,
        transaction_id: u64,
        caller: Address,
    ) -> Result<(), MultisigError> {
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

        // Auto-execute if threshold reached using weighted signatures
        let signed_weight = Self::calculate_signed_weight(env, transaction_id)?;
        let current_threshold = Self::get_current_threshold(env)?;
        if signed_weight >= current_threshold {
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

        let signed_weight = Self::calculate_signed_weight(env, transaction_id)?;
        let current_threshold = Self::get_current_threshold(env)?;
        if signed_weight < current_threshold {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Check if transaction has expired
        if env.ledger().timestamp() > transaction.expires_at {
            return Err(MultisigError::TransactionExpired);
        }

        // Execute transaction based on asset type
        if transaction.amount > 0 {
            // Determine if this is a native XLM transfer or SAC token transfer
            // For simplicity, we assume destination is a token address if it's not the contract address
            if transaction.destination != env.current_contract_address() {
                // SAC token transfer
                let token_client = token::Client::new(&env, &transaction.destination);
                token_client.transfer(
                    &env.current_contract_address(),
                    &transaction.destination,
                    &transaction.amount,
                );
            } else {
                // Native XLM transfer - use the built-in token contract
                let native_token_address = env.current_contract_address();
                let token_client = token::Client::new(&env, &native_token_address);
                token_client.transfer(
                    &env.current_contract_address(),
                    &transaction.destination,
                    &transaction.amount,
                );
            }
        }

        // Mark as executed
        transaction.executed = true;
        env.storage()
            .instance()
            .set(&(TRANSACTIONS, transaction_id), &transaction);

        // Reset heartbeat timer on successful transaction execution
        env.storage()
            .instance()
            .set(&LAST_HEARTBEAT, &env.ledger().timestamp());
        // Reset activity timer on successful transaction execution
        env.storage()
            .instance()
            .set(&LAST_ACTIVE_LEDGER, &env.ledger().sequence());

        Ok(())
    }

    /// Helper function to check if address is a signer
    fn require_signer(env: &Env, address: &Address) -> Result<(), MultisigError> {
        let signers: Vec<SignerInfo> = env
            .storage()
            .persistent()
            .get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;

        if !signers.iter().any(|signer| signer.address == *address) {
            return Err(MultisigError::Unauthorized);
        }

        Ok(())
    }

    /// Create a new proposal for voting
    pub fn create_proposal(
        env: Env,
        caller: Address,
        destination: Address,
        amount: i128,
        asset: Address,
        duration_seconds: u64,
    ) -> Result<u64, MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        // Validate duration
        if duration_seconds < MIN_PROPOSAL_DURATION || duration_seconds > MAX_PROPOSAL_DURATION {
            return Err(MultisigError::InvalidProposalDuration);
        }

        let current_time = env.ledger().timestamp();
        let expires_at = current_time + duration_seconds;

        // Generate unique proposal ID
        let proposal_count: u64 = env.storage().instance().get(&PROPOSAL_COUNT).unwrap_or(0);
        let proposal_id = proposal_count + 1;

        // Get threshold for required votes
        let threshold: u32 = env.storage().instance().get(&THRESHOLD).unwrap();

        let proposal = Proposal {
            proposal_id,
            destination: destination.clone(),
            amount,
            asset: asset.clone(),
            created_at: current_time,
            expires_at,
            executed: false,
            votes: 0,
            required_votes: threshold,
        };

        // Store proposal
        env.storage()
            .instance()
            .set(&(PROPOSALS, proposal_id), &proposal);
        env.storage().instance().set(&PROPOSAL_COUNT, &proposal_id);

        // Initialize vote tracking vector for this proposal
        let voters: Vec<Address> = Vec::new(&env);
        env.storage()
            .instance()
            .set(&(PROPOSAL_VOTES, proposal_id), &voters);

        // Emit proposal created event
        let proposal_created_event = ProposalCreatedEvent {
            proposal_id,
            destination,
            amount,
            asset,
            created_by: caller,
            created_at: current_time,
            expires_at,
        };

        env.events()
            .publish((PROPOSAL_CREATED_EVENT, symbol_short!("CREATED")), proposal_created_event);

        Ok(proposal_id)
    }

    /// Vote for a proposal
    pub fn vote_for_proposal(env: Env, caller: Address, proposal_id: u64) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
        
        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;
        
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let mut proposal: Proposal = env
    /// Helper function to calculate total weight of signed transactions
    fn calculate_signed_weight(env: &Env, transaction_id: u64) -> Result<u32, MultisigError> {
        let signers: Vec<SignerInfo> = env
            .storage()
            .persistent()
            .get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;

        let mut total_weight = 0u32;
        for signer in &signers {
            let signature_key = (SIGNATURES, transaction_id, signer.address.clone());
            if env.storage().instance().has(&signature_key) {
                total_weight += signer.weight;
            }
        }

        Ok(total_weight)
    }

    /// Helper function to get current threshold
    fn get_current_threshold(env: &Env) -> Result<u32, MultisigError> {
        let threshold_config: ThresholdConfig = env
            .storage()
            .persistent()
            .get(&THRESHOLD_CONFIG)
            .ok_or(MultisigError::EntryArchived)?;
        Ok(threshold_config.current)
    }

    /// Change threshold level (Low, Medium, High)
    pub fn change_threshold_level(
        env: Env,
        caller: Address,
        new_level: Symbol, // "low", "medium", or "high"
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let mut threshold_config: ThresholdConfig = env
            .storage()
            .persistent()
            .get(&THRESHOLD_CONFIG)
            .ok_or(MultisigError::EntryArchived)?;

        let old_threshold = threshold_config.current;
        let old_value = Bytes::from_slice(&env, &old_threshold.to_le_bytes());

        // Update threshold based on level
        match new_level {
            level if level == symbol_short!("low") => {
                threshold_config.current = threshold_config.low;
            }
            level if level == symbol_short!("medium") => {
                threshold_config.current = threshold_config.medium;
            }
            level if level == symbol_short!("high") => {
                threshold_config.current = threshold_config.high;
            }
            _ => return Err(MultisigError::InvalidThreshold),
        }

        // Validate new threshold
        let signers: Vec<SignerInfo> = env
            .storage()
            .persistent()
            .get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;
        if threshold_config.current == 0 || threshold_config.current > signers.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        // Store updated config
        env.storage()
            .persistent()
            .set(&THRESHOLD_CONFIG, &threshold_config);
        env.storage()
            .instance()
            .get(&(PROPOSALS, proposal_id))
            .ok_or(MultisigError::ProposalDoesNotExist)?;

        // Check if proposal has expired
        if env.ledger().timestamp() > proposal.expires_at {
            return Err(MultisigError::ProposalExpired);
        }

        // Check if proposal is already executed
        if proposal.executed {
            return Err(MultisigError::ProposalAlreadyExecuted);
        }

        // Get current voters list
        let mut voters: Vec<Address> = env
            .storage()
            .instance()
            .get(&(PROPOSAL_VOTES, proposal_id))
            .unwrap_or_default();

        // Check if already voted
        if voters.contains(&caller) {
            return Err(MultisigError::AlreadyVoted);
        }

        // Add vote
        voters.push_back(caller.clone());
        proposal.votes += 1;

        // Update storage
        env.storage()
            .instance()
            .set(&(PROPOSALS, proposal_id), &proposal);
        env.storage()
            .instance()
            .set(&(PROPOSAL_VOTES, proposal_id), &voters);

        // Emit vote cast event
        let vote_cast_event = VoteCastEvent {
            proposal_id,
            voter: caller.clone(),
            voted_at: env.ledger().timestamp(),
        };

        env.events()
            .publish((VOTE_CAST_EVENT, symbol_short!("CAST")), vote_cast_event);

        // Auto-execute if threshold reached
        if proposal.votes >= proposal.required_votes {
            Self::execute_proposal(env.clone(), proposal_id)?;
        }

        Ok(())
    }

    /// Execute a proposal that has sufficient votes
    pub fn execute_proposal(env: Env, proposal_id: u64) -> Result<(), MultisigError> {
        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&(PROPOSALS, proposal_id))
            .ok_or(MultisigError::ProposalDoesNotExist)?;

        if proposal.executed {
            return Err(MultisigError::ProposalAlreadyExecuted);
        }

        if proposal.votes < proposal.required_votes {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Check if proposal has expired
        if env.ledger().timestamp() > proposal.expires_at {
            return Err(MultisigError::ProposalExpired);
        }

        // Execute the proposal (transfer tokens)
        if proposal.amount > 0 {
            let token_client = token::Client::new(&env, &proposal.asset);
            token_client.transfer(
                &env.current_contract_address(),
                &proposal.destination,
                &proposal.amount,
            );
        }

        // Mark as executed
        proposal.executed = true;
        env.storage()
            .instance()
            .set(&(PROPOSALS, proposal_id), &proposal);

        // Emit proposal executed event
        let proposal_executed_event = ProposalExecutedEvent {
            proposal_id,
            executed_by: env.current_contract_address(),
            executed_at: env.ledger().timestamp(),
        };

        env.events()
            .publish((PROPOSAL_EXECUTED_EVENT, symbol_short!("EXECUTED")), proposal_executed_event);

        Ok(())
    }

    /// Check and expire proposals that have passed their expiration time
    pub fn cleanup_expired_proposals(env: Env) -> Result<u64, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let proposal_count: u64 = env.storage().instance().get(&PROPOSAL_COUNT).unwrap_or(0);
        let current_time = env.ledger().timestamp();
        let mut cleaned_count = 0u64;

        // Check proposals in batches to avoid gas limit issues
        for proposal_id in 1..=proposal_count {
            if let Some(mut proposal): Option<Proposal> = env
                .storage()
                .instance()
                .get(&(PROPOSALS, proposal_id))
            {
                // Only process non-executed proposals that have expired
                if !proposal.executed && current_time > proposal.expires_at {
                    // Mark as expired (but keep for audit trail)
                    proposal.executed = true; // Use executed flag to prevent further actions
                    env.storage()
                        .instance()
                        .set(&(PROPOSALS, proposal_id), &proposal);

                    // Clean up vote tracking to save storage
                    env.storage()
                        .instance()
                        .remove(&(PROPOSAL_VOTES, proposal_id));

                    // Emit expiration event
                    let proposal_expired_event = ProposalExpiredEvent {
                        proposal_id,
                        expired_at: current_time,
                    };

                    env.events()
                        .publish((PROPOSAL_EXPIRED_EVENT, symbol_short!("EXPIRED")), proposal_expired_event);

                    cleaned_count += 1;

                    // Limit cleanup per transaction to prevent gas issues
                    if cleaned_count >= CLEANUP_THRESHOLD {
                        break;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    /// Get proposal details
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        match env.storage().instance().get(&(PROPOSALS, proposal_id)) {
            Some(proposal) => Ok(proposal),
            None => Err(MultisigError::ProposalDoesNotExist),
        }
    }

    /// Get all active (non-executed and non-expired) proposals
    pub fn get_active_proposals(env: Env) -> Result<Vec<u64>, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let proposal_count: u64 = env.storage().instance().get(&PROPOSAL_COUNT).unwrap_or(0);
        let current_time = env.ledger().timestamp();
        let mut active_proposals = Vec::new(&env);

        for proposal_id in 1..=proposal_count {
            if let Some(proposal): Option<Proposal> = env
                .storage()
                .instance()
                .get(&(PROPOSALS, proposal_id))
            {
                // Only include non-executed proposals that haven't expired
                if !proposal.executed && current_time <= proposal.expires_at {
                    active_proposals.push_back(proposal_id);
                }
            }
        }

        Ok(active_proposals)
    }

    /// Check if an address has voted on a specific proposal
    pub fn has_voted_on_proposal(env: Env, proposal_id: u64, voter: Address) -> Result<bool, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let voters: Vec<Address> = env
            .storage()
            .instance()
            .get(&(PROPOSAL_VOTES, proposal_id))
            .unwrap_or_default();
        
        Ok(voters.contains(&voter))
    }

    /// Add a new owner
    pub fn add_owner(env: Env, caller: Address, new_owner: Address) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        let mut owners: Vec<Address> = env.storage().instance().get(&OWNERS).unwrap_or_default();

        if owners.len() as u32 >= MAX_OWNERS {
            .set(&THRESHOLD, &threshold_config.current);

        // Emit configuration change event
        let new_value = Bytes::from_slice(&env, &threshold_config.current.to_le_bytes());
        let config_event = ConfigChangeEvent {
            changed_by: caller.clone(),
            field: symbol_short!("THRESHOLD"),
            old_value,
            new_value,
            changed_at: env.ledger().timestamp(),
        };

        env.events().publish(
            (CONFIG_CHANGE_EVENT, symbol_short!("THRESHOLD_CHANGED")),
            config_event,
        );

        Ok(())
    }

    /// Update signer weight
    pub fn update_signer_weight(
        env: Env,
        caller: Address,
        signer_address: Address,
        new_weight: u32,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let mut signers: Vec<SignerInfo> = env
            .storage()
            .persistent()
            .get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;

        // Find and update the signer
        let signer_index = signers
            .iter()
            .position(|signer| signer.address == signer_address)
            .ok_or(MultisigError::OwnerDoesNotExist)?;

        let old_weight = signers[signer_index].weight;
        signers[signer_index].weight = new_weight;

        // Validate new weight
        if new_weight == 0 {
            return Err(MultisigError::InvalidThreshold);
        }

        // Store updated signers
        env.storage().persistent().set(&SIGNERS, &signers);

        // Emit configuration change event
        let old_value = Bytes::from_slice(&env, &old_weight.to_le_bytes());
        let new_value = Bytes::from_slice(&env, &new_weight.to_le_bytes());
        let config_event = ConfigChangeEvent {
            changed_by: caller.clone(),
            field: symbol_short!("WEIGHT"),
            old_value,
            new_value,
            changed_at: env.ledger().timestamp(),
        };

        env.events().publish(
            (CONFIG_CHANGE_EVENT, symbol_short!("WEIGHT_CHANGED")),
            config_event,
        );

        Ok(())
    }
        let mut owners: Vec<Address> = env.storage().instance().get(&OWNERS).unwrap_or_default();

    /// Add a new signer
    pub fn add_signer(
        env: Env,
        caller: Address,
        new_signer: Address,
        weight: u32,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let mut signers: Vec<SignerInfo> = env
            .storage()
            .persistent()
            .get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;

        if signers.len() as u32 >= MAX_OWNERS {
            return Err(MultisigError::MaximumOwnersExceeded);
        }

        if weight == 0 {
            return Err(MultisigError::InvalidThreshold);
        }

        if signers.iter().any(|signer| signer.address == new_signer) {
            return Err(MultisigError::OwnerAlreadyExists);
        }

        signers.push(SignerInfo {
            address: new_signer.clone(),
            weight,
        });

        env.storage().persistent().set(&SIGNERS, &signers);

        // Update legacy owners list for backward compatibility
        let owners: Vec<Address> = signers
            .iter()
            .map(|signer| signer.address.clone())
            .collect();
        env.storage().instance().set(&OWNERS, &owners);

        // Emit configuration change event
        let new_value = Bytes::from_slice(&env, &weight.to_le_bytes());
        let config_event = ConfigChangeEvent {
            changed_by: caller.clone(),
            field: symbol_short!("SIGNER_ADDED"),
            new_value,
            old_value: Bytes::new(&env),
            changed_at: env.ledger().timestamp(),
        };

        env.events().publish(
            (CONFIG_CHANGE_EVENT, symbol_short!("SIGNER_ADDED")),
            config_event,
        );

        Ok(())
    }

    /// Remove a signer with deadlock protection
    pub fn remove_signer(
        env: Env,
        caller: Address,
        signer_to_remove: Address,
    /// Remove an owner
    pub fn remove_owner(
        env: Env,
        caller: Address,
        owner_to_remove: Address,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let mut signers: Vec<SignerInfo> = env
            .storage()
            .persistent()
            .get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;

        // Deadlock protection: prevent removing the last signer
        if signers.len() <= 1 {
            return Err(MultisigError::CannotRemoveLastOwner);
        }

        // Check if removing would break threshold
        let current_threshold = Self::get_current_threshold(&env)?;
        let signer_to_remove_weight = signers
            .iter()
            .find(|signer| signer.address == signer_to_remove)
            .map(|signer| signer.weight)
            .ok_or(MultisigError::OwnerDoesNotExist)?;

        let total_weight_without_signer: u32 = signers
            .iter()
            .filter(|signer| signer.address != signer_to_remove)
            .map(|signer| signer.weight)
            .sum();

        if total_weight_without_signer < current_threshold {
            return Err(MultisigError::InvalidThreshold);
        }

        // Remove signer
        let index = signers
            .iter()
            .position(|signer| signer.address == signer_to_remove)
            .ok_or(MultisigError::OwnerDoesNotExist)?;

        let removed_weight = signers[index].weight;
        signers.remove(index);

        env.storage().persistent().set(&SIGNERS, &signers);

        // Update legacy owners list for backward compatibility
        let owners: Vec<Address> = signers
            .iter()
            .map(|signer| signer.address.clone())
            .collect();
        env.storage().instance().set(&OWNERS, &owners);

        // Emit configuration change event
        let old_value = Bytes::from_slice(&env, &removed_weight.to_le_bytes());
        let config_event = ConfigChangeEvent {
            changed_by: caller.clone(),
            field: symbol_short!("SIGNER_REMOVED"),
            old_value,
            new_value: Bytes::new(&env),
            changed_at: env.ledger().timestamp(),
        };

        env.events().publish(
            (CONFIG_CHANGE_EVENT, symbol_short!("SIGNER_REMOVED")),
            config_event,
        );

        Ok(())
    }

    /// Change the signature threshold (legacy function for backward compatibility)
    /// Change the signature threshold
    pub fn change_threshold(
        env: Env,
        caller: Address,
        new_threshold: u32,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let mut threshold_config: ThresholdConfig = env
            .storage()
            .persistent()
            .get(&THRESHOLD_CONFIG)
            .ok_or(MultisigError::EntryArchived)?;

        let old_threshold = threshold_config.current;
        let old_value = Bytes::from_slice(&env, &old_threshold.to_le_bytes());

        // Validate new threshold
        let signers: Vec<SignerInfo> = env
            .storage()
            .persistent()
            .get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;
        if new_threshold == 0 || new_threshold > signers.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        // Update threshold config
        threshold_config.current = new_threshold;
        env.storage()
            .persistent()
            .set(&THRESHOLD_CONFIG, &threshold_config);
        env.storage().instance().set(&THRESHOLD, &new_threshold);

        // Emit configuration change event
        let new_value = Bytes::from_slice(&env, &new_threshold.to_le_bytes());
        let config_event = ConfigChangeEvent {
            changed_by: caller.clone(),
            field: symbol_short!("THRESHOLD"),
            old_value,
            new_value,
            changed_at: env.ledger().timestamp(),
        };

        env.events().publish(
            (CONFIG_CHANGE_EVENT, symbol_short!("THRESHOLD_CHANGED")),
            config_event,
        );

        Ok(())
    }

    /// Initiate recovery process
    pub fn initiate_recovery(
        env: Env,
        caller: Address,
        new_recovery_address: Address,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

        // Check if recovery is already in progress
        if env.storage().instance().has(&RECOVERY_REQUEST) {
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
            .set(&RECOVERY_REQUEST, &recovery_request);

        Ok(())
    }

    /// Execute recovery after delay
    pub fn execute_recovery(env: Env) -> Result<(), MultisigError> {
        let recovery_request: RecoveryRequest = env
            .storage()
            .instance()
            .get(&RECOVERY_REQUEST)
            .ok_or(MultisigError::RecoveryNotInitiated)?;

        if env.ledger().timestamp() < recovery_request.execute_after {
            return Err(MultisigError::RecoveryDelayNotPassed);
        }

        // Update recovery address
        env.storage()
            .instance()
            .set(&RECOVERY_ADDRESS, &recovery_request.new_recovery_address);

        // Clear recovery request
        env.storage().instance().remove(&RECOVERY_REQUEST);

        Ok(())
    }

    /// Cancel ongoing recovery
    pub fn cancel_recovery(env: Env, caller: Address) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

        if !env.storage().instance().has(&RECOVERY_REQUEST) {
            return Err(MultisigError::RecoveryNotInitiated);
        }

        env.storage().instance().remove(&RECOVERY_REQUEST);

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
            .get(&RECOVERY_ADDRESS)
            .ok_or(MultisigError::InvalidRecoveryAddress)?;

        if caller != recovery_address {
            return Err(MultisigError::Unauthorized);
        }

        if new_owners.is_empty() || new_threshold == 0 || new_threshold > new_owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        if new_owners.len() as u32 > MAX_OWNERS {
            return Err(MultisigError::MaximumOwnersExceeded);
        }

        // Update owners and threshold
        env.storage().instance().set(&OWNERS, &new_owners);
        env.storage().instance().set(&THRESHOLD, &new_threshold);
        env.storage()
            .instance()
            .set(&RECOVERY_ADDRESS, &new_recovery_address);

        // Clear any ongoing recovery
        env.storage().instance().remove(&RECOVERY_REQUEST);

        // Auto-unfreeze wallet after successful recovery for safety
        let current_time = env.ledger().timestamp();
        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage().instance().set(
            &FREEZE_REASON,
            &Bytes::from_slice(&env, b"Auto-unfreeze: recovery executed"),
        );

        // Emit recovery unfreeze event
        let unfreeze_event = UnfreezeEvent {
            unfrozen_by: caller.clone(),
            unfrozen_at: current_time,
            reason: Bytes::from_slice(&env, b"Auto-unfreeze: recovery executed"),
        };

        env.events()
            .publish((UNFREEZE_EVENT, symbol_short!("RECOVERY")), unfreeze_event);

        Ok(())
    }

    /// Heartbeat function to reset the time-lock timer
    /// Can be called by any primary owner to prove activity
    /// Heartbeat function to reset the time-lock timer without moving funds
    /// Can be called by any owner to prove activity
    pub fn heartbeat(env: Env, caller: Address) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        // Update last heartbeat timestamp
        env.storage()
            .instance()
            .set(&LAST_HEARTBEAT, &env.ledger().timestamp());
        // Update last activity ledger
        env.storage()
            .instance()
            .set(&LAST_ACTIVE_LEDGER, &env.ledger().sequence());

        Ok(())
    }

    /// Cancel recovery function for primary signers
    /// Resets the heartbeat timer and cancels any pending recovery
    pub fn cancel_time_lock_recovery(env: Env, caller: Address) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;

        // Check if wallet is frozen
        Self::check_frozen_status(&env)?;

        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        // Reset heartbeat timer
        env.storage()
            .instance()
            .set(&LAST_HEARTBEAT, &env.ledger().timestamp());

        // Clear any ongoing recovery request
        env.storage().instance().remove(&RECOVERY_REQUEST);

        Ok(())
    }

    /// Time-lock recovery function that activates after RECOVERY_PERIOD
    /// Recovery address gains master weight to reset signers after period expires
    /// Time-lock recovery function that activates after inactivity period
    /// Can only be called by the recovery key after time-lock period expires
    pub fn time_lock_recovery(
        env: Env,
        caller: Address,
        new_owners: Vec<Address>,
        new_threshold: u32,
        new_recovery_address: Address,
        new_recovery_path_address: Address,
    ) -> Result<(), MultisigError> {
        caller.require_auth();

        // Verify caller is the recovery path address
        let recovery_path_address: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_PATH_ADDRESS)
            .ok_or(MultisigError::InvalidRecoveryAddress)?;

        if caller != recovery_path_address {
            return Err(MultisigError::Unauthorized);
        }

        // Check if recovery period has passed
        let last_heartbeat: u64 = env
            .storage()
            .instance()
            .get(&LAST_HEARTBEAT)
            .ok_or(MultisigError::EntryArchived)?;
        let current_time = env.ledger().timestamp();

        if current_time.saturating_sub(last_heartbeat) < RECOVERY_PERIOD {
        new_recovery_key: Address,
    ) -> Result<(), MultisigError> {
        caller.require_auth();

        // Verify caller is the recovery key
        let recovery_key: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_KEY)
            .ok_or(MultisigError::InvalidRecoveryAddress)?;

        if caller != recovery_key {
            return Err(MultisigError::Unauthorized);
        }

        // Check if time-lock period has passed
        let last_active: u32 = env
            .storage()
            .instance()
            .get(&LAST_ACTIVE_LEDGER)
            .ok_or(MultisigError::EntryArchived)?;
        let current_ledger = env.ledger().sequence();

        if current_ledger.saturating_sub(last_active) < TIME_LOCK_PERIOD as u32 {
            return Err(MultisigError::RecoveryDelayNotPassed);
        }

        // Validate new owners and threshold
        if new_owners.is_empty() || new_threshold == 0 || new_threshold > new_owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        if new_owners.len() as u32 > MAX_OWNERS {
            return Err(MultisigError::MaximumOwnersExceeded);
        }

        // Update wallet state
        env.storage().instance().set(&OWNERS, &new_owners);
        env.storage().instance().set(&THRESHOLD, &new_threshold);
        env.storage()
            .instance()
            .set(&RECOVERY_ADDRESS, &new_recovery_address);
        env.storage()
            .instance()
            .set(&RECOVERY_PATH_ADDRESS, &new_recovery_path_address);

        // Reset heartbeat timer
        env.storage()
            .instance()
            .set(&LAST_HEARTBEAT, &env.ledger().timestamp());
            .set(&RECOVERY_KEY, &new_recovery_key);

        // Reset activity timer
        env.storage()
            .instance()
            .set(&LAST_ACTIVE_LEDGER, &env.ledger().sequence());

        // Clear any ongoing recovery
        env.storage().instance().remove(&RECOVERY_REQUEST);

        // Auto-unfreeze wallet after successful time-lock recovery
        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage().instance().set(
            &FREEZE_REASON,
            &Bytes::from_slice(&env, b"Auto-unfreeze: time-lock recovery executed"),
        );

        // Emit time-lock recovery event
        let unfreeze_event = UnfreezeEvent {
            unfrozen_by: caller.clone(),
            unfrozen_at: env.ledger().timestamp(),
            reason: Bytes::from_slice(&env, b"Time-lock recovery executed"),
        };

        env.events()
            .publish((UNFREEZE_EVENT, symbol_short!("TIME_LOCK")), unfreeze_event);

        Ok(())
    }

    /// Check if recovery path is currently active (has master weight)
    pub fn is_recovery_path_active(env: Env) -> Result<bool, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let last_heartbeat: u64 = env
            .storage()
            .instance()
            .get(&LAST_HEARTBEAT)
            .ok_or(MultisigError::EntryArchived)?;
        let current_time = env.ledger().timestamp();

        Ok(current_time.saturating_sub(last_heartbeat) >= RECOVERY_PERIOD)
    }

    /// Get time-lock recovery status information
    pub fn get_recovery_status(env: Env) -> Result<(u64, u64, bool, Address), MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let last_heartbeat: u64 = env
            .storage()
            .instance()
            .get(&LAST_HEARTBEAT)
            .ok_or(MultisigError::EntryArchived)?;
        let current_time = env.ledger().timestamp();
        let time_since_heartbeat = current_time.saturating_sub(last_heartbeat);
        let is_recovery_active = time_since_heartbeat >= RECOVERY_PERIOD;

        let recovery_path_address: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_PATH_ADDRESS)
            .ok_or(MultisigError::InvalidRecoveryAddress)?;

        Ok((
            last_heartbeat,
            time_since_heartbeat,
            is_recovery_active,
            recovery_path_address,
        ))
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
        Self::require_signer(&env, &caller)?;

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
        let freeze_threshold =
            (normal_threshold + FREEZE_THRESHOLD_RATIO - 1) / FREEZE_THRESHOLD_RATIO;
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
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .ok_or(MultisigError::OwnerDoesNotExist)?;
        let mut signature_count = 0u32;
        for owner in &owners {
            let owner_freeze_key = (FREEZE_EVENT, freeze_tx_id, owner);
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
        env.storage()
            .instance()
            .set(&FREEZE_REASON, &reason.clone());

        // Emit freeze event
        let freeze_event = FreezeEvent {
            frozen_by: caller.clone(),
            frozen_at: current_time,
            freeze_duration: duration_seconds,
            reason: reason.clone(),
        };

        env.events()
            .publish((FREEZE_EVENT, symbol_short!("EXECUTED")), freeze_event);

        // Clean up freeze signatures
        for owner in &owners {
            let owner_freeze_key = (FREEZE_EVENT, freeze_tx_id, owner);
            env.storage().instance().remove(&owner_freeze_key);
        }

        Ok(())
    }

    /// Unfreeze the wallet with high threshold (all owners)
    pub fn unfreeze_wallet(env: Env, caller: Address, reason: Bytes) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

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
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
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
        for owner in &owners {
            let owner_unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, owner);
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
        env.storage()
            .instance()
            .set(&FREEZE_REASON, &Bytes::new(&env));

        // Emit unfreeze event
        let unfreeze_event = UnfreezeEvent {
            unfrozen_by: caller.clone(),
            unfrozen_at: current_time,
            reason: reason.clone(),
        };

        env.events()
            .publish((UNFREEZE_EVENT, symbol_short!("EXECUTED")), unfreeze_event);

        // Clean up unfreeze signatures
        for owner in &owners {
            let owner_unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, owner);
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
        let freeze_reason: Bytes = env
            .storage()
            .instance()
            .get(&FREEZE_REASON)
            .unwrap_or_default();

        env.storage().instance().set(&IS_FROZEN, &false);
        env.storage().instance().set(&FREEZE_UNTIL, &0u64);
        env.storage()
            .instance()
            .set(&FREEZE_REASON, &Bytes::new(env));

        // Emit auto-unfreeze event
        let unfreeze_event = UnfreezeEvent {
            unfrozen_by: env.current_contract_address(),
            unfrozen_at: current_time,
            reason: Bytes::from_slice(env, b"Auto-unfreeze: period expired"),
        };

        env.events()
            .publish((UNFREEZE_EVENT, symbol_short!("AUTO")), unfreeze_event);

        Ok(())
    }

    /// Get current freeze status
    pub fn get_freeze_status(env: Env) -> Result<(bool, u64, Bytes), MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let is_frozen: bool = env.storage().instance().get(&IS_FROZEN).unwrap_or(false);
        let freeze_until: u64 = env.storage().instance().get(&FREEZE_UNTIL).unwrap_or(0);
        let freeze_reason: Bytes = env
            .storage()
            .instance()
            .get(&FREEZE_REASON)
            .unwrap_or_default();

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
    pub fn has_signed_freeze(
        env: Env,
        freeze_tx_id: u64,
        owner: Address,
    ) -> Result<bool, MultisigError> {
        let freeze_key = (FREEZE_EVENT, freeze_tx_id, owner);
        Ok(env.storage().instance().has(&freeze_key))
    }

    pub fn has_signed_unfreeze(
        env: Env,
        unfreeze_tx_id: u64,
        owner: Address,
    ) -> Result<bool, MultisigError> {
        let unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, owner);
        Ok(env.storage().instance().has(&unfreeze_key))
    }

    pub fn has_signed_upgrade(
        env: Env,
        upgrade_tx_id: u64,
        owner: Address,
    ) -> Result<bool, MultisigError> {
        let upgrade_key = (UPGRADE_EVENT, upgrade_tx_id, owner);
        Ok(env.storage().instance().has(&upgrade_key))
    }
        let freeze_key = (FREEZE_EVENT, freeze_tx_id, owner);
        Ok(env.storage().instance().has(&freeze_key))
    }

    /// Helper function to check if an owner has signed a specific unfreeze request
    pub fn has_signed_unfreeze(
        env: Env,
        unfreeze_tx_id: u64,
        owner: Address,
    ) -> Result<bool, MultisigError> {
        let unfreeze_key = (UNFREEZE_EVENT, unfreeze_tx_id, owner);
        Ok(env.storage().instance().has(&unfreeze_key))
    }

    /// Upgrade the contract to a new WASM hash
    /// Requires the "High" threshold of signers (all owners)
    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: Bytes) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;

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
        for owner in &owners {
            let owner_upgrade_key = (UPGRADE_EVENT, upgrade_tx_id, owner);
            if env.storage().instance().has(&owner_upgrade_key) {
                signature_count += 1;
            }
        }

        // Check if we have enough signatures (High threshold = all owners)
        if signature_count < high_threshold {
            return Err(MultisigError::InsufficientSignatures);
        }

        // Set upgrade state to prevent concurrent upgrades
        env.storage().instance().set(&UPGRADE_STATE, &true);

        // Get current WASM hash and version
        let current_contract_id = env.current_contract_address();
        let old_wasm_hash = env.deployer().get_current_wasm_hash(&current_contract_id);
        let current_version: u32 = env.storage().instance().get(&CONTRACT_VERSION).unwrap_or(0);

        // Validate that new WASM hash is different from current
        if new_wasm_hash == old_wasm_hash {
            env.storage().instance().remove(&UPGRADE_STATE);
            return Err(MultisigError::InvalidWasmHash);
        }

        // Perform data migration before upgrade (if needed)
        Self::migrate_data(&env, current_version, CURRENT_VERSION)?;

        // Perform the upgrade
        env.deployer().update_current_contract_wasm(&new_wasm_hash);

        // Update version
        env.storage()
            .instance()
            .set(&CONTRACT_VERSION, &(CURRENT_VERSION + 1));

        // Emit upgrade event
        let upgrade_event = UpgradeEvent {
            old_wasm_hash,
            new_wasm_hash: new_wasm_hash.clone(),
            upgraded_by: caller,
            upgraded_at: env.ledger().timestamp(),
        };

        env.events()
            .publish((UPGRADE_EVENT, symbol_short!("EXECUTED")), upgrade_event);

        // Clean up upgrade signatures and state
        for owner in &owners {
            let owner_upgrade_key = (UPGRADE_EVENT, upgrade_tx_id, owner);
            env.storage().instance().remove(&owner_upgrade_key);
        }
        env.storage().instance().remove(&UPGRADE_STATE);

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
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .ok_or(MultisigError::EntryArchived)?;
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&THRESHOLD)
            .ok_or(MultisigError::EntryArchived)?;

        // Validate data integrity
        if owners.is_empty() || threshold == 0 || threshold > owners.len() as u32 {
            return Err(MultisigError::InvalidThreshold);
        }

        Ok(())
    }

    /// Helper function to check if an owner has signed a specific upgrade
    pub fn has_signed_upgrade(
        env: Env,
        upgrade_tx_id: u64,
        owner: Address,
    ) -> Result<bool, MultisigError> {
        let upgrade_key = (UPGRADE_EVENT, upgrade_tx_id, owner);
        Ok(env.storage().instance().has(&upgrade_key))
    }

    /// Get current contract version
    pub fn get_version(env: Env) -> Result<u32, MultisigError> {
        match env.storage().instance().get(&CONTRACT_VERSION) {
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

        match env
            .storage()
            .instance()
            .get(&(TRANSACTIONS, transaction_id))
        {
            Some(transaction) => Ok(transaction),
            None => Err(MultisigError::InvalidTransactionId),
        }
    }

    pub fn get_recovery_info(
        env: Env,
        upgrade_tx_id: u64,
        owner: Address,
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let signers: Vec<SignerInfo> = env.storage().persistent().get(&SIGNERS)
            .ok_or(MultisigError::EntryArchived)?;
        
        Ok(signers.iter().any(|signer| signer.address == address))

        let recovery_address: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_ADDRESS)
            .ok_or(MultisigError::EntryArchived)?;
        let recovery_delay: u64 = env.storage().instance().get(&RECOVERY_DELAY).unwrap();
        let recovery_request: Option<RecoveryRequest> =
            env.storage().instance().get(&RECOVERY_REQUEST);

        Ok((recovery_address, recovery_delay, recovery_request))
    }

    pub fn is_owner(env: Env, address: Address) -> Result<bool, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        match env.storage().instance().get(&OWNERS) {
            Some(owners) => Ok(owners.contains(&address)),
            None => Err(MultisigError::EntryArchived),
        }
    }

    pub fn has_signed(
        env: Env,
        transaction_id: u64,
        signer: Address,
    ) -> Result<bool, MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        Ok(env
            .storage()
            .instance()
            .has(&(SIGNATURES, transaction_id, signer)))
    }

    /// Helper function to check if address is an owner
    fn require_owner(env: &Env, address: &Address) -> Result<(), MultisigError> {
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS).unwrap_or_default();

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

        env.storage()
            .instance()
            .extend_ttl(env.ledger().sequence(), extend_ledgers);
        env.storage()
            .instance()
            .set(&LAST_TTL_EXTENSION, &env.ledger().sequence());

        Ok(())
    }

    /// Check and extend instance TTL automatically
    fn auto_extend_instance_ttl(env: &Env) -> Result<(), MultisigError> {
        let last_extension: u32 = env
            .storage()
            .instance()
            .get(&LAST_TTL_EXTENSION)
            .unwrap_or(0);
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
        let owners: Vec<Address> = env.storage().instance().get(&OWNERS).unwrap_or_default();
        let tx_count: u64 = env
            .storage()
            .instance()
            .get(&TRANSACTION_COUNT)
            .unwrap_or(0);

        // Base storage cost estimation (rough calculation)
        // Each Address: ~32 bytes, each transaction: ~200 bytes, overhead: ~1000 bytes
        let storage_bytes = 1000 + (owners.len() * 32) + (tx_count as usize * 200);

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

        // Extend TTL for all persistent entries
        env.storage()
            .persistent()
            .extend_ttl(env.ledger().sequence(), extend_ledgers);

        Ok(())
    }

    /// Get current rent balance
    pub fn get_rent_balance(env: Env) -> Result<i128, MultisigError> {
        Ok(env.storage().instance().get(&RENT_BALANCE).unwrap_or(0))
    }
    /// Get TTL information
    pub fn get_ttl_info(env: Env) -> Result<(u32, u32, i128), MultisigError> {
        let last_extension: u32 = env
            .storage()
            .instance()
            .get(&LAST_TTL_EXTENSION)
            .unwrap_or(0);
        let current_ledger = env.ledger().sequence();
        let remaining_ttl =
            DEFAULT_INSTANCE_TTL.saturating_sub(current_ledger.saturating_sub(last_extension));
        let rent_balance: i128 = env.storage().instance().get(&RENT_BALANCE).unwrap_or(0);

        Ok((last_extension, remaining_ttl, rent_balance))
    }

    /// Get time-lock recovery status information
    pub fn get_time_lock_status(env: Env) -> Result<(u32, u32, bool, Address), MultisigError> {
        // Auto-extend instance TTL
        Self::auto_extend_instance_ttl(&env)?;

        let last_active: u32 = env
            .storage()
            .instance()
            .get(&LAST_ACTIVE_LEDGER)
            .ok_or(MultisigError::EntryArchived)?;
        let current_ledger = env.ledger().sequence();
        let ledgers_since_active = current_ledger.saturating_sub(last_active);
        let is_recovery_available = ledgers_since_active >= TIME_LOCK_PERIOD as u32;

        let recovery_key: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_KEY)
            .ok_or(MultisigError::InvalidRecoveryAddress)?;

        Ok((
            last_active,
            ledgers_since_active,
            is_recovery_available,
            recovery_key,
        ))
    }

    /// Store data in persistent storage with automatic TTL management
    pub fn store_persistent_data(
        env: Env,
        caller: Address,
        key: Symbol,
        value: Bytes,
    ) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_signer(&env, &caller)?;
        Self::require_owner(&env, &caller)?;

        // Check minimum balance requirements
        let min_balance = Self::calculate_minimum_balance(&env)?;
        let current_balance: i128 = env.storage().instance().get(&RENT_BALANCE).unwrap_or(0);

        if current_balance < min_balance {
            return Err(MultisigError::InsufficientBalanceForRent);
        }

        // Store in persistent storage
        let persistent_key = (PERSISTENT_DATA, key);
        env.storage().persistent().set(&persistent_key, &value);

        // Auto-extend TTL
        Self::extend_persistent_ttl(&env, DEFAULT_PERSISTENT_TTL)?;

        Ok(())
    }

    /// Retrieve data from persistent storage with archival check
    pub fn get_persistent_data(env: Env, key: Symbol) -> Result<Bytes, MultisigError> {
        let persistent_key = (PERSISTENT_DATA, key);

        // Check if entry exists and is not archived
        match env.storage().persistent().get(&persistent_key) {
            Some(value) => Ok(value),
            None => Err(MultisigError::EntryArchived),
        }
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
                Address::generate(&env), // recovery_path_address
                Address::generate(&env), // recovery_key
            )
            .unwrap();
        });

        // Property 1: Recovery cannot be executed immediately after initiation
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::initiate_recovery(env.clone(), owner.clone(), Address::generate(&env))
                .unwrap();
            let result = MultisigSafe::execute_recovery(env.clone());
            assert_eq!(result, Err(MultisigError::RecoveryDelayNotPassed));
        });

        // Property 2: Recovery can be executed exactly after delay
        env.ledger()
            .with_mut(|li| li.timestamp += recovery_delay + 1);
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
                Address::generate(&env), // recovery_path_address
                Address::generate(&env), // recovery_key
            )
            .unwrap();

            // Test TTL info retrieval
            let (last_ext, remaining_ttl, rent_bal) =
                MultisigSafe::get_ttl_info(env.clone()).unwrap();
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
                Address::generate(&env), // recovery_path_address
                Address::generate(&env), // recovery_key
            )
            .unwrap();

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
                Address::generate(&env), // recovery_path_address
                Address::generate(&env), // recovery_key
            )
            .unwrap();

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
                Address::generate(&env), // recovery_path_address
                Address::generate(&env), // recovery_key
            )
            .unwrap();

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

    #[test]
    fn test_proposal_creation() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let destination = Address::generate(&env);
        let asset = Address::generate(&env);
    fn test_heartbeat_functionality() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            )
            .unwrap();

            // Test proposal creation
            let proposal_id = MultisigSafe::create_proposal(
                env.clone(),
                owner.clone(),
                destination.clone(),
                1000,
                asset.clone(),
                3600, // 1 hour duration
            )
            .unwrap();

            assert_eq!(proposal_id, 1);

            // Verify proposal details
            let proposal = MultisigSafe::get_proposal(env.clone(), proposal_id).unwrap();
            assert_eq!(proposal.proposal_id, proposal_id);
            assert_eq!(proposal.destination, destination);
            assert_eq!(proposal.amount, 1000);
            assert_eq!(proposal.asset, asset);
            assert_eq!(proposal.votes, 0);
            assert_eq!(proposal.required_votes, 1);
            assert!(!proposal.executed);
                recovery_path_address.clone(),
            )
            .unwrap();

            // Test heartbeat functionality
            MultisigSafe::heartbeat(env.clone(), owner.clone()).unwrap();

            // Check that timer was reset
            let (last_heartbeat, time_since, is_active, _) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();
            assert_eq!(time_since, 0);
            assert!(!is_active);
        });
    }

    #[test]
    fn test_proposal_voting() {
        let env = Env::default();
        let owner1 = Address::generate(&env);
        let owner2 = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let destination = Address::generate(&env);
        let asset = Address::generate(&env);

        // Setup contract with 2 owners, threshold 2
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner1.clone(), owner2.clone()],
                2,
                recovery_address.clone(),
                86400,
            )
            .unwrap();

            // Create proposal
            let proposal_id = MultisigSafe::create_proposal(
                env.clone(),
                owner1.clone(),
                destination.clone(),
                1000,
                asset.clone(),
                3600,
            )
            .unwrap();

            // Test first vote
            MultisigSafe::vote_for_proposal(env.clone(), owner1.clone(), proposal_id).unwrap();

            let proposal = MultisigSafe::get_proposal(env.clone(), proposal_id).unwrap();
            assert_eq!(proposal.votes, 1);
            assert!(!proposal.executed);

            // Test second vote (should execute)
            MultisigSafe::vote_for_proposal(env.clone(), owner2.clone(), proposal_id).unwrap();

            let proposal = MultisigSafe::get_proposal(env.clone(), proposal_id).unwrap();
            assert_eq!(proposal.votes, 2);
            assert!(proposal.executed);

            // Test double voting prevention
            let result = MultisigSafe::vote_for_proposal(env.clone(), owner1.clone(), proposal_id);
            assert_eq!(result, Err(MultisigError::AlreadyVoted));
    fn test_time_lock_recovery_before_period() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
                recovery_path_address.clone(),
            )
            .unwrap();

            // Try time-lock recovery before period expires (should fail)
            let new_owners = vec![Address::generate(&env)];
            let result = MultisigSafe::time_lock_recovery(
                env.clone(),
                recovery_path_address.clone(),
                new_owners.clone(),
                1u32,
                Address::generate(&env),
                Address::generate(&env),
            );
            assert_eq!(result, Err(MultisigError::RecoveryDelayNotPassed));
        });
    }

    #[test]
    fn test_time_lock_recovery_after_period() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
                recovery_path_address.clone(),
            )
            .unwrap();

            // Simulate time passing beyond RECOVERY_PERIOD
            env.ledger().with_mut(|li| {
                li.timestamp += RECOVERY_PERIOD + 1000; // RECOVERY_PERIOD + buffer
            });

            // Now time-lock recovery should work
            let new_owners = vec![Address::generate(&env)];
            let new_threshold = 1u32;
            let new_recovery_address = Address::generate(&env);
            let new_recovery_path_address = Address::generate(&env);

            MultisigSafe::time_lock_recovery(
                env.clone(),
                recovery_path_address.clone(),
                new_owners.clone(),
                new_threshold,
                new_recovery_address.clone(),
                new_recovery_path_address.clone(),
            )
            .unwrap();

            // Verify new state
            assert_eq!(MultisigSafe::get_owners(env.clone()).unwrap(), new_owners);
            assert_eq!(MultisigSafe::get_threshold(env.clone()).unwrap(), new_threshold);
            
            let (addr, _, _) = MultisigSafe::get_recovery_info(env.clone()).unwrap();
            assert_eq!(addr, new_recovery_address);

            // Verify timer was reset
            let (last_heartbeat, time_since, is_active, _) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();
            assert_eq!(time_since, 0);
            assert!(!is_active);
        });
    }

    #[test]
    fn test_proposal_expiration() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let destination = Address::generate(&env);
        let asset = Address::generate(&env);
    fn test_time_lock_recovery_unauthorized() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            )
            .unwrap();

            // Create proposal with short duration
            let proposal_id = MultisigSafe::create_proposal(
                env.clone(),
                owner.clone(),
                destination.clone(),
                1000,
                asset.clone(),
                3600, // 1 hour
            )
            .unwrap();

            // Fast forward time past expiration
            env.ledger().with_mut(|li| li.timestamp += 3700);

            // Test voting on expired proposal
            let result = MultisigSafe::vote_for_proposal(env.clone(), owner.clone(), proposal_id);
            assert_eq!(result, Err(MultisigError::ProposalExpired));

            // Test cleanup
            let cleaned = MultisigSafe::cleanup_expired_proposals(env.clone()).unwrap();
            assert_eq!(cleaned, 1);

            // Verify proposal is marked as executed (expired)
            let proposal = MultisigSafe::get_proposal(env.clone(), proposal_id).unwrap();
            assert!(proposal.executed);
                recovery_path_address.clone(),
            )
            .unwrap();

            // Simulate time passing beyond RECOVERY_PERIOD
            env.ledger().with_mut(|li| {
                li.timestamp += RECOVERY_PERIOD + 1000; // RECOVERY_PERIOD + buffer
            });

            // Try time-lock recovery with wrong caller (should fail)
            let unauthorized_caller = Address::generate(&env);
            let new_owners = vec![Address::generate(&env)];
            let result = MultisigSafe::time_lock_recovery(
                env.clone(),
                unauthorized_caller,
                new_owners.clone(),
                1u32,
                Address::generate(&env),
                Address::generate(&env),
            );
            assert_eq!(result, Err(MultisigError::Unauthorized));
        });
    }

    #[test]
    fn test_transaction_execution_resets_timer() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
                recovery_path_address.clone(),
            )
            .unwrap();

            // Get initial timer state
            let (initial_last_heartbeat, _, _, _) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();

            // Simulate some time passing
            env.ledger().with_mut(|li| {
                li.timestamp += 1000;
            });

            // Submit and execute a transaction
            let destination = Address::generate(&env);
            let amount = 1000i128;
            let data = Bytes::from_array(&env, &[1, 2, 3, 4]);
            let expires_at = env.ledger().timestamp() + 3600;

            let tx_id = MultisigSafe::submit_transaction(
                env.clone(),
                destination,
                amount,
                data,
                expires_at,
            )
            .unwrap();

            // Check that timer was reset after execution
            let (new_last_heartbeat, time_since, _, _) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();
            assert!(new_last_heartbeat > initial_last_heartbeat);
            assert_eq!(time_since, 0);
        });
    }

    #[test]
    fn test_proposal_validation() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let destination = Address::generate(&env);
        let asset = Address::generate(&env);
    fn test_cancel_time_lock_recovery() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            )
            .unwrap();

            // Test invalid duration (too short)
            let result = MultisigSafe::create_proposal(
                env.clone(),
                owner.clone(),
                destination.clone(),
                1000,
                asset.clone(),
                1800, // Less than minimum
            );
            assert_eq!(result, Err(MultisigError::InvalidProposalDuration));

            // Test invalid duration (too long)
            let result = MultisigSafe::create_proposal(
                env.clone(),
                owner.clone(),
                destination.clone(),
                1000,
                asset.clone(),
                3000000, // More than maximum
            );
            assert_eq!(result, Err(MultisigError::InvalidProposalDuration));
                recovery_path_address.clone(),
            )
            .unwrap();

            // Simulate some time passing
            env.ledger().with_mut(|li| {
                li.timestamp += 1000;
            });

            // Cancel recovery
            MultisigSafe::cancel_time_lock_recovery(env.clone(), owner.clone()).unwrap();

            // Check that timer was reset
            let (last_heartbeat, time_since, is_active, _) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();
            assert_eq!(time_since, 0);
            assert!(!is_active);
        });
    }

    #[test]
    fn test_active_proposals() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let destination = Address::generate(&env);
        let asset = Address::generate(&env);
    fn test_recovery_status_view() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
            )
            .unwrap();

            // Create multiple proposals
            let proposal1 = MultisigSafe::create_proposal(
                env.clone(),
                owner.clone(),
                destination.clone(),
                1000,
                asset.clone(),
                3600,
            )
            .unwrap();

            let proposal2 = MultisigSafe::create_proposal(
                env.clone(),
                owner.clone(),
                destination.clone(),
                2000,
                asset.clone(),
                3600,
            )
            .unwrap();

            // Execute one proposal
            MultisigSafe::vote_for_proposal(env.clone(), owner.clone(), proposal1).unwrap();

            // Get active proposals
            let active_proposals = MultisigSafe::get_active_proposals(env.clone()).unwrap();
            assert_eq!(active_proposals.len(), 1);
            assert_eq!(active_proposals.get(0).unwrap(), &proposal2);
                recovery_path_address.clone(),
            )
            .unwrap();

            // Test initial status
            let (last_heartbeat, time_since, is_active, rec_path_addr) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();
            assert_eq!(time_since, 0);
            assert!(!is_active);
            assert_eq!(rec_path_addr, recovery_path_address);

            // Simulate some time passing
            env.ledger().with_mut(|li| {
                li.timestamp += 1000;
            });

            // Check updated status
            let (last_heartbeat2, time_since2, is_active2, _) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();
            assert_eq!(last_heartbeat2, last_heartbeat); // Same initial timestamp
            assert_eq!(time_since2, 1000);
            assert!(!is_active2); // Still not active since RECOVERY_PERIOD is much larger

            // Simulate passing beyond RECOVERY_PERIOD
            env.ledger().with_mut(|li| {
                li.timestamp += RECOVERY_PERIOD; // RECOVERY_PERIOD
            });

            // Check that recovery is now available
            let (_, time_since3, is_active3, _) = 
                MultisigSafe::get_recovery_status(env.clone()).unwrap();
            assert!(time_since3 >= RECOVERY_PERIOD);
            assert!(is_active3);
        });
    }

    #[test]
    fn test_is_recovery_path_active() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let recovery_address = Address::generate(&env);
        let recovery_path_address = Address::generate(&env);

        // Setup contract
        env.as_contract(&env.current_contract_address(), || {
            MultisigSafe::__init__(
                env.clone(),
                vec![&env, owner.clone()],
                1,
                recovery_address.clone(),
                86400,
                recovery_path_address.clone(),
            )
            .unwrap();

            // Test initially not active
            assert!(!MultisigSafe::is_recovery_path_active(env.clone()).unwrap());

            // Simulate time passing beyond RECOVERY_PERIOD
            env.ledger().with_mut(|li| {
                li.timestamp += RECOVERY_PERIOD + 1000; // RECOVERY_PERIOD + buffer
            });

            // Test now active
            assert!(MultisigSafe::is_recovery_path_active(env.clone()).unwrap();
        });
    }
}
