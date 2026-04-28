# User-Based Rate Limiting Implementation

## Overview

This document describes the comprehensive user-based rate limiting system implemented for the Soroban Multi-Sig Safe backend. The system provides tier-based rate limiting with burst capacity, graceful degradation, and administrative controls.

## Features

### 1. **Tier-Based Rate Limiting**
- **FREE**: Basic limits for free users
- **PRO**: Enhanced limits for premium users  
- **ENTERPRISE**: High limits for enterprise customers
- **ADMIN**: Very high limits for administrative users

### 2. **Burst Capacity**
- Token bucket algorithm with burst allowance
- Separate burst windows for handling traffic spikes
- Configurable burst capacity per tier and endpoint

### 3. **Graceful Degradation**
- Request queueing for priority endpoints
- Reduced response data when approaching limits
- Circuit breaker integration for system protection

### 4. **Endpoint-Specific Limits**
- Different limits for different API endpoints
- Method-specific rate limiting (GET, POST, etc.)
- Critical endpoint protection (auth, signatures)

### 5. **Administrative Controls**
- Real-time rate limit monitoring
- User tier management
- Rate limit reset capabilities
- Comprehensive analytics

## Architecture

### Core Components

1. **UserRateLimitService**: Main service handling rate limit logic
2. **RateLimitController**: API endpoints for administration
3. **Enhanced Middleware**: Request interception and rate checking
4. **Queue Service**: Processing queued requests
5. **Configuration**: Tier definitions and limits

### Database Schema

```sql
-- User tier enumeration
enum UserTier {
  FREE
  PRO
  ENTERPRISE
  ADMIN
}

-- User table with tier field
model User {
  id    String   @id @default(cuid())
  tier  UserTier @default(FREE)
  -- other fields...
  rateLimitUsage RateLimitUsage[]
}

-- Rate limit usage tracking
model RateLimitUsage {
  id          String   @id @default(cuid())
  userId      String
  endpoint    String
  method      String
  tokens      Int      -- Current token count
  maxTokens   Int      -- Maximum tokens allowed
  windowStart DateTime -- Start of current window
  windowEnd   DateTime -- End of current window
  burstUsed   Int      -- Burst tokens used
  maxBurst    Int      -- Maximum burst tokens
  lastRequest DateTime
  -- indexes and relations...
}
```

## Configuration

### Tier Limits

```typescript
export const RATE_LIMIT_CONFIG: Record<UserTier, TierRateLimits> = {
  [UserTier.FREE]: {
    default: {
      requests: 100,
      windowMs: 15 * 60 * 1000, // 15 minutes
      burstCapacity: 20,
      burstWindowMs: 60 * 1000, // 1 minute
    },
    endpoints: {
      '/api/v1/auth/login': {
        POST: {
          requests: 5,
          windowMs: 15 * 60 * 1000,
          burstCapacity: 2,
          burstWindowMs: 60 * 1000,
        },
      },
      // ... more endpoint-specific limits
    },
  },
  // ... other tiers
};
```

### Graceful Degradation

```typescript
export const GRACEFUL_DEGRADATION_CONFIG = {
  enableQueueing: true,
  maxQueueSize: 100,
  queueTimeoutMs: 30 * 1000,
  enableDataReduction: true,
  reducedDataThreshold: 0.8,
  priorityEndpoints: [
    '/api/v1/auth/challenge',
    '/api/v1/auth/login',
    '/api/v1/transactions/:id/sign',
  ],
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 0.9,
};
```

## API Endpoints

### User Rate Limit Status

```http
GET /api/v1/rate-limits/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "tier": "PRO",
    "limits": [
      {
        "endpoint": "/api/v1/transactions",
        "method": "GET",
        "current": {
          "tokens": 45,
          "maxTokens": 1000,
          "remaining": 955,
          "windowStart": "2024-01-01T10:00:00Z",
          "windowEnd": "2024-01-01T10:15:00Z",
          "burstUsed": 5,
          "maxBurst": 250,
          "burstRemaining": 245,
          "lastRequest": "2024-01-01T10:05:00Z"
        },
        "limits": {
          "requests": 1000,
          "windowMs": 900000,
          "burstCapacity": 250,
          "burstWindowMs": 60000
        },
        "utilization": {
          "percentage": 5,
          "burstPercentage": 2
        }
      }
    ],
    "summary": {
      "totalEndpoints": 5,
      "highUtilization": 0,
      "nearBurstLimit": 0
    }
  }
}
```

### Admin: Get All Users Rate Limits

```http
GET /api/v1/rate-limits/users?page=1&limit=20&tier=PRO
Authorization: Bearer <admin-token>
```

### Admin: Reset User Rate Limits

```http
POST /api/v1/rate-limits/reset/{userId}
Authorization: Bearer <admin-token>
```

### Admin: Update User Tier

```http
PUT /api/v1/rate-limits/tier/{userId}
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "tier": "PRO"
}
```

### Admin: Rate Limiting Analytics

```http
GET /api/v1/rate-limits/analytics?startDate=2024-01-01&endDate=2024-01-07
Authorization: Bearer <admin-token>
```

## Rate Limit Headers

