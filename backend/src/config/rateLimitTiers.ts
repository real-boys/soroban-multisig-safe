import { RateLimitTier, RateLimitConfig } from '@/types/rateLimiting';

/**
 * Rate Limit Tier Configurations
 * 
 * Each tier has different limits for:
 * - Requests per minute (sustained rate)
 * - Requests per hour (medium-term limit)
 * - Requests per day (long-term limit)
 * - Burst capacity (short-term spike handling)
 * - Burst window (time frame for burst)
 */
export const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  [RateLimitTier.FREE]: {
    tier: RateLimitTier.FREE,
    requestsPerMinute: 10,
    requestsPerHour: 300,
    requestsPerDay: 1000,
    burstCapacity: 20, // Can burst up to 20 requests
    burstWindowMs: 10000, // Within 10 seconds
  },
  [RateLimitTier.BASIC]: {
    tier: RateLimitTier.BASIC,
    requestsPerMinute: 30,
    requestsPerHour: 1000,
    requestsPerDay: 5000,
    burstCapacity: 50,
    burstWindowMs: 10000,
  },
  [RateLimitTier.PREMIUM]: {
    tier: RateLimitTier.PREMIUM,
    requestsPerMinute: 100,
    requestsPerHour: 5000,
    requestsPerDay: 50000,
    burstCapacity: 150,
    burstWindowMs: 10000,
  },
  [RateLimitTier.ENTERPRISE]: {
    tier: RateLimitTier.ENTERPRISE,
    requestsPerMinute: 500,
    requestsPerHour: 20000,
    requestsPerDay: 200000,
    burstCapacity: 1000,
    burstWindowMs: 10000,
  },
};

/**
 * Default tier for unauthenticated requests (IP-based)
 */
export const DEFAULT_TIER = RateLimitTier.FREE;

/**
 * Graceful degradation thresholds
 * When a user exceeds these percentages, they enter degradation mode
 */
export const DEGRADATION_THRESHOLDS = {
  WARNING: 0.8, // 80% of limit
  DEGRADED: 0.9, // 90% of limit - start graceful degradation
  CRITICAL: 0.95, // 95% of limit - severe degradation
};

/**
 * Violation tracking configuration
 */
export const VIOLATION_CONFIG = {
  MAX_VIOLATIONS: 5, // Max violations before temporary ban
  VIOLATION_WINDOW_MS: 3600000, // 1 hour window
  BAN_DURATION_MS: 3600000, // 1 hour ban
  VIOLATION_DECAY_MS: 86400000, // Violations decay after 24 hours
};

/**
 * Redis key prefixes for rate limiting
 */
export const REDIS_KEYS = {
  USER_RATE_LIMIT: 'ratelimit:user:',
  IP_RATE_LIMIT: 'ratelimit:ip:',
  USER_BAN: 'ratelimit:ban:user:',
  IP_BAN: 'ratelimit:ban:ip:',
  VIOLATION: 'ratelimit:violation:',
};
