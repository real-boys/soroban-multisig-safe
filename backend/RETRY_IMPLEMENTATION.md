# Exponential Backoff Retry Implementation

## Overview

This implementation provides a sophisticated retry mechanism with exponential backoff, jitter, circuit breaker pattern, and dead letter queue handling for the Soroban Multisig Safe project.

## Features

### 1. **Retry Service**
- Multiple retry strategies (Exponential, Linear, Fixed, Fibonacci)
- Jitter types (Full, Equal, Decorrelated, None)
- Configurable retryable/non-retryable errors
- Per-attempt timeout
- Detailed retry history
- Callbacks for monitoring (onRetry, onSuccess, onFailure)

### 2. **Circuit Breaker**
- Prevents cascading failures
- Three states: CLOSED, OPEN, HALF_OPEN
- Configurable failure/success thresholds
- Automatic recovery testing
- Manual reset capability

### 3. **Dead Letter Queue (DLQ)**
- Stores messages that failed all retries
- Manual retry capability
- Automatic cleanup of old messages
- Alerting when threshold exceeded
- Analytics and reporting

### 4. **Enhanced RPC Service**
- Combines retry logic with circuit breaker
- Automatic failover between providers
- Provider health tracking
- Performance monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  (Controllers, Services, Background Jobs)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Retry Service                            │
│  • Exponential Backoff                                       │
│  • Jitter Application                                        │
│  • Error Classification                                      │
│  • Timeout Handling                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Circuit Breaker Service                     │
│  • State Management (CLOSED/OPEN/HALF_OPEN)                 │
│  • Failure Tracking                                          │
│  • Automatic Recovery                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                External Services / APIs                      │
│  • RPC Providers                                             │
│  • Database                                                  │
│  • Event Indexer                                             │
│  • Email Service                                             │
└─────────────────────────────────────────────────────────────┘

                         │ (On Failure)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                Dead Letter Queue Service                     │
│  • Failed Message Storage                                    │
│  • Manual Retry                                              │
│  • Analytics                                                 │
└─────────────────────────────────────────────────────────────┘
```

## Retry Strategies

### 1. Exponential Backoff
```
Delay = initialDelay * (backoffMultiplier ^ attempt)
Example: 1s, 2s, 4s, 8s, 16s...
```

### 2. Linear Backoff
```
Delay = initialDelay * attempt
Example: 1s, 2s, 3s, 4s, 5s...
```

### 3. Fixed Delay
```
Delay = initialDelay
Example: 1s, 1s, 1s, 1s, 1s...
```

### 4. Fibonacci Backoff
```
Delay = fibonacci(attempt) * initialDelay
Example: 1s, 2s, 3s, 5s, 8s...
```

## Jitter Types

### 1. Full Jitter
```
Delay = random(0, calculatedDelay)
```

### 2. Equal Jitter
```
Delay = calculatedDelay/2 + random(0, calculatedDelay/2)
```

### 3. Decorrelated Jitter
```
Delay = random(initialDelay, calculatedDelay * 3)
```

### 4. No Jitter
```
Delay = calculatedDelay
```

## Usage Examples

### Basic Retry

```typescript
import { retryService } from '@/services/RetryService';

// Simple retry with defaults
const result = await retryService.executeWithRetry(
  async () => {
    return await someApiCall();
  }
);

if (result.success) {
  console.log('Success:', result.result);
} else {
  console.error('Failed after retries:', result.error);
}
```

### Custom Configuration

```typescript
import { retryService } from '@/services/RetryService';
import { RetryStrategy, JitterType } from '@/types/retry';

const result = await retryService.executeWithRetry(
  async () => {
    return await rpcCall();
  },
  {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitterType: JitterType.FULL,
    backoffMultiplier: 2,
    timeout: 5000,
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', '503'],
    nonRetryableErrors: ['400', '401', '403'],
    onRetry: (attempt, error, delay) => {
      console.log(`Retry attempt ${attempt} after ${delay}ms`);
    },
    onSuccess: (result, attempts) => {
      console.log(`Succeeded after ${attempts} attempts`);
    },
    onFailure: (error, attempts) => {
      console.error(`Failed after ${attempts} attempts:`, error);
    },
  }
);
```

### Using Presets

```typescript
import { retryService } from '@/services/RetryService';
import { RPC_RETRY_CONFIG } from '@/config/retryConfig';

