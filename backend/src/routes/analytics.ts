import { Router } from 'express';
import { AnalyticsController } from '@/controllers/AnalyticsController';
import { body, param, query } from 'express-validator';
import { auth } from '@/middleware/auth';

const router = Router();
const analyticsController = new AnalyticsController();

// Middleware to authenticate all routes
router.use(auth);

// Generate audit report
router.post('/reports',
  [
    body('organizationId').notEmpty().withMessage('Organization ID is required'),
    body('startDate').isISO8601().withMessage('Start date must be a valid date'),
    body('endDate').isISO8601().withMessage('End date must be a valid date'),
    body('format').optional().isIn(['json', 'csv', 'pdf']).withMessage('Format must be json, csv, or pdf'),
  ],
  analyticsController.generateAuditReport.bind(analyticsController)
);

// Download report file
router.get('/download/:filename',
  [
    param('filename').notEmpty().withMessage('Filename is required'),
  ],
  analyticsController.downloadReport.bind(analyticsController)
);

// Generate charts
router.post('/charts',
  [
    body('organizationId').notEmpty().withMessage('Organization ID is required'),
    body('startDate').isISO8601().withMessage('Start date must be a valid date'),
    body('endDate').isISO8601().withMessage('End date must be a valid date'),
  ],
  analyticsController.generateCharts.bind(analyticsController)
);

// Verify transaction integrity
router.get('/verify/:transactionId',
  [
    param('transactionId').notEmpty().withMessage('Transaction ID is required'),
  ],
  analyticsController.verifyTransaction.bind(analyticsController)
);

// Get weekly summary
router.get('/weekly/:organizationId',
  [
    param('organizationId').notEmpty().withMessage('Organization ID is required'),
  ],
  analyticsController.getWeeklySummary.bind(analyticsController)
);

// Send weekly summary email
router.post('/weekly/send',
  [
    body('organizationId').notEmpty().withMessage('Organization ID is required'),
  ],
  analyticsController.sendWeeklySummary.bind(analyticsController)
);

// Email audit report
router.post('/email',
  [
    body('organizationId').notEmpty().withMessage('Organization ID is required'),
    body('startDate').isISO8601().withMessage('Start date must be a valid date'),
    body('endDate').isISO8601().withMessage('End date must be a valid date'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('format').optional().isIn(['pdf', 'csv']).withMessage('Format must be pdf or csv'),
  ],
  analyticsController.emailAuditReport.bind(analyticsController)
);

// Get analytics dashboard data
router.get('/dashboard/:organizationId',
  [
    param('organizationId').notEmpty().withMessage('Organization ID is required'),
    query('period').optional().isInt({ min: 1, max: 365 }).withMessage('Period must be between 1 and 365 days'),
  ],
  analyticsController.getDashboardData.bind(analyticsController)
);

export default router;
