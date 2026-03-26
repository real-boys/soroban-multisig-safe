import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { EventIndexerController } from '@/controllers/EventIndexerController';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';

const router = Router();
const eventIndexerController = new EventIndexerController();

// All event indexer routes require authentication
router.use(authMiddleware);

// Get indexer statistics
router.get(
  '/stats',
  eventIndexerController.getIndexerStats.bind(eventIndexerController)
);

// Get events by contract ID
router.get(
  '/contract/:contractId',
  [
    param('contractId')
      .isString()
      .withMessage('Contract ID must be a string'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
  ],
  validateRequest,
  eventIndexerController.getEventsByContract.bind(eventIndexerController)
);

// Get events by address
router.get(
  '/address/:address',
  [
    param('address')
      .isString()
      .withMessage('Address must be a string'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
  ],
  validateRequest,
  eventIndexerController.getEventsByAddress.bind(eventIndexerController)
);

// Trigger backfill (admin only ideally)
router.post(
  '/backfill',
  [
    body('fromLedger')
      .isInt({ min: 1 })
      .withMessage('From ledger must be a positive integer'),
    body('toLedger')
      .isInt({ min: 1 })
      .withMessage('To ledger must be a positive integer'),
  ],
  validateRequest,
  eventIndexerController.triggerBackfill.bind(eventIndexerController)
);

// Handle chain reorg (admin only ideally)
router.post(
  '/reorg',
  [
    body('ledger')
      .isInt({ min: 1 })
      .withMessage('Ledger must be a positive integer'),
  ],
  validateRequest,
  eventIndexerController.handleReorg.bind(eventIndexerController)
);

export default router;
