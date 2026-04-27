# Rate Limiting Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Prerequisites
- Redis running on `localhost:6379` (or set `REDIS_URL` in `.env`)
- PostgreSQL database configured

### Step 1: Run Database Migration

```bash
# Generate Prisma client
npm run db:generate

# Run migration to add rateLimitTier field
npm run db:migrate
```

Or manually run the SQL:
```sql
ALTER TABLE "users" ADD COLUMN "rateLimitTier" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "users" ADD CONSTRAINT "users_rateLimitTier_check" 
  CHECK ("rateLimitTier" IN ('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'));
CREATE INDEX "users_rateLimitTier_idx" ON "users"("rateLimitTier");
```

### Step 2: Start Redis (if not running)

```bash
# macOS with Homebrew
brew services start redis

# Or with Docker
docker run -d -p 6379:6379 redis:alpine

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### Step 3: Start the Server

```bash
npm run dev
```

The rate limiting is now active! 🎉

## ✅ Verify It's Working

### Test 1: Check Available Tiers
```bash
curl http://localhost:5001/api/v1/rate-limit/tiers
```

Expected response:
```json
{
  "success": true,
  "data": {
    "tiers": [
      {
        "tier": "FREE",
        "requestsPerMinute": 10,
        "requestsPerHour": 300,
        "requestsPerDay": 1000,
        "burstCapacity": 20,
        "burstWindowMs": 10000
      },
      // ... other tiers
    ]
  }
}
```

### Test 2: Check Your Rate Limit Status (requires auth)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/v1/rate-limit/status
```

### Test 3: Trigger Rate Limit
```bash
# Make 15 rapid requests (FREE tier limit is 10/min)
for i in {1..15}; do
  curl -H "Authorization: Bearer YOUR_TOKEN" \
    http://localhost:5001/api/v1/wallets
done
```

You should see a `429 Too Many Requests` response after the 10th request.

## 📊 Rate Limit Tiers

| Tier | Requests/Min | Requests/Hour | Requests/Day | Burst |
|------|--------------|---------------|--------------|-------|
| FREE | 10 | 300 | 1,000 | 20 |
| BASIC | 30 | 1,000 | 5,000 | 50 |
| PREMIUM | 100 | 5,000 | 50,000 | 150 |
| ENTERPRISE | 500 | 20,000 | 200,000 | 1,000 |

## 🔧 Common Tasks

### Upgrade a User's Tier

```bash
curl -X PUT http://localhost:5001/api/v1/rate-limit/admin/user/tier \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id-here",
    "tier": "PREMIUM"
  }'
```

### Reset a User's Rate Limit

```bash
curl -X POST http://localhost:5001/api/v1/rate-limit/admin/user/USER_ID/reset \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Check User Statistics

```bash
curl http://localhost:5001/api/v1/rate-limit/admin/user/USER_ID/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

## 🎯 Integration Examples

### JavaScript/TypeScript

```typescript
// Check rate limit before making requests
const response = await fetch('/api/v1/wallets', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Read rate limit headers
const remaining = response.headers.get('X-RateLimit-Remaining');
const limit = response.headers.get('X-RateLimit-Limit');
const reset = response.headers.get('X-RateLimit-Reset');

console.log(`${remaining}/${limit} requests remaining`);

// Handle rate limit errors
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
}
```

### React Hook

```typescript
import { useEffect, useState } from 'react';

function useRateLimit(token: string) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/v1/rate-limit/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setStatus(data.data));
  }, [token]);

  return status;
}

// Usage
function MyComponent() {
  const rateLimitStatus = useRateLimit(userToken);
  
  return (
    <div>
      <p>Tier: {rateLimitStatus?.tier}</p>
      <p>Remaining: {rateLimitStatus?.usage?.minuteRemaining}</p>
    </div>
  );
}
```

## 🐛 Troubleshooting

### Issue: Rate limiting not working

**Check Redis connection:**
```bash
redis-cli ping
```

**Check Redis keys:**
```bash
redis-cli KEYS "ratelimit:*"
```

**Check logs:**
```bash
# Look for rate limiting errors
tail -f logs/app.log | grep -i "rate"
```

### Issue: All requests getting rate limited

**Reset rate limits:**
```bash
# Clear all rate limit data
redis-cli KEYS "ratelimit:*" | xargs redis-cli DEL
```

### Issue: User tier not updating

**Clear tier cache:**
```bash
redis-cli DEL "ratelimit:user:tier:USER_ID"
```

## 📚 Full Documentation

- **Complete Guide**: [RATE_LIMITING.md](./RATE_LIMITING.md)
- **Usage Examples**: [RATE_LIMITING_EXAMPLES.md](./RATE_LIMITING_EXAMPLES.md)
- **Implementation Summary**: [../RATE_LIMITING_IMPLEMENTATION_SUMMARY.md](../RATE_LIMITING_IMPLEMENTATION_SUMMARY.md)

## 🔐 Security Notes

1. **Admin Endpoints**: Ensure admin endpoints have proper authorization middleware
2. **Redis Security**: Use Redis password in production (`REDIS_URL=redis://:password@host:6379`)
3. **Rate Limit Headers**: Don't expose sensitive information in headers
4. **Fail Open**: System allows requests if Redis is down (by design)

## 🎨 Customization

### Change Tier Limits

Edit `src/config/rateLimitTiers.ts`:

```typescript
export const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  [RateLimitTier.FREE]: {
    tier: RateLimitTier.FREE,
    requestsPerMinute: 20, // Changed from 10
    requestsPerHour: 600,  // Changed from 300
    // ...
  },
};
```

### Change Degradation Thresholds

```typescript
export const DEGRADATION_THRESHOLDS = {
  WARNING: 0.7,    // Show warning at 70% instead of 80%
  DEGRADED: 0.85,  // Start degradation at 85% instead of 90%
  CRITICAL: 0.95,
};
```

### Change Violation Policy

```typescript
export const VIOLATION_CONFIG = {
  MAX_VIOLATIONS: 3,              // Ban after 3 violations instead of 5
  VIOLATION_WINDOW_MS: 1800000,   // Within 30 minutes instead of 1 hour
  BAN_DURATION_MS: 7200000,       // Ban for 2 hours instead of 1
};
```

## 📈 Monitoring

### Redis Memory Usage

```bash
redis-cli INFO memory | grep used_memory_human
```

### Active Rate Limits

```bash
# Count active rate limit entries
redis-cli KEYS "ratelimit:user:*" | wc -l
```

### Banned Users

```bash
# List banned users
redis-cli KEYS "ratelimit:ban:user:*"
```

## 🚀 Production Checklist

- [ ] Redis is running and accessible
- [ ] Database migration completed
- [ ] Redis password configured (if applicable)
- [ ] Admin authorization middleware added
- [ ] Monitoring/alerting configured
- [ ] Rate limit tiers configured appropriately
- [ ] Documentation shared with team
- [ ] Client applications updated to handle 429 responses

## 💡 Tips

1. **Start Conservative**: Begin with lower limits and increase based on usage
2. **Monitor Closely**: Watch for false positives in the first week
3. **Communicate**: Inform users about rate limits and how to upgrade
4. **Cache Wisely**: Implement client-side caching to reduce API calls
5. **Test Thoroughly**: Test rate limiting in staging before production

## 🆘 Need Help?

- Check the [full documentation](./RATE_LIMITING.md)
- Review [usage examples](./RATE_LIMITING_EXAMPLES.md)
- Check Redis logs: `redis-cli MONITOR`
- Check application logs for rate limiting errors

---

**Ready to go!** Your API is now protected with comprehensive rate limiting. 🎉
