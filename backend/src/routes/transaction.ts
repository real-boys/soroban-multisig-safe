import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { TransactionController } from '@/controllers/TransactionController';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { signatureRateLimiter } from '@/middleware/rateLimiter';

const router = Router();
const transactionController = new TransactionController();

// All transaction routes require authentication
router.use(authMiddleware);

/**
 * @route POST /api/transactions
 * @desc Submit a new transaction with off-chain metadata
 */
router.post(
  '/',
  [
    body('walletId').isUUID().withMessage('Invalid wallet ID'),
    body('destination').notEmpty().withMessage('Destination is required'),
    body('amount').notEmpty().withMessage('Amount is required'),
    body('title').isLength({ min: 1, max: 200 }).trim().escape().withMessage('Title must be between 1 and 200 characters'),
    body('description').isLength({ max: 5000 }).trim().escape().withMessage('Description cannot exceed 5000 characters'),
    body('data').optional().isString(),
    body('expiresAt').isISO8601().withMessage('Invalid expiration date'),
  ],
  validateRequest,
  transactionController.submitTransaction.bind(transactionController)
);

/**
 * @route PUT /api/transactions/:transactionId/metadata
 * @desc Update metadata for an existing proposal (signers only)
 */
router.put(
  '/:transactionId/metadata',
  [
    param('transactionId').isUUID().withMessage('Invalid transaction ID'),
    body('title').optional().isLength({ min: 1, max: 200 }).trim().escape(),
    body('description').optional().isLength({ max: 5000 }).trim().escape(),
  ],
  validateRequest,
  transactionController.updateMetadata.bind(transactionController)
);

/**
 * @route GET /api/transactions
 * @desc Fast search across proposal titles
 */
router.get(
  '/',
  [
    query('q').optional().isString().trim().escape(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['pending', 'executed', 'expired']),
  ],
  validateRequest,
  transactionController.searchTransactions.bind(transactionController)
);

/**
 * @route GET /api/transactions/:transactionId
 * @desc Get transaction details including metadata and comments
 */
router.get(
  '/:transactionId',
  [
    param('transactionId').isUUID().withMessage('Invalid transaction ID'),
  ],
  validateRequest,
  transactionController.getTransaction.bind(transactionController)
);

/**
 * @route POST /api/transactions/:transactionId/comments
 * @desc Add a comment (signers only)
 */
router.post(
  '/:transactionId/comments',
  [
    param('transactionId').isUUID().withMessage('Invalid transaction ID'),
    body('content').isLength({ min: 1, max: 1000 }).trim().escape().withMessage('Comment must be between 1 and 1000 characters'),
  ],
  validateRequest,
  transactionController.addComment.bind(transactionController)
);

/**
 * @route DELETE /api/transactions/:transactionId
 * @desc Soft-delete functionality for proposals (signers only)
 */
router.delete(
  '/:transactionId',
  [
    param('transactionId').isUUID().withMessage('Invalid transaction ID'),
  ],
  validateRequest,
  transactionController.deleteTransaction.bind(transactionController)
);

/**
 * @route POST /api/transactions/:transactionId/intent-to-sign
 * @desc Record a signature fragment and potentially relay (signers only)
 */
router.post(
  '/:transactionId/intent-to-sign',
  [
    signatureRateLimiter,
    param('transactionId').isUUID().withMessage('Invalid transaction ID'),
    body('signature').optional().isString().withMessage('Signature must be a string'),
  ],
  validateRequest,
  transactionController.intentToSign.bind(transactionController)
);

export default router;
