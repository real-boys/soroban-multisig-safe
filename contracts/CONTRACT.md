# Multi-Sig Safe Contract Documentation

## Overview

The **Multi-Sig Safe** is a comprehensive multi-signature wallet contract built on Stellar's Soroban platform. It provides secure digital asset management with advanced features including time-lock recovery mechanisms, weighted signers, proposal-based governance, and emergency freeze capabilities.

## Core Features

### 🔐 Multi-Signature Security
- **Weighted Signers**: Each signer has a configurable weight for flexible threshold requirements
- **Dynamic Thresholds**: Support for low/medium/high security levels (2-of-3, 3-of-5, 5-of-7)
- **Transaction Approval**: Multi-step approval process for all fund movements

### ⏰ Time-Lock Recovery
- **Inactivity Detection**: Automatic recovery activation after prolonged inactivity
- **Recovery Key**: Designated recovery mechanism for emergency situations
- **Time-Delayed Execution**: Recovery actions require waiting periods for security

### 🛡️ Emergency Controls
- **Wallet Freeze**: Emergency freeze capability with lower threshold requirements
- **Recovery Mechanisms**: Multiple recovery paths for compromised scenarios
- **Auto-Unfreeze**: Automatic unfreezing when freeze periods expire

### 📋 Proposal System
- **Democratic Governance**: Proposal-based decision making for wallet changes
- **Voting Mechanism**: Weighted voting system for proposal approval
- **Expiration Handling**: Automatic cleanup of expired proposals

### 🔄 Contract Upgrades
- **Secure Upgrades**: Multi-signature controlled contract upgrades
- **Version Management**: Built-in versioning and migration support
- **WASM Hash Validation**: Ensures upgrade integrity

## Architecture

### Storage Structure

#### Persistent Storage (Long-term)
- `SIGNERS`: Array of `SignerInfo` (address + weight)
- `THRESHOLD_CONFIG`: Low/Medium/High threshold levels
- Custom persistent data with TTL management

#### Instance Storage (Session-based)
- `OWNERS`: Legacy owner list for backward compatibility
- `THRESHOLD`: Current active threshold
- `TRANSACTIONS`: Transaction approval queue
- `PROPOSALS`: Active governance proposals
- Recovery and freeze state management

### Key Data Types

```rust
pub struct Transaction {
    pub destination: Address,
    pub amount: i128,
    pub data: Bytes,
    pub executed: bool,
    pub signatures: u32,
    pub created_at: u64,
    pub expires_at: u64,
}

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

pub struct SignerInfo {
    pub address: Address,
    pub weight: u32,
}
```

## Contract Functions

### Initialization
```rust
__init__(
    signers: Vec<Address>,
    threshold_config: ThresholdConfig,
    recovery_address: Address,
    recovery_delay: u64,
    recovery_path_address: Address,
    recovery_key: Address
)
```
Initializes the multi-sig wallet with signers, thresholds, and recovery configuration.

### Transaction Management
- `submit_transaction()`: Submit transaction for approval
- `sign_transaction()`: Add signature to pending transaction
- `execute_transaction()`: Execute approved transaction

### Signer Management
- `add_signer()`: Add new signer with weight
- `remove_signer()`: Remove signer (with deadlock protection)
- `update_signer_weight()`: Modify signer voting weight
- `change_threshold_level()`: Switch between security levels

### Recovery System
- `initiate_recovery()`: Start recovery process
- `execute_recovery()`: Complete recovery after delay
- `emergency_recovery()`: Immediate recovery by recovery address
- `time_lock_recovery()`: Recovery after inactivity period

### Freeze System
- `freeze_wallet()`: Emergency freeze (1/3 threshold)
- `unfreeze_wallet()`: Unfreeze wallet (all owners required)
- `get_freeze_status()`: Check current freeze state

### Proposal System
- `create_proposal()`: Create governance proposal
- `vote_for_proposal()`: Vote on active proposal
- `execute_proposal()`: Execute approved proposal
- `cleanup_expired_proposals()`: Clean up expired proposals

### Contract Management
- `upgrade()`: Upgrade contract WASM (all owners required)
- `heartbeat()`: Reset time-lock timers
- `top_up_rent()`: Fund storage rent requirements

