# Rate Limiting Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Request                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Middleware Layer                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         userRateLimiter / strictRateLimiter            │    │
│  │                                                         │    │
│  │  1. Extract user ID or IP address                      │    │
│  │  2. Call RateLimitService.checkRateLimit()             │    │
│  │  3. Add rate limit headers to response                 │    │
│  │  4. Allow or block request                             │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      RateLimitService                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  checkRateLimit(identifier, tier, isUser)                │  │
│  │                                                           │  │
│  │  1. Check if banned                                      │  │
│  │  2. Get rate limit data from Redis                       │  │
│  │  3. Reset expired windows                                │  │
│  │  4. Check burst, minute, hour, day limits                │  │
│  │  5. Increment counters                                   │  │
│  │  6. Check for graceful degradation                       │  │
│  │  7. Record violations if limit exceeded                  │  │
│  │  8. Return result                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  getUserTier(userId)                                     │  │
│  │                                                           │  │
│  │  1. Check Redis cache                                    │  │
│  │  2. If not cached, fetch from PostgreSQL                 │  │
│  │  3. Cache in Redis (1 hour TTL)                          │  │
│  │  4. Return tier                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────────┬────────────────────────┘
                 │                        │
                 ▼                        ▼
┌─────────────────────────────┐  ┌──────────────────────────────┐
│         Redis Cache          │  │      PostgreSQL Database     │
│                              │  │                              │
│  Rate Limit Data:            │  │  User Table:                 │
│  • User/IP counters          │  │  • id                        │
│  • Time windows              │  │  • email                     │
│  • Violations                │  │  • rateLimitTier             │
│  • Bans                      │  │  • ...                       │
│  • Tier cache                │  │                              │
│                              │  │                              │
│  Key Patterns:               │  └──────────────────────────────┘
│  • ratelimit:user:<id>       │
│  • ratelimit:ip:<ip>         │
│  • ratelimit:ban:user:<id>   │
│  • ratelimit:violation:*     │
└──────────────────────────────┘
```

## Request Flow Diagram

```
┌─────────┐
│ Request │
└────┬────┘
     │
     ▼
┌─────────────────────┐
│ Is Authenticated?   │
└────┬────────────┬───┘
     │ Yes        │ No
     ▼            ▼
┌─────────┐  ┌──────────┐
│ User ID │  │ IP Addr  │
└────┬────┘  └────┬─────┘
     │            │
     └────┬───────┘
          │
          ▼
┌──────────────────────┐
│ Get User Tier        │
│ (or DEFAULT for IP)  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Check if Banned?     │
└──────┬───────────────┘
       │
       ├─ Yes ──► 429 Too Many Requests (Banned)
       │
       └─ No
           │
           ▼
┌──────────────────────┐
│ Get Rate Limit Data  │
│ from Redis           │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Reset Expired        │
│ Windows              │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Check Burst Limit    │
└──────┬───────────────┘
       │
       ├─ Exceeded ──► Record Violation ──► 429 Too Many Requests
       │
       └─ OK
           │
           ▼
┌──────────────────────┐
│ Check Minute Limit   │
└──────┬───────────────┘
       │
       ├─ Exceeded ──► Record Violation ──► 429 Too Many Requests
       │
       └─ OK
           │
           ▼
┌──────────────────────┐
│ Check Hour Limit     │
└──────┬───────────────┘
       │
       ├─ Exceeded ──► Record Violation ──► 429 Too Many Requests
       │
       └─ OK
           │
           ▼
┌──────────────────────┐
│ Check Day Limit      │
└──────┬───────────────┘
       │
       ├─ Exceeded ──► Record Violation ──► 429 Too Many Requests
       │
       └─ OK
           │
           ▼