// Use predefined configuration for RPC calls
const result = await retryService.executeWithRetry(
  async () => {
    return await rpcProvider.call('getLatestLedger');
  },
  RPC_RETRY_CONFIG
);
```

### Convenience Methods

```typescript
// Exponential backoff
const result = await retryService.retryWithExponentialBackoff(
  async () => await apiCall(),
  5, // max attempts
  1000 // initial delay
);

// Linear backoff
const result = await retryService.retryWithLinearBackoff(
  async () => await apiCall(),
  3,
  2000
);

// Fixed delay
const result = await retryService.retryWithFixedDelay(
  async () => await apiCall(),
  3,
  1000
);
```

### Circuit Breaker

```typescript
import { circuitBreakerService } from '@/services/CircuitBreakerService';

const result = await circuitBreakerService.execute(
  'my-service',
  async () => {
    return await externalServiceCall();
  },
  {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    monitoringPeriod: 120000,
  }
);
```

### Enhanced RPC Service

```typescript
import { enhancedRPCService } from '@/services/EnhancedRPCService';

// Automatically handles retry, circuit breaker, and failover
const result = await enhancedRPCService.makeRPCCall(
  'getLatestLedger',
  {},
  {
    timeout: 5000,
    retryConfig: {
      maxAttempts: 5,
    },
  }
);
```

### Dead Letter Queue

```typescript
import { deadLetterQueueService } from '@/services/DeadLetterQueueService';
import { retryService } from '@/services/RetryService';

// When all retries fail, add to DLQ
const result = await retryService.executeWithRetry(
  async () => await processMessage(message),
  config
);

if (!result.success) {
  await deadLetterQueueService.addMessage(
    'my-queue',
    message,
    result.error!,
    result.retryHistory
  );
}