All API responses include rate limit headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 955
X-RateLimit-Reset: 1704110400
X-RateLimit-Burst-Limit: 250
X-RateLimit-Burst-Remaining: 245
X-RateLimit-Burst-Reset: 1704106800
Retry-After: 300
```

## Error Responses

### Rate Limit Exceeded

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later.",
    "details": {
      "limit": 100,
      "remaining": 0,
      "resetTime": 1704110400000,
      "retryAfter": 300
    }
  }
}
```

### Request Queued

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Request queued. Position: 5",
    "details": {
      "limit": 100,
      "remaining": 0,
      "resetTime": 1704110400000,
      "retryAfter": 300,
      "queuePosition": 5
    }
  }
}
```

## Implementation Details

### Token Bucket Algorithm

The system uses a token bucket algorithm with the following characteristics:

1. **Main Window**: Primary rate limiting window (e.g., 15 minutes)
2. **Burst Window**: Short-term burst allowance (e.g., 1 minute)
3. **Token Refill**: Tokens are refilled when windows reset
4. **Burst Capacity**: Additional tokens for handling spikes

### Redis Storage

Rate limit data is stored in Redis with the following structure:

```
Key: rate_limit:{userId}:{endpoint}:{method}
Hash Fields:
- tokens: current token count
- windowStart: window start timestamp
- windowEnd: window end timestamp
- burstUsed: burst tokens used
- lastRequest: last request timestamp
```

### Database Tracking

Long-term usage data is stored in PostgreSQL for:
- Analytics and reporting
- User behavior analysis
- Billing and usage tracking
- Audit trails

### Graceful Degradation Strategies

1. **Request Queueing**: Priority endpoints can queue requests
2. **Data Reduction**: Reduce response payload size when approaching limits
3. **Circuit Breaker**: Prevent system overload by failing fast
4. **Priority Routing**: Critical endpoints get preferential treatment

## Monitoring and Alerting

### Metrics Tracked

- Requests per user per endpoint
- Rate limit violations
- Queue lengths and timeouts
- Tier utilization patterns
- System performance impact

### Alert Conditions

- High rate limit violation rates
- Queue overflow conditions
- Unusual usage patterns
- System performance degradation

## Security Considerations

### Protection Against Abuse

1. **IP + User Rate Limiting**: Dual-layer protection
2. **Endpoint-Specific Limits**: Critical endpoints have stricter limits
3. **Burst Protection**: Prevents rapid-fire attacks
4. **Queue Limits**: Prevents memory exhaustion

### Data Privacy

- Rate limit data is anonymized in analytics
- User identification is secure and encrypted
- Audit logs track administrative actions

## Performance Optimization

### Redis Optimization

- Efficient hash storage for rate limit data
- Automatic expiration of old data
- Pipeline operations for bulk updates
- Connection pooling and clustering support

### Database Optimization

- Indexed queries for fast lookups
- Batch operations for analytics
- Partitioned tables for large datasets
- Efficient aggregation queries

### Memory Management

- Bounded queue sizes
- Automatic cleanup of expired data
- Efficient data structures
- Memory usage monitoring

## Deployment Considerations

### Environment Variables

```bash
# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_ENABLE_QUEUEING=true
RATE_LIMIT_MAX_QUEUE_SIZE=100
RATE_LIMIT_QUEUE_TIMEOUT_MS=30000

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_CLUSTER_ENABLED=false

# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/db
```

### Scaling Considerations

1. **Redis Clustering**: For high-availability deployments
2. **Database Sharding**: For large user bases
3. **Load Balancing**: Distribute rate limiting load
4. **Caching**: Reduce database queries for tier lookups

### Migration Strategy

1. **Phase 1**: Deploy with existing IP-based limits as fallback
2. **Phase 2**: Enable user-based limits for authenticated users
3. **Phase 3**: Migrate all endpoints to new system
4. **Phase 4**: Remove legacy rate limiting

## Testing

### Unit Tests

- Rate limiting logic validation
- Tier configuration testing
- Error handling verification
- Edge case coverage

### Integration Tests

- End-to-end API testing
- Redis integration testing
- Database consistency testing
- Performance benchmarking

### Load Testing

- High-concurrency scenarios
- Rate limit effectiveness
- System stability under load
- Queue performance testing

## Troubleshooting

### Common Issues

1. **Rate Limits Too Strict**: Adjust tier configurations
2. **Queue Overflows**: Increase queue size or processing speed
3. **Redis Connection Issues**: Check Redis health and connectivity
4. **Database Performance**: Optimize queries and indexes

### Debug Tools

- Rate limit status endpoints
- Redis monitoring commands
- Database query analysis
- Application logs and metrics

## Future Enhancements

### Planned Features

1. **Dynamic Rate Limiting**: AI-based adaptive limits
2. **Geographic Limits**: Location-based rate limiting
3. **API Key Support**: Alternative authentication method
4. **Real-time Dashboards**: Live monitoring interface
5. **Custom Tier Creation**: Flexible tier management

### Integration Opportunities

1. **Billing System**: Usage-based billing integration
2. **Analytics Platform**: Advanced usage analytics
3. **Alerting System**: Integration with monitoring tools
4. **CDN Integration**: Edge-based rate limiting

## Conclusion

The user-based rate limiting system provides comprehensive protection against abuse while maintaining excellent user experience through intelligent tier management, burst capacity, and graceful degradation. The system is designed for scalability, maintainability, and operational excellence.

For questions or support, please refer to the API documentation or contact the development team.