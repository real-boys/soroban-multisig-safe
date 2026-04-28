import { Redis } from 'redis';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { 
  UserTier, 
  RATE_LIMIT_CONFIG, 
  RateLimitRule, 
  GRACEFUL_DEGRADATION_CONFIG 
} from '@/config/rateLimitConfig';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  burstLimit: number;
  burstRemaining: number;
  burstResetTime: number;
  retryAfter?: number;
  queuePosition?: number;
}

export interface RateLimitUsage {
  tokens: number;
  maxTokens: number;
  windowStart: Date;
  windowEnd: Date;
  burstUsed: number;
  maxBurst: number;
  lastRequest: Date;
}

export class UserRateLimitService {
  private redis: Redis;
  private prisma: PrismaClient;
  private requestQueue: Map<string, Array<{ resolve: Function; reject: Function; timestamp: number }>> = new Map();

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
  }

  /**
   * Check if a user request is allowed based on their tier and endpoint
   */
  async checkRateLimit(
    userId: string,
    endpoint: string,
    method: string,
    userTier: UserTier = UserTier.FREE
  ): Promise<RateLimitResult> {
    try {
      const rule = this.getRateLimitRule(userTier, endpoint, method);
      const key = this.generateRedisKey(userId, endpoint, method);
      
      // Get current usage from Redis
      const usage = await this.getCurrentUsage(key, rule);
      
      // Check if request is allowed
      const now = new Date();
      const allowed = this.isRequestAllowed(usage, rule, now);
      
      if (allowed) {
        // Consume tokens
        await this.consumeTokens(key, usage, rule, now);
        
        return {
          allowed: true,
          limit: rule.requests,
          remaining: Math.max(0, rule.requests - usage.tokens - 1),
          resetTime: usage.windowEnd.getTime(),
          burstLimit: rule.burstCapacity,
          burstRemaining: Math.max(0, rule.burstCapacity - usage.burstUsed - 1),
          burstResetTime: now.getTime() + rule.burstWindowMs,
        };
      } else {
        // Handle graceful degradation
        return await this.handleRateLimitExceeded(userId, endpoint, method, usage, rule);
      }
    } catch (error) {
      logger.error('Rate limit check failed:', error);
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        limit: 100,
        remaining: 99,
        resetTime: Date.now() + 15 * 60 * 1000,
        burstLimit: 20,
        burstRemaining: 19,
        burstResetTime: Date.now() + 60 * 1000,
      };
    }
  }

  /**
   * Get the appropriate rate limit rule for user tier and endpoint
   */
  private getRateLimitRule(userTier: UserTier, endpoint: string, method: string): RateLimitRule {
    const tierConfig = RATE_LIMIT_CONFIG[userTier];
    
    // Check for endpoint-specific rule
    const endpointConfig = tierConfig.endpoints[endpoint];
    if (endpointConfig && endpointConfig[method]) {
      return endpointConfig[method];
    }
    
    // Fall back to default rule
    return tierConfig.default;
  }

  /**
   * Generate Redis key for rate limiting
   */
  private generateRedisKey(userId: string, endpoint: string, method: string): string {
    return `rate_limit:${userId}:${endpoint}:${method}`;
  }

  /**
   * Get current usage from Redis with token bucket algorithm
   */
  private async getCurrentUsage(key: string, rule: RateLimitRule): Promise<RateLimitUsage> {
    const now = new Date();
    const data = await this.redis.hGetAll(key);
    
    if (!data.windowStart) {
      // First request - initialize
      return {
        tokens: 0,
        maxTokens: rule.requests,
        windowStart: now,
        windowEnd: new Date(now.getTime() + rule.windowMs),
        burstUsed: 0,
        maxBurst: rule.burstCapacity,
        lastRequest: now,
      };
    }
    
    const windowStart = new Date(data.windowStart);
    const windowEnd = new Date(data.windowEnd);
    const lastRequest = new Date(data.lastRequest);
    
    // Check if window has expired
    if (now >= windowEnd) {
      // Reset window
      return {
        tokens: 0,
        maxTokens: rule.requests,
        windowStart: now,
        windowEnd: new Date(now.getTime() + rule.windowMs),
        burstUsed: 0,
        maxBurst: rule.burstCapacity,
        lastRequest: now,
      };
    }
    
    // Check if burst window has expired
    let burstUsed = parseInt(data.burstUsed) || 0;
    const timeSinceLastRequest = now.getTime() - lastRequest.getTime();
    if (timeSinceLastRequest >= rule.burstWindowMs) {
      burstUsed = 0;
    }
    
    return {
      tokens: parseInt(data.tokens) || 0,
      maxTokens: rule.requests,
      windowStart,
      windowEnd,
      burstUsed,
      maxBurst: rule.burstCapacity,
      lastRequest,
    };
  }

  /**
   * Check if request is allowed based on token bucket algorithm
   */
  private isRequestAllowed(usage: RateLimitUsage, rule: RateLimitRule, now: Date): boolean {
    // Check main rate limit
    if (usage.tokens >= rule.requests) {
      return false;
    }
    
    // Check burst limit
    const timeSinceLastRequest = now.getTime() - usage.lastRequest.getTime();
    if (timeSinceLastRequest < rule.burstWindowMs && usage.burstUsed >= rule.burstCapacity) {
      return false;
    }
    
    return true;
  }

  /**
   * Consume tokens and update Redis
   */
  private async consumeTokens(
    key: string,
    usage: RateLimitUsage,
    rule: RateLimitRule,
    now: Date
  ): Promise<void> {
    const timeSinceLastRequest = now.getTime() - usage.lastRequest.getTime();
    const burstUsed = timeSinceLastRequest >= rule.burstWindowMs ? 1 : usage.burstUsed + 1;
    
    const pipeline = this.redis.multi();
    pipeline.hSet(key, {
      tokens: usage.tokens + 1,
      windowStart: usage.windowStart.toISOString(),
      windowEnd: usage.windowEnd.toISOString(),
      burstUsed: burstUsed,
      lastRequest: now.toISOString(),
    });
    pipeline.expire(key, Math.ceil(rule.windowMs / 1000));
    
    await pipeline.exec();
  }

  /**
   * Handle rate limit exceeded with graceful degradation
   */
  private async handleRateLimitExceeded(
    userId: string,
    endpoint: string,
    method: string,
    usage: RateLimitUsage,
    rule: RateLimitRule
  ): Promise<RateLimitResult> {
    const retryAfter = Math.ceil((usage.windowEnd.getTime() - Date.now()) / 1000);
    
    // Check if queueing is enabled and this is a priority endpoint
    if (GRACEFUL_DEGRADATION_CONFIG.enableQueueing && this.isPriorityEndpoint(endpoint)) {
      const queuePosition = await this.addToQueue(userId, endpoint, method);
      
      if (queuePosition <= GRACEFUL_DEGRADATION_CONFIG.maxQueueSize) {
        return {
          allowed: false,
          limit: rule.requests,
          remaining: 0,
          resetTime: usage.windowEnd.getTime(),
          burstLimit: rule.burstCapacity,
          burstRemaining: 0,
          burstResetTime: usage.lastRequest.getTime() + rule.burstWindowMs,
          retryAfter,
          queuePosition,
        };
      }
    }
    
    // Log rate limit exceeded for monitoring
    await this.logRateLimitExceeded(userId, endpoint, method, usage);
    
    return {
      allowed: false,
      limit: rule.requests,
      remaining: 0,
      resetTime: usage.windowEnd.getTime(),
      burstLimit: rule.burstCapacity,
      burstRemaining: 0,
      burstResetTime: usage.lastRequest.getTime() + rule.burstWindowMs,
      retryAfter,
    };
  }

  /**
   * Check if endpoint is priority for queueing
   */
  private isPriorityEndpoint(endpoint: string): boolean {
    return GRACEFUL_DEGRADATION_CONFIG.priorityEndpoints.some(priority => 
      endpoint.includes(priority.replace(':id', ''))
    );
  }

  /**
   * Add request to queue for priority endpoints
   */
  private async addToQueue(userId: string, endpoint: string, method: string): Promise<number> {
    const queueKey = `${userId}:${endpoint}:${method}`;
    
    if (!this.requestQueue.has(queueKey)) {
      this.requestQueue.set(queueKey, []);
    }
    
    const queue = this.requestQueue.get(queueKey)!;
    
    return new Promise((resolve, reject) => {
      const queueItem = {
        resolve,
        reject,
        timestamp: Date.now(),
      };
      
      queue.push(queueItem);
      
      // Set timeout for queue item
      setTimeout(() => {
        const index = queue.indexOf(queueItem);
        if (index > -1) {
          queue.splice(index, 1);
          reject(new Error('Queue timeout'));
        }
      }, GRACEFUL_DEGRADATION_CONFIG.queueTimeoutMs);
      
      resolve(queue.length);
    });
  }

  /**
   * Process queued requests
   */
  async processQueue(): Promise<void> {
    for (const [queueKey, queue] of this.requestQueue.entries()) {
      if (queue.length === 0) continue;
      
      const [userId, endpoint, method] = queueKey.split(':');
      const userTier = await this.getUserTier(userId);
      
      // Check if we can process the next request
      const result = await this.checkRateLimit(userId, endpoint, method, userTier);
      
      if (result.allowed && queue.length > 0) {
        const queueItem = queue.shift()!;
        queueItem.resolve(result);
      }
    }
  }

  /**
   * Get user tier from database
   */
  private async getUserTier(userId: string): Promise<UserTier> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { tier: true },
      });
      
      // Convert Prisma enum to our enum
      if (!user?.tier) return UserTier.FREE;
      
      switch (user.tier) {
        case 'PRO': return UserTier.PRO;
        case 'ENTERPRISE': return UserTier.ENTERPRISE;
        case 'ADMIN': return UserTier.ADMIN;
        default: return UserTier.FREE;
      }
    } catch (error) {
      logger.error('Failed to get user tier:', error);
      return UserTier.FREE;
    }
  }

  /**
   * Log rate limit exceeded for monitoring and analytics
   */
  private async logRateLimitExceeded(
    userId: string,
    endpoint: string,
    method: string,
    usage: RateLimitUsage
  ): Promise<void> {
    try {
      // Store in database for analytics
      await this.prisma.rateLimitUsage.upsert({
        where: {
          userId_endpoint_method: {
            userId,
            endpoint,
            method,
          },
        },
        update: {
          tokens: usage.tokens,
          maxTokens: usage.maxTokens,
          windowStart: usage.windowStart,
          windowEnd: usage.windowEnd,
          burstUsed: usage.burstUsed,
          maxBurst: usage.maxBurst,
          lastRequest: usage.lastRequest,
          updatedAt: new Date(),
        },
        create: {
          userId,
          endpoint,
          method,
          tokens: usage.tokens,
          maxTokens: usage.maxTokens,
          windowStart: usage.windowStart,
          windowEnd: usage.windowEnd,
          burstUsed: usage.burstUsed,
          maxBurst: usage.maxBurst,
          lastRequest: usage.lastRequest,
        },
      });
      
      // Log for monitoring
      logger.warn('Rate limit exceeded', {
        userId,
        endpoint,
        method,
        tokens: usage.tokens,
        maxTokens: usage.maxTokens,
        burstUsed: usage.burstUsed,
        maxBurst: usage.maxBurst,
      });
    } catch (error) {
      logger.error('Failed to log rate limit exceeded:', error);
    }
  }

  /**
   * Get rate limit status for a user
   */
  async getRateLimitStatus(userId: string): Promise<{
    tier: UserTier;
    limits: Array<{
      endpoint: string;
      method: string;
      usage: RateLimitUsage;
      rule: RateLimitRule;
    }>;
  }> {
    const userTier = await this.getUserTier(userId);
    const limits: Array<{
      endpoint: string;
      method: string;
      usage: RateLimitUsage;
      rule: RateLimitRule;
    }> = [];
    
    // Get usage for all endpoints this user has accessed
    const usageRecords = await this.prisma.rateLimitUsage.findMany({
      where: { userId },
      orderBy: { lastRequest: 'desc' },
      take: 20, // Limit to recent endpoints
    });
    
    for (const record of usageRecords) {
      const rule = this.getRateLimitRule(userTier, record.endpoint, record.method);
      const key = this.generateRedisKey(userId, record.endpoint, record.method);
      const usage = await this.getCurrentUsage(key, rule);
      
      limits.push({
        endpoint: record.endpoint,
        method: record.method,
        usage,
        rule,
      });
    }
    
    return {
      tier: userTier,
      limits,
    };
  }

  /**
   * Reset rate limits for a user (admin function)
   */
  async resetUserRateLimits(userId: string): Promise<void> {
    try {
      // Delete from Redis
      const keys = await this.redis.keys(`rate_limit:${userId}:*`);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      
      // Delete from database
      await this.prisma.rateLimitUsage.deleteMany({
        where: { userId },
      });
      
      logger.info(`Rate limits reset for user ${userId}`);
    } catch (error) {
      logger.error('Failed to reset user rate limits:', error);
      throw error;
    }
  }

  /**
   * Update user tier (admin function)
   */
  async updateUserTier(userId: string, newTier: UserTier): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { tier: newTier },
      });
      
      logger.info(`User ${userId} tier updated to ${newTier}`);
    } catch (error) {
      logger.error('Failed to update user tier:', error);
      throw error;
    }
  }
}