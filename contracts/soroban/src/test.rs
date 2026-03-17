use soroban_sdk::Env;
use stellar_multisig_safe::{MultisigError, MultisigSafe};

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Address, Bytes};

    fn create_test_env() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env
    }

    fn create_test_owners(env: &Env) -> Vec<Address> {
        vec![
            Address::generate(env),
            Address::generate(env),
            Address::generate(env),
        ]
    }

    #[test]
    fn test_initialization() {
        let env = create_test_env();
        let owners = create_test_owners(&env);
        let threshold = 2u32;
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400u64; // 24 hours

        MultisigSafe::__init(
            env.clone(),
            owners.clone(),
            threshold,
            recovery_address.clone(),
            recovery_delay,
        )
        .unwrap();

        // Verify initialization
        assert_eq!(MultisigSafe::get_owners(env.clone()).unwrap(), owners);
        assert_eq!(MultisigSafe::get_threshold(env.clone()).unwrap(), threshold);
        
        let (addr, delay, req) = MultisigSafe::get_recovery_info(env.clone()).unwrap();
        assert_eq!(addr, recovery_address);
        assert_eq!(delay, recovery_delay);
        assert!(req.is_none());
    }

    #[test]
    fn test_invalid_initialization() {
        let env = create_test_env();
        let owners = create_test_owners(&env);
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400u64;

        // Test invalid threshold
        assert_eq!(
            MultisigSafe::__init(
                env.clone(),
                owners.clone(),
                0u32,
                recovery_address.clone(),
                recovery_delay,
            ),
            Err(MultisigError::InvalidThreshold)
        );

        // Test threshold too high
        assert_eq!(
            MultisigSafe::__init(
                env.clone(),
                owners.clone(),
                4u32,
                recovery_address.clone(),
                recovery_delay,
            ),
            Err(MultisigError::InvalidThreshold)
        );

        // Test insufficient recovery delay
        assert_eq!(
            MultisigSafe::__init(
                env.clone(),
                owners.clone(),
                2u32,
                recovery_address.clone(),
                3600u64,
            ),
            Err(MultisigError::InvalidTimeDelay)
        );
    }

    #[test]
    fn test_transaction_lifecycle() {
        let env = create_test_env();
        let owners = create_test_owners(&env);
        let threshold = 2u32;
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400u64;

        MultisigSafe::__init(
            env.clone(),
            owners.clone(),
            threshold,
            recovery_address,
            recovery_delay,
        )
        .unwrap();

        let destination = Address::generate(&env);
        let amount = 1000i128;
        let data = Bytes::from_array(&env, &[1, 2, 3, 4]);
        let expires_at = env.ledger().timestamp() + 3600; // 1 hour from now

        // Submit transaction
        let tx_id = MultisigSafe::submit_transaction(
            env.clone(),
            destination.clone(),
            amount,
            data.clone(),
            expires_at,
        )
        .unwrap();

        // Verify transaction exists
        let transaction = MultisigSafe::get_transaction(env.clone(), tx_id).unwrap();
        assert_eq!(transaction.destination, destination);
        assert_eq!(transaction.amount, amount);
        assert_eq!(transaction.data, data);
        assert!(!transaction.executed);
        assert_eq!(transaction.signatures, 1); // Auto-signed by submitter

        // Sign with second owner
        MultisigSafe::sign_transaction(env.clone(), tx_id).unwrap();

        // Verify transaction executed (threshold reached)
        let transaction = MultisigSafe::get_transaction(env.clone(), tx_id).unwrap();
        assert!(transaction.executed);
    }

    #[test]
    fn test_owner_management() {
        let env = create_test_env();
        let owners = create_test_owners(&env);
        let threshold = 2u32;
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400u64;

        MultisigSafe::__init(
            env.clone(),
            owners.clone(),
            threshold,
            recovery_address,
            recovery_delay,
        )
        .unwrap();

        let new_owner = Address::generate(&env);

        // Add new owner
        MultisigSafe::add_owner(env.clone(), new_owner.clone()).unwrap();

        let updated_owners = MultisigSafe::get_owners(env.clone()).unwrap();
        assert_eq!(updated_owners.len(), 4);
        assert!(updated_owners.contains(&new_owner));

        // Remove owner
        MultisigSafe::remove_owner(env.clone(), owners[0].clone()).unwrap();

        let updated_owners = MultisigSafe::get_owners(env.clone()).unwrap();
        assert_eq!(updated_owners.len(), 3);
        assert!(!updated_owners.contains(&owners[0]));
    }

    #[test]
    fn test_recovery_mechanism() {
        let env = create_test_env();
        let owners = create_test_owners(&env);
        let threshold = 2u32;
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400u64;

        MultisigSafe::__init(
            env.clone(),
            owners.clone(),
            threshold,
            recovery_address.clone(),
            recovery_delay,
        )
        .unwrap();

        let new_recovery_address = Address::generate(&env);

        // Initiate recovery
        MultisigSafe::initiate_recovery(env.clone(), new_recovery_address.clone()).unwrap();

        // Verify recovery request exists
        let (_, _, recovery_request) = MultisigSafe::get_recovery_info(env.clone()).unwrap();
        assert!(recovery_request.is_some());
        assert_eq!(
            recovery_request.unwrap().new_recovery_address,
            new_recovery_address
        );

        // Cancel recovery
        MultisigSafe::cancel_recovery(env.clone()).unwrap();

        // Verify recovery request cleared
        let (_, _, recovery_request) = MultisigSafe::get_recovery_info(env.clone()).unwrap();
        assert!(recovery_request.is_none());
    }

    #[test]
    fn test_emergency_recovery() {
        let env = create_test_env();
        let owners = create_test_owners(&env);
        let threshold = 2u32;
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400u64;

        MultisigSafe::__init(
            env.clone(),
            owners.clone(),
            threshold,
            recovery_address.clone(),
            recovery_delay,
        )
        .unwrap();

        let new_owners = vec![Address::generate(&env)];
        let new_threshold = 1u32;
        let new_recovery_address = Address::generate(&env);

        // Emergency recovery (called by recovery address)
        MultisigSafe::emergency_recovery(
            env.clone(),
            new_owners.clone(),
            new_threshold,
            new_recovery_address.clone(),
        )
        .unwrap();

        // Verify new state
        assert_eq!(MultisigSafe::get_owners(env.clone()).unwrap(), new_owners);
        assert_eq!(MultisigSafe::get_threshold(env.clone()).unwrap(), new_threshold);
        
        let (addr, _, _) = MultisigSafe::get_recovery_info(env.clone()).unwrap();
        assert_eq!(addr, new_recovery_address);
    }

    #[test]
    fn test_view_functions() {
        let env = create_test_env();
        let owners = create_test_owners(&env);
        let threshold = 2u32;
        let recovery_address = Address::generate(&env);
        let recovery_delay = 86400u64;

        MultisigSafe::__init(
            env.clone(),
            owners.clone(),
            threshold,
            recovery_address.clone(),
            recovery_delay,
        )
        .unwrap();

        // Test is_owner
        assert!(MultisigSafe::is_owner(env.clone(), owners[0].clone()).unwrap());
        assert!(!MultisigSafe::is_owner(env.clone(), Address::generate(&env)).unwrap());

        // Test transaction submission and signing check
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

        // Test has_signed
        assert!(MultisigSafe::has_signed(env.clone(), tx_id, owners[0].clone()).unwrap());
        assert!(!MultisigSafe::has_signed(env.clone(), tx_id, owners[1].clone()).unwrap());
    }
}
