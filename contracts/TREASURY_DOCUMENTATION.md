# Treasury Management Smart Contract Documentation

## Overview

The **Treasury Management Smart Contract** is a comprehensive solution for managing collective funds with advanced security features including withdrawal limits, time locks, and proposal voting systems. Built on Stellar's Soroban platform, this contract provides secure and transparent treasury operations for DAOs, organizations, and investment groups.

## Core Features

### 🔐 Multi-Manager Security
- **Manager Roles**: Designated managers with configurable weights for flexible governance
- **Dynamic Thresholds**: Support for different approval thresholds based on transaction size
- **Access Control**: Strict authorization checks for all treasury operations

### 💰 Withdrawal Limits
- **Daily Limits**: Configurable daily withdrawal limits to prevent excessive spending
- **Weekly Limits**: Higher limits for weekly operations with automatic reset
- **Monthly Limits**: Maximum monthly withdrawal caps for long-term budgeting
- **Automatic Reset**: Time-based reset of withdrawal counters

### ⏰ Time-Lock Protection
- **Standard Time-Locks**: 24-hour waiting period for regular withdrawals
- **Emergency Time-Locks**: 1-hour waiting period for urgent situations
- **Extended Time-Locks**: 7-day waiting period for large amounts
- **Configurable Thresholds**: Adjustable amount thresholds for different time-lock periods

### 📋 Proposal Voting System
- **Democratic Governance**: Proposal-based decision making for treasury operations
- **Multiple Proposal Types**: Support for various proposal categories
- **Weighted Voting**: Manager weights influence voting power
- **Expiration Handling**: Automatic cleanup of expired proposals

## Architecture

### Data Structures

#### TreasuryManager
```rust
pub struct TreasuryManager {
    pub address: Address,
    pub weight: u32,
    pub joined_at: u64,
}
```

#### WithdrawalLimit
```rust
pub struct WithdrawalLimit {
    pub daily_limit: i128,
    pub weekly_limit: i128,
    pub monthly_limit: i128,
    pub last_updated: u64,
}
```

#### TimeLockConfig
```rust
pub struct TimeLockConfig {
    pub standard_period: u64,
    pub emergency_period: u64,
    pub large_amount_threshold: i128,
    pub extended_period: u64,
}
```

#### TreasuryProposal
```rust
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
```

#### ProposalType
```rust
pub enum ProposalType {
    StandardWithdrawal,
    EmergencyWithdrawal,
    BudgetAllocation,
    ParameterChange,
    ManagerAddition,
    ManagerRemoval,
}
```

### Storage Structure

#### Instance Storage
- `MANAGERS`: Array of `TreasuryManager` structures
- `THRESHOLD`: Current approval threshold
- `WITHDRAWAL_LIMITS`: Withdrawal limit configuration
- `TIME_LOCK_CONFIG`: Time-lock configuration
- `TREASURY_CONFIG`: General treasury configuration
- `PROPOSALS`: Active and historical proposals
- `PROPOSAL_VOTES`: Voting records per proposal
- `WITHDRAWAL_REQUESTS`: Withdrawal request history
- `TREASURY_STATS`: Treasury statistics and counters

#### Time-Based Storage
- `LAST_DAILY_RESET`: Timestamp of last daily reset
- `LAST_WEEKLY_RESET`: Timestamp of last weekly reset
- `LAST_MONTHLY_RESET`: Timestamp of last monthly reset

## API Reference

### Initialization

#### `initialize`
```rust
pub fn initialize(
    env: Env,
    managers: Vec<Address>,
    threshold: u32,
    withdrawal_limits: WithdrawalLimit,
    time_lock_config: TimeLockConfig,
    treasury_config: TreasuryConfig,
) -> Result<(), TreasuryError>
```

Initializes the treasury contract with managers and configuration parameters.

**Parameters:**
- `managers`: List of initial manager addresses
- `threshold`: Number of votes required for proposal execution
- `withdrawal_limits`: Withdrawal limit configuration
- `time_lock_config`: Time-lock configuration
- `treasury_config`: General treasury configuration

