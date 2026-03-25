#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, env, panic, symbol_short,
    token, Address, Bytes, Env, IntoVal, Symbol,
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

// Storage keys
const OWNERS: Symbol = symbol_short!("OWNERS");
const THRESHOLD: Symbol = symbol_short!("THRESHLD");
const TRANSACTION_COUNT: Symbol = symbol_short!("TX_COUNT");
const TRANSACTIONS: Symbol = symbol_short!("TRANS");
const RECOVERY_ADDRESS: Symbol = symbol_short!("REC_ADDR");
const RECOVERY_DELAY: Symbol = symbol_short!("REC_DLAY");
const RECOVERY_REQUEST: Symbol = symbol_short!("REC_REQ");
const SIGNATURES: Symbol = symbol_short!("SIGS");
const MAX_OWNERS: u32 = 10;
const MIN_RECOVERY_DELAY: u64 = 86400; // 24 hours in seconds

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
        let mut unique_owners = std::collections::HashSet::new();
        for owner in &owners {
            if !unique_owners.insert(owner) {
                return Err(MultisigError::OwnerAlreadyExists);
            }
        }

        // Store owners
        env.storage().instance().set(&OWNERS, &owners);
        env.storage().instance().set(&THRESHOLD, &threshold);
        env.storage().instance().set(&RECOVERY_ADDRESS, &recovery_address);
        env.storage().instance().set(&RECOVERY_DELAY, &recovery_delay);
        env.storage().instance().set(&TRANSACTION_COUNT, &0u64);

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
        Self::require_owner(&env, &caller)?;

        let tx_count: u64 = env.storage().instance().get(&TRANSACTION_COUNT).unwrap_or(0);
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
        env.storage().instance().set(&TRANSACTION_COUNT, &transaction_id);

        // Auto-sign if submitter is an owner
        Self::sign_transaction_internal(&env, transaction_id, caller.clone())?;

        Ok(transaction_id)
    }

    /// Sign a transaction
    pub fn sign_transaction(env: Env, caller: Address, transaction_id: u64) -> Result<(), MultisigError> {
        caller.require_auth();
        Self::require_owner(&env, &caller)?;
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
        Self::require_owner(&env, &caller)?;

        let mut owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .unwrap_or_default();

        if owners.len() as u32 >= MAX_OWNERS {
            return Err(MultisigError::MaximumOwnersExceeded);
        }

        if owners.contains(&new_owner) {
            return Err(MultisigError::OwnerAlreadyExists);
        }

        owners.push(new_owner.clone());
        env.storage().instance().set(&OWNERS, &owners);

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

        let index = owners
            .iter()
            .position(|owner| *owner == owner_to_remove)
            .ok_or(MultisigError::OwnerDoesNotExist)?;

        owners.remove(index);
        env.storage().instance().set(&OWNERS, &owners);

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
        Self::require_owner(&env, &caller)?;

        if !env.storage().instance().has(&RECOVERY_REQUEST) {
            return Err(MultisigError::RecoveryNotInitiated);
        }

        env.storage().instance().remove(&RECOVERY_REQUEST);

        Ok(())
    }

    /// Emergency recovery by recovery address
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

        // Update owners and threshold
        env.storage().instance().set(&OWNERS, &new_owners);
        env.storage().instance().set(&THRESHOLD, &new_threshold);
        env.storage().instance().set(&RECOVERY_ADDRESS, &new_recovery_address);

        // Clear any ongoing recovery
        env.storage().instance().remove(&RECOVERY_REQUEST);

        Ok(())
    }

    /// View functions
    pub fn get_owners(env: Env) -> Result<Vec<Address>, MultisigError> {
        Ok(env
            .storage()
            .instance()
            .get(&OWNERS)
            .unwrap_or_default())
    }

    pub fn get_threshold(env: Env) -> Result<u32, MultisigError> {
        env.storage()
            .instance()
            .get(&THRESHOLD)
            .ok_or(MultisigError::InvalidThreshold)
    }

    pub fn get_transaction(env: Env, transaction_id: u64) -> Result<Transaction, MultisigError> {
        env.storage()
            .instance()
            .get(&(TRANSACTIONS, transaction_id))
            .ok_or(MultisigError::InvalidTransactionId)
    }

    pub fn get_recovery_info(
        env: Env,
    ) -> Result<(Address, u64, Option<RecoveryRequest>), MultisigError> {
        let recovery_address: Address = env
            .storage()
            .instance()
            .get(&RECOVERY_ADDRESS)
            .ok_or(MultisigError::InvalidRecoveryAddress)?;
        let recovery_delay: u64 = env.storage().instance().get(&RECOVERY_DELAY).unwrap();
        let recovery_request: Option<RecoveryRequest> = env.storage().instance().get(&RECOVERY_REQUEST);

        Ok((recovery_address, recovery_delay, recovery_request))
    }

    pub fn is_owner(env: Env, address: Address) -> Result<bool, MultisigError> {
        let owners: Vec<Address> = env
            .storage()
            .instance()
            .get(&OWNERS)
            .unwrap_or_default();
        Ok(owners.contains(&address))
    }

    pub fn has_signed(env: Env, transaction_id: u64, signer: Address) -> Result<bool, MultisigError> {
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
            .unwrap_or_default();
        
        if !owners.contains(address) {
            return Err(MultisigError::Unauthorized);
        }
        
        Ok(())
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
}
