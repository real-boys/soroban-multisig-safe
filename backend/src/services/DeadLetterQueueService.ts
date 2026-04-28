import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { DeadLetterMessage, RetryAttempt } from '@/types/retry';
import { DEAD_LETTER_CONFIG } from '@/config/retryConfig';
import { retryService } from './RetryService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Dead Letter Queue Service
 * 
 * Handles messages that have failed all retry attempts.
 * Provides:
 * - Storage of failed messages
 * - Manual retry capability
 * - Automatic cleanup of old messages
 * - Alerting when threshold is exceeded
 * - Analytics and reporting
 */
export class DeadLetterQueueService {
  private alertThreshold: number;
  private maxRetentionDays: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isCleaningUp: boolean = false;

  constructor() {
    this.alertThreshold = DEAD_LETTER_CONFIG.alertThreshold;
    this.maxRetentionDays = DEAD_LETTER_CONFIG.maxRetentionDays;
  }

  /**
   * Start the DLQ service
   */
  start(): void {
    // Start cleanup job (runs every hour)
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      3600000 // 1 hour
    );
    
    logger.info('Dead Letter Queue service started');
  }

  /**
   * Stop the DLQ service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.info('Dead Letter Queue service stopped');
  }

  /**
   * Add a message to the dead letter queue
   */
  async addMessage<T>(
    originalQueue: string,
    payload: T,
    error: Error,
    retryHistory: RetryAttempt[],
    metadata?: Record<string, any>
  ): Promise<string> {
    const messageId = uuidv4();
    const now = new Date();

    const dlqMessage: DeadLetterMessage<T> = {
      id: messageId,
      originalQueue,
      payload,
      error: error.message || String(error),
      attempts: retryHistory.length,
      firstAttempt: new Date(retryHistory[0]?.timestamp || now.getTime()),
      lastAttempt: new Date(retryHistory[retryHistory.length - 1]?.timestamp || now.getTime()),
      retryHistory,
      metadata,
    };

    try {
      // Store in database (using a generic JSON field)
      await prisma.$executeRaw`
        INSERT INTO dead_letter_queue (
          id, 
          original_queue, 
          payload, 
          error, 
          attempts, 
          first_attempt, 
          last_attempt, 
          retry_history, 
          metadata,
          created_at
        ) VALUES (
          ${messageId},
          ${originalQueue},
          ${JSON.stringify(payload)}::jsonb,
          ${dlqMessage.error},
          ${dlqMessage.attempts},
          ${dlqMessage.firstAttempt},
          ${dlqMessage.lastAttempt},
          ${JSON.stringify(retryHistory)}::jsonb,
          ${JSON.stringify(metadata || {})}::jsonb,
          ${now}
        )
      `;

      logger.warn(
        `Message added to DLQ: ${messageId} from queue "${originalQueue}" ` +
        `after ${dlqMessage.attempts} attempts`
      );

      // Check if we should alert
      await this.checkAlertThreshold();

      return messageId;
    } catch (error) {
      logger.error('Error adding message to DLQ:', error);
      throw error;
    }
  }

  /**
   * Get a message from the DLQ
   */
  async getMessage(messageId: string): Promise<DeadLetterMessage | null> {
    try {
      const result: any = await prisma.$queryRaw`
        SELECT * FROM dead_letter_queue WHERE id = ${messageId}
      `;

      if (!result || result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        id: row.id,
        originalQueue: row.original_queue,
        payload: row.payload,
        error: row.error,
        attempts: row.attempts,
        firstAttempt: row.first_attempt,
        lastAttempt: row.last_attempt,
        retryHistory: row.retry_history,
        metadata: row.metadata,
      };
    } catch (error) {
      logger.error('Error getting message from DLQ:', error);
      return null;
    }
  }

  /**
   * Get all messages from a specific queue
   */
  async getMessagesByQueue(
    queueName: string,
    limit: number = 100
  ): Promise<DeadLetterMessage[]> {
    try {
      const results: any = await prisma.$queryRaw`
        SELECT * FROM dead_letter_queue 
        WHERE original_queue = ${queueName}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return results.map((row: any) => ({
        id: row.id,
        originalQueue: row.original_queue,
        payload: row.payload,
        error: row.error,
        attempts: row.attempts,
        firstAttempt: row.first_attempt,
        lastAttempt: row.last_attempt,
        retryHistory: row.retry_history,
        metadata: row.metadata,
      }));
    } catch (error) {
      logger.error('Error getting messages by queue:', error);
      return [];
    }
  }

  /**
   * Get all messages with pagination
   */
  async getAllMessages(
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ messages: DeadLetterMessage[]; total: number }> {
    try {
      const offset = (page - 1) * pageSize;

      const [messages, countResult]: any = await Promise.all([
        prisma.$queryRaw`
          SELECT * FROM dead_letter_queue 
          ORDER BY created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        prisma.$queryRaw`
          SELECT COUNT(*) as count FROM dead_letter_queue
        `,
      ]);

      return {
        messages: messages.map((row: any) => ({
          id: row.id,
          originalQueue: row.original_queue,
          payload: row.payload,
          error: row.error,
          attempts: row.attempts,
          firstAttempt: row.first_attempt,
          lastAttempt: row.last_attempt,
          retryHistory: row.retry_history,
          metadata: row.metadata,
        })),
        total: parseInt(countResult[0]?.count || '0'),
      };
    } catch (error) {
      logger.error('Error getting all messages:', error);
      return { messages: [], total: 0 };
    }
  }

  /**
   * Retry a message from the DLQ
   */
  async retryMessage(
    messageId: string,
    retryHandler: (payload: any) => Promise<void>
  ): Promise<boolean> {
    const message = await this.getMessage(messageId);
    
    if (!message) {
      logger.warn(`Message ${messageId} not found in DLQ`);
      return false;
    }

    try {
      logger.info(`Retrying message ${messageId} from DLQ`);

      // Attempt to process the message with retry logic
      const result = await retryService.executeWithRetry(
        () => retryHandler(message.payload),
        {
          maxAttempts: DEAD_LETTER_CONFIG.maxRetries,
          initialDelay: DEAD_LETTER_CONFIG.retryDelay,
        }
      );

      // Check if retry was successful
      if (result.success) {
        // If successful, remove from DLQ
        await this.removeMessage(messageId);
        logger.info(`Message ${messageId} successfully retried and removed from DLQ`);
        return true;
      } else {
        // If failed, update retry count
        logger.error(`Failed to retry message ${messageId}:`, result.error);
        await this.updateRetryCount(messageId);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to retry message ${messageId}:`, error);
      
      // Update retry count in metadata
      await this.updateRetryCount(messageId);
      
      return false;
    }
  }

  /**
   * Retry all messages from a specific queue
   */
  async retryQueue(
    queueName: string,
    retryHandler: (payload: any) => Promise<void>
  ): Promise<{ succeeded: number; failed: number }> {
    const messages = await this.getMessagesByQueue(queueName);
    
    let succeeded = 0;
    let failed = 0;

    for (const message of messages) {
      const success = await this.retryMessage(message.id, retryHandler);
      if (success) {
        succeeded++;
      } else {
        failed++;
      }

      // Small delay between retries
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info(
      `Retried ${messages.length} messages from queue "${queueName}": ` +
      `${succeeded} succeeded, ${failed} failed`
    );

    return { succeeded, failed };
  }

  /**
   * Remove a message from the DLQ
   */
  async removeMessage(messageId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        DELETE FROM dead_letter_queue WHERE id = ${messageId}
      `;
      
      logger.info(`Message ${messageId} removed from DLQ`);
    } catch (error) {
      logger.error('Error removing message from DLQ:', error);
      throw error;
    }
  }

  /**
   * Remove all messages from a specific queue
   */
  async clearQueue(queueName: string): Promise<number> {
    try {
      const result: any = await prisma.$executeRaw`
        DELETE FROM dead_letter_queue WHERE original_queue = ${queueName}
      `;
      
      logger.info(`Cleared ${result} messages from queue "${queueName}" in DLQ`);
      return result;
    } catch (error) {
      logger.error('Error clearing queue from DLQ:', error);
      return 0;
    }
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<{
    totalMessages: number;
    messagesByQueue: Record<string, number>;
    oldestMessage: Date | null;
    newestMessage: Date | null;
  }> {
    try {
      const [totalResult, queueStats, oldestResult, newestResult]: any = await Promise.all([
        prisma.$queryRaw`SELECT COUNT(*) as count FROM dead_letter_queue`,
        prisma.$queryRaw`
          SELECT original_queue, COUNT(*) as count 
          FROM dead_letter_queue 
          GROUP BY original_queue
        `,
        prisma.$queryRaw`
          SELECT created_at FROM dead_letter_queue 
          ORDER BY created_at ASC LIMIT 1
        `,
        prisma.$queryRaw`
          SELECT created_at FROM dead_letter_queue 
          ORDER BY created_at DESC LIMIT 1
        `,
      ]);

      const messagesByQueue: Record<string, number> = {};
      for (const row of queueStats) {
        messagesByQueue[row.original_queue] = parseInt(row.count);
      }

      return {
        totalMessages: parseInt(totalResult[0]?.count || '0'),
        messagesByQueue,
        oldestMessage: oldestResult[0]?.created_at || null,
        newestMessage: newestResult[0]?.created_at || null,
      };
    } catch (error) {
      logger.error('Error getting DLQ stats:', error);
      return {
        totalMessages: 0,
        messagesByQueue: {},
        oldestMessage: null,
        newestMessage: null,
      };
    }
  }

  /**
   * Cleanup old messages
   */
  private async cleanup(): Promise<void> {
    // Prevent concurrent cleanup operations
    if (this.isCleaningUp) {
      logger.warn('Cleanup already in progress, skipping');
      return;
    }

    this.isCleaningUp = true;
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.maxRetentionDays);

      const result: any = await prisma.$executeRaw`
        DELETE FROM dead_letter_queue 
        WHERE created_at < ${cutoffDate}
      `;

      if (result > 0) {
        logger.info(`Cleaned up ${result} old messages from DLQ`);
      }
    } catch (error) {
      logger.error('Error cleaning up DLQ:', error);
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Check if alert threshold is exceeded
   */
  private async checkAlertThreshold(): Promise<void> {
    try {
      const stats = await this.getStats();
      
      if (stats.totalMessages >= this.alertThreshold) {
        logger.error(
          `DLQ ALERT: ${stats.totalMessages} messages in dead letter queue ` +
          `(threshold: ${this.alertThreshold})`
        );
        
        // Here you could send alerts via email, Slack, etc.
        // For now, just log
      }
    } catch (error) {
      logger.error('Error checking alert threshold:', error);
    }
  }

  /**
   * Update retry count for a message
   */
  private async updateRetryCount(messageId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE dead_letter_queue 
        SET 
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{dlqRetries}',
            (COALESCE((metadata->>'dlqRetries')::int, 0) + 1)::text::jsonb
          ),
          last_attempt = ${new Date()}
        WHERE id = ${messageId}
      `;
    } catch (error) {
      logger.error('Error updating retry count:', error);
    }
  }
}

export const deadLetterQueueService = new DeadLetterQueueService();
