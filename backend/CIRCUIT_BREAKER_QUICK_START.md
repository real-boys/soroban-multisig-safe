# Circuit Breaker Quick Start Guide

## Overview

This guide provides a quick reference for using the circuit breaker implementation in the Soroban Multisig Safe backend.

## Installation

Dependencies are already included in `package.json`. Install them:

```bash
cd backend
npm install
```

## Environment Variables

Add to your `.env` file:

```bash
# RPC Configuration (comma-separated for multiple providers)
STELLAR_RPC_URLS=https://rpc1.stellar.org,https://rpc2.stellar.org

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password

# Circuit Breaker Monitoring (optional)
CIRCUIT_BREAKER_CHECK_INTERVAL=30000  # 30 seconds
```

## Quick Usage

### 1. Using Circuit Breaker in Your Service

```typescript
import { circuitBreakerService } from './CircuitBreakerService';
import { retryService } from './RetryService';
import { RPC_RETRY_CONFIG } from '@/config/retryConfig';

class MyService {
  private readonly circuitName = 'my-service';

  async callExternalAPI(): Promise<any> {
    return await circuitBreakerService.execute(
      this.circuitName,
      async () => {
        return await retryService.executeWithRetry(
          async () => {
            // Your API call here
            return await axios.get('https://api.example.com/data');
          },
          RPC_RETRY_CONFIG
        );
      },
      {
        failureThreshold: 5,      // Open after 5 failures
        successThreshold: 2,      // Close after 2 successes
        timeout: 60000,           // 1 minute timeout
        monitoringPeriod: 120000, // 2 minute monitoring window
      }
    );
  }
}
```

### 2. Check Service Health

```typescript
import { circuitBreakerService } from './CircuitBreakerService';

const stats = circuitBreakerService.getStats('my-service');
console.log('Circuit State:', stats?.state);
console.log('Failures:', stats?.failures);
console.log('Is Healthy:', stats?.state === 'CLOSED');
```

### 3. Manual Circuit Control

```typescript
// Reset a circuit breaker
circuitBreakerService.reset('my-service');

// Manually open a circuit
circuitBreakerService.open('my-service');

// Check if circuit is open
const isOpen = circuitBreakerService.isOpen('my-service');
```

## API Endpoints

### Health Check
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/v1/retry/circuit-breaker/health
```

### Get All Circuit Stats
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/v1/retry/circuit-breaker/stats
```

### Get Specific Circuit
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/v1/retry/circuit-breaker/email-service
```

### Reset Circuit
```bash
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/v1/retry/circuit-breaker/email-service/reset
```

### Get Metrics
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/v1/retry/circuit-breaker/metrics
```

### Get Alerts
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/v1/retry/circuit-breaker/alerts?limit=50
```

## Integrated Services

### Email Service
```typescript
import { EmailService } from './EmailService';

const emailService = new EmailService();

// Send email with circuit breaker protection
await emailService.sendWeeklySummary('org-123');

// Check health
const health = emailService.getHealthStatus();
console.log('Circuit State:', health.circuitState);
console.log('Queued Emails:', health.queuedEmails);
```

### Token Service
```typescript
import { TokenService } from './TokenService';

const tokenService = new TokenService();

// Get token prices with circuit breaker protection
const prices = await tokenService.getTokenPrices(['XLM', 'USDC']);

// Check health
const health = tokenService.getHealthStatus();
console.log('RPC Circuit:', health.rpcCircuitState);
console.log('Price Circuit:', health.priceCircuitState);
```

### Stellar Service
```typescript
import { StellarService } from './StellarService';

const stellarService = new StellarService();

// Submit transaction with circuit breaker protection
const result = await stellarService.submitMultisigTransaction(
  contractAddress,
  transaction,
  signatures
);

// Check health
const health = stellarService.getHealthStatus();
console.log('Circuit State:', health.circuitState);
```

## Monitoring

### Register Alert Callback

```typescript
import { circuitBreakerMonitorService } from './CircuitBreakerMonitorService';

// In your index.ts or startup file
circuitBreakerMonitorService.onAlert((alert) => {
  if (alert.severity === 'critical') {
    console.error('CRITICAL:', alert.message);
    // Send to Slack, PagerDuty, etc.
  }
});
```

### Get Health Report

```typescript
const report = circuitBreakerMonitorService.getHealthReport();

