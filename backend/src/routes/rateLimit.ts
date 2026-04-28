import { Router } from 'express';
import { RateLimitController } from '@/controllers/RateLimitController';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { body, param, query } from 'express-validator';
import { UserTier } from '@/config/rateLimitConfig';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';

const router = Router();
const rateLimitController = new RateLimitController();

// Validation schemas
const updateTierValidation = [
  param('userId').isUUID().withMessage('Invalid user ID format'),
  body('tier')
    .isIn(Object.values(UserTier))
    .withMessage(`Tier must be one of: ${Object.values(UserTier).join(', ')}`),
];

const userIdValidation = [
  param('userId').isUUID().withMessage('Invalid user ID format'),
];

const analyticsValidation = [
  query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
];

const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('tier').optional().isIn(Object.values(UserTier)).withMessage('Invalid tier'),
];

// Middleware to check admin permissions
const requireAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  try {
    // Get user tier from database
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { tier: true },
    });

    if (!user || user.tier !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      });
    }

    next();
  } catch (error) {
    logger.error('Error checking admin permissions:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify permissions',
      },
    });
  }
};

/**
 * @route GET /rate-limits/status
 * @desc Get current user's rate limit status
 * @access Private
 */
router.get(
  '/status',
  authMiddleware,
  rateLimitController.getUserRateLimitStatus.bind(rateLimitController)
);

/**
 * @route GET /rate-limits/status/:userId
 * @desc Get specific user's rate limit status (admin only)
 * @access Admin
 */
router.get(
  '/status/:userId',
  authMiddleware,
  requireAdmin,
  userIdValidation,
  validateRequest,
  rateLimitController.getUserRateLimitStatus.bind(rateLimitController)
);

/**
 * @route GET /rate-limits/users
 * @desc Get rate limit status for all users (admin only)
 * @access Admin
 */
router.get(
  '/users',
  authMiddleware,
  requireAdmin,
  paginationValidation,
  validateRequest,
  rateLimitController.getAllUsersRateLimitStatus.bind(rateLimitController)
);

/**
 * @route POST /rate-limits/reset/:userId
 * @desc Reset rate limits for a specific user (admin only)
 * @access Admin
 */
router.post(
  '/reset/:userId',
  authMiddleware,
  requireAdmin,
  userIdValidation,
  validateRequest,
  rateLimitController.resetUserRateLimits.bind(rateLimitController)
);

/**
 * @route PUT /rate-limits/tier/:userId
 * @desc Update user tier (admin only)
 * @access Admin
 */
router.put(
  '/tier/:userId',
  authMiddleware,
  requireAdmin,
  updateTierValidation,
  validateRequest,
  rateLimitController.updateUserTier.bind(rateLimitController)
);

/**
 * @route GET /rate-limits/analytics
 * @desc Get rate limiting analytics (admin only)
 * @access Admin
 */
router.get(
  '/analytics',
  authMiddleware,
  requireAdmin,
  analyticsValidation,
  validateRequest,
  rateLimitController.getRateLimitAnalytics.bind(rateLimitController)
);

/**
 * @route GET /rate-limits/config
 * @desc Get rate limiting configuration (admin only)
 * @access Admin
 */
router.get(
  '/config',
  authMiddleware,
  requireAdmin,
  rateLimitController.getRateLimitConfig.bind(rateLimitController)
);

export default router;