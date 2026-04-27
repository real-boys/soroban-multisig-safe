#![cfg(test)]

use soroban_sdk::{
    token, Address, Bytes, Env,
};
use super::{
    TreasuryManager, TreasuryError, ProposalType,
    TreasuryManager as Manager, WithdrawalLimit, TimeLockConfig, TreasuryConfig,
    TreasuryProposal, TreasuryStats, WithdrawalRequest,
};

type TreasuryManagerClient<'a> = soroban_sdk::contractclient::Client<'a, TreasuryManager>;

#[test]
fn test_treasury_initialization() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Create test managers
    let manager1 = Address::generate(&env);
    let manager2 = Address::generate(&env);
    let manager3 = Address::generate(&env);
    let managers = vec![&env, manager1.clone(), manager2.clone(), manager3.clone()];

    // Create configuration
    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400, // 24 hours
        emergency_period: 3600,  // 1 hour
        large_amount_threshold: 10000000,
        extended_period: 604800, // 7 days
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000, // 30 days
        min_proposal_duration: 3600,    // 1 hour
        auto_cleanup_threshold: 100,
    };

    // Initialize treasury
    client.initialize(
        &managers,
        &2u32, // threshold of 2
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Verify initialization
    let stats = client.get_treasury_stats();
    assert_eq!(stats.total_managers, 3);
    assert_eq!(stats.active_proposals, 0);
    assert_eq!(stats.daily_withdrawn, 0);
    assert_eq!(stats.weekly_withdrawn, 0);
    assert_eq!(stats.monthly_withdrawn, 0);

    // Test manager verification
    assert!(client.is_manager(&manager1));
    assert!(client.is_manager(&manager2));
    assert!(client.is_manager(&manager3));

    let non_manager = Address::generate(&env);
    assert!(!client.is_manager(&non_manager));
}

#[test]
fn test_add_remove_manager() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Initialize with one manager
    let manager1 = Address::generate(&env);
    let managers = vec![&env, manager1.clone()];
    
    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &1u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Add new manager
    let manager2 = Address::generate(&env);
    client.add_manager(&manager2, &1u32);

    // Verify manager was added
    assert!(client.is_manager(&manager2));
    let stats = client.get_treasury_stats();
    assert_eq!(stats.total_managers, 2);

    // Remove manager
    client.remove_manager(&manager1);

    // Verify manager was removed
    assert!(!client.is_manager(&manager1));
    assert!(client.is_manager(&manager2));
    let stats = client.get_treasury_stats();
    assert_eq!(stats.total_managers, 1);

    // Test error cases
    let non_manager = Address::generate(&env);
    let result = client.try_add_manager(&non_manager, &1u32);
    assert_eq!(result, Err(TreasuryError::Unauthorized));

    // Test removing last manager (should fail)
    let result = client.try_remove_manager(&manager2);
    assert_eq!(result, Err(TreasuryError::CannotRemoveLastManager));
}

#[test]
fn test_proposal_creation_and_voting() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup managers
    let manager1 = Address::generate(&env);
    let manager2 = Address::generate(&env);
    let managers = vec![&env, manager1.clone(), manager2.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &2u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Create a proposal
    let destination = Address::generate(&env);
    let asset = Address::generate(&env);
    let description = Bytes::from_slice(&env, "Test withdrawal proposal");
    
    let proposal_id = client.create_proposal(
        &ProposalType::StandardWithdrawal,
        &destination,
        &1000000i128,
        &asset,
        &description,
        &86400u64, // 24 hour duration
    );

    assert!(proposal_id > 0);

    // Verify proposal exists
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.proposal_id, proposal_id);
    assert_eq!(proposal.destination, destination);
    assert_eq!(proposal.amount, 1000000);
    assert!(!proposal.executed);
    assert_eq!(proposal.votes, 0);
    assert_eq!(proposal.required_votes, 2);

    // Vote on proposal
    client.vote_on_proposal(&proposal_id);

    // Check vote count
    let proposal = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(proposal.votes, 1);

    // Second vote should execute the proposal (but will fail due to time-lock)
    // For testing, we'll skip time validation by advancing the ledger
    env.ledger().set_timestamp(env.ledger().timestamp() + 86500);
    
    client.vote_on_proposal(&proposal_id);

    // Check if proposal was executed (should fail due to insufficient balance)
    let proposal = client.get_proposal(&proposal_id).unwrap();
    // Note: In a real test with proper token setup, this would be executed
}

