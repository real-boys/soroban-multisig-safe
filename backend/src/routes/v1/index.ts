import { Router } from 'express';
import { requireMaximumVersion } from '@/middleware/apiVersioning';

// Import existing route handlers
import authRoutes from '@/routes/auth';
import walletRoutes from '@/routes/wallet';
import transactionRoutes from '@/routes/transaction';
import userRoutes from '@/routes/user';
// import recoveryRoutes from '@/routes/recovery'; // Not implemented yet
import analyticsRoutes from '@/routes/analytics';
import healthRoutes from '@/routes/health';
import tokenRoutes from '@/routes/token';
import eventIndexerRoutes from '@/routes/eventIndexer';

const router = Router();

// Apply maximum version constraint to ensure v1 routes only work with v1
router.use(requireMaximumVersion('v1'));

// Mount all existing routes under v1
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