// Later, retry from DLQ
await deadLetterQueueService.retryMessage(
  messageId,
  async (payload) => {
    await processMessage(payload);
  }
);
```

## Configuration Presets

### RPC Calls
```typescript
{
  maxAttempts: 5,
  initialDelay: 500,
  maxDelay: 10000,
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.FULL,
  retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', '503', '504'],
}
```

### Database Operations
```typescript
{
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 5000,
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.EQUAL,
  retryableErrors: ['P1001', 'P1002', 'ETIMEDOUT'],
}
```

### Event Indexer
```typescript
{
  maxAttempts: 10,
  initialDelay: 2000,
  maxDelay: 60000,
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.DECORRELATED,
}
```

### Transaction Submission
```typescript
{
  maxAttempts: 5,
  initialDelay: 2000,
  maxDelay: 30000,
  strategy: RetryStrategy.EXPONENTIAL,
  jitterType: JitterType.FULL,
  nonRetryableErrors: ['TX_BAD_AUTH', 'TX_MALFORMED'],
}
```

## API Endpoints

### Dead Letter Queue

#### Get DLQ Statistics
```
GET /api/v1/retry/dlq/stats
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "totalMessages": 42,
    "messagesByQueue": {
      "transactions": 15,
      "notifications": 27
    },
    "oldestMessage": "2026-04-20T10:00:00Z",
    "newestMessage": "2026-04-27T15:30:00Z"
  }
}
```

#### Get DLQ Messages
```
GET /api/v1/retry/dlq/messages?page=1&pageSize=50
Authorization: Bearer <token>
```

#### Get Message by ID
```
GET /api/v1/retry/dlq/message/:messageId
Authorization: Bearer <token>
```

#### Retry Message
```
POST /api/v1/retry/dlq/message/:messageId/retry
Authorization: Bearer <token>
```

#### Delete Message
```
DELETE /api/v1/retry/dlq/message/:messageId
Authorization: Bearer <token>
```

### Circuit Breaker

#### Get All Circuit Breaker Stats
```
GET /api/v1/retry/circuit-breaker/stats
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "circuits": [
      {
        "name": "rpc-provider-0",
        "state": "CLOSED",
        "failures": 0,
        "successes": 150,
        "lastSuccessTime": 1714234567890
      }
    ],
    "count": 1
  }
}
```

#### Get Specific Circuit Status
```
GET /api/v1/retry/circuit-breaker/:circuitName
Authorization: Bearer <token>
```

#### Reset Circuit Breaker
```
POST /api/v1/retry/circuit-breaker/:circuitName/reset
Authorization: Bearer <token>
```

### RPC Providers

#### Get RPC Provider Stats
```
GET /api/v1/retry/rpc/providers
Authorization: Bearer <token>
```

#### Reset All RPC Providers
```
POST /api/v1/retry/rpc/providers/reset
Authorization: Bearer <token>
```

## Database Schema

### Dead Letter Queue Table

```sql
CREATE TABLE dead_letter_queue (
  id VARCHAR(255) PRIMARY KEY,
  original_queue VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  error TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt TIMESTAMP NOT NULL,
  last_attempt TIMESTAMP NOT NULL,
  retry_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Monitoring

### Metrics to Track

1. **Retry Metrics**
   - Total retry attempts
   - Success rate after retries
   - Average attempts before success
   - Most common retry errors

2. **Circuit Breaker Metrics**
   - Circuit state changes
   - Time in OPEN state
   - Failure rate per circuit
   - Recovery success rate

3. **DLQ Metrics**
   - Messages in DLQ
   - DLQ growth rate
   - Retry success rate from DLQ
   - Average time in DLQ

4. **RPC Provider Metrics**
   - Provider health status
   - Failover frequency
   - Average response time per provider
   - Error rate per provider

## Best Practices

### 1. Choose Appropriate Strategy
- **Exponential**: Most common, good for network issues
- **Linear**: Predictable, good for rate limiting
- **Fixed**: Simple, good for quick retries
- **Fibonacci**: Balanced growth, good for long-running operations

### 2. Use Jitter
- Always use jitter in production to avoid thundering herd
- **Full jitter**: Maximum randomization
- **Equal jitter**: Balance between predictability and randomization

### 3. Set Reasonable Limits
- Don't retry forever (max 5-10 attempts usually sufficient)
- Set appropriate timeouts
- Cap maximum delay (30-60 seconds typical)

### 4. Classify Errors Correctly
- Don't retry client errors (400, 401, 403, 404)
- Do retry transient errors (503, 504, network errors)
- Use specific error codes when possible

### 5. Monitor and Alert
- Track retry rates
- Alert on high DLQ growth
- Monitor circuit breaker state changes
- Track provider health

### 6. Handle DLQ Messages
- Review DLQ regularly
- Investigate patterns in failures
- Set up automated retry for recoverable failures
- Clean up old messages

## Troubleshooting

### High Retry Rate
- Check if external service is degraded
- Review retry configuration (too aggressive?)
- Check error classification
- Consider circuit breaker

### Circuit Breaker Stuck Open
- Check if service has recovered
- Review failure threshold (too low?)
- Manually reset if needed
- Check monitoring period

### DLQ Growing
- Investigate common failure patterns
- Check if retry logic is appropriate
- Review error handling in application
- Consider manual intervention

### Provider Failover Issues
- Check provider health
- Review circuit breaker configuration
- Verify provider URLs
- Check network connectivity

## Performance Considerations

### Memory Usage
- Retry history stored in memory during execution
- DLQ messages stored in database
- Circuit breaker state minimal memory footprint

### CPU Usage
- Jitter calculation is lightweight
- Exponential calculation is O(1)
- Circuit breaker checks are O(1)

### Database Impact
- DLQ writes only on final failure
- Periodic cleanup runs hourly
- Indexes optimize queries

## Security Considerations

### Authentication
- All admin endpoints require authentication
- DLQ access restricted to authorized users
- Circuit breaker management requires admin role

### Data Privacy
- DLQ may contain sensitive payload data
- Consider encryption for sensitive messages
- Implement data retention policies

### Rate Limiting
- Retry logic respects rate limits
- Circuit breaker prevents abuse
- DLQ prevents infinite retries

## Future Enhancements

- [ ] Distributed circuit breaker (Redis-based)
- [ ] Advanced DLQ analytics dashboard
- [ ] Automatic retry strategy selection
- [ ] Machine learning for optimal backoff
- [ ] Webhook notifications for DLQ events
- [ ] Grafana dashboards for monitoring
- [ ] Prometheus metrics export

## License

This retry implementation is part of the Soroban Multisig Safe project and follows the same license.
