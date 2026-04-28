import { Request, Response, NextFunction } from 'express';
import { Redis } from 'redis';
import { PrismaClient } from '@prisma/client';
import { UserRateLimitService, RateLimitResult } from '@/services/UserRateLimitService';
import { UserTier, RATE_LIMIT_HEADERS } from '@/config/rateLimitConfig';
import { logger } from '@/utils/logger';
import { connectRedis } from '@/config/redis';
import { prisma } from '@/config/database';

// Legacy rate limiter for backward compatibility
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true, 
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again after 15 minutes'
    }
  }
});

export const signatureRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 signature intents per minute
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_SIGNATURE_ATTEMPTS',
      message: 'Too many signature attempts, please try again after a minute'
    }
  }
});

// Enhanced user-based rate limiter
let userRateLimitService: UserRateLimitService | null = null;

// Initialize the service
async function initializeUserRateLimitService(): Promise<UserRateLimitService> {
  if (!userRateLimitService) {
    const redis = await connectRedis();
    userRateLimitService = new UserRateLimitService(redis, prisma);
  }
  return userRateLimitService;
}

/**
 * User-based rate limiting middleware with tier support
 */
export const userRateLimiter = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip rate limiting for non-authenticated requests (fallback to IP-based)
      if (!req.user?.id) {
        return next();
      }

      const service = await initializeUserRateLimitService();
      const userId = req.user.id;
      const endpoint = getEndpointPattern(req.path);
      const method = req.method;

      // Get user tier (default to FREE if not found)
      const userTier = await getUserTier(userId);

      // Check rate limit
      const result: RateLimitResult = await service.checkRateLimit(
        userId,
        endpoint,
        method,
        userTier
      );

      // Set rate limit headers
      setRateLimitHeaders(res, result);

      if (!result.allowed) {
        // Handle rate limit exceeded
        const errorResponse = {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: result.queuePosition 
              ? `Request queued. Position: ${result.queuePosition}`
              : 'Rate limit exceeded. Please try again later.',
            details: {
              limit: result.limit,
              remaining: result.remaining,
              resetTime: result.resetTime,
              retryAfter: result.retryAfter,
              queuePosition: result.queuePosition,
            },
          },
        };

        if (result.queuePosition) {
          // Request is queued
          return res.status(202).json(errorResponse);
        } else {
          // Request is rejected
          return res.status(429).json(errorResponse);
        }
      }

      // Request is allowed, continue
      next();
    } catch (error) {
      logger.error('User rate limiter error:', error);
      // Fail open - continue with request if rate limiting fails
      next();
    }
  };
};

/**
 * Endpoint-specific rate limiter
 */
export const endpointRateLimiter = (customLimits?: {
  requests: number;
  windowMs: number;
  burstCapacity?: number;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return next();
      }

      const service = await initializeUserRateLimitService();
      const userId = req.user.id;
      const endpoint = getEndpointPattern(req.path);
      const method = req.method;

      // Use custom limits if provided, otherwise use tier-based limits
      let result: RateLimitResult;
      
      if (customLimits) {
        // Create a custom rule for this endpoint
        const customRule = {
          requests: customLimits.requests,
          windowMs: customLimits.windowMs,
          burstCapacity: customLimits.burstCapacity || Math.ceil(customLimits.requests * 0.2),
          burstWindowMs: 60 * 1000, // 1 minute burst window
        };
        
        // We would need to extend the service to accept custom rules
        // For now, fall back to tier-based limits
        const userTier = await getUserTier(userId);
        result = await service.checkRateLimit(userId, endpoint, method, userTier);
      } else {
        const userTier = await getUserTier(userId);
        result = await service.checkRateLimit(userId, endpoint, method, userTier);
      }

      setRateLimitHeaders(res, result);

      if (!result.allowed) {
        const errorResponse = {
          success: false,
          error: {
            code: 'ENDPOINT_RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded for ${method} ${endpoint}`,
            details: {
              limit: result.limit,
              remaining: result.remaining,
              resetTime: result.resetTime,
              retryAfter: result.retryAfter,
            },
          },
        };

        return res.status(429).json(errorResponse);
      }

      next();
    } catch (error) {
      logger.error('Endpoint rate limiter error:', error);
      next();
    }
  };
};

/**
 * Admin middleware to check rate limit status
 */
export const rateLimitStatus = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await initializeUserRateLimitService();
      const userId = req.params.userId || req.user?.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
          },
        });
      }

      const status = await service.getRateLimitStatus(userId);
      
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Rate limit status error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get rate limit status',
        },
      });
    }
  };
};

/**
 * Admin middleware to reset user rate limits
 */
export const resetRateLimits = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await initializeUserRateLimitService();
      const userId = req.params.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
          },
        });
      }

      await service.resetUserRateLimits(userId);
      
      res.json({
        success: true,
        message: `Rate limits reset for user ${userId}`,
      });
    } catch (error) {
      logger.error('Reset rate limits error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reset rate limits',
        },
      });
    }
  };
};

/**
 * Admin middleware to update user tier
 */
export const updateUserTier = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await initializeUserRateLimitService();
      const userId = req.params.userId;
      const { tier } = req.body;

      if (!userId || !tier) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'User ID and tier are required',
          },
        });
      }

      if (!Object.values(UserTier).includes(tier)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIER',
            message: 'Invalid user tier',
          },
        });
      }

      await service.updateUserTier(userId, tier);
      
      res.json({
        success: true,
        message: `User ${userId} tier updated to ${tier}`,
      });
    } catch (error) {
      logger.error('Update user tier error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update user tier',
        },
      });
    }
  };
};

// Helper functions

/**
 * Get endpoint pattern for rate limiting (normalize dynamic routes)
 */
function getEndpointPattern(path: string): string {
  // Normalize common patterns
  return path
    .replace(/\/[a-f0-9-]{36}/g, '/:id') // UUIDs
    .replace(/\/[a-f0-9]{64}/g, '/:hash') // Hashes
    .replace(/\/\d+/g, '/:id') // Numeric IDs
    .replace(/\/v\d+/, '') // Remove version prefix for pattern matching
    || '/';
}

/**
 * Get user tier from database
 */
async function getUserTier(userId: string): Promise<UserTier> {
  try {
    const user = await prisma.user.findUnique({
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
 * Set rate limit headers in response
 */
function setRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.set({
    [RATE_LIMIT_HEADERS.LIMIT]: result.limit.toString(),
    [RATE_LIMIT_HEADERS.REMAINING]: result.remaining.toString(),
    [RATE_LIMIT_HEADERS.RESET]: Math.ceil(result.resetTime / 1000).toString(),
    [RATE_LIMIT_HEADERS.BURST_LIMIT]: result.burstLimit.toString(),
    [RATE_LIMIT_HEADERS.BURST_REMAINING]: result.burstRemaining.toString(),
    [RATE_LIMIT_HEADERS.BURST_RESET]: Math.ceil(result.burstResetTime / 1000).toString(),
  });

  if (result.retryAfter) {
    res.set(RATE_LIMIT_HEADERS.RETRY_AFTER, result.retryAfter.toString());
  }
}