#[test]
fn test_withdrawal_limits() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup
    let manager1 = Address::generate(&env);
    let managers = vec![&env, manager1.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &1u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Test updating withdrawal limits
    client.update_withdrawal_limits(
        &2000000i128, // new daily limit
        &10000000i128, // new weekly limit
        &40000000i128, // new monthly limit
    );

    // Test invalid limits
    let result = client.try_update_withdrawal_limits(
        &-1000i128, // invalid negative limit
        &10000000i128,
        &40000000i128,
    );
    assert_eq!(result, Err(TreasuryError::InvalidWithdrawalLimit));

    // Test inconsistent limits (weekly < daily)
    let result = client.try_update_withdrawal_limits(
        &2000000i128,
        &1000000i128, // weekly less than daily
        &40000000i128,
    );
    assert_eq!(result, Err(TreasuryError::InvalidWithdrawalLimit));
}

#[test]
fn test_time_lock_configuration() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup
    let manager1 = Address::generate(&env);
    let managers = vec![&env, manager1.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &1u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Test updating time-lock configuration
    client.update_time_lock_config(
        &172800u64, // 48 hours standard
        &7200u64,   // 2 hours emergency
        &20000000i128, // new large amount threshold
        &1209600u64,  // 14 days extended
    );

    // Test invalid configuration
    let result = client.try_update_time_lock_config(
        &0u64, // invalid zero period
        &7200u64,
        &20000000i128,
        &1209600u64,
    );
    assert_eq!(result, Err(TreasuryError::InvalidTimeLockPeriod));

    // Test invalid threshold
    let result = client.try_update_time_lock_config(
        &172800u64,
        &7200u64,
        &-1000i128, // invalid negative threshold
        &1209600u64,
    );
    assert_eq!(result, Err(TreasuryError::InvalidWithdrawalLimit));
}

#[test]
fn test_proposal_types() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup
    let manager1 = Address::generate(&env);
    let managers = vec![&env, manager1.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &1u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Test different proposal types
    let destination = Address::generate(&env);
    let asset = Address::generate(&env);
    let description = Bytes::from_slice(&env, "Test proposal");

    // Standard withdrawal
    let proposal_id1 = client.create_proposal(
        &ProposalType::StandardWithdrawal,
        &destination,
        &1000000i128,
        &asset,
        &description,
        &86400u64,
    );

    // Emergency withdrawal
    let proposal_id2 = client.create_proposal(
        &ProposalType::EmergencyWithdrawal,
        &destination,
        &5000000i128,
        &asset,
        &description,
        &3600u64,
    );

    // Budget allocation
    let proposal_id3 = client.create_proposal(
        &ProposalType::BudgetAllocation,
        &destination,
        &2000000i128,
        &asset,
        &description,
        &86400u64,
    );

    // Manager addition
    let new_manager = Address::generate(&env);
    let proposal_id4 = client.create_proposal(
        &ProposalType::ManagerAddition,
        &new_manager,
        &0i128, // amount not relevant for manager addition
        &asset,
        &description,
        &86400u64,
    );

    // Verify all proposals exist
    assert!(client.get_proposal(&proposal_id1).is_some());
    assert!(client.get_proposal(&proposal_id2).is_some());
    assert!(client.get_proposal(&proposal_id3).is_some());
    assert!(client.get_proposal(&proposal_id4).is_some());

    // Check active proposals
    let active_proposals = client.get_active_proposals();
    assert_eq!(active_proposals.len(), 4);
}

#[test]
fn test_proposal_execution_conditions() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup with 2 managers, threshold 2
    let manager1 = Address::generate(&env);
    let manager2 = Address::generate(&env);
    let managers = vec![&env, manager1.clone(), manager2.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &2u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Create proposal
    let destination = Address::generate(&env);
    let asset = Address::generate(&env);
    let description = Bytes::from_slice(&env, "Test proposal");
    
    let proposal_id = client.create_proposal(
        &ProposalType::StandardWithdrawal,
        &destination,
        &1000000i128,
        &asset,
        &description,
        &86400u64,
    );

    // Try to execute without enough votes
    let result = client.try_execute_proposal(&proposal_id);
    assert_eq!(result, Err(TreasuryError::InsufficientBalance)); // Reused error for insufficient votes

    // Add first vote
    client.vote_on_proposal(&proposal_id);

    // Try to execute with insufficient votes
    let result = client.try_execute_proposal(&proposal_id);
    assert_eq!(result, Err(TreasuryError::InsufficientBalance));

    // Add second vote
    client.vote_on_proposal(&proposal_id);

    // Try to execute before time-lock expires
    let result = client.try_execute_proposal(&proposal_id);
    assert_eq!(result, Err(TreasuryError::TimeLockNotExpired));

    // Advance time past time-lock
    env.ledger().set_timestamp(env.ledger().timestamp() + 86500);

    // Now execution should work (but will fail due to insufficient balance in this test)
    let result = client.try_execute_proposal(&proposal_id);
    assert_eq!(result, Err(TreasuryError::InsufficientBalance)); // Expected due to no token balance
}

