import Bull, { Queue, Job, JobOptions } from 'bull';
import { logger } from '@/utils/logger';

export type QueueName = 'transactions' | 'notifications' | 'events' | 'tasks' | 'tasks-high-priority' | 'tasks-low-priority' | 'dead-letter-tasks';

export interface MessageJob<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
}

const DEAD_LETTER_QUEUE = 'dead-letter';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const defaultJobOptions: JobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: false,
};

export class MessageQueueService {
  private queues = new Map<string, Queue>();

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queue = new Bull(name, REDIS_URL);
      queue.on('failed', (job: Job, err: Error) => {
        logger.error(`Job ${job.id} in queue "${name}" failed: ${err.message}`);
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
          this.sendToDeadLetter(name, job).catch((e: Error) =>
            logger.error('Dead letter enqueue error:', e)
          );
        }
      });
      queue.on('completed', (job: Job) =>
        logger.info(`Job ${job.id} in queue "${name}" completed`)
      );
      this.queues.set(name, queue);
    }
    return this.queues.get(name)!;
  }

  private async sendToDeadLetter(originQueue: string, job: Job): Promise<void> {
    const dlq = this.getQueue(DEAD_LETTER_QUEUE);
    await dlq.add({ originQueue, jobId: job.id, data: job.data, failedReason: job.failedReason });
    logger.warn(`Job ${job.id} from "${originQueue}" moved to dead-letter queue`);
  }

  /**
   * Publish a message to a named queue.
   */
  async publish<T>(
    queueName: QueueName,
    message: MessageJob<T>,
    options: JobOptions = {}
  ): Promise<Job<MessageJob<T>>> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(message, { ...defaultJobOptions, ...options });
    logger.info(`Published job ${job.id} to queue "${queueName}" (type: ${message.type})`);
    return job;
  }

  /**
   * Register a processor for a named queue.
   */
  subscribe<T>(
    queueName: QueueName,
    processor: (job: Job<MessageJob<T>>) => Promise<void>,
    concurrency = 1
  ): void {
    const queue = this.getQueue(queueName);
    queue.process(concurrency, processor);
    logger.info(`Subscribed processor to queue "${queueName}" (concurrency: ${concurrency})`);
  }

  /**
   * Get queue metrics for monitoring.
   */
  async getMetrics(queueName: QueueName) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { queueName, waiting, active, completed, failed, delayed };
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    logger.info('All message queues closed');
  }
}

export const messageQueueService = new MessageQueueService();
