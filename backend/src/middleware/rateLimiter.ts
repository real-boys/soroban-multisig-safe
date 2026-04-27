import { Request, Response, NextFunction } from 'express';
import { rateLimitService } from '@/services/RateLimitService';
import { RateLimitTier } from '@/types/rateLimiting';
import { logger } from '@/utils/logger';

/**
 * User-based rate limiting middleware with tier support
 * 
 * Features:
 * - Checks authenticated users by user ID
 * - Falls back to IP-based limiting for unauthenticated requests
 * - Supports multiple tiers with different limits
 * - Provides burst capacity handling
 * - Implements graceful degradation
 */
export const userRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Determine identifier (user ID or IP)
    const userId = req.user?.id;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const identifier = userId || ipAddress;
    const isUser = !!userId;

    // Get user's tier
    let tier = RateLimitTier.FREE;
    if (userId) {
      tier = await rateLimitService.getUserTier(userId);
    }

    // Check rate limit
    const result = await rateLimitService.checkRateLimit(identifier, tier, isUser);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Tier', result.info.tier);
    res.setHeader('X-RateLimit-Limit', result.info.limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.info.remaining.toString());
    res.setHeader('X-RateLimit-Reset', result.info.reset.toString());
    res.setHeader('X-RateLimit-Burst-Remaining', result.info.burstRemaining.toString());
    res.setHeader('X-RateLimit-Burst-Reset', result.info.burstReset.toString());

    if (result.degraded) {
      res.setHeader('X-RateLimit-Degraded', 'true');
      res.setHeader('X-RateLimit-Degradation-Message', result.degradationMessage || '');
    }

    if (!result.allowed) {
      if (result.info.retryAfter) {
        res.setHeader('Retry-After', result.info.retryAfter.toString());
      }

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded. Please try again later.',
          tier: result.info.tier,
          limit: result.info.limit,
          remaining: result.info.remaining,
          reset: result.info.reset,
          retryAfter: result.info.retryAfter,
        },
      }) as any;
    }

    // Add rate limit info to request for potential use in handlers
    (req as any).rateLimit = result.info;

    next();
  } catch (error) {
    logger.error('Rate limiter middleware error:', error);
    // Fail open - allow request if rate limiting fails
    next();
  }
};

/**
 * Endpoint-specific rate limiter for sensitive operations
 * Uses stricter limits regardless of tier
 */
export const strictRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const identifier = userId || ipAddress;
    const isUser = !!userId;

    // Use FREE tier limits for strict endpoints (most restrictive)
    const result = await rateLimitService.checkRateLimit(
      identifier,
      RateLimitTier.FREE,
      isUser
    );

    res.setHeader('X-RateLimit-Tier', 'STRICT');
    res.setHeader('X-RateLimit-Limit', result.info.limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.info.remaining.toString());
    res.setHeader('X-RateLimit-Reset', result.info.reset.toString());

    if (!result.allowed) {
      if (result.info.retryAfter) {
        res.setHeader('Retry-After', result.info.retryAfter.toString());
      }

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests to this sensitive endpoint. Please try again later.',
          retryAfter: result.info.retryAfter,
        },
      }) as any;
    }

    next();
  } catch (error) {
    logger.error('Strict rate limiter middleware error:', error);
    next();
  }
};

/**
 * Legacy rate limiter for backward compatibility
 * Kept for gradual migration
 */
export const rateLimiter = userRateLimiter;

/**
 * Signature-specific rate limiter
 * Uses strict limits for signature operations
 */
export const signatureRateLimiter = strictRateLimiter;
