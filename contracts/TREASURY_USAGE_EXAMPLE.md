# Treasury Management Contract Usage Example

## Quick Start Guide

This guide demonstrates how to deploy and use the Treasury Management Smart Contract for managing collective funds with advanced security features.

## Prerequisites

- Soroban CLI installed
- Stellar network access (testnet or mainnet)
- Basic understanding of Rust and smart contracts

## Deployment Steps

### 1. Build the Contract

```bash
cd contracts/soroban
cargo build --target wasm32-unknown-unknown --release
```

### 2. Deploy the Contract

```bash
# Deploy to testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/multisig_safe.wasm \
  --source alice \
  --network testnet

# Note the contract ID for future use
```

### 3. Initialize the Treasury

```rust
use soroban_sdk::{Address, Env, Bytes};

// Define initial managers
let manager1 = Address::from_string("GD...");
let manager2 = Address::from_string("GD...");
let manager3 = Address::from_string("GD...");
let managers = vec![manager1, manager2, manager3];

// Set withdrawal limits (in smallest token units)
let withdrawal_limits = WithdrawalLimit {
    daily_limit: 1000000,      // 1M tokens per day
    weekly_limit: 5000000,     // 5M tokens per week
    monthly_limit: 20000000,    // 20M tokens per month
    last_updated: 0,
};

// Configure time-locks
let time_lock_config = TimeLockConfig {
    standard_period: 86400,        // 24 hours for standard withdrawals
    emergency_period: 3600,       // 1 hour for emergency withdrawals
    large_amount_threshold: 10000000,  // 10M tokens trigger extended lock
    extended_period: 604800,       // 7 days for large amounts
};

// Set treasury configuration
let treasury_config = TreasuryConfig {
    withdrawal_threshold: 1000000,     // Proposals required for >1M tokens
    emergency_threshold: 5000000,      // Emergency procedures for >5M tokens
    max_proposal_duration: 2592000,    // 30 days maximum proposal duration
    min_proposal_duration: 3600,       // 1 hour minimum proposal duration
    auto_cleanup_threshold: 100,       // Clean up after 100 expired proposals
};

// Initialize the contract
treasury_client.initialize(
    &managers,
    &2u32,  // Require 2 out of 3 managers to approve
    &withdrawal_limits,
    &time_lock_config,
    &treasury_config,
);
```

## Usage Examples

### Example 1: Standard Withdrawal

```rust
// Create a withdrawal proposal for operational expenses
let proposal_id = treasury_client.create_proposal(
    &ProposalType::StandardWithdrawal,
    &recipient_address,
    &500000i128,  // 0.5M tokens
    &token_address,
    &Bytes::from_slice(&env, b"Q3 operational expenses - marketing and development"),
    &86400u64,    // 24 hour voting period
);

// Manager 1 votes
env.set_current_contract_address(&manager1);
treasury_client.vote_on_proposal(&proposal_id);

// Manager 2 votes
env.set_current_contract_address(&manager2);
treasury_client.vote_on_proposal(&proposal_id);

// Wait for time-lock to expire (24 hours for standard withdrawals)
env.ledger().set_timestamp(env.ledger().timestamp() + 86500);

// Execute the withdrawal (will be done automatically when threshold is reached)
treasury_client.execute_proposal(&proposal_id);
```

### Example 2: Emergency Withdrawal

```rust
// Create an emergency withdrawal proposal
let proposal_id = treasury_client.create_proposal(
    &ProposalType::EmergencyWithdrawal,
    &recipient_address,
    &2000000i128,  // 2M tokens
    &token_address,
    &Bytes::from_slice(&env, b"Emergency liquidity need - market opportunity"),
    &3600u64,    // 1 hour voting period
);

// Emergency withdrawals have shorter time-locks (1 hour)
// Still requires threshold votes but executes faster

// All managers vote quickly
env.set_current_contract_address(&manager1);
treasury_client.vote_on_proposal(&proposal_id);

env.set_current_contract_address(&manager2);
treasury_client.vote_on_proposal(&proposal_id);

// Wait only 1 hour for emergency time-lock
env.ledger().set_timestamp(env.ledger().timestamp() + 3700);

// Execute emergency withdrawal
treasury_client.execute_proposal(&proposal_id);
```

### Example 3: Large Amount Withdrawal

```rust
// Create a proposal for a large amount (triggers extended time-lock)
let proposal_id = treasury_client.create_proposal(
    &ProposalType::StandardWithdrawal,
    &recipient_address,
    &15000000i128,  // 15M tokens (exceeds 10M threshold)
    &token_address,
    &Bytes::from_slice(&env, b"Major investment - strategic acquisition"),
    &604800u64,    // 7 day voting period for large amounts
);

// This proposal will have a 7-day time-lock regardless of voting speed
// Managers can vote immediately but must wait 7 days for execution

// All managers vote
env.set_current_contract_address(&manager1);
treasury_client.vote_on_proposal(&proposal_id);

env.set_current_contract_address(&manager2);
treasury_client.vote_on_proposal(&proposal_id);

// Must wait 7 days for extended time-lock
env.ledger().set_timestamp(env.ledger().timestamp() + 605000);

// Execute large withdrawal
treasury_client.execute_proposal(&proposal_id);
```

### Example 4: Manager Management

```rust
// Add a new manager
env.set_current_contract_address(&manager1);
treasury_client.add_manager(&new_manager, &1u32);

// Remove a manager (cannot remove the last one)
treasury_client.remove_manager(&manager_to_remove);
```

