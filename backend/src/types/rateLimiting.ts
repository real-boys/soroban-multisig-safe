/**
 * Rate Limiting Types and Interfaces
 */

export enum RateLimitTier {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

export interface RateLimitConfig {
  tier: RateLimitTier;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstCapacity: number; // Maximum burst requests allowed
  burstWindowMs: number; // Time window for burst (e.g., 10 seconds)
}

export interface RateLimitInfo {
  tier: RateLimitTier;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  retryAfter?: number; // Seconds until retry
  burstRemaining: number;
  burstReset: number;
}

export interface RateLimitResult {
  allowed: boolean;
  info: RateLimitInfo;
  degraded?: boolean; // True if in graceful degradation mode
  degradationMessage?: string;
}

export interface UserRateLimitData {
  userId: string;
  tier: RateLimitTier;
  minuteCount: number;
  hourCount: number;
  dayCount: number;
  burstCount: number;
  minuteReset: number;
  hourReset: number;
  dayReset: number;
  burstReset: number;
  violations: number; // Track repeated violations
  lastViolation?: number;
}
