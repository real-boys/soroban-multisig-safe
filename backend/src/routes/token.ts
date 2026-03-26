import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { TokenController } from '@/controllers/TokenController';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';

const router = Router();
const tokenController = new TokenController();

// All token routes require authentication
router.use(authMiddleware);

// Get token balances for a wallet
router.get(
  '/balances/:walletAddress',
  [
    param('walletAddress')
      .isEthereumAddress()
      .withMessage('Invalid wallet address'),
  ],
  validateRequest,
  tokenController.getTokenBalances.bind(tokenController)
);

// Get token prices
router.get(
  '/prices',
  [
    query('symbols')
      .optional()
      .isString()
      .withMessage('Symbols must be a string'),
  ],
  validateRequest,
  tokenController.getTokenPrices.bind(tokenController)
);

// Get portfolio value
router.get(
  '/portfolio/:walletAddress',
  [
    param('walletAddress')
      .isEthereumAddress()
      .withMessage('Invalid wallet address'),
  ],
  validateRequest,
  tokenController.getPortfolioValue.bind(tokenController)
);

// Discover custom tokens
router.get(
  '/discover/:walletAddress',
  [
    param('walletAddress')
      .isEthereumAddress()
      .withMessage('Invalid wallet address'),
  ],
  validateRequest,
  tokenController.discoverCustomTokens.bind(tokenController)
);

// Get transaction history
router.get(
  '/transactions/:walletAddress',
  [
    param('walletAddress')
      .isEthereumAddress()
      .withMessage('Invalid wallet address'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('type')
      .optional()
      .isString()
      .withMessage('Type must be a string'),
  ],
  validateRequest,
  tokenController.getTransactionHistory.bind(tokenController)
);

export default router;
