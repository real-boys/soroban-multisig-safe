import { CronJob } from 'cron';
import { PrismaClient, ScheduledTask, TaskExecution, TaskLog, WorkerNode } from '@prisma/client';
import { logger } from '@/utils/logger';
import { MessageQueueService, MessageJob } from './MessageQueueService';
import { EventEmitter } from 'events';

export interface TaskExecutionContext {
  taskId: string;
  executionId: string;
  jobId: string;
  workerId: string;
  nodeId: string;
  retryCount: number;
}

export interface TaskDefinition {
  id: string;
  name: string;
  description?: string;
  taskType: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  priority: number;
  maxRetries: number;
  timeoutMs: number;
  metadata?: any;
}

export interface TaskResult {
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
  metadata?: any;
}

export type TaskHandler = (context: TaskExecutionContext) => Promise<TaskResult>;

export class TaskSchedulerService extends EventEmitter {
  private prisma: PrismaClient;
  private messageQueue: MessageQueueService;
  private cronJobs = new Map<string, CronJob>();
  private taskHandlers = new Map<string, TaskHandler>();
  private runningExecutions = new Map<string, TaskExecutionContext>();
  private workerNode: WorkerNode | null = null;
  private nodeId: string;
  private isRunning = false;

  constructor() {
    super();
    this.prisma = new PrismaClient();
    this.messageQueue = new MessageQueueService();
    this.nodeId = this.generateNodeId();
    this.initializeWorkerNode();
  }

  private generateNodeId(): string {
    const hostname = require('os').hostname();
    const pid = process.pid;
    const timestamp = Date.now();
    return `${hostname}-${pid}-${timestamp}`;
  }

  private async initializeWorkerNode(): Promise<void> {
    try {
      const os = require('os');
      
      this.workerNode = await this.prisma.workerNode.upsert({
        where: { nodeId: this.nodeId },
        update: {
          hostname: os.hostname(),
          ipAddress: this.getLocalIpAddress(),
          version: process.env.npm_package_version || '1.0.0',
          status: 'ONLINE',
          lastHeartbeat: new Date(),
          maxConcurrency: parseInt(process.env.TASK_MAX_CONCURRENCY || '10'),
        },
        create: {
          nodeId: this.nodeId,
          hostname: os.hostname(),
          ipAddress: this.getLocalIpAddress(),
          version: process.env.npm_package_version || '1.0.0',
          status: 'ONLINE',
          maxConcurrency: parseInt(process.env.TASK_MAX_CONCURRENCY || '10'),
          capabilities: {
            supportedTaskTypes: ['WEEKLY_SUMMARY', 'MONTHLY_AUDIT', 'FILE_CLEANUP', 'CUSTOM'],
            resources: {
              memory: os.totalmem(),
                  cpuCount: os.cpus().length,
            },
          },
        },
      });

      logger.info(`Worker node initialized: ${this.nodeId}`);
    } catch (error) {
      logger.error('Failed to initialize worker node:', error);
      throw error;
    }
  }

  private getLocalIpAddress(): string {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }

  /**
   * Register a task handler for a specific task type
   */
  public registerTaskHandler(taskType: string, handler: TaskHandler): void {
    this.taskHandlers.set(taskType, handler);
    logger.info(`Task handler registered for type: ${taskType}`);
  }

