# User-Based Rate Limiting

## Overview

This implementation provides a comprehensive user-based rate limiting system with multiple tiers, burst capacity handling, and graceful degradation. The system is designed to protect the API from abuse while providing a fair and scalable experience for all users.

## Features

### 1. **Multi-Tier Rate Limiting**
- **FREE**: Basic tier for free users and unauthenticated requests
- **BASIC**: Entry-level paid tier with increased limits
- **PREMIUM**: Advanced tier for power users
- **ENTERPRISE**: Highest tier for enterprise customers

### 2. **Burst Capacity**
- Allows short-term spikes in traffic
- Separate burst window (default: 10 seconds)
- Prevents abuse while accommodating legitimate bursts

### 3. **Graceful Degradation**
- Warning at 80% usage
- Degraded mode at 90% usage
- Critical alerts at 95% usage
- Informative messages guide users to upgrade

### 4. **Violation Tracking**
- Tracks repeated rate limit violations
- Temporary bans after excessive violations
- Automatic violation decay after 24 hours

### 5. **Distributed Rate Limiting**
- Redis-based storage for multi-server deployments
- Consistent rate limiting across all instances
- Fast lookups with caching

## Rate Limit Tiers

| Tier | Requests/Min | Requests/Hour | Requests/Day | Burst Capacity |
|------|--------------|---------------|--------------|----------------|
| FREE | 10 | 300 | 1,000 | 20 |
| BASIC | 30 | 1,000 | 5,000 | 50 |
| PREMIUM | 100 | 5,000 | 50,000 | 150 |
| ENTERPRISE | 500 | 20,000 | 200,000 | 1,000 |

## Architecture

### Components

1. **RateLimitService** (`src/services/RateLimitService.ts`)
   - Core rate limiting logic
   - Redis integration
   - Violation tracking
   - Tier management

2. **Middleware** (`src/middleware/rateLimiter.ts`)
   - `userRateLimiter`: Standard rate limiting for all endpoints
   - `strictRateLimiter`: Stricter limits for sensitive operations
   - Automatic header injection

3. **Controllers** (`src/controllers/rateLimitController.ts`)
   - User-facing endpoints for status checks
   - Admin endpoints for tier management

4. **Configuration** (`src/config/rateLimitTiers.ts`)
   - Tier definitions
   - Degradation thresholds
   - Violation policies

## Usage

### Applying Rate Limiting to Routes

#### Standard Rate Limiting
```typescript
import { userRateLimiter } from '@/middleware/rateLimiter';

router.get('/api/v1/wallets', userRateLimiter, getWallets);
```

#### Strict Rate Limiting (for sensitive operations)
```typescript
import { strictRateLimiter } from '@/middleware/rateLimiter';

router.post('/api/v1/transactions/sign', strictRateLimiter, signTransaction);
```

### Checking Rate Limit Status

Users can check their current rate limit status:

```bash
GET /api/v1/rate-limit/status
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "tier": "PREMIUM",
    "config": {
      "requestsPerMinute": 100,
      "requestsPerHour": 5000,
      "requestsPerDay": 50000,
      "burstCapacity": 150,
      "burstWindowMs": 10000
    },
    "usage": {
      "minuteCount": 45,
      "hourCount": 1200,
      "dayCount": 8500,
      "burstCount": 5,
      "minuteRemaining": 55,
      "hourRemaining": 3800,
      "dayRemaining": 41500,
      "burstRemaining": 145,
      "minuteReset": 1714234567890,
      "hourReset": 1714237890123,
      "dayReset": 1714320890123,
      "burstReset": 1714234500000
    }
  }
}
```

### Response Headers

All rate-limited requests include these headers:

```
X-RateLimit-Tier: PREMIUM
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1714234567
X-RateLimit-Burst-Remaining: 145
X-RateLimit-Burst-Reset: 1714234500
```

When in degradation mode:
```
X-RateLimit-Degraded: true
X-RateLimit-Degradation-Message: Warning: You are nearing your rate limit...
```

When rate limit is exceeded:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 45
```

## API Endpoints

### User Endpoints

#### Get Rate Limit Status
```
GET /api/v1/rate-limit/status
Authorization: Bearer <token>
```

#### Get Available Tiers
```
GET /api/v1/rate-limit/tiers
```

### Admin Endpoints

#### Update User Tier
```
PUT /api/v1/rate-limit/admin/user/tier
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "userId": "user123",
  "tier": "PREMIUM"
}
```

#### Get User Statistics
```
GET /api/v1/rate-limit/admin/user/:userId/stats
Authorization: Bearer <admin-token>
```

#### Reset User Rate Limit
```
POST /api/v1/rate-limit/admin/user/:userId/reset
Authorization: Bearer <admin-token>
```

#### Reset IP Rate Limit
```
POST /api/v1/rate-limit/admin/ip/:ipAddress/reset
Authorization: Bearer <admin-token>
```

## Configuration

### Environment Variables

```env
# Redis Configuration (required for rate limiting)
REDIS_URL=redis://localhost:6379

