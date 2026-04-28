import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { rateLimiter, userRateLimiter } from '@/middleware/rateLimiter';
import { authMiddleware } from '@/middleware/auth';
import { apiVersioning, CURRENT_VERSION } from '@/middleware/apiVersioning';
import { connectDatabase, prisma } from '@/config/database';
import { connectRedis } from '@/config/redis';

// Routes
import authRoutes from '@/routes/auth';
import walletRoutes from '@/routes/wallet';
import transactionRoutes from '@/routes/transaction';
import userRoutes from '@/routes/user';
import recoveryRoutes from '@/routes/recovery';
import analyticsRoutes from '@/routes/analytics';
import healthRoutes from '@/routes/health';
import tokenRoutes from '@/routes/token';
import eventIndexerRoutes from '@/routes/eventIndexer';
import taskRoutes from '@/routes/tasks';

// Socket handlers
import { setupSocketHandlers } from '@/services/socketService';
import { CronService } from '@/services/CronService';
import { EventIndexerService } from '@/services/EventIndexerService';
import { RPCLoadBalancer } from '@/services/RPCLoadBalancer';
import { IndexerHealthChecker } from '@/services/IndexerHealthChecker';
import { SyncLagAlertService } from '@/services/SyncLagAlertService';
import { DatabaseBackupService } from '@/services/DatabaseBackupService';
import { ResourceMonitor } from '@/services/ResourceMonitor';
import { deadLetterQueueService } from '@/services/DeadLetterQueueService';
import { circuitBreakerMonitorService } from '@/services/CircuitBreakerMonitorService';
import { RateLimitQueueService } from '@/services/RateLimitQueueService';

// Task Management Services
import { taskSchedulerService } from '@/services/TaskSchedulerService';
import { distributedExecutionService } from '@/services/DistributedExecutionService';
import { taskFailureHandlerService } from '@/services/TaskFailureHandlerService';
import { taskMonitoringService } from '@/services/TaskMonitoringService';
import { taskHandlerIntegration } from '@/services/TaskHandlerIntegration';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 5001;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply IP-based rate limiting first (fallback for unauthenticated requests)
app.use(rateLimiter);

// Apply API versioning middleware to all /api routes
app.use('/api', apiVersioning);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/user', userRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/events', eventIndexerRoutes);
app.use('/api/tasks', taskRoutes);

// Socket.io setup
setupSocketHandlers(io);

// Initialize services
const cronService = new CronService();
cronService.start();

const eventIndexerService = new EventIndexerService();
eventIndexerService.start();

// Initialize RPC Load Balancer with multiple providers
const rpcProviders = (process.env.STELLAR_RPC_URLS || process.env.STELLAR_RPC_URL || '').split(',').filter(Boolean);
const rpcLoadBalancer = new RPCLoadBalancer(rpcProviders);
rpcLoadBalancer.start();
logger.info(`RPC Load Balancer initialized with ${rpcProviders.length} provider(s)`);

// Initialize Indexer Health Checker
const indexerHealthChecker = new IndexerHealthChecker();
indexerHealthChecker.start();
logger.info('Indexer Health Checker initialized');

// Initialize Sync Lag Alert Service
const syncLagAlertService = new SyncLagAlertService({
  syncLagWarning: Number(process.env.SYNC_LAG_WARNING) || 100,
  syncLagCritical: Number(process.env.SYNC_LAG_CRITICAL) || 500,
  checkInterval: Number(process.env.SYNC_LAG_CHECK_INTERVAL) || 60000,
  notificationChannels: (process.env.ALERT_CHANNELS || 'webhook').split(','),
});
syncLagAlertService.start();
logger.info('Sync Lag Alert Service initialized');

// Initialize Database Backup Service
const databaseBackupService = new DatabaseBackupService({
  backupDir: process.env.BACKUP_DIR,
  walArchiveDir: process.env.WAL_ARCHIVE_DIR,
  retentionDays: Number(process.env.BACKUP_RETENTION_DAYS) || 7,
  webhookUrl: process.env.BACKUP_WEBHOOK_URL,
});
// Start automated backups every 6 hours
const backupIntervalMinutes = Number(process.env.BACKUP_INTERVAL_MINUTES) || 360;
databaseBackupService.start(backupIntervalMinutes);
logger.info(`Database Backup Service initialized (interval: ${backupIntervalMinutes} minutes)`);

// Initialize Resource Monitor
const resourceMonitor = new ResourceMonitor(Number(process.env.RESOURCE_CHECK_INTERVAL) || 60000);
resourceMonitor.start();
logger.info('Resource Monitor initialized');


// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected successfully');

    // Initialize Task Management Services
    logger.info('Initializing Task Management Services...');
    await distributedExecutionService.start();
    await taskSchedulerService.start();
    await taskMonitoringService.start();
    taskFailureHandlerService.startDeadLetterProcessor();
    
    // Migrate existing cron jobs and register handlers
    await taskHandlerIntegration.migrateExistingCronJobs();
    logger.info('Task Management Services initialized');

    // Start server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  // Stop all services
  logger.info('Stopping services...');
  eventIndexerService.stop();
  rpcLoadBalancer.stop();
  indexerHealthChecker.stop();
  syncLagAlertService.stop();
  databaseBackupService.stop();
  resourceMonitor.stop();
  cronService.stop();
  deadLetterQueueService.stop();
  circuitBreakerMonitorService.stop();
  rateLimitQueueService.stop();
  
  // Close server
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Disconnect from database
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting database:', error);
    }
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();

export { app, io };