### Example 5: Configuration Updates

```rust
// Update withdrawal limits
env.set_current_contract_address(&manager1);
treasury_client.update_withdrawal_limits(
    &2000000i128,  // New daily limit: 2M tokens
    &10000000i128, // New weekly limit: 10M tokens
    &40000000i128, // New monthly limit: 40M tokens
);

// Update time-lock configuration
treasury_client.update_time_lock_config(
    &172800u64,    // 48 hours standard period
    &7200u64,      // 2 hours emergency period
    &20000000i128, // 20M tokens large amount threshold
    &1209600u64,   // 14 days extended period
);
```

## Monitoring and Queries

### Check Treasury Status
```rust
// Get current treasury statistics
let stats = treasury_client.get_treasury_stats();
println!("Daily withdrawn: {}", stats.daily_withdrawn);
println!("Weekly withdrawn: {}", stats.weekly_withdrawn);
println!("Monthly withdrawn: {}", stats.monthly_withdrawn);
println!("Active proposals: {}", stats.active_proposals);
println!("Total managers: {}", stats.total_managers);
```

### List Active Proposals
```rust
// Get all active proposals
let active_proposals = treasury_client.get_active_proposals();
for proposal in active_proposals.iter() {
    println!("Proposal {}: {} votes required, {} votes received", 
             proposal.proposal_id, proposal.required_votes, proposal.votes);
}
```

### Check Manager Status
```rust
// Verify if an address is a manager
let is_manager = treasury_client.is_manager(&check_address);
if is_manager {
    println!("Address is a treasury manager");
} else {
    println!("Address is not a treasury manager");
}
```

## Error Handling

The contract provides detailed error codes for troubleshooting:

```rust
match treasury_client.create_proposal(...) {
    Ok(proposal_id) => println!("Created proposal: {}", proposal_id),
    Err(TreasuryError::Unauthorized) => println!("Not authorized to create proposals"),
    Err(TreasuryError::WithdrawalLimitExceeded) => println!("Amount exceeds withdrawal limits"),
    Err(TreasuryError::InvalidProposalDuration) => println!("Invalid proposal duration"),
    Err(error) => println!("Error: {:?}", error),
}
```

## Best Practices

### Security Recommendations
1. **Multi-Sig Setup**: Use at least 3 managers with 2-of-3 threshold
2. **Time-Lock Configuration**: Use longer time-locks for larger amounts
3. **Regular Monitoring**: Check withdrawal limits and proposal activity
4. **Emergency Procedures**: Define clear criteria for emergency withdrawals

### Operational Guidelines
1. **Proposal Descriptions**: Always provide clear, detailed descriptions
2. **Voting Participation**: All managers should participate in voting
3. **Limit Planning**: Set withdrawal limits based on actual cash flow needs
4. **Audit Trail**: Monitor contract events for transparency

### Configuration Tips
1. **Start Conservative**: Begin with lower limits and shorter time-locks
2. **Adjust Based on Usage**: Modify configuration based on actual usage patterns
3. **Consider Seasonality**: Account for seasonal variations in cash flow
4. **Plan for Growth**: Ensure limits scale with organization growth

## Integration Examples

### Frontend Integration
```javascript
// JavaScript/TypeScript example for frontend
async function createProposal(proposalData) {
    const contract = new Contract(treasuryContractId);
    
    const result = await contract.call(
        "create_proposal",
        proposalData.type,
        proposalData.destination,
        proposalData.amount,
        proposalData.asset,
        proposalData.description,
        proposalData.duration
    );
    
    return result;
}

async function voteOnProposal(proposalId) {
    const contract = new Contract(treasuryContractId);
    
    const result = await contract.call("vote_on_proposal", proposalId);
    return result;
}
```

### Backend Integration
```python
# Python example for backend monitoring
async def monitor_treasury():
    contract = Contract(treasury_contract_id)
    
    # Get treasury stats
    stats = await contract.call("get_treasury_stats")
    
    # Check if approaching limits
    daily_usage_percent = (stats.daily_withdrawn / stats.daily_limit) * 100
    if daily_usage_percent > 80:
        send_alert(f"Daily withdrawal usage at {daily_usage_percent:.1f}%")
    
    # Monitor active proposals
    proposals = await contract.call("get_active_proposals")
    for proposal in proposals:
        if proposal.votes >= proposal.required_votes - 1:
            send_alert(f"Proposal {proposal.proposal_id} needs one more vote")
```

## Troubleshooting

### Common Issues

1. **"Unauthorized" Error**: Ensure the caller is a registered manager
2. **"WithdrawalLimitExceeded"**: Check current withdrawal usage against limits
3. **"TimeLockNotExpired"**: Wait for the required time-lock period
4. **"ProposalExpired"**: Create a new proposal with appropriate duration

### Debugging Tips

1. **Check Manager Status**: Use `is_manager()` to verify authorization
2. **Monitor Limits**: Use `get_treasury_stats()` to check current usage
3. **Review Proposals**: Use `get_active_proposals()` to see pending items
4. **Check Events**: Monitor contract events for operation details

## Support Resources

- **Documentation**: Full contract documentation in `TREASURY_DOCUMENTATION.md`
- **Test Suite**: Comprehensive tests in `treasury_test.rs`
- **GitHub Issues**: Report bugs and request features
- **Community**: Join Stellar Soroban community discussions

This Treasury Management contract provides a robust foundation for secure collective fund management with flexible governance and strong security protections.
