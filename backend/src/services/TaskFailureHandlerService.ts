import { PrismaClient, TaskExecution, ScheduledTask, TaskLog } from '@prisma/client';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';
import { MessageQueueService, MessageJob } from './MessageQueueService';

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
  nonRetryableErrors: string[];
}

export interface FailureContext {
  taskId: string;
  executionId: string;
  error: Error;
  retryCount: number;
  workerId?: string;
}

export interface DeadLetterJob {
  originalJobId: string;
  taskId: string;
  executionId: string;
  error: string;
  errorStack: string;
  retryCount: number;
  failedAt: Date;
  originalPayload: any;
  retryPolicy: RetryPolicy;
}

export class TaskFailureHandlerService extends EventEmitter {
  private prisma: PrismaClient;
  private messageQueue: MessageQueueService;
  private retryPolicies = new Map<string, RetryPolicy>();
  private deadLetterProcessorActive = false;

  constructor() {
    super();
    this.prisma = new PrismaClient();
    this.messageQueue = new MessageQueueService();
    this.initializeDefaultPolicies();
    this.setupDeadLetterProcessor();
  }

  /**
   * Initialize default retry policies for different task types
   */
  private initializeDefaultPolicies(): void {
    // Default policy for most tasks
    this.retryPolicies.set('DEFAULT', {
      maxRetries: 3,
      backoffStrategy: 'exponential',
      baseDelay: 5000, // 5 seconds
      maxDelay: 300000, // 5 minutes
      retryableErrors: [
        'TIMEOUT',
        'NETWORK_ERROR',
        'TEMPORARY_FAILURE',
        'RESOURCE_UNAVAILABLE',
      ],
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'PERMISSION_DENIED',
        'NOT_FOUND',
        'AUTHENTICATION_FAILED',
      ],
    });

