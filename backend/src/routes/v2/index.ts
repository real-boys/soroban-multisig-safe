import { Router } from 'express';
import { requireMinimumVersion } from '@/middleware/apiVersioning';

// Import existing route handlers (we'll create v2-specific versions later)
import authRoutes from '@/routes/auth';
import walletRoutes from '@/routes/wallet';
import transactionRoutes from '@/routes/transaction';
import userRoutes from '@/routes/user';
// import recoveryRoutes from '@/routes/recovery'; // Not implemented yet
import analyticsRoutes from '@/routes/analytics';
import healthRoutes from './health';
import tokenRoutes from '@/routes/token';
import eventIndexerRoutes from '@/routes/eventIndexer';

const router = Router();

// Apply minimum version constraint to ensure v2 routes only work with v2+
router.use(requireMinimumVersion('v2'));

// Mount all existing routes under v2
// Note: These will be enhanced with v2-specific features later
router.use('/auth', authRoutes);
router.use('/wallets', walletRoutes);
router.use('/transactions', transactionRoutes);
router.use('/user', userRoutes);
// router.use('/recovery', recoveryRoutes); // Not implemented yet
router.use('/analytics', analyticsRoutes);
router.use('/health', healthRoutes);
router.use('/token', tokenRoutes);
router.use('/events', eventIndexerRoutes);

export default router;
