export enum UserTier {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
  ADMIN = 'ADMIN'
}

export interface RateLimitRule {
  requests: number;
  windowMs: number;
  burstCapacity: number;
  burstWindowMs: number;
}

export interface EndpointRateLimit {
  [method: string]: RateLimitRule;
}

export interface TierRateLimits {
  default: RateLimitRule;
  endpoints: {
    [endpoint: string]: EndpointRateLimit;
  };
}

export const RATE_LIMIT_CONFIG: Record<UserTier, TierRateLimits> = {
  [UserTier.FREE]: {
    default: {
      requests: 100,
      windowMs: 15 * 60 * 1000, // 15 minutes
      burstCapacity: 20,
      burstWindowMs: 60 * 1000, // 1 minute
    },
    endpoints: {
      '/api/v1/auth/challenge': {
        POST: {
          requests: 10,
          windowMs: 5 * 60 * 1000, // 5 minutes
          burstCapacity: 3,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/auth/login': {
        POST: {
          requests: 5,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 2,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/transactions': {
        POST: {
          requests: 20,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 5,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
        GET: {
          requests: 200,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 50,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/wallets': {
        POST: {
          requests: 5,
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
          burstCapacity: 2,
          burstWindowMs: 60 * 60 * 1000, // 1 hour
        },
        GET: {
          requests: 100,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 25,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/signatures': {
        POST: {
          requests: 50,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 10,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
      },
    },
  },
  [UserTier.PRO]: {
    default: {
      requests: 500,
      windowMs: 15 * 60 * 1000, // 15 minutes
      burstCapacity: 100,
      burstWindowMs: 60 * 1000, // 1 minute
    },
    endpoints: {
      '/api/v1/auth/challenge': {
        POST: {
          requests: 50,
          windowMs: 5 * 60 * 1000, // 5 minutes
          burstCapacity: 15,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/auth/login': {
        POST: {
          requests: 25,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 10,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/transactions': {
        POST: {
          requests: 100,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 25,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
        GET: {
          requests: 1000,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 250,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/wallets': {
        POST: {
          requests: 25,
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
          burstCapacity: 10,
          burstWindowMs: 60 * 60 * 1000, // 1 hour
        },
        GET: {
          requests: 500,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 125,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/signatures': {
        POST: {
          requests: 250,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 50,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
      },
    },
  },
  [UserTier.ENTERPRISE]: {
    default: {
      requests: 2000,
      windowMs: 15 * 60 * 1000, // 15 minutes
      burstCapacity: 500,
      burstWindowMs: 60 * 1000, // 1 minute
    },
    endpoints: {
      '/api/v1/auth/challenge': {
        POST: {
          requests: 200,
          windowMs: 5 * 60 * 1000, // 5 minutes
          burstCapacity: 60,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/auth/login': {
        POST: {
          requests: 100,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 40,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/transactions': {
        POST: {
          requests: 500,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 125,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
        GET: {
          requests: 5000,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 1250,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/wallets': {
        POST: {
          requests: 100,
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
          burstCapacity: 40,
          burstWindowMs: 60 * 60 * 1000, // 1 hour
        },
        GET: {
          requests: 2000,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 500,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/signatures': {
        POST: {
          requests: 1000,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 200,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
      },
    },
  },
  [UserTier.ADMIN]: {
    default: {
      requests: 10000,
      windowMs: 15 * 60 * 1000, // 15 minutes
      burstCapacity: 2500,
      burstWindowMs: 60 * 1000, // 1 minute
    },
    endpoints: {
      // Admin users have very high limits for all endpoints
      '/api/v1/auth/challenge': {
        POST: {
          requests: 1000,
          windowMs: 5 * 60 * 1000, // 5 minutes
          burstCapacity: 300,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/auth/login': {
        POST: {
          requests: 500,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 200,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/transactions': {
        POST: {
          requests: 2500,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 625,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
        GET: {
          requests: 25000,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 6250,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/wallets': {
        POST: {
          requests: 500,
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
          burstCapacity: 200,
          burstWindowMs: 60 * 60 * 1000, // 1 hour
        },
        GET: {
          requests: 10000,
          windowMs: 15 * 60 * 1000, // 15 minutes
          burstCapacity: 2500,
          burstWindowMs: 60 * 1000,
        },
      },
      '/api/v1/signatures': {
        POST: {
          requests: 5000,
          windowMs: 60 * 60 * 1000, // 1 hour
          burstCapacity: 1000,
          burstWindowMs: 5 * 60 * 1000, // 5 minutes
        },
      },
    },
  },
};

export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
  BURST_LIMIT: 'X-RateLimit-Burst-Limit',
  BURST_REMAINING: 'X-RateLimit-Burst-Remaining',
  BURST_RESET: 'X-RateLimit-Burst-Reset',
} as const;

export const GRACEFUL_DEGRADATION_CONFIG = {
  // Queue requests when rate limit is exceeded
  enableQueueing: true,
  maxQueueSize: 100,
  queueTimeoutMs: 30 * 1000, // 30 seconds
  
  // Reduce response data when under pressure
  enableDataReduction: true,
  reducedDataThreshold: 0.8, // When 80% of rate limit is used
  
  // Prioritize certain endpoints
  priorityEndpoints: [
    '/api/v1/auth/challenge',
    '/api/v1/auth/login',
    '/api/v1/transactions/:id/sign',
  ],
  
  // Circuit breaker integration
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 0.9, // When 90% of rate limit is used
};