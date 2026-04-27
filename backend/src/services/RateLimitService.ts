import { redisClient } from '@/config/redis';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import {
  RateLimitTier,
  RateLimitConfig,
  RateLimitResult,
  RateLimitInfo,
  UserRateLimitData,
} from '@/types/rateLimiting';
import {
  RATE_LIMIT_TIERS,
  DEFAULT_TIER,
  DEGRADATION_THRESHOLDS,
  VIOLATION_CONFIG,
  REDIS_KEYS,
} from '@/config/rateLimitTiers';

/**
 * User-Based Rate Limiting Service
 * 
 * Features:
 * - Multi-tier rate limiting (FREE, BASIC, PREMIUM, ENTERPRISE)
 * - Burst capacity handling
 * - Graceful degradation
 * - Violation tracking and temporary bans
 * - Redis-based distributed rate limiting
 */
export class RateLimitService {
  /**
   * Check if a user/IP is allowed to make a request
   */
  async checkRateLimit(
    identifier: string,
    tier: RateLimitTier = DEFAULT_TIER,
    isUser: boolean = false
  ): Promise<RateLimitResult> {
    try {
      // Check if banned
      const isBanned = await this.isTemporarilyBanned(identifier, isUser);
      if (isBanned) {
        const banTTL = await this.getBanTTL(identifier, isUser);
        return {
          allowed: false,
          info: this.createRateLimitInfo(tier, 0, 0, 0, 0, banTTL),
          degraded: false,
        };
      }

      const config = RATE_LIMIT_TIERS[tier];
      const now = Date.now();
      
      // Get current rate limit data
      const data = await this.getRateLimitData(identifier, isUser);
      
      // Initialize if new
      if (!data) {
        const newData = this.initializeRateLimitData(identifier, tier, now);
        await this.saveRateLimitData(identifier, newData, isUser);
        return {
          allowed: true,
          info: this.createRateLimitInfo(
            tier,
            config.requestsPerMinute - 1,
            config.requestsPerHour - 1,
            config.requestsPerDay - 1,
            config.burstCapacity - 1,
            0
          ),
          degraded: false,
        };
      }

      // Reset windows if expired
      const updatedData = this.resetExpiredWindows(data, config, now);

      // Check burst capacity first (most restrictive)
      if (updatedData.burstCount >= config.burstCapacity) {
        await this.recordViolation(identifier, isUser);
        const retryAfter = Math.ceil((updatedData.burstReset - now) / 1000);
        return {
          allowed: false,
          info: this.createRateLimitInfo(
            tier,
            config.requestsPerMinute - updatedData.minuteCount,
            config.requestsPerHour - updatedData.hourCount,
            config.requestsPerDay - updatedData.dayCount,
            0,
            retryAfter
          ),
          degraded: false,
        };
      }

      // Check minute limit
      if (updatedData.minuteCount >= config.requestsPerMinute) {
        await this.recordViolation(identifier, isUser);
        const retryAfter = Math.ceil((updatedData.minuteReset - now) / 1000);
        return {
          allowed: false,
          info: this.createRateLimitInfo(
            tier,
            0,
            config.requestsPerHour - updatedData.hourCount,
            config.requestsPerDay - updatedData.dayCount,
            config.burstCapacity - updatedData.burstCount,
            retryAfter
          ),
          degraded: false,
        };
      }

      // Check hour limit
      if (updatedData.hourCount >= config.requestsPerHour) {
        await this.recordViolation(identifier, isUser);
        const retryAfter = Math.ceil((updatedData.hourReset - now) / 1000);
        return {
          allowed: false,
          info: this.createRateLimitInfo(
            tier,
            config.requestsPerMinute - updatedData.minuteCount,
            0,
            config.requestsPerDay - updatedData.dayCount,
            config.burstCapacity - updatedData.burstCount,
            retryAfter
          ),
          degraded: false,
        };
      }

      // Check day limit
      if (updatedData.dayCount >= config.requestsPerDay) {
        await this.recordViolation(identifier, isUser);
        const retryAfter = Math.ceil((updatedData.dayReset - now) / 1000);
        return {
          allowed: false,
          info: this.createRateLimitInfo(
            tier,
            config.requestsPerMinute - updatedData.minuteCount,
            config.requestsPerHour - updatedData.hourCount,
            0,
            config.burstCapacity - updatedData.burstCount,
            retryAfter
          ),
          degraded: false,
        };
      }

      // Increment counters
      updatedData.minuteCount++;
      updatedData.hourCount++;
      updatedData.dayCount++;
      updatedData.burstCount++;

      // Save updated data
      await this.saveRateLimitData(identifier, updatedData, isUser);

      // Check for graceful degradation
      const degradationStatus = this.checkDegradation(updatedData, config);

      return {
        allowed: true,
        info: this.createRateLimitInfo(
          tier,
          config.requestsPerMinute - updatedData.minuteCount,
          config.requestsPerHour - updatedData.hourCount,
          config.requestsPerDay - updatedData.dayCount,
          config.burstCapacity - updatedData.burstCount,
          0
        ),
        degraded: degradationStatus.degraded,
        degradationMessage: degradationStatus.message,
      };
    } catch (error) {
      logger.error('Rate limit check error:', error);
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        info: this.createRateLimitInfo(tier, -1, -1, -1, -1, 0),
        degraded: false,
      };
    }
  }

  /**
   * Get user's rate limit tier from database
   */
  async getUserTier(userId: string): Promise<RateLimitTier> {
    try {
      // Check Redis cache first
      const cacheKey = `${REDIS_KEYS.USER_RATE_LIMIT}tier:${userId}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        return cached as RateLimitTier;
      }

      // Fetch from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { rateLimitTier: true },
      });

      const tier = (user?.rateLimitTier as RateLimitTier) || DEFAULT_TIER;
      
      // Cache for 1 hour
      await redisClient.setEx(cacheKey, 3600, tier);
      
      return tier;
    } catch (error) {
      logger.error('Error fetching user tier:', error);
      return DEFAULT_TIER;
    }
  }

  /**
   * Update user's rate limit tier
   */
  async updateUserTier(userId: string, tier: RateLimitTier): Promise<void> {
    try {
      // Update database
      await prisma.user.update({
        where: { id: userId },
        data: { rateLimitTier: tier },
      });

      // Update cache
      const cacheKey = `${REDIS_KEYS.USER_RATE_LIMIT}tier:${userId}`;
      await redisClient.setEx(cacheKey, 3600, tier);
      
      // Also clear existing rate limit data to apply new limits immediately
      const dataKey = `${REDIS_KEYS.USER_RATE_LIMIT}${userId}`;
      await redisClient.del(dataKey);
      
      logger.info(`Updated rate limit tier for user ${userId} to ${tier}`);
    } catch (error) {
      logger.error('Error updating user tier:', error);
      throw error;
    }
  }

  /**
   * Get rate limit data from Redis
   */
  private async getRateLimitData(
    identifier: string,
    isUser: boolean
  ): Promise<UserRateLimitData | null> {
    try {
      const prefix = isUser ? REDIS_KEYS.USER_RATE_LIMIT : REDIS_KEYS.IP_RATE_LIMIT;
      const key = `${prefix}${identifier}`;
      const data = await redisClient.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data) as UserRateLimitData;
    } catch (error) {
      logger.error('Error getting rate limit data:', error);
      return null;
    }
  }

  /**
   * Save rate limit data to Redis
   */
  private async saveRateLimitData(
    identifier: string,
    data: UserRateLimitData,
    isUser: boolean
  ): Promise<void> {
    try {
      const prefix = isUser ? REDIS_KEYS.USER_RATE_LIMIT : REDIS_KEYS.IP_RATE_LIMIT;
      const key = `${prefix}${identifier}`;
      
      // Set with expiration (keep data for 25 hours to cover day window)
      await redisClient.setEx(key, 90000, JSON.stringify(data));
    } catch (error) {
      logger.error('Error saving rate limit data:', error);
    }
  }

  /**
   * Initialize new rate limit data
   */
  private initializeRateLimitData(
    identifier: string,
    tier: RateLimitTier,
    now: number
  ): UserRateLimitData {
    return {
      userId: identifier,
      tier,
      minuteCount: 0,
      hourCount: 0,
      dayCount: 0,
      burstCount: 0,
      minuteReset: now + 60000, // 1 minute
      hourReset: now + 3600000, // 1 hour
      dayReset: now + 86400000, // 24 hours
      burstReset: now + RATE_LIMIT_TIERS[tier].burstWindowMs,
      violations: 0,
    };
  }

  /**
   * Reset expired time windows
   */
  private resetExpiredWindows(
    data: UserRateLimitData,
    config: RateLimitConfig,
    now: number
  ): UserRateLimitData {
    const updated = { ...data };

    if (now >= updated.minuteReset) {
      updated.minuteCount = 0;
      updated.minuteReset = now + 60000;
    }

    if (now >= updated.hourReset) {
      updated.hourCount = 0;
      updated.hourReset = now + 3600000;
    }

    if (now >= updated.dayReset) {
      updated.dayCount = 0;
      updated.dayReset = now + 86400000;
    }

    if (now >= updated.burstReset) {
      updated.burstCount = 0;
      updated.burstReset = now + config.burstWindowMs;
    }

    return updated;
  }

  /**
   * Create rate limit info object
   */
  private createRateLimitInfo(
    tier: RateLimitTier,
    minuteRemaining: number,
    hourRemaining: number,
    dayRemaining: number,
    burstRemaining: number,
    retryAfter: number
  ): RateLimitInfo {
    const config = RATE_LIMIT_TIERS[tier];
    const now = Date.now();

    return {
      tier,
      limit: config.requestsPerMinute,
      remaining: Math.max(0, minuteRemaining),
      reset: Math.floor((now + 60000) / 1000),
      retryAfter: retryAfter > 0 ? retryAfter : undefined,
      burstRemaining: Math.max(0, burstRemaining),
      burstReset: Math.floor((now + config.burstWindowMs) / 1000),
    };
  }

  /**
   * Check for graceful degradation
   */
  private checkDegradation(
    data: UserRateLimitData,
    config: RateLimitConfig
  ): { degraded: boolean; message?: string } {
    const minuteUsage = data.minuteCount / config.requestsPerMinute;
    const hourUsage = data.hourCount / config.requestsPerHour;
    const dayUsage = data.dayCount / config.requestsPerDay;
    const burstUsage = data.burstCount / config.burstCapacity;

    const maxUsage = Math.max(minuteUsage, hourUsage, dayUsage, burstUsage);

    if (maxUsage >= DEGRADATION_THRESHOLDS.CRITICAL) {
      return {
        degraded: true,
        message: 'Critical: You are approaching your rate limit. Consider upgrading your tier.',
      };
    }

    if (maxUsage >= DEGRADATION_THRESHOLDS.DEGRADED) {
      return {
        degraded: true,
        message: 'Warning: You are nearing your rate limit. Some features may be restricted.',
      };
    }

    if (maxUsage >= DEGRADATION_THRESHOLDS.WARNING) {
      return {
        degraded: true,
        message: 'Notice: You have used 80% of your rate limit.',
      };
    }

    return { degraded: false };
  }

  /**
   * Record a rate limit violation
   */
  private async recordViolation(identifier: string, isUser: boolean): Promise<void> {
    try {
      const key = `${REDIS_KEYS.VIOLATION}${isUser ? 'user' : 'ip'}:${identifier}`;
      const violations = await redisClient.incr(key);
      
      // Set expiration on first violation
      if (violations === 1) {
        await redisClient.expire(key, Math.floor(VIOLATION_CONFIG.VIOLATION_WINDOW_MS / 1000));
      }

      // Temporary ban if too many violations
      if (violations >= VIOLATION_CONFIG.MAX_VIOLATIONS) {
        await this.temporarilyBan(identifier, isUser);
        logger.warn(`Temporarily banned ${isUser ? 'user' : 'IP'}: ${identifier} for excessive violations`);
      }
    } catch (error) {
      logger.error('Error recording violation:', error);
    }
  }

  /**
   * Temporarily ban a user or IP
   */
  private async temporarilyBan(identifier: string, isUser: boolean): Promise<void> {
    try {
      const prefix = isUser ? REDIS_KEYS.USER_BAN : REDIS_KEYS.IP_BAN;
      const key = `${prefix}${identifier}`;
      const ttl = Math.floor(VIOLATION_CONFIG.BAN_DURATION_MS / 1000);
      
      await redisClient.setEx(key, ttl, 'banned');
    } catch (error) {
      logger.error('Error setting temporary ban:', error);
    }
  }

  /**
   * Check if user/IP is temporarily banned
   */
  private async isTemporarilyBanned(identifier: string, isUser: boolean): Promise<boolean> {
    try {
      const prefix = isUser ? REDIS_KEYS.USER_BAN : REDIS_KEYS.IP_BAN;
      const key = `${prefix}${identifier}`;
      const banned = await redisClient.get(key);
      
      return banned === 'banned';
    } catch (error) {
      logger.error('Error checking ban status:', error);
      return false;
    }
  }

  /**
   * Get remaining ban time in seconds
   */
  private async getBanTTL(identifier: string, isUser: boolean): Promise<number> {
    try {
      const prefix = isUser ? REDIS_KEYS.USER_BAN : REDIS_KEYS.IP_BAN;
      const key = `${prefix}${identifier}`;
      const ttl = await redisClient.ttl(key);
      
      return Math.max(0, ttl);
    } catch (error) {
      logger.error('Error getting ban TTL:', error);
      return 0;
    }
  }

  /**
   * Get rate limit statistics for a user
   */
  async getRateLimitStats(identifier: string, isUser: boolean): Promise<UserRateLimitData | null> {
    return this.getRateLimitData(identifier, isUser);
  }

  /**
   * Reset rate limits for a user (admin function)
   */
  async resetRateLimit(identifier: string, isUser: boolean): Promise<void> {
    try {
      const prefix = isUser ? REDIS_KEYS.USER_RATE_LIMIT : REDIS_KEYS.IP_RATE_LIMIT;
      const key = `${prefix}${identifier}`;
      await redisClient.del(key);
      
      // Also clear violations and bans
      const violationKey = `${REDIS_KEYS.VIOLATION}${isUser ? 'user' : 'ip'}:${identifier}`;
      const banKey = `${isUser ? REDIS_KEYS.USER_BAN : REDIS_KEYS.IP_BAN}${identifier}`;
      await redisClient.del(violationKey);
      await redisClient.del(banKey);
      
      logger.info(`Reset rate limit for ${isUser ? 'user' : 'IP'}: ${identifier}`);
    } catch (error) {
      logger.error('Error resetting rate limit:', error);
      throw error;
    }
  }
}

export const rateLimitService = new RateLimitService();
