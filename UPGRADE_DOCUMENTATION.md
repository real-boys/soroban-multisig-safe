# Upgradeable Contract Wrapper Documentation

## Overview

This document describes the upgradeable contract implementation for the Soroban Multisig Safe contract. The upgrade mechanism allows the contract to be updated to new versions while preserving all existing state and data.

## Features

### 1. Upgrade Function
- **Function**: `upgrade(env: Env, caller: Address, new_wasm_hash: Bytes) -> Result<(), MultisigError>`
- **Security**: Requires "High" threshold (all owners must approve)
- **Validation**: Prevents empty or duplicate WASM hashes
- **State Management**: Prevents concurrent upgrades

### 2. Upgrade Event
```rust
pub struct UpgradeEvent {
    pub old_wasm_hash: Bytes,
    pub new_wasm_hash: Bytes,
    pub upgraded_by: Address,
    pub upgraded_at: u64,
}
```

### 3. Version Tracking
- Automatic version incrementing on successful upgrade
- Version persistence across contract upgrades
- Migration support for future versions

### 4. Data Compatibility
- All storage keys remain consistent across versions
- Migration functions for data format changes
- State validation before and after upgrade

## Security Measures

### 1. High Threshold Requirement
- All contract owners must approve the upgrade
- Prevents unilateral contract modifications
- Ensures community consensus

### 2. WASM Hash Validation
- Prevents empty WASM hash submissions
- Blocks upgrades to the same WASM hash
- Validates hash format and structure

### 3. Concurrent Upgrade Prevention
- Upgrade state tracking prevents simultaneous upgrades
- Automatic cleanup of upgrade signatures
- State consistency guarantees

### 4. Data Integrity Checks
- Validates critical data before migration
- Ensures owners and thresholds are valid
- Prevents corruption during upgrade process

## Usage

### Step 1: Prepare New WASM
1. Build the new contract version
2. Deploy to get the new WASM hash
3. Verify the new implementation

### Step 2: Initiate Upgrade
Each owner must call the upgrade function with the new WASM hash:

```rust
// Called by each owner
MultisigSafe::upgrade(
    env,
    owner_address,
    new_wasm_hash,
)?;
```

### Step 3: Upgrade Completion
- Once all owners have signed, the upgrade executes automatically
- The contract version is incremented
- An Upgrade event is emitted
- All existing data is preserved

## Event Structure

The upgrade process emits an event with the following structure:
- **Topic**: `(UPGRADE, EXECUTED)`
- **Data**: `UpgradeEvent` containing old/new hashes and metadata

## Migration Process

### Current Implementation
- Version 1 → Version 2: No data migration needed
- All storage keys remain compatible
- Data structures are preserved

### Future Migrations
The `migrate_data` function can be extended for:
- Storage format changes
- New field additions
- Data structure optimizations

## Testing

### Test Coverage
1. **Basic Upgrade Functionality**
   - Version tracking
   - Signature collection
   - Threshold validation

2. **State Persistence**
   - Owner preservation
   - Transaction data integrity
   - Recovery mechanism continuity

3. **Security Measures**
   - Invalid hash rejection
   - Duplicate signature prevention
   - Concurrent upgrade blocking

4. **Event Emission**
   - Upgrade event structure
   - Event data accuracy
   - Event timing

### Running Tests
```bash
cargo test --package multisig-safe --lib
```

## Integration Examples

### Frontend Integration
```javascript
// Check if upgrade is needed
const currentVersion = await contract.getVersion();
const newWasmHash = "0x...";

// Each owner signs the upgrade
for (const owner of owners) {
    await contract.upgrade(owner, newWasmHash);
}

// Listen for upgrade events
contract.events((event) => {
    if (event.topic === "UPGRADE") {
        console.log("Contract upgraded:", event.data);
    }
});
```

### Backend Integration
```rust
// Monitor for upgrade events
let events = env.events().all();
for event in events {
    if event.topic.0 == UPGRADE_EVENT {
        let upgrade_event: UpgradeEvent = event.data;
        // Handle upgrade completion
    }
}
```

## Best Practices

1. **Before Upgrade**
   - Test new implementation thoroughly
   - Verify all owners agree to upgrade
   - Backup critical data

2. **During Upgrade**
   - Monitor upgrade progress
   - Verify event emissions
   - Check version increment

3. **After Upgrade**
   - Validate all functionality
   - Confirm data persistence
   - Update documentation

## Troubleshooting

### Common Issues
1. **Insufficient Signatures**: Ensure all owners have signed
2. **Invalid WASM Hash**: Verify hash format and content
3. **Upgrade in Progress**: Wait for current upgrade to complete

### Error Codes
- `InvalidWasmHash`: Empty or invalid WASM hash
- `InsufficientSignatures`: Not enough owner approvals
- `UpgradeInProgress`: Another upgrade is in progress

## Future Enhancements

1. **Timed Upgrades**: Add time delays for additional security
2. **Upgrade Proposals**: Formal proposal mechanism
3. **Rollback Support**: Ability to revert upgrades
4. **Automated Testing**: Built-in upgrade validation

## Conclusion

The upgradeable contract wrapper provides a secure, flexible mechanism for evolving the multisig safe contract while maintaining the highest security standards and data integrity guarantees.