┌──────────────────────┐
│ Increment Counters   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Save to Redis        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Check Degradation    │
│ (80%, 90%, 95%)      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Add Response Headers │
│ • X-RateLimit-*      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Allow Request        │
│ (200 OK)             │
└──────────────────────┘
```

## Data Flow

### Rate Limit Data Structure in Redis

```json
{
  "userId": "user-123",
  "tier": "PREMIUM",
  "minuteCount": 45,
  "hourCount": 1200,
  "dayCount": 8500,
  "burstCount": 5,
  "minuteReset": 1714234567890,
  "hourReset": 1714237890123,
  "dayReset": 1714320890123,
  "burstReset": 1714234500000,
  "violations": 0,
  "lastViolation": null
}
```

### Tier Configuration

```typescript
{
  tier: "PREMIUM",
  requestsPerMinute: 100,
  requestsPerHour: 5000,
  requestsPerDay: 50000,
  burstCapacity: 150,
  burstWindowMs: 10000
}
```

## Component Interaction

```
┌──────────────────────────────────────────────────────────────┐
│                         Controllers                           │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  rateLimitController.ts                             │    │
│  │  • getRateLimitStatus()                             │    │
│  │  • getRateLimitTiers()                              │    │
│  │  • updateUserTier()                                 │    │
│  │  • getUserRateLimitStats()                          │    │
│  │  • resetUserRateLimit()                             │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                          Services                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  RateLimitService                                   │    │
│  │  • checkRateLimit()                                 │    │
│  │  • getUserTier()                                    │    │
│  │  • updateUserTier()                                 │    │
│  │  • getRateLimitStats()                              │    │
│  │  • resetRateLimit()                                 │    │
│  │  • recordViolation()                                │    │
│  │  • temporarilyBan()                                 │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                      Configuration                            │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  rateLimitTiers.ts                                  │    │
│  │  • RATE_LIMIT_TIERS                                 │    │
│  │  • DEGRADATION_THRESHOLDS                           │    │
│  │  • VIOLATION_CONFIG                                 │    │
│  │  • REDIS_KEYS                                       │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Graceful Degradation Flow

```
Request Usage: 0% ──────────────────────────────────────► 100%
                │         │         │         │         │
                │         │         │         │         │
                ▼         ▼         ▼         ▼         ▼
              Normal   Warning  Degraded  Critical   Blocked
               (0%)     (80%)     (90%)     (95%)    (100%)
                │         │         │         │         │
                │         │         │         │         │
                ▼         ▼         ▼         ▼         ▼
            ┌────────┬─────────┬─────────┬─────────┬────────┐
            │ Normal │ Notice  │ Warning │ Critical│ 429    │
            │ Service│ Message │ Message │ Alert   │ Error  │
            └────────┴─────────┴─────────┴─────────┴────────┘
```

## Violation Tracking

```
Violation Timeline:

Request 1-10:  ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓  (Within limit)
Request 11:    ✗                       (Violation 1)
Request 12:    ✗                       (Violation 2)
Request 13:    ✗                       (Violation 3)
Request 14:    ✗                       (Violation 4)
Request 15:    ✗                       (Violation 5 → BAN)

┌──────────────────────────────────────────────────────────┐
│ Violation Window: 1 hour                                 │
│ Max Violations: 5                                        │
│ Ban Duration: 1 hour                                     │
│ Violation Decay: 24 hours                               │
└──────────────────────────────────────────────────────────┘
```

## Multi-Window Rate Limiting

```
Time Windows:

Minute Window (60s):
├─────────────────────────────────────────────────────────┤
│ ✓✓✓✓✓✓✓✓✓✓ (10 requests for FREE tier)                 │
└─────────────────────────────────────────────────────────┘

Hour Window (3600s):
├─────────────────────────────────────────────────────────┤
│ ✓✓✓✓✓✓✓✓✓✓...✓✓✓ (300 requests for FREE tier)         │
└─────────────────────────────────────────────────────────┘

Day Window (86400s):
├─────────────────────────────────────────────────────────┤
│ ✓✓✓✓✓✓✓✓✓✓...✓✓✓✓✓✓ (1000 requests for FREE tier)     │
└─────────────────────────────────────────────────────────┘

Burst Window (10s):
├──────────┤
│ ✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓ (20 burst requests for FREE)    │
└──────────┘

All windows are checked independently.
Request is blocked if ANY window is exceeded.
```