### Manager Management

#### `add_manager`
```rust
pub fn add_manager(
    env: Env,
    new_manager: Address,
    weight: u32,
) -> Result<(), TreasuryError>
```

Adds a new manager to the treasury. Requires existing manager authorization.

#### `remove_manager`
```rust
pub fn remove_manager(
    env: Env,
    manager_to_remove: Address,
) -> Result<(), TreasuryError>
```

Removes a manager from the treasury. Cannot remove the last manager.

### Proposal System

#### `create_proposal`
```rust
pub fn create_proposal(
    env: Env,
    proposal_type: ProposalType,
    destination: Address,
    amount: i128,
    asset: Address,
    description: Bytes,
    duration: u64,
) -> Result<u64, TreasuryError>
```

Creates a new proposal for treasury action. Returns the proposal ID.

#### `vote_on_proposal`
```rust
pub fn vote_on_proposal(
    env: Env,
    proposal_id: u64,
) -> Result<(), TreasuryError>
```

Votes on an existing proposal. Requires manager authorization.

#### `execute_proposal`
```rust
pub fn execute_proposal(
    env: Env,
    proposal_id: u64,
) -> Result<(), TreasuryError>
```

Executes a proposal that has sufficient votes and has passed the time-lock period.

### Configuration Management

#### `update_withdrawal_limits`
```rust
pub fn update_withdrawal_limits(
    env: Env,
    daily_limit: i128,
    weekly_limit: i128,
    monthly_limit: i128,
) -> Result<(), TreasuryError>
```

Updates the withdrawal limits. Requires manager authorization.

#### `update_time_lock_config`
```rust
pub fn update_time_lock_config(
    env: Env,
    standard_period: u64,
    emergency_period: u64,
    large_amount_threshold: i128,
    extended_period: u64,
) -> Result<(), TreasuryError>
```

Updates the time-lock configuration. Requires manager authorization.

### Query Functions

#### `get_treasury_stats`
```rust
pub fn get_treasury_stats(env: Env) -> TreasuryStats
```

Returns current treasury statistics including balances and limits.

#### `get_active_proposals`
```rust
pub fn get_active_proposals(env: Env) -> Vec<TreasuryProposal>
```

Returns all active proposals that haven't expired or been executed.

#### `get_proposal`
```rust
pub fn get_proposal(env: Env, proposal_id: u64) -> Option<TreasuryProposal>
```

Returns a specific proposal by ID.

#### `is_manager`
```rust
pub fn is_manager(env: &Env, address: &Address) -> bool
```

Checks if an address is a treasury manager.

## Security Features

### Access Control
- All operations require manager authorization
- Proposal voting prevents unilateral actions
- Time-lock delays prevent rushed decisions

### Withdrawal Protection
- Daily, weekly, and monthly limits prevent excessive spending
- Automatic reset ensures fair access over time
- Large amounts require extended time-locks

### Proposal Security
- Expiration prevents stale proposals
- Voting threshold ensures consensus
- Time-lock delays consideration period

### Audit Trail
- All operations emit events for transparency
- Proposal and voting history is maintained
- Withdrawal requests are tracked

## Error Handling

The contract uses a comprehensive error system:

```rust
pub enum TreasuryError {
    Unauthorized = 1,
    InsufficientBalance = 2,
    WithdrawalLimitExceeded = 3,
    TimeLockNotExpired = 4,
    ProposalAlreadyExists = 5,
    ProposalDoesNotExist = 6,
    ProposalExpired = 7,
    ProposalAlreadyExecuted = 8,
    AlreadyVoted = 9,
    InvalidWithdrawalLimit = 10,
    InvalidTimeLockPeriod = 11,
    InvalidProposalDuration = 12,
    ManagerAlreadyExists = 13,
    ManagerDoesNotExist = 14,
    CannotRemoveLastManager = 15,
    InvalidThreshold = 16,
    MaximumManagersExceeded = 17,
    InvalidAssetAddress = 18,
    TransferFailed = 19,
    EntryArchived = 20,
    InsufficientBalanceForRent = 21,
    InvalidTtlExtension = 22,
}
```

