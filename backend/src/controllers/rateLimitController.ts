import { Request, Response } from 'express';
import { rateLimitService } from '@/services/RateLimitService';
import { RateLimitTier } from '@/types/rateLimiting';
import { RATE_LIMIT_TIERS } from '@/config/rateLimitTiers';
import { logger } from '@/utils/logger';

/**
 * Get current user's rate limit status
 */
export const getRateLimitStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const tier = await rateLimitService.getUserTier(userId);
    const stats = await rateLimitService.getRateLimitStats(userId, true);
    const config = RATE_LIMIT_TIERS[tier];

    res.json({
      success: true,
      data: {
        tier,
        config: {
          requestsPerMinute: config.requestsPerMinute,
          requestsPerHour: config.requestsPerHour,
          requestsPerDay: config.requestsPerDay,
          burstCapacity: config.burstCapacity,
          burstWindowMs: config.burstWindowMs,
        },
        usage: stats ? {
          minuteCount: stats.minuteCount,
          hourCount: stats.hourCount,
          dayCount: stats.dayCount,
          burstCount: stats.burstCount,
          minuteRemaining: config.requestsPerMinute - stats.minuteCount,
          hourRemaining: config.requestsPerHour - stats.hourCount,
          dayRemaining: config.requestsPerDay - stats.dayCount,
          burstRemaining: config.burstCapacity - stats.burstCount,
          minuteReset: stats.minuteReset,
          hourReset: stats.hourReset,
          dayReset: stats.dayReset,
          burstReset: stats.burstReset,
        } : null,
      },
    });
  } catch (error) {
    logger.error('Error getting rate limit status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve rate limit status',
      },
    });
  }
};

/**
 * Get all available rate limit tiers
 */
export const getRateLimitTiers = async (req: Request, res: Response): Promise<void> => {
  try {
    const tiers = Object.values(RateLimitTier).map((tier) => {
      const config = RATE_LIMIT_TIERS[tier];
      return {
        tier,
        requestsPerMinute: config.requestsPerMinute,
        requestsPerHour: config.requestsPerHour,
        requestsPerDay: config.requestsPerDay,
        burstCapacity: config.burstCapacity,
        burstWindowMs: config.burstWindowMs,
      };
    });

    res.json({
      success: true,
      data: { tiers },
    });
  } catch (error) {
    logger.error('Error getting rate limit tiers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve rate limit tiers',
      },
    });
  }
};

/**
 * Update user's rate limit tier (Admin only)
 */
export const updateUserTier = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, tier } = req.body;

    if (!userId || !tier) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'userId and tier are required',
        },
      });
      return;
    }

    if (!Object.values(RateLimitTier).includes(tier)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TIER',
          message: `Invalid tier. Must be one of: ${Object.values(RateLimitTier).join(', ')}`,
        },
      });
      return;
    }

    await rateLimitService.updateUserTier(userId, tier);

    res.json({
      success: true,
      data: {
        message: `Successfully updated user ${userId} to tier ${tier}`,
        userId,
        tier,
      },
    });
  } catch (error) {
    logger.error('Error updating user tier:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update user tier',
      },
    });
  }
};

/**
 * Get rate limit statistics for a specific user (Admin only)
 */
export const getUserRateLimitStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'userId is required',
        },
      });
      return;
    }

    const tier = await rateLimitService.getUserTier(userId);
    const stats = await rateLimitService.getRateLimitStats(userId, true);
    const config = RATE_LIMIT_TIERS[tier];

    res.json({
      success: true,
      data: {
        userId,
        tier,
        config,
        stats,
      },
    });
  } catch (error) {
    logger.error('Error getting user rate limit stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve user rate limit statistics',
      },
    });
  }
};

/**
 * Reset rate limit for a user (Admin only)
 */
export const resetUserRateLimit = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'userId is required',
        },
      });
      return;
    }

    await rateLimitService.resetRateLimit(userId, true);

    res.json({
      success: true,
      data: {
        message: `Successfully reset rate limit for user ${userId}`,
        userId,
      },
    });
  } catch (error) {
    logger.error('Error resetting user rate limit:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset user rate limit',
      },
    });
  }
};

/**
 * Reset rate limit for an IP address (Admin only)
 */
export const resetIpRateLimit = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ipAddress } = req.params;

    if (!ipAddress) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'ipAddress is required',
        },
      });
      return;
    }

    await rateLimitService.resetRateLimit(ipAddress, false);

    res.json({
      success: true,
      data: {
        message: `Successfully reset rate limit for IP ${ipAddress}`,
        ipAddress,
      },
    });
  } catch (error) {
    logger.error('Error resetting IP rate limit:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset IP rate limit',
      },
    });
  }
};
