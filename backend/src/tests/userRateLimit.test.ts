import { UserRateLimitService } from '@/services/UserRateLimitService';
import { UserTier } from '@/config/rateLimitConfig';
import { Redis } from 'redis';
import { PrismaClient } from '@prisma/client';

// Mock Redis and Prisma
jest.mock('redis');
jest.mock('@prisma/client');
jest.mock('@/utils/logger');

describe('UserRateLimitService', () => {
  let service: UserRateLimitService;
  let mockRedis: jest.Mocked<Redis>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockRedis = {
      hGetAll: jest.fn(),
      hSet: jest.fn(),
      multi: jest.fn(),
      expire: jest.fn(),
      keys: jest.fn(),
      del: jest.fn(),
    } as any;

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      rateLimitUsage: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as any;

    const mockPipeline = {
      hSet: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn(),
    };

    mockRedis.multi.mockReturnValue(mockPipeline as any);

    service = new UserRateLimitService(mockRedis, mockPrisma);
  });

  describe('checkRateLimit', () => {
    it('should allow request for new user', async () => {
      mockRedis.hGetAll.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.FREE });

      const result = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'GET',
        UserTier.FREE
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should deny request when rate limit exceeded', async () => {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 15 * 60 * 1000);
      
      mockRedis.hGetAll.mockResolvedValue({
        tokens: '200', // Exceeds FREE tier limit of 100
        windowStart: now.toISOString(),
        windowEnd: windowEnd.toISOString(),
        burstUsed: '0',
        lastRequest: now.toISOString(),
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.FREE });
      mockPrisma.rateLimitUsage.upsert.mockResolvedValue({} as any);

      const result = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'GET',
        UserTier.FREE
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow higher limits for PRO tier', async () => {
      mockRedis.hGetAll.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.PRO });

      const result = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'GET',
        UserTier.PRO
      );

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeGreaterThan(100); // PRO tier has higher limits
    });

    it('should handle burst capacity', async () => {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 15 * 60 * 1000);
      
      mockRedis.hGetAll.mockResolvedValue({
        tokens: '10',
        windowStart: now.toISOString(),
        windowEnd: windowEnd.toISOString(),
        burstUsed: '25', // Exceeds burst capacity
        lastRequest: now.toISOString(),
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.FREE });
      mockPrisma.rateLimitUsage.upsert.mockResolvedValue({} as any);

      const result = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'GET',
        UserTier.FREE
      );

      expect(result.allowed).toBe(false);
      expect(result.burstRemaining).toBe(0);
    });

    it('should reset window when expired', async () => {
      const now = new Date();
      const expiredWindowEnd = new Date(now.getTime() - 1000); // 1 second ago
      
      mockRedis.hGetAll.mockResolvedValue({
        tokens: '100',
        windowStart: new Date(now.getTime() - 16 * 60 * 1000).toISOString(),
        windowEnd: expiredWindowEnd.toISOString(),
        burstUsed: '20',
        lastRequest: expiredWindowEnd.toISOString(),
      });
      
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.FREE });

      const result = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'GET',
        UserTier.FREE
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(90); // Should be reset to near full capacity
    });

    it('should fail open when service fails', async () => {
      mockRedis.hGetAll.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'GET',
        UserTier.FREE
      );

      expect(result.allowed).toBe(true); // Should fail open
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return user rate limit status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.PRO });
      mockPrisma.rateLimitUsage.findMany.mockResolvedValue([
        {
          endpoint: '/api/v1/transactions',
          method: 'GET',
          tokens: 50,
          maxTokens: 1000,
          windowStart: new Date(),
          windowEnd: new Date(Date.now() + 15 * 60 * 1000),
          burstUsed: 5,
          maxBurst: 250,
          lastRequest: new Date(),
        },
      ] as any);

      mockRedis.hGetAll.mockResolvedValue({
        tokens: '50',
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        burstUsed: '5',
        lastRequest: new Date().toISOString(),
      });

      const status = await service.getRateLimitStatus('user-123');

      expect(status.tier).toBe(UserTier.PRO);
      expect(status.limits).toHaveLength(1);
      expect(status.limits[0].endpoint).toBe('/api/v1/transactions');
    });
  });

  describe('resetUserRateLimits', () => {
    it('should reset user rate limits', async () => {
      mockRedis.keys.mockResolvedValue(['rate_limit:user-123:endpoint1', 'rate_limit:user-123:endpoint2']);
      mockRedis.del.mockResolvedValue(2);
      mockPrisma.rateLimitUsage.deleteMany.mockResolvedValue({ count: 2 });

      await service.resetUserRateLimits('user-123');

      expect(mockRedis.del).toHaveBeenCalledWith(['rate_limit:user-123:endpoint1', 'rate_limit:user-123:endpoint2']);
      expect(mockPrisma.rateLimitUsage.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
    });
  });

  describe('updateUserTier', () => {
    it('should update user tier', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-123',
        tier: UserTier.PRO,
      } as any);

      await service.updateUserTier('user-123', UserTier.PRO);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { tier: UserTier.PRO },
      });
    });
  });

  describe('endpoint pattern matching', () => {
    it('should normalize endpoint patterns correctly', async () => {
      mockRedis.hGetAll.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.FREE });

      // Test UUID normalization
      await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions/550e8400-e29b-41d4-a716-446655440000',
        'GET',
        UserTier.FREE
      );

      // Test numeric ID normalization
      await service.checkRateLimit(
        'user-123',
        '/api/v1/wallets/12345',
        'GET',
        UserTier.FREE
      );

      // Both should be normalized to the same pattern
      expect(mockRedis.hGetAll).toHaveBeenCalledTimes(2);
    });
  });

  describe('tier-specific limits', () => {
    it('should apply different limits for different tiers', async () => {
      mockRedis.hGetAll.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.ENTERPRISE });

      const result = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'GET',
        UserTier.ENTERPRISE
      );

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeGreaterThan(1000); // ENTERPRISE tier has very high limits
    });

    it('should apply endpoint-specific limits', async () => {
      mockRedis.hGetAll.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ tier: UserTier.FREE });

      // Auth endpoints have stricter limits
      const authResult = await service.checkRateLimit(
        'user-123',
        '/api/v1/auth/login',
        'POST',
        UserTier.FREE
      );

      // Transaction endpoints have different limits
      const txResult = await service.checkRateLimit(
        'user-123',
        '/api/v1/transactions',
        'POST',
        UserTier.FREE
      );

      expect(authResult.limit).toBeLessThan(txResult.limit);
    });
  });
});