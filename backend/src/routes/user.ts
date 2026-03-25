import { Router } from 'express';
import { UserController } from '@/controllers/UserController';
import { authMiddleware } from '@/middleware/auth';
import { body, param } from 'express-validator';
import { validateRequest } from '@/middleware/validation';

const router = Router();
const userController = new UserController();

// All user routes require authentication
router.use(authMiddleware);

/**
 * @route GET /api/user/profile
 * @desc Get authenticated user profile with settings
 */
router.get('/profile', userController.getProfile.bind(userController));

/**
 * @route GET /api/user/discovery
 * @desc Find all safes this user is a signer on
 */
router.get('/discovery', userController.discoverSafes.bind(userController));

/**
 * @route PUT /api/user/preferences
 * @desc Update global notification and theme preferences
 */
router.put(
  '/preferences',
  [
    body('emailNotifications').optional().isBoolean(),
    body('pushNotifications').optional().isBoolean(),
    body('theme').optional().isIn(['dark', 'light', 'system']),
  ],
  validateRequest,
  userController.updatePreferences.bind(userController)
);

/**
 * @route PUT /api/user/wallets/:walletId/settings
 * @desc Update user-specific settings for a single wallet (nickname, favorite)
 */
router.put(
  '/wallets/:walletId/settings',
  [
    param('walletId').isString().notEmpty(),
    body('nickname').optional().isString().trim().escape(),
    body('isFavorite').optional().isBoolean(),
    body('isPinned').optional().isBoolean(),
  ],
  validateRequest,
  userController.updateWalletSettings.bind(userController)
);

/**
 * @route POST /api/user/invitations
 * @desc Invite a user to a safe
 */
router.post(
  '/invitations',
  [
    body('walletId').isUUID().withMessage('Valid wallet ID is required'),
    body('inviteeAddress').isString().notEmpty().withMessage('Invitee address is required'),
  ],
  validateRequest,
  userController.inviteUser.bind(userController)
);

export default router;
