import { UserRateLimitService } from './UserRateLimitService';
import { logger } from '@/utils/logger';
import { connectRedis } from '@/config/redis';
import { prisma } from '@/config/database';

export class RateLimitQueueService {
  private userRateLimitService: UserRateLimitService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly processInterval: number = 1000; // Process queue every second

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    const redis = await connectRedis();
    this.userRateLimitService = new UserRateLimitService(redis, prisma);
  }

  /**
   * Start the queue processing service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Rate limit queue service is already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(async () => {
      try {
        await this.processQueues();
      } catch (error) {
        logger.error('Error processing rate limit queues:', error);
      }
    }, this.processInterval);

    logger.info('Rate limit queue service started');
  }

  /**
   * Stop the queue processing service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Rate limit queue service stopped');
  }

  /**
   * Process all queued requests
   */
  private async processQueues(): Promise<void> {
    if (!this.userRateLimitService) {
      await this.initializeService();
    }

    await this.userRateLimitService.processQueue();
  }

  /**
   * Get queue service status
   */
  getStatus(): {
    isRunning: boolean;
    processInterval: number;
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      processInterval: this.processInterval,
      uptime: this.isRunning ? Date.now() : 0,
    };
  }
}