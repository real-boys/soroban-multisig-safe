import { RateLimitService } from '@/services/RateLimitService';
import { RateLimitTier } from '@/types/rateLimiting';
import { redisClient } from '@/config/redis';
import { prisma } from '@/config/database';

// Mock dependencies
jest.mock('@/config/redis');
jest.mock('@/config/database');
jest.mock('@/utils/logger');

describe('RateLimitService', () => {
  let rateLimitService: RateLimitService;
  const mockUserId = 'test-user-123';
  const mockIpAddress = '192.168.1.1';

  beforeEach(() => {
    rateLimitService = new RateLimitService();
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow first request for new user', async () => {
      // Mock Redis to return null (no existing data)
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.allowed).toBe(true);
      expect(result.info.tier).toBe(RateLimitTier.FREE);
      expect(result.info.remaining).toBeGreaterThan(0);
      expect(result.degraded).toBe(false);
    });

    it('should block request when minute limit exceeded', async () => {
      // Mock existing data at limit
      const existingData = {
        userId: mockUserId,
        tier: RateLimitTier.FREE,
        minuteCount: 10, // At FREE tier limit
        hourCount: 50,
        dayCount: 100,
        burstCount: 5,
        minuteReset: Date.now() + 30000,
        hourReset: Date.now() + 1800000,
        dayReset: Date.now() + 43200000,
        burstReset: Date.now() + 5000,
        violations: 0,
      };

      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));
      (redisClient.incr as jest.Mock).mockResolvedValue(1);
      (redisClient.expire as jest.Mock).mockResolvedValue(1);

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.allowed).toBe(false);
      expect(result.info.remaining).toBe(0);
      expect(result.info.retryAfter).toBeGreaterThan(0);
    });

    it('should block request when burst capacity exceeded', async () => {
      const existingData = {
        userId: mockUserId,
        tier: RateLimitTier.FREE,
        minuteCount: 5,
        hourCount: 50,
        dayCount: 100,
        burstCount: 20, // At FREE tier burst limit
        minuteReset: Date.now() + 30000,
        hourReset: Date.now() + 1800000,
        dayReset: Date.now() + 43200000,
        burstReset: Date.now() + 5000,
        violations: 0,
      };

      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));
      (redisClient.incr as jest.Mock).mockResolvedValue(1);
      (redisClient.expire as jest.Mock).mockResolvedValue(1);

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.allowed).toBe(false);
      expect(result.info.burstRemaining).toBe(0);
    });

    it('should apply graceful degradation at 80% usage', async () => {
      const existingData = {
        userId: mockUserId,
        tier: RateLimitTier.FREE,
        minuteCount: 8, // 80% of 10
        hourCount: 50,
        dayCount: 100,
        burstCount: 5,
        minuteReset: Date.now() + 30000,
        hourReset: Date.now() + 1800000,
        dayReset: Date.now() + 43200000,
        burstReset: Date.now() + 5000,
        violations: 0,
      };

      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.allowed).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.degradationMessage).toContain('80%');
    });

    it('should reset counters after time window expires', async () => {
      const existingData = {
        userId: mockUserId,
        tier: RateLimitTier.FREE,
        minuteCount: 10,
        hourCount: 50,
        dayCount: 100,
        burstCount: 20,
        minuteReset: Date.now() - 1000, // Expired
        hourReset: Date.now() + 1800000,
        dayReset: Date.now() + 43200000,
        burstReset: Date.now() - 1000, // Expired
        violations: 0,
      };

      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.allowed).toBe(true);
      expect(result.info.remaining).toBeGreaterThan(0);
    });

    it('should handle banned users', async () => {
      (redisClient.get as jest.Mock)
        .mockResolvedValueOnce('banned') // Ban check
        .mockResolvedValueOnce(null); // Rate limit data

      (redisClient.ttl as jest.Mock).mockResolvedValue(300);

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.allowed).toBe(false);
      expect(result.info.retryAfter).toBe(300);
    });

    it('should fail open on error', async () => {
      (redisClient.get as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('getUserTier', () => {
    it('should return cached tier if available', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(RateLimitTier.PREMIUM);

      const tier = await rateLimitService.getUserTier(mockUserId);

      expect(tier).toBe(RateLimitTier.PREMIUM);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database if not cached', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        rateLimitTier: RateLimitTier.BASIC,
      });

      const tier = await rateLimitService.getUserTier(mockUserId);

      expect(tier).toBe(RateLimitTier.BASIC);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId },
        select: { rateLimitTier: true },
      });
      expect(redisClient.setEx).toHaveBeenCalled();
    });

    it('should return default tier on error', async () => {
      (redisClient.get as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const tier = await rateLimitService.getUserTier(mockUserId);

      expect(tier).toBe(RateLimitTier.FREE);
    });
  });

  describe('updateUserTier', () => {
    it('should update database and cache', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      await rateLimitService.updateUserTier(mockUserId, RateLimitTier.PREMIUM);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { rateLimitTier: RateLimitTier.PREMIUM },
      });
      expect(redisClient.setEx).toHaveBeenCalled();
      expect(redisClient.del).toHaveBeenCalled();
    });
  });

  describe('resetRateLimit', () => {
    it('should clear all rate limit data for user', async () => {
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      await rateLimitService.resetRateLimit(mockUserId, true);

      expect(redisClient.del).toHaveBeenCalledTimes(3); // Data, violations, ban
    });

    it('should clear all rate limit data for IP', async () => {
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      await rateLimitService.resetRateLimit(mockIpAddress, false);

      expect(redisClient.del).toHaveBeenCalledTimes(3);
    });
  });

  describe('Tier-specific limits', () => {
    it('should apply FREE tier limits correctly', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.FREE,
        true
      );

      expect(result.info.limit).toBe(10); // FREE tier: 10 req/min
    });

    it('should apply PREMIUM tier limits correctly', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.PREMIUM,
        true
      );

      expect(result.info.limit).toBe(100); // PREMIUM tier: 100 req/min
    });

    it('should apply ENTERPRISE tier limits correctly', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

      const result = await rateLimitService.checkRateLimit(
        mockUserId,
        RateLimitTier.ENTERPRISE,
        true
      );

      expect(result.info.limit).toBe(500); // ENTERPRISE tier: 500 req/min
    });
  });

  describe('Violation tracking', () => {
    it('should record violations when limit exceeded', async () => {
      const existingData = {
        userId: mockUserId,
        tier: RateLimitTier.FREE,
        minuteCount: 10,
        hourCount: 50,
        dayCount: 100,
        burstCount: 5,
        minuteReset: Date.now() + 30000,
        hourReset: Date.now() + 1800000,
        dayReset: Date.now() + 43200000,
        burstReset: Date.now() + 5000,
        violations: 0,
      };

      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));
      (redisClient.incr as jest.Mock).mockResolvedValue(1);
      (redisClient.expire as jest.Mock).mockResolvedValue(1);

      await rateLimitService.checkRateLimit(mockUserId, RateLimitTier.FREE, true);

      expect(redisClient.incr).toHaveBeenCalled();
    });

    it('should ban user after max violations', async () => {
      const existingData = {
        userId: mockUserId,
        tier: RateLimitTier.FREE,
        minuteCount: 10,
        hourCount: 50,
        dayCount: 100,
        burstCount: 5,
        minuteReset: Date.now() + 30000,
        hourReset: Date.now() + 1800000,
        dayReset: Date.now() + 43200000,
        burstReset: Date.now() + 5000,
        violations: 0,
      };

      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(existingData));
      (redisClient.incr as jest.Mock).mockResolvedValue(5); // Max violations
      (redisClient.expire as jest.Mock).mockResolvedValue(1);
      (redisClient.setEx as jest.Mock).mockResolvedValue('OK');

      await rateLimitService.checkRateLimit(mockUserId, RateLimitTier.FREE, true);

      expect(redisClient.setEx).toHaveBeenCalledWith(
        expect.stringContaining('ban'),
        expect.any(Number),
        'banned'
      );
    });
  });
});