### View Functions
- `get_owners()`: Get current owner list
- `get_threshold()`: Get current threshold
- `get_transaction()`: Get transaction details
- `get_proposal()`: Get proposal details
- `get_recovery_status()`: Get recovery system status
- `get_freeze_status()`: Get freeze system status

## Security Model

### Authorization Levels
1. **Owner**: Basic access to wallet operations
2. **Signer**: Full access including configuration changes
3. **Recovery Address**: Emergency recovery capabilities
4. **Recovery Key**: Time-lock recovery activation

### Threshold Requirements
- **Low Security**: 2-of-3 signers
- **Medium Security**: 3-of-5 signers
- **High Security**: 5-of-7 signers
- **Freeze**: 1/3 of normal threshold
- **Unfreeze**: All owners required
- **Upgrade**: All owners required

### Time-Locks
- **Recovery Delay**: Minimum 24 hours
- **Freeze Duration**: 1 hour to 30 days
- **Proposal Duration**: 1 hour to 30 days
- **Time-Lock Period**: 180 days of inactivity

## Error Handling

The contract defines comprehensive error types:

```rust
pub enum MultisigError {
    Unauthorized = 1,
    InvalidTransactionId = 2,
    TransactionAlreadyExecuted = 3,
    InsufficientSignatures = 4,
    // ... additional error codes
}
```

## Storage Optimization

### TTL Management
- **Instance Storage**: 180 days default TTL
- **Persistent Storage**: 360 days default TTL
- **Auto-Extension**: Automatic TTL renewal on activity

### Rent Management
- **Balance Tracking**: Minimum balance calculation
- **Top-up Mechanism**: Owner-funded rent payments
- **Cost Estimation**: Storage byte-based cost calculation

## Events

The contract emits events for all major state changes:

- `CONFIG_CHANGE`: Configuration updates
- `UPGRADE`: Contract upgrades
- `FREEZE`/`UNFREEZE`: Freeze state changes
- `PROPOSAL_CREATED`/`VOTE_CAST`/`PROPOSAL_EXECUTED`: Governance actions

## Testing

Comprehensive test suite covering:
- Contract initialization
- Transaction lifecycle
- Recovery mechanisms
- Freeze/unfreeze operations
- Proposal voting
- Edge cases and error conditions

## Deployment

### Prerequisites
- Soroban CLI installed
- Rust toolchain configured
- Stellar network access

### Build Process
```bash
# Build contract
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/multisig_safe.wasm

# Deploy to network
soroban contract deploy --wasm multisig_safe.optimized.wasm --network testnet
```

## Integration

### Backend Integration
The contract integrates with the Node.js backend via:
- Stellar SDK for transaction submission
- Event indexing for state synchronization
- API endpoints for wallet operations

### Frontend Integration
React frontend provides:
- Multi-step wallet creation wizard
- Transaction approval interface
- Real-time status updates via WebSocket
- Recovery flow management

## Future Enhancements

### Planned Features
- **Batch Transactions**: Multiple operations in single transaction
- **Role-Based Access**: Granular permission system
- **Multi-Asset Support**: Enhanced token handling
- **Cross-Contract Calls**: Integration with other Soroban contracts

### Protocol Improvements
- **Gas Optimization**: Reduced execution costs
- **Storage Efficiency**: Improved data structures
- **Migration Tools**: Seamless version upgrades

## Security Considerations

### Audit Status
- Contract undergoes regular security audits
- Formal verification planned for critical functions
- Bug bounty program for vulnerability disclosure

### Best Practices
- Regular key rotation recommended
- Monitor contract events for suspicious activity
- Maintain adequate rent balance
- Use appropriate security thresholds for risk tolerance

## Support

For technical support or questions:
- Review contract source code in `contracts/soroban/src/`
- Check test cases for usage examples
- Refer to integration tests in backend/frontend

---

*This documentation reflects contract version 1.0.0. Check `get_version()` for deployed contract version.*</content>
<parameter name="filePath">c:\Users\MAHEK\Documents\real43\soroban-multisig-safe\contracts\CONTRACT.md