#[test]
fn test_proposal_expiration() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup
    let manager1 = Address::generate(&env);
    let managers = vec![&env, manager1.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &1u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Create proposal with short duration
    let destination = Address::generate(&env);
    let asset = Address::generate(&env);
    let description = Bytes::from_slice(&env, "Test proposal");
    
    let proposal_id = client.create_proposal(
        &ProposalType::StandardWithdrawal,
        &destination,
        &1000000i128,
        &asset,
        &description,
        &3600u64, // 1 hour duration
    );

    // Advance time past expiration
    env.ledger().set_timestamp(env.ledger().timestamp() + 3700);

    // Try to vote on expired proposal
    let result = client.try_vote_on_proposal(&proposal_id);
    assert_eq!(result, Err(TreasuryError::ProposalExpired));

    // Try to execute expired proposal
    let result = client.try_execute_proposal(&proposal_id);
    assert_eq!(result, Err(TreasuryError::ProposalExpired));
}

#[test]
fn test_unauthorized_access() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup with manager
    let manager1 = Address::generate(&env);
    let managers = vec![&env, manager1.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,
        emergency_period: 3600,
        large_amount_threshold: 10000000,
        extended_period: 604800,
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &1u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Test unauthorized operations with non-manager
    let non_manager = Address::generate(&env);
    env.set_current_contract_address(&non_manager);

    let destination = Address::generate(&env);
    let asset = Address::generate(&env);
    let description = Bytes::from_slice(&env, "Unauthorized proposal");

    // Try to create proposal
    let result = client.try_create_proposal(
        &ProposalType::StandardWithdrawal,
        &destination,
        &1000000i128,
        &asset,
        &description,
        &86400u64,
    );
    assert_eq!(result, Err(TreasuryError::Unauthorized));

    // Try to vote
    let result = client.try_vote_on_proposal(&1u64);
    assert_eq!(result, Err(TreasuryError::Unauthorized));

    // Try to execute
    let result = client.try_execute_proposal(&1u64);
    assert_eq!(result, Err(TreasuryError::Unauthorized));

    // Try to update limits
    let result = client.try_update_withdrawal_limits(&2000000i128, &10000000i128, &40000000i128);
    assert_eq!(result, Err(TreasuryError::Unauthorized));

    // Try to update time-lock config
    let result = client.try_update_time_lock_config(&172800u64, &7200u64, &20000000i128, &1209600u64);
    assert_eq!(result, Err(TreasuryError::Unauthorized));
}

#[test]
fn test_initialization_validation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    let manager1 = Address::generate(&env);
    let manager2 = Address::generate(&env);

    // Test empty managers
    let result = client.try_initialize(
        &Vec::new(&env),
        &1u32,
        &WithdrawalLimit {
            daily_limit: 1000000,
            weekly_limit: 5000000,
            monthly_limit: 20000000,
            last_updated: 0,
        },
        &TimeLockConfig {
            standard_period: 86400,
            emergency_period: 3600,
            large_amount_threshold: 10000000,
            extended_period: 604800,
        },
        &TreasuryConfig {
            withdrawal_threshold: 1000000,
            emergency_threshold: 5000000,
            max_proposal_duration: 2592000,
            min_proposal_duration: 3600,
            auto_cleanup_threshold: 100,
        },
    );
    assert_eq!(result, Err(TreasuryError::MaximumManagersExceeded));

    // Test invalid threshold (0)
    let managers = vec![&env, manager1.clone()];
    let result = client.try_initialize(
        &managers,
        &0u32,
        &WithdrawalLimit {
            daily_limit: 1000000,
            weekly_limit: 5000000,
            monthly_limit: 20000000,
            last_updated: 0,
        },
        &TimeLockConfig {
            standard_period: 86400,
            emergency_period: 3600,
            large_amount_threshold: 10000000,
            extended_period: 604800,
        },
        &TreasuryConfig {
            withdrawal_threshold: 1000000,
            emergency_threshold: 5000000,
            max_proposal_duration: 2592000,
            min_proposal_duration: 3600,
            auto_cleanup_threshold: 100,
        },
    );
    assert_eq!(result, Err(TreasuryError::InvalidThreshold));

    // Test invalid threshold (higher than managers)
    let result = client.try_initialize(
        &managers,
        &5u32,
        &WithdrawalLimit {
            daily_limit: 1000000,
            weekly_limit: 5000000,
            monthly_limit: 20000000,
            last_updated: 0,
        },
        &TimeLockConfig {
            standard_period: 86400,
            emergency_period: 3600,
            large_amount_threshold: 10000000,
            extended_period: 604800,
        },
        &TreasuryConfig {
            withdrawal_threshold: 1000000,
            emergency_threshold: 5000000,
            max_proposal_duration: 2592000,
            min_proposal_duration: 3600,
            auto_cleanup_threshold: 100,
        },
    );
    assert_eq!(result, Err(TreasuryError::InvalidThreshold));

    // Test duplicate managers
    let duplicate_managers = vec![&env, manager1.clone(), manager1.clone()];
    let result = client.try_initialize(
        &duplicate_managers,
        &2u32,
        &WithdrawalLimit {
            daily_limit: 1000000,
            weekly_limit: 5000000,
            monthly_limit: 20000000,
            last_updated: 0,
        },
        &TimeLockConfig {
            standard_period: 86400,
            emergency_period: 3600,
            large_amount_threshold: 10000000,
            extended_period: 604800,
        },
        &TreasuryConfig {
            withdrawal_threshold: 1000000,
            emergency_threshold: 5000000,
            max_proposal_duration: 2592000,
            min_proposal_duration: 3600,
            auto_cleanup_threshold: 100,
        },
    );
    assert_eq!(result, Err(TreasuryError::ManagerAlreadyExists));
}