## Tier Comparison

```
┌──────────────┬──────────┬──────────┬──────────┬──────────────┐
│ Metric       │   FREE   │  BASIC   │ PREMIUM  │ ENTERPRISE   │
├──────────────┼──────────┼──────────┼──────────┼──────────────┤
│ Req/Minute   │    10    │    30    │   100    │     500      │
│ Req/Hour     │   300    │  1,000   │  5,000   │   20,000     │
│ Req/Day      │  1,000   │  5,000   │ 50,000   │  200,000     │
│ Burst        │    20    │    50    │   150    │    1,000     │
│ Burst Window │   10s    │   10s    │   10s    │     10s      │
└──────────────┴──────────┴──────────┴──────────┴──────────────┘

Visual Representation:

FREE:        ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
BASIC:       ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
PREMIUM:     ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
ENTERPRISE:  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

             0%                                              100%
```

## Redis Key Structure

```
Redis Database
│
├── ratelimit:user:<userId>
│   └── JSON: { minuteCount, hourCount, dayCount, ... }
│
├── ratelimit:ip:<ipAddress>
│   └── JSON: { minuteCount, hourCount, dayCount, ... }
│
├── ratelimit:user:tier:<userId>
│   └── String: "PREMIUM"
│
├── ratelimit:ban:user:<userId>
│   └── String: "banned"
│
├── ratelimit:ban:ip:<ipAddress>
│   └── String: "banned"
│
├── ratelimit:violation:user:<userId>
│   └── Integer: 3
│
└── ratelimit:violation:ip:<ipAddress>
    └── Integer: 2
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────┐
│                    Performance Metrics                       │
├─────────────────────────────────────────────────────────────┤
│ Redis Latency:           < 1ms (local)                      │
│ Database Query:          ~5ms (cached in Redis)             │
│ Middleware Overhead:     < 2ms                              │
│ Total Request Overhead:  < 3ms                              │
│                                                              │
│ Throughput:              10,000+ req/sec (single instance)  │
│ Memory per User:         ~500 bytes (Redis)                 │
│ Cache Hit Rate:          > 99% (tier lookups)               │
└─────────────────────────────────────────────────────────────┘
```

## Scalability

```
┌────────────────────────────────────────────────────────────┐
│                    Horizontal Scaling                       │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Server 1 │  │ Server 2 │  │ Server 3 │                 │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
│       │             │             │                        │
│       └─────────────┼─────────────┘                        │
│                     │                                      │
│                     ▼                                      │
│            ┌─────────────────┐                             │
│            │  Redis Cluster  │                             │
│            │  (Shared State) │                             │
│            └─────────────────┘                             │
│                                                             │
│  All servers share the same rate limit state via Redis     │
│  No single point of failure with Redis Cluster             │
└────────────────────────────────────────────────────────────┘
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Scenarios                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis Down:                                                 │
│  ├─ Fail Open (allow requests)                              │
│  ├─ Log error                                               │
│  └─ Continue serving requests                               │
│                                                              │
│  Database Down:                                              │
│  ├─ Use cached tier (if available)                          │
│  ├─ Fall back to DEFAULT_TIER                               │
│  └─ Continue serving requests                               │
│                                                              │
│  Invalid Data:                                               │
│  ├─ Reset rate limit data                                   │
│  ├─ Initialize fresh counters                               │
│  └─ Allow request                                           │
│                                                              │
│  Network Timeout:                                            │
│  ├─ Fail open after timeout                                 │
│  └─ Log warning                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

This architecture ensures high availability, scalability, and performance while providing comprehensive rate limiting capabilities.
