# Circuit Breaker Implementation Guide

## Overview

This document describes the comprehensive circuit breaker implementation for external service calls in the Soroban Multisig Safe backend. The circuit breaker pattern prevents cascading failures by stopping requests to failing services and allowing them time to recover.

## Architecture

### Core Components

1. **CircuitBreakerService** - Core circuit breaker logic
2. **CircuitBreakerMonitorService** - Centralized monitoring and alerting
3. **Service Integrations** - Circuit breaker integration in external services
4. **Monitoring Endpoints** - REST API for health checks and metrics

### Circuit States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Service is failing, reject requests immediately
- **HALF_OPEN**: Testing if service has recovered

## Integrated Services

### 1. Enhanced RPC Service
- **Circuit Name**: `rpc-provider-{index}`
- **Purpose**: Stellar RPC calls with automatic failover
- **Configuration**:
  - Failure Threshold: 10
  - Success Threshold: 3
  - Timeout: 30 seconds
  - Monitoring Period: 60 seconds

### 2. Email Service
- **Circuit Name**: `email-service`
- **Purpose**: SMTP email delivery
- **Configuration**:
  - Failure Threshold: 5
  - Success Threshold: 2
  - Timeout: 5 minutes
  - Monitoring Period: 10 minutes
- **Fallback**: Queues emails for later retry when circuit is open

### 3. Token Service
- **Circuit Names**: 
  - `token-service-rpc` (Stellar RPC calls)
  - `token-service-price` (CoinGecko API)
- **Configuration**:
  - RPC: Failure Threshold 10, Timeout 30s
  - Price: Failure Threshold 5, Timeout 60s
- **Fallback**: Returns cached price data when circuit is open

### 4. Stellar Service
- **Circuit Name**: `stellar-service`
- **Purpose**: Transaction submission to Stellar network
- **Configuration**:
  - Failure Threshold: 5
  - Success Threshold: 2
  - Timeout: 60 seconds
  - Monitoring Period: 120 seconds

## Features

### 1. Automatic Retry with Exponential Backoff
All circuit breaker protected calls include retry logic with:
- Configurable max attempts
- Exponential backoff with jitter
- Retryable vs non-retryable error classification

### 2. Fallback Mechanisms

#### Email Service Fallback
```typescript
// Queues emails when circuit is open
private queueEmailForLater(mailOptions: any): void {
  this.fallbackEmailQueue.push({
    mailOptions,
    timestamp: new Date(),
  });
}

// Process queued emails when circuit recovers
async processQueuedEmails(): Promise<void> {
  // Processes up to 1000 queued emails
  // Skips emails older than 24 hours
}
```

#### Token Service Fallback
```typescript
// Returns stale cached data when circuit is open
catch (error: any) {
  const cached = this.priceCache.get(cacheKey);
  if (cached) {
    logger.warn('Returning stale cached price data as fallback');
    return cached.data;
  }
  return {};
}
```

### 3. Comprehensive Monitoring

#### Health Status Endpoints
```
GET /api/v1/retry/circuit-breaker/health
GET /api/v1/retry/circuit-breaker/stats
GET /api/v1/retry/circuit-breaker/metrics
GET /api/v1/retry/circuit-breaker/alerts
```

#### Health Report Structure
```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "summary": {
    "totalCircuits": 6,
    "openCircuits": 0,
    "halfOpenCircuits": 0,
    "closedCircuits": 6,
    "totalFailures": 0,
    "overallHealth": "healthy"
  },
  "circuits": [
    {
      "name": "email-service",
      "state": "CLOSED",
      "failures": 0,
      "successes": 10,
      "isHealthy": true
    }
  ],
  "rpcProviders": [
    {
      "url": "https://soroban-futurenet.stellar.org",
      "name": "rpc-provider-0",
      "isHealthy": true,
      "failures": 0,
      "circuitState": "CLOSED"
    }
  ],
  "recentAlerts": []
}
```

### 4. Alert System

The monitor service generates alerts for:
- **Critical**: Circuit breaker opens
- **Warning**: Circuit breaker in HALF_OPEN state
- **Warning**: High failure rate in CLOSED state (≥3 failures)