  /**
   * Start the task scheduler service
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Task scheduler is already running');
      return;
    }

    try {
      logger.info('Starting Task Scheduler Service...');
      
      // Load active tasks from database
      await this.loadActiveTasks();
      
      // Setup queue processors
      this.setupQueueProcessors();
      
      // Start heartbeat monitoring
      this.startHeartbeat();
      
      this.isRunning = true;
      logger.info('Task Scheduler Service started successfully');
      this.emit('started');
    } catch (error) {
      logger.error('Failed to start Task Scheduler Service:', error);
      throw error;
    }
  }

  /**
   * Stop the task scheduler service
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping Task Scheduler Service...');
      
      // Stop all cron jobs
      for (const [taskId, job] of this.cronJobs) {
        job.stop();
      }
      this.cronJobs.clear();
      
      // Update worker node status
      if (this.workerNode) {
        await this.prisma.workerNode.update({
          where: { id: this.workerNode.id },
          data: { status: 'OFFLINE' },
        });
      }
      
      // Close message queue connections
      await this.messageQueue.close();
      
      this.isRunning = false;
      logger.info('Task Scheduler Service stopped');
      this.emit('stopped');
    } catch (error) {
      logger.error('Error stopping Task Scheduler Service:', error);
      throw error;
    }
  }

  /**
   * Load active tasks from database and schedule them
   */
  private async loadActiveTasks(): Promise<void> {
    try {
      const tasks = await this.prisma.scheduledTask.findMany({
        where: { isActive: true },
        orderBy: { priority: 'asc' },
      });

      for (const task of tasks) {
        await this.scheduleTask(task);
      }

      logger.info(`Loaded and scheduled ${tasks.length} active tasks`);
    } catch (error) {
      logger.error('Failed to load active tasks:', error);
      throw error;
    }
  }

  /**
   * Schedule a single task
   */
  private async scheduleTask(task: ScheduledTask): Promise<void> {
    try {
      // Calculate next run time
      const nextRun = this.getNextRunTime(task.cronExpression, task.timezone);
      
      // Update task with next run time
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: { nextRunAt: nextRun },
      });

      // Create cron job
      const job = new CronJob(
        task.cronExpression,
        () => this.executeTask(task.id),
        null,
        true,
        task.timezone
      );

