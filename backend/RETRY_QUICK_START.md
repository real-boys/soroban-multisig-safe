# Retry Logic Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Run Database Migration

```bash
# Navigate to backend directory
cd soroban-multisig-safe/backend

# Run migration to create DLQ table
psql $DATABASE_URL < prisma/migrations/add_dead_letter_queue.sql

# Or use Prisma if configured
npm run db:migrate
```

### Step 2: Verify Setup

```bash
# Check if DLQ table exists
psql $DATABASE_URL -c "\d dead_letter_queue"
```

### Step 3: Start Using Retry Logic

The retry services are automatically available - no additional setup needed!

---

## 📝 Basic Usage

### 1. Simple Retry

```typescript
import { retryService } from '@/services/RetryService';

// Retry an operation with default settings
const result = await retryService.executeWithRetry(
  async () => {
    return await myApiCall();
  }
);

if (result.success) {
  console.log('Success!', result.result);
} else {
  console.error('Failed:', result.error);
}
```

### 2. RPC Calls with Retry

```typescript
import { enhancedRPCService } from '@/services/EnhancedRPCService';

// Automatically retries with exponential backoff
const ledger = await enhancedRPCService.makeRPCCall('getLatestLedger');
```

### 3. Database Operations with Retry

```typescript
import { retryService } from '@/services/RetryService';
import { DATABASE_RETRY_CONFIG } from '@/config/retryConfig';

const user = await retryService.executeWithRetry(
  async () => {
    return await prisma.user.create({ data: userData });
  },
  DATABASE_RETRY_CONFIG
);
```

### 4. Circuit Breaker Protection

```typescript
import { circuitBreakerService } from '@/services/CircuitBreakerService';

const result = await circuitBreakerService.execute(
  'external-api',
  async () => {
    return await externalApiCall();
  }
);
```

---

## 🎯 Common Scenarios

### Scenario 1: Network Request with Retry

```typescript
import { retryService } from '@/services/RetryService';
import { RetryStrategy, JitterType } from '@/types/retry';

async function fetchDataWithRetry(url: string) {
  const result = await retryService.executeWithRetry(
    async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    {
      maxAttempts: 5,
      initialDelay: 1000,
      strategy: RetryStrategy.EXPONENTIAL,
      jitterType: JitterType.FULL,
      retryableErrors: ['NETWORK_ERROR', '503', '504'],
    }
  );

  return result.result;
}
```

### Scenario 2: Transaction Submission

```typescript
import { retryService } from '@/services/RetryService';
import { TRANSACTION_SUBMISSION_RETRY_CONFIG } from '@/config/retryConfig';

async function submitTransaction(tx: any) {
  const result = await retryService.executeWithRetry(
    async () => {
      return await stellarService.submitTransaction(tx);
    },
    TRANSACTION_SUBMISSION_RETRY_CONFIG
  );

  if (!result.success) {
    // Add to DLQ for manual review
    await deadLetterQueueService.addMessage(
      'transactions',
      tx,
      result.error!,
      result.retryHistory
    );
  }

  return result;
}
```

### Scenario 3: Event Indexing

```typescript
import { retryService } from '@/services/RetryService';
import { EVENT_INDEXER_RETRY_CONFIG } from '@/config/retryConfig';

async function fetchEvents(startLedger: number) {
  return await retryService.executeWithRetry(
    async () => {
      return await rpcService.getEvents(startLedger);
    },
    {
      ...EVENT_INDEXER_RETRY_CONFIG,
      onRetry: (attempt, error, delay) => {
        logger.warn(`Event fetch failed, retry ${attempt} in ${delay}ms`);
      },
    }
  );
}
```

---

## 🔧 Configuration Presets

Use predefined configurations for common scenarios:

```typescript
import {
  RPC_RETRY_CONFIG,
  DATABASE_RETRY_CONFIG,
  EVENT_INDEXER_RETRY_CONFIG,
  TRANSACTION_SUBMISSION_RETRY_CONFIG,
  EMAIL_RETRY_CONFIG,
  WEBHOOK_RETRY_CONFIG,
} from '@/config/retryConfig';

// Use appropriate preset
await retryService.executeWithRetry(myFunction, RPC_RETRY_CONFIG);
```

---

## 📊 Monitoring

### Check DLQ Status

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/v1/retry/dlq/stats
```

### Check Circuit Breakers

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/v1/retry/circuit-breaker/stats
```

### Check RPC Providers

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/v1/retry/rpc/providers
```

---

## 🐛 Troubleshooting

### Issue: Too Many Retries

**Solution**: Adjust `maxAttempts` in configuration

```typescript
{
  maxAttempts: 3, // Reduce from default 5
}
```

### Issue: Retries Too Slow

**Solution**: Reduce initial delay and max delay

```typescript
{
  initialDelay: 500,  // Reduce from 1000
  maxDelay: 10000,    // Reduce from 30000
}
```

### Issue: Circuit Breaker Stuck Open

**Solution**: Reset manually

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/v1/retry/circuit-breaker/my-circuit/reset
```

### Issue: DLQ Growing

**Solution**: Review and retry failed messages

```bash
# Get DLQ messages
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/v1/retry/dlq/messages

# Retry specific message
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/v1/retry/dlq/message/MESSAGE_ID/retry
```

---

## 💡 Tips

### 1. Start Conservative
Begin with fewer retries and shorter delays, then adjust based on monitoring.

### 2. Use Jitter
Always use jitter in production to avoid thundering herd problems.

### 3. Classify Errors
Properly configure `retryableErrors` and `nonRetryableErrors` for your use case.

### 4. Monitor DLQ
Set up alerts when DLQ grows beyond threshold.

### 5. Test Retry Logic
Test your retry configuration in staging before production.

---

## 📚 Next Steps

- Read full documentation: [RETRY_IMPLEMENTATION.md](./RETRY_IMPLEMENTATION.md)
- Review configuration options: [src/config/retryConfig.ts](./src/config/retryConfig.ts)
- Check examples: [RETRY_EXAMPLES.md](./RETRY_EXAMPLES.md)
- Run tests: `npm test -- retry.test.ts`

---

## ✅ Checklist

- [ ] Database migration run
- [ ] DLQ table created
- [ ] Retry logic integrated in services
- [ ] Monitoring endpoints tested
- [ ] Alerts configured
- [ ] Documentation reviewed

---

**Ready to go!** Your application now has sophisticated retry logic with exponential backoff, circuit breakers, and dead letter queue handling. 🎉