Alerts are:
- Logged automatically
- Stored in history (last 1000 alerts)
- Dispatched to registered callbacks
- Deduplicated (5-minute window)

## Usage Examples

### Using Circuit Breaker in a Service

```typescript
import { circuitBreakerService } from './CircuitBreakerService';
import { retryService } from './RetryService';

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
          {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 5000,
            strategy: RetryStrategy.EXPONENTIAL,
            jitterType: JitterType.FULL,
            backoffMultiplier: 2,
          }
        );
      },
      {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        monitoringPeriod: 120000,
      }
    );
  }

  getHealthStatus() {
    const stats = circuitBreakerService.getStats(this.circuitName);
    return {
      circuitState: stats?.state || 'UNKNOWN',
      isHealthy: stats?.state === 'CLOSED' || stats?.state === 'HALF_OPEN',
    };
  }
}
```

### Registering Alert Callbacks

```typescript
import { circuitBreakerMonitorService } from './CircuitBreakerMonitorService';

// Register callback for critical alerts
circuitBreakerMonitorService.onAlert((alert) => {
  if (alert.severity === 'critical') {
    // Send to Slack
    sendSlackAlert({
      channel: '#alerts',
      message: `🚨 ${alert.message}`,
      details: {
        circuit: alert.circuitName,
        state: alert.state,
        failures: alert.failures,
      },
    });

    // Send to PagerDuty
    triggerPagerDutyIncident({
      title: alert.message,
      severity: 'critical',
      details: alert,
    });
  }
});
```

## API Endpoints

### Circuit Breaker Management

#### Get All Circuit Breaker Stats
```http
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
        "name": "email-service",
        "state": "CLOSED",
        "failures": 0,
        "successes": 10,
        "lastSuccessTime": 1234567890
      }
    ],
    "count": 6
  }
}
```

#### Get Health Report
```http
GET /api/v1/retry/circuit-breaker/health
Authorization: Bearer <token>
```

#### Get Metrics (Prometheus Format)
```http
GET /api/v1/retry/circuit-breaker/metrics
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "circuit_breaker_state": {
      "email-service": "CLOSED",
      "token-service-rpc": "CLOSED"
    },
    "circuit_breaker_failures": {
      "email-service": 0,
      "token-service-rpc": 0
    },
    "circuit_breaker_open_count": 0,
    "circuit_breaker_half_open_count": 0,
    "circuit_breaker_closed_count": 6
  }
}
```

#### Get Alert History
```http
GET /api/v1/retry/circuit-breaker/alerts?limit=100
Authorization: Bearer <token>
```

#### Reset Circuit Breaker
```http
POST /api/v1/retry/circuit-breaker/:circuitName/reset
Authorization: Bearer <token>
```

### RPC Provider Management

#### Get RPC Provider Stats
```http
GET /api/v1/retry/rpc/providers
Authorization: Bearer <token>
```

#### Reset All RPC Providers
```http
POST /api/v1/retry/rpc/providers/reset
Authorization: Bearer <token>
```

## Configuration

### Environment Variables

```bash
# RPC Configuration
STELLAR_RPC_URLS=https://rpc1.stellar.org,https://rpc2.stellar.org,https://rpc3.stellar.org

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password

# Circuit Breaker Monitoring
CIRCUIT_BREAKER_CHECK_INTERVAL=30000  # 30 seconds
```

### Custom Circuit Breaker Configuration

```typescript
import { RPC_CIRCUIT_BREAKER_CONFIG } from '@/config/retryConfig';

// Override default configuration
const customConfig = {
  ...RPC_CIRCUIT_BREAKER_CONFIG,
  failureThreshold: 15,  // Increase threshold
  timeout: 45000,        // 45 seconds
};
```

## Monitoring and Observability

### Metrics Integration

The circuit breaker exposes metrics compatible with Prometheus:

```typescript
// Example Prometheus scrape config
const metrics = circuitBreakerMonitorService.getMetrics();

// Export as Prometheus format
app.get('/metrics', (req, res) => {
  const metrics = circuitBreakerMonitorService.getMetrics();
  
  let output = '';
  output += `# HELP circuit_breaker_open_count Number of open circuit breakers\n`;
  output += `# TYPE circuit_breaker_open_count gauge\n`;
  output += `circuit_breaker_open_count ${metrics.circuit_breaker_open_count}\n`;
  
  // ... more metrics
  
  res.set('Content-Type', 'text/plain');
  res.send(output);
});
```

### Logging

All circuit breaker events are logged with appropriate levels:
- **ERROR**: Circuit opens, critical failures
- **WARN**: High failure rates, circuit in HALF_OPEN
- **INFO**: Circuit closes, successful recoveries
- **DEBUG**: Individual request successes/failures

### Dashboard Integration

Example Grafana dashboard queries:

```promql
# Circuit breaker state
circuit_breaker_state{circuit="email-service"}

# Failure rate
rate(circuit_breaker_failures[5m])

# Open circuits count
circuit_breaker_open_count
```

## Best Practices

1. **Set Appropriate Thresholds**: Configure failure thresholds based on service SLAs
2. **Implement Fallbacks**: Always provide fallback mechanisms for critical services
3. **Monitor Actively**: Set up alerts for circuit breaker state changes
4. **Test Failure Scenarios**: Regularly test circuit breaker behavior
5. **Document Service Dependencies**: Maintain clear documentation of external dependencies
6. **Use Timeouts**: Always set appropriate timeouts for external calls
7. **Cache When Possible**: Implement caching for non-critical data

## Troubleshooting

### Circuit Breaker Stuck Open

If a circuit breaker remains open:

1. Check the service health:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     http://localhost:5001/api/v1/retry/circuit-breaker/email-service
   ```

2. Review recent failures:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     http://localhost:5001/api/v1/retry/circuit-breaker/alerts
   ```

3. Manually reset if service is healthy:
   ```bash
   curl -X POST -H "Authorization: Bearer <token>" \
     http://localhost:5001/api/v1/retry/circuit-breaker/email-service/reset
   ```

### High Failure Rate

If experiencing high failure rates:

1. Check external service status
2. Review network connectivity
3. Verify configuration (timeouts, retry settings)
4. Check logs for error patterns
5. Consider increasing timeout or retry attempts

### False Positives

If circuit breaker opens unnecessarily:

1. Increase failure threshold
2. Extend monitoring period
3. Review retryable error classification
4. Adjust timeout values

## Testing

### Unit Tests

```typescript
import { circuitBreakerService } from './CircuitBreakerService';

describe('CircuitBreakerService', () => {
  it('should open circuit after threshold failures', async () => {
    const circuitName = 'test-circuit';
    
    // Simulate failures
    for (let i = 0; i < 5; i++) {
      try {
        await circuitBreakerService.execute(
          circuitName,
          async () => {
            throw new Error('Service unavailable');
          },
          { failureThreshold: 5 }
        );
      } catch (error) {
        // Expected
      }
    }
    
    // Circuit should be open
    expect(circuitBreakerService.isOpen(circuitName)).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('Email Service with Circuit Breaker', () => {
  it('should queue emails when circuit is open', async () => {
    const emailService = new EmailService();
    
    // Force circuit open
    circuitBreakerService.open('email-service');
    
    // Attempt to send email
    try {
      await emailService.sendWeeklySummary('org-123');
    } catch (error) {
      // Expected
    }
    
    // Check queue
    const health = emailService.getHealthStatus();
    expect(health.queuedEmails).toBeGreaterThan(0);
  });
});
```

## Future Enhancements

1. **Adaptive Thresholds**: Automatically adjust thresholds based on historical data
2. **Service Mesh Integration**: Integrate with Istio/Linkerd for distributed circuit breaking
3. **Machine Learning**: Predict failures before they occur
4. **Advanced Fallbacks**: Implement more sophisticated fallback strategies
5. **Multi-Region Support**: Circuit breaker coordination across regions
6. **Custom Alert Channels**: Support for more alerting platforms (Teams, Discord, etc.)

## References

- [Circuit Breaker Pattern - Martin Fowler](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Release It! - Michael Nygard](https://pragprog.com/titles/mnee2/release-it-second-edition/)
- [Retry Pattern - Microsoft](https://docs.microsoft.com/en-us/azure/architecture/patterns/retry)
- [Exponential Backoff - AWS](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
