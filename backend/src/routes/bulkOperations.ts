import { Router } from 'express';
import { BulkOperationController } from '@/controllers/BulkOperationController';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '@/middleware/auth';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const bulkOperationController = new BulkOperationController();

// Rate limiting for bulk operations
const bulkRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 bulk requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many bulk operations, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware for bulk wallet operations
const validateBulkCreateWallets = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.name').notEmpty().withMessage('Wallet name is required'),
  body('items.*.owners').isArray({ min: 1 }).withMessage('At least one owner is required'),
  body('items.*.threshold').isInt({ min: 1 }).withMessage('Threshold must be a positive integer'),
  body('items.*.recoveryAddress').notEmpty().withMessage('Recovery address is required'),
  body('items.*.recoveryDelay').isInt({ min: 0 }).withMessage('Recovery delay must be a non-negative integer'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
  body('options.timeoutMs').optional().isInt({ min: 1000 }),
  body('options.validateBeforeExecute').optional().isBoolean(),
];

const validateBulkUpdateWallets = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.id').notEmpty().withMessage('Wallet ID is required'),
  body('items.*.name').optional().notEmpty().withMessage('Wallet name cannot be empty'),
  body('items.*.threshold').optional().isInt({ min: 1 }).withMessage('Threshold must be a positive integer'),
  body('items.*.recoveryAddress').optional().notEmpty().withMessage('Recovery address cannot be empty'),
  body('items.*.recoveryDelay').optional().isInt({ min: 0 }).withMessage('Recovery delay must be a non-negative integer'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
];

const validateBulkDeleteWallets = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.id').notEmpty().withMessage('Wallet ID is required'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
];

// Validation middleware for bulk transaction operations
const validateBulkCreateTransactions = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.walletId').notEmpty().withMessage('Wallet ID is required'),
  body('items.*.destination').notEmpty().withMessage('Destination address is required'),
  body('items.*.amount').isNumeric().withMessage('Amount must be a number'),
  body('items.*.title').notEmpty().withMessage('Title is required'),
  body('items.*.description').notEmpty().withMessage('Description is required'),
  body('items.*.expiresAt').isISO8601().withMessage('Expiry date must be a valid date'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
];

const validateBulkUpdateTransactions = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.id').notEmpty().withMessage('Transaction ID is required'),
  body('items.*.title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('items.*.description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
];

const validateBulkDeleteTransactions = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.id').notEmpty().withMessage('Transaction ID is required'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
];

// Validation middleware for bulk comment operations
const validateBulkCreateComments = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('items.*.content').notEmpty().isLength({ max: 1000 }).withMessage('Content is required and must be less than 1000 characters'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
];

const validateBulkDeleteComments = [
  body('items').isArray({ min: 1, max: 100 }).withMessage('Items must be an array with 1-100 items'),
  body('items.*.id').notEmpty().withMessage('Comment ID is required'),
  body('options.continueOnError').optional().isBoolean(),
  body('options.maxConcurrency').optional().isInt({ min: 1, max: 50 }),
];

// Validation middleware for operation management
const validateOperationId = [
  param('operationId').isUUID().withMessage('Invalid operation ID'),
];

// Wallet bulk operation routes
router.post(
  '/wallets/create',
  authMiddleware,
  bulkRateLimit,
  validateBulkCreateWallets,
  bulkOperationController.bulkCreateWallets.bind(bulkOperationController)
);

router.put(
  '/wallets/update',
  authMiddleware,
  bulkRateLimit,
  validateBulkUpdateWallets,
  bulkOperationController.bulkUpdateWallets.bind(bulkOperationController)
);

router.delete(
  '/wallets/delete',
  authMiddleware,
  bulkRateLimit,
  validateBulkDeleteWallets,
  bulkOperationController.bulkDeleteWallets.bind(bulkOperationController)
);

// Transaction bulk operation routes
router.post(
  '/transactions/create',
  authMiddleware,
  bulkRateLimit,
  validateBulkCreateTransactions,
  bulkOperationController.bulkCreateTransactions.bind(bulkOperationController)
);

router.put(
  '/transactions/update',
  authMiddleware,
  bulkRateLimit,
  validateBulkUpdateTransactions,
  bulkOperationController.bulkUpdateTransactions.bind(bulkOperationController)
);

router.delete(
  '/transactions/delete',
  authMiddleware,
  bulkRateLimit,
  validateBulkDeleteTransactions,
  bulkOperationController.bulkDeleteTransactions.bind(bulkOperationController)
);

// Comment bulk operation routes
router.post(
  '/comments/create',
  authMiddleware,
  bulkRateLimit,
  validateBulkCreateComments,
  bulkOperationController.bulkCreateComments.bind(bulkOperationController)
);

router.delete(
  '/comments/delete',
  authMiddleware,
  bulkRateLimit,
  validateBulkDeleteComments,
  bulkOperationController.bulkDeleteComments.bind(bulkOperationController)
);

// Operation management routes
router.get(
  '/operations/:operationId/progress',
  authMiddleware,
  validateOperationId,
  bulkOperationController.getOperationProgress.bind(bulkOperationController)
);

router.post(
  '/operations/:operationId/cancel',
  authMiddleware,
  validateOperationId,
  bulkOperationController.cancelOperation.bind(bulkOperationController)
);

router.get(
  '/operations/active',
  authMiddleware,
  bulkOperationController.getActiveOperations.bind(bulkOperationController)
);

export default router;