      this.cronJobs.set(task.id, job);
      logger.info(`Task scheduled: ${task.name} (${task.id}) - Next run: ${nextRun.toISOString()}`);
    } catch (error) {
      logger.error(`Failed to schedule task ${task.name}:`, error);
      throw error;
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(taskId: string): Promise<void> {
    try {
      const task = await this.prisma.scheduledTask.findUnique({
        where: { id: taskId },
      });

      if (!task || !task.isActive) {
        logger.warn(`Task not found or inactive: ${taskId}`);
        return;
      }

      // Check dependencies
      const canExecute = await this.checkTaskDependencies(taskId);
      if (!canExecute) {
        logger.info(`Task dependencies not met: ${taskId}`);
        return;
      }

      // Create task execution record
      const execution = await this.prisma.taskExecution.create({
        data: {
          taskId: taskId,
          status: 'PENDING',
          nodeId: this.nodeId,
        },
      });

      // Queue task for execution
      await this.queueTaskExecution(task, execution.id);
      
      // Update task statistics
      await this.prisma.scheduledTask.update({
        where: { id: taskId },
        data: {
          lastRunAt: new Date(),
          runCount: { increment: 1 },
          nextRunAt: this.getNextRunTime(task.cronExpression, task.timezone),
        },
      });

      logger.info(`Task queued for execution: ${task.name} (${execution.id})`);
    } catch (error) {
      logger.error(`Failed to execute task ${taskId}:`, error);
    }
  }

  /**
   * Queue task execution using message queue
   */
  private async queueTaskExecution(task: ScheduledTask, executionId: string): Promise<void> {
    const jobData: MessageJob = {
      type: 'TASK_EXECUTION',
      payload: {
        taskId: task.id,
        executionId: executionId,
        taskType: task.taskType,
        timeoutMs: task.timeoutMs,
        maxRetries: task.maxRetries,
        metadata: task.metadata,
      },
      timestamp: Date.now(),
    };

    const priority = 11 - task.priority; // Convert to Bull priority (lower number = higher priority)
    
    await this.messageQueue.publish('tasks', jobData, {
      priority,
      delay: 0,
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  /**
   * Setup queue processors for task execution
   */
  private setupQueueProcessors(): void {
    this.messageQueue.subscribe('tasks', async (job) => {
      await this.processTaskExecution(job);
    }, parseInt(process.env.TASK_MAX_CONCURRENCY || '10'));
  }

  /**
   * Process task execution from queue
   */
  private async processTaskExecution(job: any): Promise<void> {
    const { taskId, executionId, taskType, timeoutMs, metadata } = job.data.payload;
    const context: TaskExecutionContext = {
      taskId,
      executionId,
      jobId: job.id.toString(),
      workerId: this.nodeId,
      nodeId: this.nodeId,
      retryCount: job.attemptsMade,
    };

    try {
      // Update execution status to RUNNING
      await this.prisma.taskExecution.update({
        where: { id: executionId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          jobId: job.id.toString(),
          workerId: this.nodeId,
          nodeId: this.nodeId,
        },
      });

      // Track running execution
      this.runningExecutions.set(executionId, context);

      // Update worker load
      await this.updateWorkerLoad(1);

      // Get task handler
      const handler = this.taskHandlers.get(taskType);
      if (!handler) {
        throw new Error(`No handler registered for task type: ${taskType}`);
      }

      // Execute task with timeout
      const result = await this.executeWithTimeout(
        () => handler(context),
        timeoutMs
      );

      // Update execution with success result
      await this.prisma.taskExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          durationMs: BigInt(Date.now() - new Date(job.timestamp).getTime()),
          result: result.result || null,
        },
      });

      // Update task success count
      await this.prisma.scheduledTask.update({
        where: { id: taskId },
        data: { successCount: { increment: 1 } },
      });

      // Update worker statistics
      await this.prisma.workerNode.update({
        where: { nodeId: this.nodeId },
        data: { totalProcessed: { increment: 1 } },
      });

      logger.info(`Task completed successfully: ${taskId} (${executionId})`);
      this.emit('taskCompleted', { taskId, executionId, result });

    } catch (error) {
      logger.error(`Task execution failed: ${taskId} (${executionId})`, error);

      // Update execution with error
      await this.prisma.taskExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs: BigInt(Date.now() - new Date(job.timestamp).getTime()),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : null,
        },
      });

      // Update task failure count
      await this.prisma.scheduledTask.update({
        where: { id: taskId },
        data: { failureCount: { increment: 1 } },
      });

      // Update worker failure statistics
      await this.prisma.workerNode.update({
        where: { nodeId: this.nodeId },
        data: { totalFailed: { increment: 1 } },
      });

      this.emit('taskFailed', { taskId, executionId, error });

      // Re-throw to let Bull handle retries
      throw error;
    } finally {
      // Clean up tracking
      this.runningExecutions.delete(executionId);
      await this.updateWorkerLoad(-1);
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check if task dependencies are satisfied
   */
  private async checkTaskDependencies(taskId: string): Promise<boolean> {
    try {
      const dependencies = await this.prisma.taskDependency.findMany({
        where: { taskId },
        include: {
          dependsOnTask: {
            include: {
              executions: {
                where: { status: 'COMPLETED' },
                orderBy: { completedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      for (const dep of dependencies) {
        const lastExecution = dep.dependsOnTask.executions[0];
        
        if (!lastExecution) {
          return false; // Dependency never executed
        }

        switch (dep.dependencyType) {
          case 'SUCCESS':
            if (lastExecution.status !== 'COMPLETED') {
              return false;
            }
            break;
          case 'COMPLETION':
            if (!['COMPLETED', 'FAILED'].includes(lastExecution.status)) {
              return false;
            }
            break;
          case 'FAILURE':
            if (lastExecution.status !== 'FAILED') {
              return false;
            }
            break;
        }
      }

      return true;
    } catch (error) {
      logger.error(`Error checking dependencies for task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Get next run time for cron expression
   */
  private getNextRunTime(cronExpression: string, timezone: string): Date {
    const job = new CronJob(cronExpression, () => {}, null, false, timezone);
    const nextRun = job.nextDate();
    return nextRun?.toDate() || new Date();
  }

  /**
   * Update worker node load
   */
  private async updateWorkerLoad(delta: number): Promise<void> {
    if (!this.workerNode) return;

    try {
      const newLoad = Math.max(0, (this.runningExecutions.size || 0) + delta);
      await this.prisma.workerNode.update({
        where: { nodeId: this.nodeId },
        data: { currentLoad: newLoad },
      });
    } catch (error) {
      logger.error('Failed to update worker load:', error);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    setInterval(async () => {
      try {
        if (this.workerNode) {
          await this.prisma.workerNode.update({
            where: { id: this.workerNode.id },
            data: {
              lastHeartbeat: new Date(),
              currentLoad: this.runningExecutions.size,
            },
          });
        }
      } catch (error) {
        logger.error('Heartbeat failed:', error);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Add a new scheduled task
   */
  public async addTask(taskData: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt' | 'runCount' | 'successCount' | 'failureCount'>): Promise<ScheduledTask> {
    try {
      const task = await this.prisma.scheduledTask.create({
        data: {
          ...taskData,
          nextRunAt: this.getNextRunTime(taskData.cronExpression, taskData.timezone),
        },
      });

      if (task.isActive) {
        await this.scheduleTask(task);
      }

      logger.info(`Task added: ${task.name} (${task.id})`);
      this.emit('taskAdded', task);
      return task;
    } catch (error) {
      logger.error('Failed to add task:', error);
      throw error;
    }
  }

  /**
   * Update a scheduled task
   */
  public async updateTask(taskId: string, updates: Partial<ScheduledTask>): Promise<ScheduledTask> {
    try {
      // Stop existing cron job if active
      const existingJob = this.cronJobs.get(taskId);
      if (existingJob) {
        existingJob.stop();
        this.cronJobs.delete(taskId);
      }

      // Update task in database
      const task = await this.prisma.scheduledTask.update({
        where: { id: taskId },
        data: {
          ...updates,
          nextRunAt: updates.cronExpression || updates.timezone 
            ? this.getNextRunTime(
                updates.cronExpression || '',
                updates.timezone || 'UTC'
              )
            : undefined,
        },
      });

      // Reschedule if active
      if (task.isActive) {
        await this.scheduleTask(task);
      }

      logger.info(`Task updated: ${task.name} (${task.id})`);
      this.emit('taskUpdated', task);
      return task;
    } catch (error) {
      logger.error(`Failed to update task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a scheduled task
   */
  public async deleteTask(taskId: string): Promise<void> {
    try {
      // Stop cron job
      const existingJob = this.cronJobs.get(taskId);
      if (existingJob) {
        existingJob.stop();
        this.cronJobs.delete(taskId);
      }

      // Delete from database (cascade will handle executions and logs)
      await this.prisma.scheduledTask.delete({
        where: { id: taskId },
      });

      logger.info(`Task deleted: ${taskId}`);
      this.emit('taskDeleted', { taskId });
    } catch (error) {
      logger.error(`Failed to delete task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get task execution history
   */
  public async getTaskExecutions(taskId: string, limit = 50): Promise<TaskExecution[]> {
    try {
      return await this.prisma.taskExecution.findMany({
        where: { taskId },
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: {
          logs: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });
    } catch (error) {
      logger.error(`Failed to get executions for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get scheduler status and metrics
   */
  public async getStatus(): Promise<any> {
    try {
      const [tasks, executions, workerNodes] = await Promise.all([
        this.prisma.scheduledTask.count({ where: { isActive: true } }),
        this.prisma.taskExecution.count({
          where: { status: 'RUNNING' },
        }),
        this.prisma.workerNode.findMany({
          where: { status: 'ONLINE' },
        }),
      ]);

      return {
        isRunning: this.isRunning,
        nodeId: this.nodeId,
        activeTasks: tasks,
        runningExecutions: executions,
        onlineWorkers: workerNodes.length,
        currentLoad: this.runningExecutions.size,
        maxConcurrency: this.workerNode?.maxConcurrency || 10,
      };
    } catch (error) {
      logger.error('Failed to get scheduler status:', error);
      throw error;
    }
  }

  /**
   * Add log entry for task execution
   */
  public async addTaskLog(
    executionId: string,
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    message: string,
    metadata?: any
  ): Promise<void> {
    try {
      await this.prisma.taskLog.create({
        data: {
          executionId,
          level,
          message,
          metadata,
        },
      });
    } catch (error) {
      logger.error(`Failed to add task log for execution ${executionId}:`, error);
    }
  }
}

export const taskSchedulerService = new TaskSchedulerService();