## Event System

The contract emits events for all major operations:

- `TreasuryInitializedEvent`: Contract initialization
- `ManagerAddedEvent`: Manager addition
- `ManagerRemovedEvent`: Manager removal
- `WithdrawalExecutedEvent`: Withdrawal execution
- `ProposalCreatedEvent`: Proposal creation
- `VoteCastEvent`: Vote casting
- `ProposalExecutedEvent`: Proposal execution
- `LimitsUpdatedEvent`: Withdrawal limit updates
- `TimeLockUpdatedEvent`: Time-lock configuration updates

## Usage Examples

### Basic Setup
```rust
// Initialize treasury with 3 managers, threshold of 2
let managers = vec![manager1, manager2, manager3];
let withdrawal_limits = WithdrawalLimit {
    daily_limit: 1000000,
    weekly_limit: 5000000,
    monthly_limit: 20000000,
    last_updated: 0,
};

let time_lock_config = TimeLockConfig {
    standard_period: 86400,    // 24 hours
    emergency_period: 3600,     // 1 hour
    large_amount_threshold: 10000000,
    extended_period: 604800,    // 7 days
};

treasury.initialize(managers, 2, withdrawal_limits, time_lock_config, treasury_config);
```

### Creating and Executing a Withdrawal
```rust
// Create withdrawal proposal
let proposal_id = treasury.create_proposal(
    ProposalType::StandardWithdrawal,
    recipient,
    1000000,
    token_address,
    "Monthly operational expenses".into(),
    86400, // 24 hour duration
);

// Vote on proposal
treasury.vote_on_proposal(proposal_id);

// Wait for time-lock to expire (if needed)
// Then execute
treasury.execute_proposal(proposal_id);
```

### Emergency Withdrawal
```rust
// Create emergency withdrawal proposal
let proposal_id = treasury.create_proposal(
    ProposalType::EmergencyWithdrawal,
    recipient,
    5000000,
    token_address,
    "Emergency liquidity need".into(),
    3600, // 1 hour duration
);

// Emergency withdrawals have shorter time-locks
```

## Best Practices

### Security Recommendations
1. **Manager Selection**: Choose trusted managers with diverse backgrounds
2. **Threshold Setting**: Set thresholds high enough to prevent collusion
3. **Time-Lock Configuration**: Use appropriate time-locks for your risk profile
4. **Regular Audits**: Monitor proposal and withdrawal patterns

### Operational Guidelines
1. **Proposal Clarity**: Provide clear descriptions for all proposals
2. **Budget Planning**: Use withdrawal limits to enforce budget discipline
3. **Emergency Procedures**: Establish clear criteria for emergency withdrawals
4. **Documentation**: Maintain external records of all treasury decisions

### Configuration Tips
1. **Withdrawal Limits**: Set limits based on expected cash flow needs
2. **Time-Lock Periods**: Balance security with operational flexibility
3. **Proposal Duration**: Allow sufficient time for consideration
4. **Manager Weights**: Consider voting power distribution carefully

## Integration

### Frontend Integration
The contract provides query functions for frontend integration:
- Use `get_active_proposals()` for proposal listings
- Use `get_treasury_stats()` for dashboard information
- Use `is_manager()` for access control

### Backend Integration
- Listen to contract events for real-time updates
- Use proposal IDs for tracking operations
- Implement retry logic for time-lock operations

## Upgrade Path

The contract is designed for future upgrades:
- Configuration can be updated via proposals
- Manager list can be modified through governance
- New features can be added through contract upgrades

## License

This contract is licensed under the MIT License. See the repository for full license terms.

## Support

For technical support and questions:
- GitHub Issues: Report bugs and feature requests
- Documentation: Refer to this guide and code comments
- Community: Join the Stellar Soroban community discussions
