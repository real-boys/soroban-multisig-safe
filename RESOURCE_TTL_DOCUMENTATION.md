# Resource TTL and Rent Management Documentation

## Overview

This document explains the Time-To-Live (TTL) and rent management system implemented in the Soroban Multisig Safe contract to prevent storage entries from expiring and getting archived.

## Storage Architecture

### Instance Storage
- **Purpose**: Stores contract state data that exists only while the contract is active
- **TTL Management**: Automatic extension on every function call
- **Default TTL**: 180 days (15,552,000 ledgers)
- **Auto-extension**: When 50% of TTL is consumed

### Persistent Storage  
- **Purpose**: Stores long-term data that should survive contract lifecycle
- **TTL Management**: Manual extension via rent payments
- **Default TTL**: 360 days (31,104,000 ledgers)
- **Rent-based**: Requires XLM deposits for maintenance

## XLM Storage Requirements

### Cost Calculation Formula

```rust
// Base storage cost estimation
storage_bytes = 1000 + (owners_count * 32) + (transactions_count * 200)
base_cost = storage_bytes (in stroops)
minimum_balance = base_cost * 2  // 2x safety buffer
```

### Storage Cost Breakdown

| Component | Bytes per Entry | Cost (stroops) | Cost (XLM) |
|-----------|----------------|----------------|------------|
| Base overhead | 1000 | 1,000 | 0.0001 XLM |
| Each owner | 32 | 32 | 0.0000032 XLM |
| Each transaction | 200 | 200 | 0.00002 XLM |
| Safety buffer | 2x multiplier | - | - |

### Example Calculations

#### Small Multisig (3 owners, 10 transactions)
```
storage_bytes = 1000 + (3 * 32) + (10 * 200) = 1000 + 96 + 2000 = 3,096 bytes
base_cost = 3,096 stroops = 0.0003096 XLM
minimum_balance = 3,096 * 2 = 6,192 stroops = 0.0006192 XLM
```

#### Medium Multisig (5 owners, 50 transactions)
```
storage_bytes = 1000 + (5 * 32) + (50 * 200) = 1000 + 160 + 10,000 = 11,160 bytes
base_cost = 11,160 stroops = 0.001116 XLM  
minimum_balance = 11,160 * 2 = 22,320 stroops = 0.002232 XLM
```

#### Large Multisig (10 owners, 100 transactions)
```
storage_bytes = 1000 + (10 * 32) + (100 * 200) = 1000 + 320 + 20,000 = 21,320 bytes
base_cost = 21,320 stroops = 0.002132 XLM
minimum_balance = 21,320 * 2 = 42,640 stroops = 0.004264 XLM
```

## TTL Management Features

### Automatic TTL Extension
- **Trigger**: Every contract function call
- **Logic**: Extends when 50% of current TTL is consumed
- **Extension**: Default 180 days
- **Storage**: Tracks last extension ledger number

### Manual TTL Extension
- **Function**: `extend_instance_ttl()`
- **Minimum**: 30 days extension
- **Validation**: Prevents extensions below minimum threshold

### Persistent Storage TTL
- **Trigger**: Manual rent payments
- **Extension**: 360 days per rent payment
- **Validation**: Requires minimum balance before storage

## Rent Management Functions

### `top_up_rent(caller, amount)`
- **Purpose**: Add XLM to contract for persistent storage
- **Validation**: Caller must be owner, amount > 0
- **Auto-extension**: Extends persistent storage TTL
- **Tracking**: Updates rent balance

### `get_rent_balance()`
- **Returns**: Current rent balance in stroops
- **Purpose**: Monitor available rent funds

### `calculate_minimum_balance()`
- **Returns**: Minimum XLM needed for current storage
- **Dynamic**: Based on current owners and transactions
- **Safety**: Includes 2x buffer multiplier

## Error Handling

### EntryArchived (Error Code: 16)
- **Cause**: Storage entry TTL expired
- **Recovery**: Extend TTL and restore data
- **Prevention**: Auto-extension for instance storage

### InsufficientBalanceForRent (Error Code: 17)
- **Cause**: Inadequate XLM for persistent storage
- **Recovery**: Call `top_up_rent()` with sufficient XLM
- **Prevention**: Monitor rent balance regularly

### InvalidTtlExtension (Error Code: 18)
- **Cause**: TTL extension below minimum threshold
- **Recovery**: Use valid extension amount (≥30 days)
- **Prevention**: Use default extension values

## Best Practices

### For Contract Users
1. **Monitor TTL**: Use `get_ttl_info()` regularly
2. **Maintain Rent Balance**: Keep sufficient XLM for persistent storage
3. **Plan for Growth**: Consider future transaction volume
4. **Regular Maintenance**: Call view functions to trigger auto-extension

### For Contract Developers
1. **Buffer Multiplier**: Use 2x safety buffer for cost calculations
2. **Auto-Extension**: Implement for all instance storage operations
3. **Error Recovery**: Handle EntryArchived errors gracefully
4. **Cost Monitoring**: Provide balance and cost query functions

## Long-term Storage Recommendations

### 1 Year Storage Estimate
For a multisig with 5 owners and 100 transactions over 1 year:
```
Total storage cost: ~0.005 XLM
Recommended rent deposit: 0.01 XLM (2x buffer)
```

### 5 Year Storage Estimate  
For a multisig with 10 owners and 500 transactions over 5 years:
```
Total storage cost: ~0.03 XLM
Recommended rent deposit: 0.06 XLM (2x buffer)
```

## Monitoring and Maintenance

### Daily Checks
- Rent balance status
- TTL remaining time
- Storage cost changes

### Monthly Actions  
- Top up rent if balance < 50% of minimum
- Review transaction history growth
- Plan for additional owners if needed

### Emergency Procedures
1. **TTL Expiration**: Immediately call any function to trigger auto-extension
2. **Rent Depletion**: Top up with minimum balance + 50% buffer
3. **Data Recovery**: Use persistent storage functions with proper error handling

## Technical Implementation Details

### Storage Keys
```rust
const RENT_BALANCE: Symbol = symbol_short!("RENT_BAL");
const LAST_TTL_EXTENSION: Symbol = symbol_short!("LAST_EXT");
const PERSISTENT_DATA: Symbol = symbol_short!("PERS_DATA");
```

### TTL Constants
```rust
const DEFAULT_INSTANCE_TTL: u32 = 15552000; // 180 days
const DEFAULT_PERSISTENT_TTL: u32 = 31104000; // 360 days  
const MIN_TTL_EXTENSION: u32 = 2592000; // 30 days
const RENT_BUFFER_MULTIPLIER: u32 = 2; // 2x safety buffer
```

### Auto-extension Logic
```rust
fn auto_extend_instance_ttl(env: &Env) -> Result<(), MultisigError> {
    let ledgers_since_extension = current_ledger - last_extension;
    if ledgers_since_extension > DEFAULT_INSTANCE_TTL / 2 {
        extend_instance_ttl(env, DEFAULT_INSTANCE_TTL)?;
    }
}
```

## Conclusion

This TTL and rent management system ensures:
- **Reliability**: Prevents unexpected data loss
- **Cost-effectiveness**: Optimizes XLM usage
- **Transparency**: Clear cost calculations and monitoring
- **Automation**: Reduces manual maintenance requirements

The implementation provides robust protection against storage archival while maintaining efficient resource utilization.