# Rate Limiting (optional - uses defaults if not set)
RATE_LIMIT_FREE_PER_MINUTE=10
RATE_LIMIT_BASIC_PER_MINUTE=30
RATE_LIMIT_PREMIUM_PER_MINUTE=100
RATE_LIMIT_ENTERPRISE_PER_MINUTE=500
```

### Customizing Tiers

Edit `src/config/rateLimitTiers.ts`:

```typescript
export const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  [RateLimitTier.FREE]: {
    tier: RateLimitTier.FREE,
    requestsPerMinute: 10,
    requestsPerHour: 300,
    requestsPerDay: 1000,
    burstCapacity: 20,
    burstWindowMs: 10000,
  },
  // ... other tiers
};
```

### Adjusting Degradation Thresholds

```typescript
export const DEGRADATION_THRESHOLDS = {
  WARNING: 0.8,    // 80% - show notice
  DEGRADED: 0.9,   // 90% - start degradation
  CRITICAL: 0.95,  // 95% - critical warning
};
```

### Violation Policy

```typescript
export const VIOLATION_CONFIG = {
  MAX_VIOLATIONS: 5,              // Ban after 5 violations
  VIOLATION_WINDOW_MS: 3600000,   // Within 1 hour
  BAN_DURATION_MS: 3600000,       // Ban for 1 hour
  VIOLATION_DECAY_MS: 86400000,   // Violations decay after 24 hours
};
```

## Database Schema

The rate limit tier is stored in the User model:

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  rateLimitTier String   @default("FREE")
  // ... other fields
}
```

### Migration

Run the migration to add the `rateLimitTier` field:

```bash
npm run db:migrate
```

## Redis Keys

The system uses the following Redis key patterns:

- `ratelimit:user:<userId>` - User rate limit data
- `ratelimit:ip:<ipAddress>` - IP rate limit data
- `ratelimit:user:tier:<userId>` - Cached user tier
- `ratelimit:ban:user:<userId>` - User ban status
- `ratelimit:ban:ip:<ipAddress>` - IP ban status
- `ratelimit:violation:user:<userId>` - User violation count
- `ratelimit:violation:ip:<ipAddress>` - IP violation count

## Monitoring

### Metrics to Track

1. **Rate Limit Hits**: Number of requests blocked by rate limiting
2. **Tier Distribution**: Usage across different tiers
3. **Violation Rate**: Frequency of violations per tier
4. **Ban Rate**: Number of temporary bans issued
5. **Degradation Events**: Frequency of degradation warnings

### Logging

The system logs important events:

```typescript
logger.info('Updated rate limit tier for user X to PREMIUM');
logger.warn('Temporarily banned user X for excessive violations');
logger.error('Rate limit check error:', error);
```

## Best Practices

### 1. **Fail Open**
If rate limiting fails (Redis down, etc.), the system allows requests to prevent service disruption.

### 2. **Cache Tier Information**
User tiers are cached in Redis for 1 hour to reduce database queries.

### 3. **Multiple Time Windows**
Using minute, hour, and day windows provides protection against different attack patterns.

### 4. **Burst Handling**
Burst capacity allows legitimate traffic spikes without penalizing users.

### 5. **Graceful Degradation**
Users receive warnings before hitting hard limits, allowing them to adjust behavior.

## Testing

### Manual Testing

1. **Test Rate Limiting**:
```bash
# Make multiple requests quickly
for i in {1..15}; do
  curl -H "Authorization: Bearer <token>" http://localhost:5001/api/v1/wallets
done
```

2. **Check Status**:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:5001/api/v1/rate-limit/status
```

3. **Test Tier Upgrade**:
```bash
curl -X PUT http://localhost:5001/api/v1/rate-limit/admin/user/tier \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "tier": "PREMIUM"}'
```

### Automated Testing

```typescript
describe('Rate Limiting', () => {
  it('should allow requests within limit', async () => {
    // Test implementation
  });

  it('should block requests exceeding limit', async () => {
    // Test implementation
  });

  it('should handle burst capacity', async () => {
    // Test implementation
  });

  it('should apply graceful degradation', async () => {
    // Test implementation
  });
});
```

## Troubleshooting

### Issue: Rate limits not working

**Solution**: Check Redis connection
```bash
redis-cli ping
```

### Issue: Users hitting limits too quickly

**Solution**: Review tier configuration and consider upgrading users or adjusting limits.

### Issue: False positives (legitimate users banned)

**Solution**: Adjust violation thresholds in `VIOLATION_CONFIG`.

### Issue: Rate limit data not persisting

**Solution**: Check Redis TTL settings and ensure Redis is not evicting keys prematurely.

## Future Enhancements

1. **Dynamic Tier Adjustment**: Automatically upgrade/downgrade based on usage patterns
2. **Custom Endpoint Limits**: Different limits for different endpoints
3. **Time-based Limits**: Different limits for peak/off-peak hours
4. **Geographic Limits**: Different limits based on user location
5. **API Key Rate Limiting**: Separate limits for API keys vs. user sessions
6. **Rate Limit Analytics Dashboard**: Visual monitoring of rate limit metrics

## Security Considerations

1. **DDoS Protection**: Rate limiting provides basic DDoS protection
2. **Brute Force Prevention**: Strict limits on authentication endpoints
3. **Resource Protection**: Prevents resource exhaustion attacks
4. **Fair Usage**: Ensures fair resource distribution among users

## Support

For issues or questions about rate limiting:
- Check logs for error messages
- Review Redis connection status
- Verify user tier configuration
- Contact the development team

## License

This rate limiting implementation is part of the Soroban Multisig Safe project and follows the same license.