console.log('Overall Health:', report.summary.overallHealth);
console.log('Open Circuits:', report.summary.openCircuits);
console.log('Total Circuits:', report.summary.totalCircuits);
```

## Configuration Presets

### Quick (Fast Failure)
```typescript
{
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 10000,        // 10 seconds
  monitoringPeriod: 30000 // 30 seconds
}
```

### Standard (Balanced)
```typescript
{
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,         // 1 minute
  monitoringPeriod: 120000 // 2 minutes
}
```

### Patient (Slow Failure)
```typescript
{
  failureThreshold: 10,
  successThreshold: 3,
  timeout: 300000,        // 5 minutes
  monitoringPeriod: 600000 // 10 minutes
}
```

## Common Patterns

### With Fallback Data

```typescript
async getData(): Promise<Data> {
  try {
    return await circuitBreakerService.execute(
      'my-service',
      async () => await fetchFromAPI(),
      config
    );
  } catch (error) {
    // Return cached or default data
    return this.getCachedData() || this.getDefaultData();
  }
}
```

### With Queue

```typescript
async processItem(item: Item): Promise<void> {
  try {
    await circuitBreakerService.execute(
      'my-service',
      async () => await sendToAPI(item),
      config
    );
  } catch (error) {
    if (error.circuitState === 'OPEN') {
      // Queue for later
      this.queue.push(item);
    } else {
      throw error;
    }
  }
}
```

### With Retry

```typescript
async reliableCall(): Promise<Result> {
  return await circuitBreakerService.execute(
    'my-service',
    async () => {
      return await retryService.executeWithRetry(
        async () => await apiCall(),
        {
          maxAttempts: 3,
          initialDelay: 1000,
          strategy: RetryStrategy.EXPONENTIAL,
        }
      );
    },
    circuitConfig
  );
}
```

## Testing

### Run Tests
```bash
npm test -- circuitBreaker.test.ts
```

### Test Circuit Behavior
```typescript
import { circuitBreakerService } from './CircuitBreakerService';

describe('My Service', () => {
  it('should handle circuit breaker', async () => {
    // Force circuit open
    circuitBreakerService.open('my-service');
    
    // Verify behavior
    await expect(myService.call()).rejects.toThrow('Circuit breaker');
    
    // Reset
    circuitBreakerService.reset('my-service');
  });
});
```

## Troubleshooting

### Circuit Won't Close
```typescript
// Check stats
const stats = circuitBreakerService.getStats('my-service');
console.log('State:', stats?.state);
console.log('Failures:', stats?.failures);
console.log('Next Attempt:', new Date(stats?.nextAttemptTime || 0));

// Manually reset if needed
circuitBreakerService.reset('my-service');
```

### Too Many False Positives
```typescript
// Increase thresholds
const config = {
  failureThreshold: 10,  // Increase from 5
  timeout: 120000,       // Increase from 60s
  monitoringPeriod: 300000 // Increase from 120s
};
```

### Missing Alerts
```typescript
// Check monitor is running
circuitBreakerMonitorService.start();

// Register callback
circuitBreakerMonitorService.onAlert((alert) => {
  console.log('Alert:', alert);
});
```

## Best Practices

1. **Set Appropriate Thresholds**: Based on service SLAs
2. **Implement Fallbacks**: Always have a fallback strategy
3. **Monitor Actively**: Set up alerts for circuit state changes
4. **Test Failure Scenarios**: Regularly test circuit breaker behavior
5. **Use Timeouts**: Always set appropriate timeouts
6. **Cache When Possible**: Implement caching for non-critical data
7. **Log Everything**: Comprehensive logging for debugging

## Next Steps

- Read the full [Implementation Guide](./CIRCUIT_BREAKER_IMPLEMENTATION.md)
- Review the [Summary Document](../CIRCUIT_BREAKER_SUMMARY.md)
- Check the [Test Suite](./src/tests/circuitBreaker.test.ts)
- Set up monitoring dashboards (Grafana)
- Configure external alerting (Slack, PagerDuty)

## Support

For issues or questions:
1. Check the logs: `tail -f logs/app.log`
2. Review circuit stats: `GET /api/v1/retry/circuit-breaker/stats`
3. Check alert history: `GET /api/v1/retry/circuit-breaker/alerts`
4. Consult the full documentation

## Circuit Names Reference

- `email-service` - Email/SMTP service
- `token-service-rpc` - Token RPC calls
- `token-service-price` - Price API calls
- `stellar-service` - Stellar transaction submission
- `rpc-provider-{index}` - Individual RPC providers

## Useful Commands

```bash
# Check all circuit states
curl -s http://localhost:5001/api/v1/retry/circuit-breaker/stats | jq '.data.circuits[] | {name, state, failures}'

# Reset all circuits
for circuit in email-service token-service-rpc token-service-price stellar-service; do
  curl -X POST http://localhost:5001/api/v1/retry/circuit-breaker/$circuit/reset
done

# Monitor health
watch -n 5 'curl -s http://localhost:5001/api/v1/retry/circuit-breaker/health | jq .data.summary'
```