    // Aggressive retry policy for critical tasks
    this.retryPolicies.set('CRITICAL', {
      maxRetries: 5,
      backoffStrategy: 'exponential',
      baseDelay: 2000, // 2 seconds
      maxDelay: 600000, // 10 minutes
      retryableErrors: [
        'TIMEOUT',
        'NETWORK_ERROR',
        'TEMPORARY_FAILURE',
        'RESOURCE_UNAVAILABLE',
        'DATABASE_ERROR',
      ],
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'PERMISSION_DENIED',
        'NOT_FOUND',
        'AUTHENTICATION_FAILED',
      ],
    });

    // Conservative policy for external API calls
    this.retryPolicies.set('EXTERNAL_API', {
      maxRetries: 2,
      backoffStrategy: 'linear',
      baseDelay: 10000, // 10 seconds
      maxDelay: 60000, // 1 minute
      retryableErrors: [
        'TIMEOUT',
        'NETWORK_ERROR',
        'RATE_LIMITED',
        'SERVICE_UNAVAILABLE',
      ],
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'PERMISSION_DENIED',
        'NOT_FOUND',
        'AUTHENTICATION_FAILED',
        'INVALID_REQUEST',
      ],
    });
  }

  /**
   * Set custom retry policy for a task type
   */
  public setRetryPolicy(taskType: string, policy: RetryPolicy): void {
    this.retryPolicies.set(taskType, policy);
    logger.info(`Retry policy set for task type: ${taskType}`);
  }

  /**
   * Get retry policy for a task type
   */
  public getRetryPolicy(taskType: string): RetryPolicy {
    return this.retryPolicies.get(taskType) || this.retryPolicies.get('DEFAULT')!;
  }

  /**
   * Handle task failure and determine retry strategy
   */
  public async handleTaskFailure(context: FailureContext): Promise<void> {
    try {
      const task = await this.prisma.scheduledTask.findUnique({
        where: { id: context.taskId },
      });

      if (!task) {
        logger.error(`Task not found for failure handling: ${context.taskId}`);
        return;
      }

      const retryPolicy = this.getRetryPolicy(task.taskType);
      const errorType = this.categorizeError(context.error);

      // Log the failure
      await this.logFailure(context, errorType);

      // Check if error is retryable
      if (!this.isRetryableError(errorType, retryPolicy)) {
        await this.handleNonRetryableFailure(context, task);
        return;
      }

      // Check if max retries exceeded
      if (context.retryCount >= retryPolicy.maxRetries) {
        await this.handleMaxRetriesExceeded(context, task, retryPolicy);
        return;
      }

      // Schedule retry
      await this.scheduleRetry(context, task, retryPolicy);

    } catch (error) {
      logger.error('Error in task failure handler:', error);
      this.emit('error', { context, error });
    }
  }

  /**
   * Categorize error type based on error message and properties
   */
  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Network related errors
    if (message.includes('timeout') || message.includes('etimedout')) {
      return 'TIMEOUT';
    }
    if (message.includes('network') || message.includes('enotfound') || message.includes('econnrefused')) {
      return 'NETWORK_ERROR';
    }

    // Database related errors
    if (message.includes('database') || message.includes('connection') || stack.includes('prisma')) {
      return 'DATABASE_ERROR';
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') || message.includes('schema')) {
      return 'VALIDATION_ERROR';
    }

    // Permission errors
    if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) {
      return 'PERMISSION_DENIED';
    }

    // Authentication errors
    if (message.includes('authentication') || message.includes('unauthenticated')) {
      return 'AUTHENTICATION_FAILED';
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'RATE_LIMITED';
    }

    // Service unavailable
    if (message.includes('service unavailable') || message.includes('503')) {
      return 'SERVICE_UNAVAILABLE';
    }

    // Resource issues
    if (message.includes('memory') || message.includes('disk') || message.includes('resource')) {
      return 'RESOURCE_UNAVAILABLE';
    }

    // Default
    return 'UNKNOWN_ERROR';
  }

  /**
   * Check if error is retryable based on policy
   */
  private isRetryableError(errorType: string, policy: RetryPolicy): boolean {
    if (policy.nonRetryableErrors.includes(errorType)) {
      return false;
    }
    return policy.retryableErrors.includes(errorType) || errorType === 'UNKNOWN_ERROR';
  }

  /**
   * Log failure details
   */
  private async logFailure(context: FailureContext, errorType: string): Promise<void> {
    try {
      await this.prisma.taskLog.create({
        data: {
          executionId: context.executionId,
          level: 'ERROR',
          message: `Task failed: ${context.error.message}`,
          metadata: {
            errorType,
            retryCount: context.retryCount,
            workerId: context.workerId,
            errorStack: context.error.stack,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to log task failure:', error);
    }
  }

  /**
   * Handle non-retryable failures
   */
  private async handleNonRetryableFailure(context: FailureContext, task: ScheduledTask): Promise<void> {
    try {
      // Update execution status
      await this.prisma.taskExecution.update({
        where: { id: context.executionId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: context.error.message,
          errorStack: context.error.stack,
        },
      });

      // Update task failure count
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: { failureCount: { increment: 1 } },
      });

      logger.error(`Non-retryable failure for task ${task.name}: ${context.error.message}`);
      this.emit('nonRetryableFailure', { context, task });
    } catch (error) {
      logger.error('Error handling non-retryable failure:', error);
    }
  }

  /**
   * Handle failures that exceeded max retries
   */
  private async handleMaxRetriesExceeded(
    context: FailureContext, 
    task: ScheduledTask, 
    retryPolicy: RetryPolicy
  ): Promise<void> {
    try {
      // Send to dead letter queue
      const deadLetterJob: DeadLetterJob = {
        originalJobId: context.taskId,
        taskId: task.id,
        executionId: context.executionId,
        error: context.error.message,
        errorStack: context.error.stack || '',
        retryCount: context.retryCount,
        failedAt: new Date(),
        originalPayload: context,
        retryPolicy,
      };

      await this.sendToDeadLetterQueue(deadLetterJob);

      // Update execution status
      await this.prisma.taskExecution.update({
        where: { id: context.executionId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: `Max retries exceeded: ${context.error.message}`,
          errorStack: context.error.stack,
        },
      });

      // Update task failure count
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: { failureCount: { increment: 1 } },
      });

      logger.error(`Max retries exceeded for task ${task.name}: ${context.error.message}`);
      this.emit('maxRetriesExceeded', { context, task, deadLetterJob });
    } catch (error) {
      logger.error('Error handling max retries exceeded:', error);
    }
  }

  /**
   * Schedule task retry
   */
  private async scheduleRetry(
    context: FailureContext, 
    task: ScheduledTask, 
    retryPolicy: RetryPolicy
  ): Promise<void> {
    try {
      const delay = this.calculateRetryDelay(context.retryCount, retryPolicy);
      
      // Create new execution record for retry
      const retryExecution = await this.prisma.taskExecution.create({
        data: {
          taskId: task.id,
          status: 'PENDING',
          nodeId: context.workerId,
          retryCount: context.retryCount + 1,
        },
      });

      // Queue retry job with delay
      const retryJob: MessageJob = {
        type: 'TASK_RETRY',
        payload: {
          taskId: task.id,
          executionId: retryExecution.id,
          originalExecutionId: context.executionId,
          taskType: task.taskType,
          timeoutMs: task.timeoutMs,
          maxRetries: task.maxRetries,
          retryCount: context.retryCount + 1,
          metadata: task.metadata,
        },
        timestamp: Date.now(),
      };

      await this.messageQueue.publish('tasks', retryJob, {
        delay,
        priority: 10 - task.priority, // Higher priority for retries
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: false,
      });

      // Update original execution
      await this.prisma.taskExecution.update({
        where: { id: context.executionId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: context.error.message,
          errorStack: context.error.stack,
        },
      });

      logger.info(`Task retry scheduled for ${task.name} (attempt ${context.retryCount + 1}) in ${delay}ms`);
      this.emit('retryScheduled', { context, task, retryExecution, delay });
    } catch (error) {
      logger.error('Error scheduling retry:', error);
    }
  }

  /**
   * Calculate retry delay based on strategy
   */
  private calculateRetryDelay(retryCount: number, policy: RetryPolicy): number {
    let delay: number;

    switch (policy.backoffStrategy) {
      case 'fixed':
        delay = policy.baseDelay;
        break;
      case 'linear':
        delay = policy.baseDelay * (retryCount + 1);
        break;
      case 'exponential':
        delay = policy.baseDelay * Math.pow(2, retryCount);
        break;
      default:
        delay = policy.baseDelay;
    }

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    delay = delay + jitter;

    // Cap at max delay
    return Math.min(delay, policy.maxDelay);
  }

  /**
   * Send job to dead letter queue
   */
  private async sendToDeadLetterQueue(deadLetterJob: DeadLetterJob): Promise<void> {
    try {
      const messageJob: MessageJob = {
        type: 'DEAD_LETTER_TASK',
        payload: deadLetterJob,
        timestamp: Date.now(),
      };

      await this.messageQueue.publish('dead-letter-tasks', messageJob, {
        priority: 1, // Low priority for dead letter jobs
        removeOnComplete: 100,
        removeOnFail: false,
      });

      logger.info(`Task sent to dead letter queue: ${deadLetterJob.taskId}`);
    } catch (error) {
      logger.error('Failed to send to dead letter queue:', error);
    }
  }

  /**
   * Setup dead letter queue processor
   */
  private setupDeadLetterProcessor(): void {
    this.messageQueue.subscribe('dead-letter-tasks', async (job) => {
      await this.processDeadLetterJob(job);
    }, 1); // Process dead letter jobs sequentially
  }

  /**
   * Process dead letter queue job
   */
  private async processDeadLetterJob(job: any): Promise<void> {
    const deadLetterJob: DeadLetterJob = job.data.payload;

    try {
      logger.info(`Processing dead letter job: ${deadLetterJob.taskId}`);

      // Log dead letter job
      await this.prisma.taskLog.create({
        data: {
          executionId: deadLetterJob.executionId,
          level: 'ERROR',
          message: `Task moved to dead letter queue after ${deadLetterJob.retryCount} retries`,
          metadata: {
            deadLetterJob,
            processedAt: new Date(),
          },
        },
      });

      // Emit event for external handling (e.g., notifications, alerts)
      this.emit('deadLetterJobProcessed', deadLetterJob);

      // Could implement additional logic here:
      // - Send notifications to administrators
      // - Create manual intervention tickets
      // - Archive job data for analysis

    } catch (error) {
      logger.error('Error processing dead letter job:', error);
    }
  }

  /**
   * Get failure statistics
   */
  public async getFailureStats(timeRange?: { start: Date; end: Date }): Promise<{
    totalFailures: number;
    failuresByTaskType: { [taskType: string]: number };
    failuresByErrorType: { [errorType: string]: number };
    retryRate: number;
    deadLetterCount: number;
  }> {
    try {
      const whereClause = timeRange ? {
        completedAt: { gte: timeRange.start, lte: timeRange.end },
        status: 'FAILED',
      } : {
        status: 'FAILED',
      };

      const [totalFailures, failuresByTaskType, failuresByErrorType] = await Promise.all([
        this.prisma.taskExecution.count({ where: whereClause }),
        
        this.prisma.taskExecution.groupBy({
          by: ['task'],
          where: whereClause,
          _count: true,
        }),
        
        this.prisma.taskLog.groupBy({
          by: ['level'],
          where: {
            level: 'ERROR',
            timestamp: timeRange ? { gte: timeRange.start, lte: timeRange.end } : undefined,
          },
          _count: true,
        }),
      ]);

      const retryRate = totalFailures > 0 ? 
        (failuresByTaskType.reduce((sum, group) => sum + group._count, 0) - totalFailures) / totalFailures 
        : 0;

      return {
        totalFailures,
        failuresByTaskType: failuresByTaskType.reduce((acc, group) => {
          acc[group.task.taskType] = group._count;
          return acc;
        }, {} as { [taskType: string]: number }),
        failuresByErrorType: failuresByErrorType.reduce((acc, group) => {
          acc[group.level] = group._count;
          return acc;
        }, {} as { [errorType: string]: number }),
        retryRate,
        deadLetterCount: await this.messageQueue.getMetrics('dead-letter-tasks').then(m => m.waiting),
      };
    } catch (error) {
      logger.error('Failed to get failure stats:', error);
      throw error;
    }
  }

  /**
   * Retry dead letter job manually
   */
  public async retryDeadLetterJob(deadLetterJob: DeadLetterJob): Promise<void> {
    try {
      // Create new execution
      const retryExecution = await this.prisma.taskExecution.create({
        data: {
          taskId: deadLetterJob.taskId,
          status: 'PENDING',
          retryCount: 0, // Reset retry count for manual retry
        },
      });

      // Queue for immediate execution
      const retryJob: MessageJob = {
        type: 'TASK_RETRY',
        payload: {
          taskId: deadLetterJob.taskId,
          executionId: retryExecution.id,
          originalExecutionId: deadLetterJob.executionId,
          taskType: 'CUSTOM', // Will be determined from task
          timeoutMs: deadLetterJob.retryPolicy.maxDelay,
          maxRetries: deadLetterJob.retryPolicy.maxRetries,
          retryCount: 0,
          metadata: deadLetterJob.originalPayload,
        },
        timestamp: Date.now(),
      };

      await this.messageQueue.publish('tasks', retryJob, {
        priority: 1, // High priority for manual retries
        delay: 0,
        removeOnComplete: 50,
        removeOnFail: false,
      });

      logger.info(`Dead letter job manually retried: ${deadLetterJob.taskId}`);
      this.emit('deadLetterJobRetried', { deadLetterJob, retryExecution });
    } catch (error) {
      logger.error('Failed to retry dead letter job:', error);
      throw error;
    }
  }

  /**
   * Get dead letter jobs
   */
  public async getDeadLetterJobs(limit = 50): Promise<DeadLetterJob[]> {
    try {
      // This would typically query the dead letter queue directly
      // For now, we'll return a placeholder implementation
      const metrics = await this.messageQueue.getMetrics('dead-letter-tasks');
      logger.info(`Dead letter queue has ${metrics.waiting} jobs`);
      
      // In a real implementation, you would fetch actual job data from the queue
      return [];
    } catch (error) {
      logger.error('Failed to get dead letter jobs:', error);
      return [];
    }
  }

  /**
   * Start dead letter processor
   */
  public startDeadLetterProcessor(): void {
    if (!this.deadLetterProcessorActive) {
      this.deadLetterProcessorActive = true;
      logger.info('Dead letter processor started');
    }
  }

  /**
   * Stop dead letter processor
   */
  public stopDeadLetterProcessor(): void {
    if (this.deadLetterProcessorActive) {
      this.deadLetterProcessorActive = false;
      logger.info('Dead letter processor stopped');
    }
  }
}

export const taskFailureHandlerService = new TaskFailureHandlerService();
