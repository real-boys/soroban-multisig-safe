import { Router } from 'express';
import {
  getRateLimitStatus,
  getRateLimitTiers,
  updateUserTier,
  getUserRateLimitStats,
  resetUserRateLimit,
  resetIpRateLimit,
} from '@/controllers/rateLimitController';
import { authMiddleware } from '@/middleware/auth';

const router = Router();

/**
 * Public routes
 */

// Get available rate limit tiers
router.get('/tiers', getRateLimitTiers);

/**
 * Authenticated user routes
 */

// Get current user's rate limit status
router.get('/status', authMiddleware, getRateLimitStatus);

/**
 * Admin routes
 * Note: Add admin authorization middleware in production
 */

// Update user's rate limit tier
router.put('/admin/user/tier', authMiddleware, updateUserTier);

// Get user's rate limit statistics
router.get('/admin/user/:userId/stats', authMiddleware, getUserRateLimitStats);

// Reset user's rate limit
router.post('/admin/user/:userId/reset', authMiddleware, resetUserRateLimit);

// Reset IP's rate limit
router.post('/admin/ip/:ipAddress/reset', authMiddleware, resetIpRateLimit);

export default router;
