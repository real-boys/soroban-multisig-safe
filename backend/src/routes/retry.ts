import { Router } from 'express';
import {
  getDLQStats,
  getDLQMessages,
  getDLQMessagesByQueue,
  getDLQMessage,
  retryDLQMessage,
  deleteDLQMessage,
  clearDLQQueue,
  getCircuitBreakerStats,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  getRPCProviderStats,
  resetRPCProviders,
  getCircuitBreakerHealthReport,
  getCircuitBreakerMetrics,
  getCircuitBreakerAlerts,
  clearCircuitBreakerAlerts,
} from '@/controllers/RetryController';
import { authMiddleware } from '@/middleware/auth';

const router = Router();

/**
 * Dead Letter Queue Routes
 */

// Get DLQ statistics
router.get('/dlq/stats', authMiddleware, getDLQStats);

// Get all DLQ messages with pagination
router.get('/dlq/messages', authMiddleware, getDLQMessages);

// Get messages from a specific queue
router.get('/dlq/queue/:queueName', authMiddleware, getDLQMessagesByQueue);

// Get a specific message
router.get('/dlq/message/:messageId', authMiddleware, getDLQMessage);

// Retry a specific message
router.post('/dlq/message/:messageId/retry', authMiddleware, retryDLQMessage);

// Delete a specific message
router.delete('/dlq/message/:messageId', authMiddleware, deleteDLQMessage);

// Clear all messages from a queue
router.delete('/dlq/queue/:queueName', authMiddleware, clearDLQQueue);

/**
 * Circuit Breaker Routes
 */

// Get all circuit breaker statistics
router.get('/circuit-breaker/stats', authMiddleware, getCircuitBreakerStats);

// Get comprehensive health report
router.get('/circuit-breaker/health', authMiddleware, getCircuitBreakerHealthReport);

// Get metrics for monitoring systems
router.get('/circuit-breaker/metrics', authMiddleware, getCircuitBreakerMetrics);

// Get alert history
router.get('/circuit-breaker/alerts', authMiddleware, getCircuitBreakerAlerts);

// Clear alert history
router.delete('/circuit-breaker/alerts', authMiddleware, clearCircuitBreakerAlerts);

// Get specific circuit breaker status
router.get('/circuit-breaker/:circuitName', authMiddleware, getCircuitBreakerStatus);

// Reset a circuit breaker
router.post('/circuit-breaker/:circuitName/reset', authMiddleware, resetCircuitBreaker);

/**
 * RPC Provider Routes
 */

// Get RPC provider statistics
router.get('/rpc/providers', authMiddleware, getRPCProviderStats);

// Reset all RPC providers
router.post('/rpc/providers/reset', authMiddleware, resetRPCProviders);

export default router;
