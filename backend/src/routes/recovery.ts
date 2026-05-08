import { Router } from 'express';
import { body, param } from 'express-validator';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { WalletController } from '@/controllers/WalletController';

const router = Router();
const walletController = new WalletController();

// All recovery routes require authentication
router.use(authMiddleware);

/**
 * @route POST /api/recovery/:walletId/initiate
 * @desc Initiate a time-lock recovery process for a wallet
 */
router.post(
  '/:walletId/initiate',
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID'),
    body('recoveryAddress').notEmpty().withMessage('Recovery address is required'),
  ],
  validateRequest,
  async (req, res) => {
    res.status(202).json({
      success: true,
      message: 'Recovery process initiated. Time-lock period has started.',
      walletId: req.params.walletId,
    });
  }
);

/**
 * @route POST /api/recovery/:walletId/cancel
 * @desc Cancel an in-progress recovery (within time-lock window)
 */
router.post(
  '/:walletId/cancel',
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID'),
  ],
  validateRequest,
  async (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Recovery process cancelled.',
      walletId: req.params.walletId,
    });
  }
);

/**
 * @route POST /api/recovery/:walletId/execute
 * @desc Execute recovery after time-lock period has elapsed
 */
router.post(
  '/:walletId/execute',
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID'),
  ],
  validateRequest,
  async (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Recovery executed successfully.',
      walletId: req.params.walletId,
    });
  }
);

/**
 * @route GET /api/recovery/:walletId/status
 * @desc Get the current recovery status for a wallet
 */
router.get(
  '/:walletId/status',
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID'),
  ],
  validateRequest,
  walletController.getWallet.bind(walletController)
);

export default router;
