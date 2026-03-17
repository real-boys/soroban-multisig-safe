import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { WalletController } from '@/controllers/WalletController';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';

const router = Router();
const walletController = new WalletController();

// All wallet routes require authentication
router.use(authMiddleware);

// Create a new multisig wallet
router.post(
  '/',
  [
    body('name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Wallet name must be between 1 and 100 characters'),
    body('owners')
      .isArray({ min: 1, max: 10 })
      .withMessage('Must have between 1 and 10 owners'),
    body('owners.*')
      .isEthereumAddress()
      .withMessage('Each owner must be a valid Stellar address'),
    body('threshold')
      .isInt({ min: 1, max: 10 })
      .withMessage('Threshold must be between 1 and 10'),
    body('recoveryAddress')
      .isEthereumAddress()
      .withMessage('Recovery address must be a valid Stellar address'),
    body('recoveryDelay')
      .isInt({ min: 86400 })
      .withMessage('Recovery delay must be at least 24 hours'),
  ],
  validateRequest,
  walletController.createWallet.bind(walletController)
);

// Get user's wallets
router.get(
  '/',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  validateRequest,
  walletController.getWallets.bind(walletController)
);

// Get specific wallet
router.get(
  '/:walletId',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
  ],
  validateRequest,
  walletController.getWallet.bind(walletController)
);

// Update wallet settings
router.put(
  '/:walletId',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
    body('name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Wallet name must be between 1 and 100 characters'),
  ],
  validateRequest,
  walletController.updateWallet.bind(walletController)
);

// Add owner to wallet
router.post(
  '/:walletId/owners',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
    body('ownerAddress')
      .isEthereumAddress()
      .withMessage('Owner address must be a valid Stellar address'),
  ],
  validateRequest,
  walletController.addOwner.bind(walletController)
);

// Remove owner from wallet
router.delete(
  '/:walletId/owners/:ownerAddress',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
    param('ownerAddress')
      .isEthereumAddress()
      .withMessage('Owner address must be a valid Stellar address'),
  ],
  validateRequest,
  walletController.removeOwner.bind(walletController)
);

// Update threshold
router.put(
  '/:walletId/threshold',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
    body('threshold')
      .isInt({ min: 1, max: 10 })
      .withMessage('Threshold must be between 1 and 10'),
  ],
  validateRequest,
  walletController.updateThreshold.bind(walletController)
);

// Update recovery settings
router.put(
  '/:walletId/recovery',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
    body('recoveryAddress')
      .isEthereumAddress()
      .withMessage('Recovery address must be a valid Stellar address'),
    body('recoveryDelay')
      .isInt({ min: 86400 })
      .withMessage('Recovery delay must be at least 24 hours'),
  ],
  validateRequest,
  walletController.updateRecoverySettings.bind(walletController)
);

// Get wallet balance
router.get(
  '/:walletId/balance',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
  ],
  validateRequest,
  walletController.getBalance.bind(walletController)
);

// Get wallet transaction history
router.get(
  '/:walletId/transactions',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['pending', 'executed', 'expired'])
      .withMessage('Status must be pending, executed, or expired'),
  ],
  validateRequest,
  walletController.getTransactionHistory.bind(walletController)
);

// Export wallet data
router.get(
  '/:walletId/export',
  [
    param('walletId')
      .isUUID()
      .withMessage('Invalid wallet ID'),
    query('format')
      .optional()
      .isIn(['json', 'csv'])
      .withMessage('Format must be json or csv'),
  ],
  validateRequest,
  walletController.exportWalletData.bind(walletController)
);

// Import wallet data
router.post(
  '/import',
  [
    body('walletData')
      .isObject()
      .withMessage('Wallet data must be a valid object'),
    body('format')
      .isIn(['json', 'csv'])
      .withMessage('Format must be json or csv'),
  ],
  validateRequest,
  walletController.importWalletData.bind(walletController)
);

export default router;
