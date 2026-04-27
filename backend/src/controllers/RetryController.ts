import { Request, Response } from 'express';
import { deadLetterQueueService } from '@/services/DeadLetterQueueService';
import { circuitBreakerService } from '@/services/CircuitBreakerService';
import { enhancedRPCService } from '@/services/EnhancedRPCService';
import { logger } from '@/utils/logger';

/**
 * Get Dead Letter Queue statistics
 */
export const getDLQStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await deadLetterQueueService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting DLQ stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve DLQ statistics',
      },
    });
  }
};

/**
 * Get all messages from DLQ with pagination
 */
export const getDLQMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;

    const result = await deadLetterQueueService.getAllMessages(page, pageSize);

    res.json({
      success: true,
      data: {
        messages: result.messages,
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / pageSize),
        },
      },
    });
  } catch (error) {
    logger.error('Error getting DLQ messages:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve DLQ messages',
      },
    });
  }
};

/**
 * Get messages from a specific queue
 */
export const getDLQMessagesByQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { queueName } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const messages = await deadLetterQueueService.getMessagesByQueue(queueName, limit);

    res.json({
      success: true,
      data: {
        queueName,
        messages,
        count: messages.length,
      },
    });
  } catch (error) {
    logger.error('Error getting DLQ messages by queue:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve messages',
      },
    });
  }
};

/**
 * Get a specific message from DLQ
 */
export const getDLQMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;

    const message = await deadLetterQueueService.getMessage(messageId);

    if (!message) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Message not found in DLQ',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    logger.error('Error getting DLQ message:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve message',
      },
    });
  }
};

/**
 * Retry a specific message from DLQ
 */
export const retryDLQMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;

    // Note: In a real implementation, you would need to provide the appropriate
    // retry handler based on the message type/queue
    const success = await deadLetterQueueService.retryMessage(
      messageId,
      async (payload) => {
        // Placeholder retry logic
        logger.info('Retrying message:', payload);
      }
    );

    if (success) {
      res.json({
        success: true,
        data: {
          message: 'Message successfully retried and removed from DLQ',
          messageId,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'RETRY_FAILED',
          message: 'Failed to retry message',
        },
      });
    }
  } catch (error) {
    logger.error('Error retrying DLQ message:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retry message',
      },
    });
  }
};

/**
 * Delete a message from DLQ
 */
export const deleteDLQMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;

    await deadLetterQueueService.removeMessage(messageId);

    res.json({
      success: true,
      data: {
        message: 'Message removed from DLQ',
        messageId,
      },
    });
  } catch (error) {
    logger.error('Error deleting DLQ message:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete message',
      },
    });
  }
};

/**
 * Clear all messages from a specific queue
 */
export const clearDLQQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { queueName } = req.params;

    const count = await deadLetterQueueService.clearQueue(queueName);

    res.json({
      success: true,
      data: {
        message: `Cleared ${count} messages from queue`,
        queueName,
        count,
      },
    });
  } catch (error) {
    logger.error('Error clearing DLQ queue:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to clear queue',
      },
    });
  }
};

/**
 * Get circuit breaker statistics
 */
export const getCircuitBreakerStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = circuitBreakerService.getAllStats();
    
    const statsArray = Array.from(stats.entries()).map(([name, stat]) => ({
      name,
      ...stat,
    }));

    res.json({
      success: true,
      data: {
        circuits: statsArray,
        count: statsArray.length,
      },
    });
  } catch (error) {
    logger.error('Error getting circuit breaker stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve circuit breaker statistics',
      },
    });
  }
};

/**
 * Get specific circuit breaker status
 */
export const getCircuitBreakerStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { circuitName } = req.params;

    const stats = circuitBreakerService.getStats(circuitName);

    if (!stats) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Circuit breaker not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        name: circuitName,
        ...stats,
      },
    });
  } catch (error) {
    logger.error('Error getting circuit breaker status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve circuit breaker status',
      },
    });
  }
};

/**
 * Reset a circuit breaker
 */
export const resetCircuitBreaker = async (req: Request, res: Response): Promise<void> => {
  try {
    const { circuitName } = req.params;

    circuitBreakerService.reset(circuitName);

    res.json({
      success: true,
      data: {
        message: 'Circuit breaker reset successfully',
        circuitName,
      },
    });
  } catch (error) {
    logger.error('Error resetting circuit breaker:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset circuit breaker',
      },
    });
  }
};

/**
 * Get RPC provider statistics
 */
export const getRPCProviderStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = enhancedRPCService.getProviderStats();

    res.json({
      success: true,
      data: {
        providers: stats,
        count: stats.length,
        healthyCount: stats.filter((p) => p.isHealthy).length,
      },
    });
  } catch (error) {
    logger.error('Error getting RPC provider stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve RPC provider statistics',
      },
    });
  }
};

/**
 * Reset all RPC providers
 */
export const resetRPCProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    enhancedRPCService.resetProviders();

    res.json({
      success: true,
      data: {
        message: 'All RPC providers reset successfully',
      },
    });
  } catch (error) {
    logger.error('Error resetting RPC providers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reset RPC providers',
      },
    });
  }
};