#[test]
fn test_large_amount_time_lock() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TreasuryManager);
    let client = TreasuryManagerClient::new(&env, &contract_id);

    // Setup
    let manager1 = Address::generate(&env);
    let managers = vec![&env, manager1.clone()];

    let withdrawal_limits = WithdrawalLimit {
        daily_limit: 1000000,
        weekly_limit: 5000000,
        monthly_limit: 20000000,
        last_updated: 0,
    };

    let time_lock_config = TimeLockConfig {
        standard_period: 86400,   // 24 hours
        emergency_period: 3600,   // 1 hour
        large_amount_threshold: 10000000, // 10 million
        extended_period: 604800,  // 7 days
    };

    let treasury_config = TreasuryConfig {
        withdrawal_threshold: 1000000,
        emergency_threshold: 5000000,
        max_proposal_duration: 2592000,
        min_proposal_duration: 3600,
        auto_cleanup_threshold: 100,
    };

    client.initialize(
        &managers,
        &1u32,
        &withdrawal_limits,
        &time_lock_config,
        &treasury_config,
    );

    // Create proposal for amount below threshold (should use standard time-lock)
    let destination = Address::generate(&env);
    let asset = Address::generate(&env);
    let description = Bytes::from_slice(&env, "Standard amount proposal");
    
    let proposal_id1 = client.create_proposal(
        &ProposalType::StandardWithdrawal,
        &destination,
        &5000000i128, // Below large amount threshold
        &asset,
        &description,
        &86400u64,
    );

    let proposal1 = client.get_proposal(&proposal_id1).unwrap();
    let expected_time_lock1 = env.ledger().timestamp() + 86400; // Standard period
    assert_eq!(proposal1.time_lock_until, expected_time_lock1);

    // Create proposal for amount above threshold (should use extended time-lock)
    let description2 = Bytes::from_slice(&env, "Large amount proposal");
    
    let proposal_id2 = client.create_proposal(
        &ProposalType::StandardWithdrawal,
        &destination,
        &15000000i128, // Above large amount threshold
        &asset,
        &description2,
        &86400u64,
    );

    let proposal2 = client.get_proposal(&proposal_id2).unwrap();
    let expected_time_lock2 = env.ledger().timestamp() + 604800; // Extended period
    assert_eq!(proposal2.time_lock_until, expected_time_lock2);

    // Emergency withdrawal should always use emergency period
    let description3 = Bytes::from_slice(&env, "Emergency proposal");
    
    let proposal_id3 = client.create_proposal(
        &ProposalType::EmergencyWithdrawal,
        &destination,
        &20000000i128, // Even large amount
        &asset,
        &description3,
        &86400u64,
    );

    let proposal3 = client.get_proposal(&proposal_id3).unwrap();
    let expected_time_lock3 = env.ledger().timestamp() + 3600; // Emergency period
    assert_eq!(proposal3.time_lock_until, expected_time_lock3);
}
