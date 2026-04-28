import { Request, Response } from 'express';
import { UserRateLimitService } from '@/services/UserRateLimitService';
import { UserTier } from '@/config/rateLimitConfig';
import { logger } from '@/utils/logger';
import { connectRedis } from '@/config/redis';
import { prisma } from '@/config/database';

export class RateLimitController {
  private userRateLimitService: UserRateLimitService;

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    if (!this.userRateLimitService) {
      const redis = await connectRedis();
      this.userRateLimitService = new UserRateLimitService(redis, prisma);
    }
  }

  /**
   * Get rate limit status for a user
   */
  async getUserRateLimitStatus(req: Request, res: Response): Promise<void> {
    try {
      await this.initializeService();
      
      const userId = req.params.userId || req.user?.id;
      
      if (!userId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
          },
        });
        return;
      }

      const status = await this.userRateLimitService.getRateLimitStatus(userId);
      
      res.json({
        success: true,
        data: {
          userId,
          tier: status.tier,
          limits: status.limits.map(limit => ({
            endpoint: limit.endpoint,
            method: limit.method,
            current: {
              tokens: limit.usage.tokens,
              maxTokens: limit.usage.maxTokens,
              remaining: Math.max(0, limit.usage.maxTokens - limit.usage.tokens),
              windowStart: limit.usage.windowStart,
              windowEnd: limit.usage.windowEnd,
              burstUsed: limit.usage.burstUsed,
              maxBurst: limit.usage.maxBurst,
              burstRemaining: Math.max(0, limit.usage.maxBurst - limit.usage.burstUsed),
              lastRequest: limit.usage.lastRequest,
            },
            limits: {
              requests: limit.rule.requests,
              windowMs: limit.rule.windowMs,
              burstCapacity: limit.rule.burstCapacity,
              burstWindowMs: limit.rule.burstWindowMs,
            },
            utilization: {
              percentage: Math.round((limit.usage.tokens / limit.usage.maxTokens) * 100),
              burstPercentage: Math.round((limit.usage.burstUsed / limit.usage.maxBurst) * 100),
            },
          })),
          summary: {
            totalEndpoints: status.limits.length,
            highUtilization: status.limits.filter(l => 
              (l.usage.tokens / l.usage.maxTokens) > 0.8
            ).length,
            nearBurstLimit: status.limits.filter(l => 
              (l.usage.burstUsed / l.usage.maxBurst) > 0.8
            ).length,
          },
        },
      });
    } catch (error) {
      logger.error('Get user rate limit status error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get rate limit status',
        },
      });
    }
  }

  /**
   * Get rate limit status for all users (admin only)
   */
  async getAllUsersRateLimitStatus(req: Request, res: Response): Promise<void> {
    try {
      await this.initializeService();
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const tier = req.query.tier as UserTier;
      
      const skip = (page - 1) * limit;
      
      // Get users with optional tier filter
      const whereClause = tier ? { tier } : {};
      
      const [users, totalUsers] = await Promise.all([
        prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            email: true,
            stellarAddress: true,
            tier: true,
            createdAt: true,
            rateLimitUsage: {
              select: {
                endpoint: true,
                method: true,
                tokens: true,
                maxTokens: true,
                burstUsed: true,
                maxBurst: true,
                lastRequest: true,
              },
              orderBy: { lastRequest: 'desc' },
              take: 5, // Top 5 most recent endpoints per user
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where: whereClause }),
      ]);

      const usersWithStatus = users.map(user => ({
        id: user.id,
        email: user.email,
        stellarAddress: user.stellarAddress,
        tier: user.tier,
        createdAt: user.createdAt,
        rateLimitSummary: {
          activeEndpoints: user.rateLimitUsage.length,
          totalRequests: user.rateLimitUsage.reduce((sum, usage) => sum + usage.tokens, 0),
          highUtilization: user.rateLimitUsage.filter(usage => 
            (usage.tokens / usage.maxTokens) > 0.8
          ).length,
          lastActivity: user.rateLimitUsage.length > 0 
            ? user.rateLimitUsage[0].lastRequest 
            : null,
        },
        recentEndpoints: user.rateLimitUsage.map(usage => ({
          endpoint: usage.endpoint,
          method: usage.method,
          utilization: Math.round((usage.tokens / usage.maxTokens) * 100),
          burstUtilization: Math.round((usage.burstUsed / usage.maxBurst) * 100),
          lastRequest: usage.lastRequest,
        })),
      }));

      res.json({
        success: true,
        data: {
          users: usersWithStatus,
          pagination: {
            page,
            limit,
            total: totalUsers,
            pages: Math.ceil(totalUsers / limit),
          },
          summary: {
            totalUsers,
            tierDistribution: await this.getTierDistribution(),
            activeUsers: users.filter(u => u.rateLimitUsage.length > 0).length,
          },
        },
      });
    } catch (error) {
      logger.error('Get all users rate limit status error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get users rate limit status',
        },
      });
    }
  }

  /**
   * Reset rate limits for a user (admin only)
   */
  async resetUserRateLimits(req: Request, res: Response): Promise<void> {
    try {
      await this.initializeService();
      
      const userId = req.params.userId;
      
      if (!userId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
          },
        });
        return;
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, tier: true },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
        return;
      }

      await this.userRateLimitService.resetUserRateLimits(userId);
      
      // Log the action
      logger.info(`Rate limits reset for user ${userId} by admin ${req.user?.id}`);
      
      res.json({
        success: true,
        message: `Rate limits reset for user ${user.email}`,
        data: {
          userId: user.id,
          email: user.email,
          tier: user.tier,
          resetAt: new Date().toISOString(),
          resetBy: req.user?.id,
        },
      });
    } catch (error) {
      logger.error('Reset user rate limits error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reset rate limits',
        },
      });
    }
  }

  /**
   * Update user tier (admin only)
   */
  async updateUserTier(req: Request, res: Response): Promise<void> {
    try {
      await this.initializeService();
      
      const userId = req.params.userId;
      const { tier } = req.body;
      
      if (!userId || !tier) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'User ID and tier are required',
          },
        });
        return;
      }

      if (!Object.values(UserTier).includes(tier)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIER',
            message: `Invalid user tier. Valid tiers: ${Object.values(UserTier).join(', ')}`,
          },
        });
        return;
      }

      // Verify user exists and get current tier
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, tier: true },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
        return;
      }

      const oldTier = user.tier;
      await this.userRateLimitService.updateUserTier(userId, tier);
      
      // Log the action
      logger.info(`User ${userId} tier updated from ${oldTier} to ${tier} by admin ${req.user?.id}`);
      
      res.json({
        success: true,
        message: `User tier updated successfully`,
        data: {
          userId: user.id,
          email: user.email,
          oldTier,
          newTier: tier,
          updatedAt: new Date().toISOString(),
          updatedBy: req.user?.id,
        },
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
  }

  /**
   * Get rate limiting analytics (admin only)
   */
  async getRateLimitAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      
      const endDate = req.query.endDate 
        ? new Date(req.query.endDate as string)
        : new Date();

      // Get rate limit usage analytics
      const [
        totalRequests,
        uniqueUsers,
        topEndpoints,
        tierUsage,
        timeSeriesData,
      ] = await Promise.all([
        // Total requests in period
        prisma.rateLimitUsage.aggregate({
          where: {
            lastRequest: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: { tokens: true },
        }),
        
        // Unique users
        prisma.rateLimitUsage.findMany({
          where: {
            lastRequest: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
        
        // Top endpoints by usage
        prisma.rateLimitUsage.groupBy({
          by: ['endpoint', 'method'],
          where: {
            lastRequest: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: { tokens: true },
          _count: { userId: true },
          orderBy: { _sum: { tokens: 'desc' } },
          take: 10,
        }),
        
        // Usage by tier
        prisma.user.groupBy({
          by: ['tier'],
          _count: { id: true },
        }),
        
        // Time series data (daily aggregation)
        this.getTimeSeriesData(startDate, endDate),
      ]);

      res.json({
        success: true,
        data: {
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
          summary: {
            totalRequests: totalRequests._sum.tokens || 0,
            uniqueUsers: uniqueUsers.length,
            averageRequestsPerUser: uniqueUsers.length > 0 
              ? Math.round((totalRequests._sum.tokens || 0) / uniqueUsers.length)
              : 0,
          },
          topEndpoints: topEndpoints.map(endpoint => ({
            endpoint: endpoint.endpoint,
            method: endpoint.method,
            totalRequests: endpoint._sum.tokens || 0,
            uniqueUsers: endpoint._count.userId,
          })),
          tierDistribution: tierUsage.map(tier => ({
            tier: tier.tier,
            userCount: tier._count.id,
          })),
          timeSeriesData,
        },
      });
    } catch (error) {
      logger.error('Get rate limit analytics error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get rate limit analytics',
        },
      });
    }
  }

  /**
   * Get rate limit configuration (admin only)
   */
  async getRateLimitConfig(req: Request, res: Response): Promise<void> {
    try {
      const { RATE_LIMIT_CONFIG, GRACEFUL_DEGRADATION_CONFIG } = await import('@/config/rateLimitConfig');
      
      res.json({
        success: true,
        data: {
          tierConfigs: RATE_LIMIT_CONFIG,
          gracefulDegradation: GRACEFUL_DEGRADATION_CONFIG,
          availableTiers: Object.values(UserTier),
        },
      });
    } catch (error) {
      logger.error('Get rate limit config error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get rate limit configuration',
        },
      });
    }
  }

  // Helper methods

  private async getTierDistribution(): Promise<Array<{ tier: string; count: number }>> {
    const distribution = await prisma.user.groupBy({
      by: ['tier'],
      _count: { id: true },
    });
    
    return distribution.map(item => ({
      tier: item.tier || 'FREE',
      count: item._count.id,
    }));
  }

  private async getTimeSeriesData(startDate: Date, endDate: Date): Promise<Array<{
    date: string;
    requests: number;
    users: number;
  }>> {
    // This is a simplified version - in production, you might want to use a more efficient query
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const timeSeriesData = [];
    
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const [requests, users] = await Promise.all([
        prisma.rateLimitUsage.aggregate({
          where: {
            lastRequest: {
              gte: dayStart,
              lt: dayEnd,
            },
          },
          _sum: { tokens: true },
        }),
        prisma.rateLimitUsage.findMany({
          where: {
            lastRequest: {
              gte: dayStart,
              lt: dayEnd,
            },
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);
      
      timeSeriesData.push({
        date: dayStart.toISOString().split('T')[0],
        requests: requests._sum.tokens || 0,
        users: users.length,
      });
    }
    
    return timeSeriesData;
  }
}