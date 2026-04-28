import { PrismaClient, ScheduledTask, TaskExecution, TaskLog, WorkerNode } from '@prisma/client';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';

export interface TaskMetrics {
  taskId: string;
  taskName: string;
  taskType: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
  nextExecutionTime?: Date;
  successRate: number;
  failureRate: number;
}

export interface WorkerMetrics {
  nodeId: string;
  hostname: string;
  status: string;
  currentLoad: number;
  maxConcurrency: number;
  totalProcessed: bigint;
  totalFailed: bigint;
  successRate: number;
  averageExecutionTime: number;
  lastHeartbeat: Date;
  uptime: number;
}

export interface SystemMetrics {
  totalTasks: number;
  activeTasks: number;
  runningExecutions: number;
  queuedExecutions: number;
  completedExecutions24h: number;
  failedExecutions24h: number;
  averageExecutionTime24h: number;
  systemLoad: number;
  availableWorkers: number;
  deadLetterQueueSize: number;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  threshold: number;
  timeWindow: number; // in minutes
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isActive: boolean;
  notificationChannels: string[];
  lastTriggered?: Date;
}

export interface TaskAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  details: any;
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export class TaskMonitoringService extends EventEmitter {
  private prisma: PrismaClient;
  private alertRules = new Map<string, AlertRule>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.prisma = new PrismaClient();
    this.initializeDefaultAlertRules();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'HIGH_FAILURE_RATE',
        name: 'High Task Failure Rate',
        description: 'Alert when task failure rate exceeds threshold',
        condition: 'FAILURE_RATE',
        threshold: 20, // 20%
        timeWindow: 60, // 1 hour
        severity: 'HIGH',
        isActive: true,
        notificationChannels: ['email', 'webhook'],
      },
      {
        id: 'LONG_EXECUTION_TIME',
        name: 'Long Execution Time',
        description: 'Alert when tasks take too long to execute',
        condition: 'EXECUTION_TIME',
        threshold: 300000, // 5 minutes
        timeWindow: 30, // 30 minutes
        severity: 'MEDIUM',
        isActive: true,
        notificationChannels: ['email'],
      },
      {
        id: 'WORKER_OVERLOAD',
        name: 'Worker Overload',
        description: 'Alert when workers are overloaded',
        condition: 'WORKER_LOAD',
        threshold: 80, // 80%
        timeWindow: 15, // 15 minutes
        severity: 'HIGH',
        isActive: true,
        notificationChannels: ['webhook'],
      },
      {
        id: 'DEAD_LETTER_QUEUE_SIZE',
        name: 'Dead Letter Queue Size',
        description: 'Alert when dead letter queue grows too large',
        condition: 'DEAD_LETTER_SIZE',
        threshold: 100, // 100 jobs
        timeWindow: 5, // 5 minutes
        severity: 'CRITICAL',
        isActive: true,
        notificationChannels: ['email', 'webhook', 'slack'],
      },
      {
        id: 'TASK_NOT_RUNNING',
        name: 'Task Not Running',
        description: 'Alert when scheduled tasks miss their execution window',
        condition: 'MISSED_EXECUTION',
        threshold: 1, // 1 missed execution
        timeWindow: 120, // 2 hours
        severity: 'MEDIUM',
        isActive: true,
        notificationChannels: ['email'],
      },
    ];

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
    });

    logger.info(`Initialized ${defaultRules.length} default alert rules`);
  }

  /**
   * Start the monitoring service
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Task monitoring service is already running');
      return;
    }

    try {
      logger.info('Starting Task Monitoring Service...');
      
      // Start periodic monitoring
      this.startPeriodicMonitoring();
      
      this.isRunning = true;
      logger.info('Task Monitoring Service started successfully');
      this.emit('started');
    } catch (error) {
      logger.error('Failed to start Task Monitoring Service:', error);
      throw error;
    }
  }

  /**
   * Stop the monitoring service
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      logger.info('Stopping Task Monitoring Service...');
      
      // Stop periodic monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
      
      this.isRunning = false;
      logger.info('Task Monitoring Service stopped');
      this.emit('stopped');
    } catch (error) {
      logger.error('Error stopping Task Monitoring Service:', error);
      throw error;
    }
  }

  /**
   * Start periodic monitoring
   */
  private startPeriodicMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 60000); // Check every minute
  }

  /**
   * Perform health checks and alert evaluations
   */
  private async performHealthChecks(): Promise<void> {
    try {
      const systemMetrics = await this.getSystemMetrics();
      const taskMetrics = await this.getAllTaskMetrics();
      const workerMetrics = await this.getAllWorkerMetrics();

      // Evaluate alert rules
      for (const [ruleId, rule] of this.alertRules) {
        if (rule.isActive) {
          await this.evaluateAlertRule(rule, systemMetrics, taskMetrics, workerMetrics);
        }
      }

      // Emit metrics update event
      this.emit('metricsUpdate', { systemMetrics, taskMetrics, workerMetrics });
    } catch (error) {
      logger.error('Error during health checks:', error);
    }
  }

  /**
   * Evaluate an alert rule
   */
  private async evaluateAlertRule(
    rule: AlertRule,
    systemMetrics: SystemMetrics,
    taskMetrics: TaskMetrics[],
    workerMetrics: WorkerMetrics[]
  ): Promise<void> {
    try {
      let shouldAlert = false;
      let details: any = {};

      switch (rule.condition) {
        case 'FAILURE_RATE':
          const overallFailureRate = systemMetrics.failedExecutions24h / Math.max(systemMetrics.completedExecutions24h, 1) * 100;
          shouldAlert = overallFailureRate > rule.threshold;
          details = { failureRate: overallFailureRate, threshold: rule.threshold };
          break;

        case 'EXECUTION_TIME':
          const longRunningTasks = taskMetrics.filter(task => task.averageExecutionTime > rule.threshold);
          shouldAlert = longRunningTasks.length > 0;
          details = { longRunningTasks, threshold: rule.threshold };
          break;

        case 'WORKER_LOAD':
          const overloadedWorkers = workerMetrics.filter(worker => {
            const loadPercentage = (worker.currentLoad / worker.maxConcurrency) * 100;
            return loadPercentage > rule.threshold;
          });
          shouldAlert = overloadedWorkers.length > 0;
          details = { overloadedWorkers, threshold: rule.threshold };
          break;

        case 'DEAD_LETTER_SIZE':
          shouldAlert = systemMetrics.deadLetterQueueSize > rule.threshold;
          details = { queueSize: systemMetrics.deadLetterQueueSize, threshold: rule.threshold };
          break;

        case 'MISSED_EXECUTION':
          const now = new Date();
          const windowStart = new Date(now.getTime() - rule.timeWindow * 60 * 1000);
          
          const missedExecutions = await this.prisma.scheduledTask.findMany({
            where: {
              isActive: true,
              nextRunAt: { lt: windowStart },
              OR: [
                { lastRunAt: { lt: windowStart } },
                { lastRunAt: null },
              ],
            },
          });

          shouldAlert = missedExecutions.length >= rule.threshold;
          details = { missedExecutions: missedExecutions.length, tasks: missedExecutions };
          break;
      }

      if (shouldAlert) {
        await this.triggerAlert(rule, details);
      }
    } catch (error) {
      logger.error(`Error evaluating alert rule ${rule.id}:`, error);
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, details: any): Promise<void> {
    try {
      // Check if alert was recently triggered (avoid spam)
      if (rule.lastTriggered && (Date.now() - rule.lastTriggered.getTime()) < 5 * 60 * 1000) {
        return; // Already triggered within last 5 minutes
      }

      const alert: TaskAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message: `${rule.name}: ${this.formatAlertMessage(rule, details)}`,
        details,
        triggeredAt: new Date(),
        acknowledged: false,
      };

      // Store alert (in a real implementation, you'd save to database)
      logger.warn(`ALERT: ${alert.message}`, { details });

      // Update rule last triggered time
      rule.lastTriggered = new Date();

      // Send notifications
      await this.sendNotifications(alert, rule.notificationChannels);

      // Emit alert event
      this.emit('alertTriggered', alert);
    } catch (error) {
      logger.error('Error triggering alert:', error);
    }
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(rule: AlertRule, details: any): string {
    switch (rule.condition) {
      case 'FAILURE_RATE':
        return `Failure rate is ${details.failureRate.toFixed(2)}% (threshold: ${details.threshold}%)`;
      case 'EXECUTION_TIME':
        return `${details.longRunningTasks.length} tasks exceeding ${details.threshold}ms execution time`;
      case 'WORKER_LOAD':
        return `${details.overloadedWorkers.length} workers overloaded (threshold: ${details.threshold}%)`;
      case 'DEAD_LETTER_SIZE':
        return `Dead letter queue has ${details.queueSize} jobs (threshold: ${details.threshold})`;
      case 'MISSED_EXECUTION':
        return `${details.missedExecutions} tasks missed execution window`;
      default:
        return 'Threshold exceeded';
    }
  }

  /**
   * Send notifications for alert
   */
  private async sendNotifications(alert: TaskAlert, channels: string[]): Promise<void> {
    try {
      for (const channel of channels) {
        switch (channel) {
          case 'email':
            await this.sendEmailNotification(alert);
            break;
          case 'webhook':
            await this.sendWebhookNotification(alert);
            break;
          case 'slack':
            await this.sendSlackNotification(alert);
            break;
          default:
            logger.warn(`Unknown notification channel: ${channel}`);
        }
      }
    } catch (error) {
      logger.error('Error sending notifications:', error);
    }
  }

  /**
   * Send email notification (placeholder implementation)
   */
  private async sendEmailNotification(alert: TaskAlert): Promise<void> {
    // In a real implementation, you would integrate with an email service
    logger.info(`Email notification sent for alert: ${alert.ruleName}`);
  }

  /**
   * Send webhook notification (placeholder implementation)
   */
  private async sendWebhookNotification(alert: TaskAlert): Promise<void> {
    // In a real implementation, you would send HTTP request to webhook URL
    logger.info(`Webhook notification sent for alert: ${alert.ruleName}`);
  }

  /**
   * Send Slack notification (placeholder implementation)
   */
  private async sendSlackNotification(alert: TaskAlert): Promise<void> {
    // In a real implementation, you would integrate with Slack API
    logger.info(`Slack notification sent for alert: ${alert.ruleName}`);
  }

  /**
   * Get system-wide metrics
   */
  public async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        totalTasks,
        activeTasks,
        runningExecutions,
        completedExecutions24h,
        failedExecutions24h,
        availableWorkers,
      ] = await Promise.all([
        this.prisma.scheduledTask.count(),
        this.prisma.scheduledTask.count({ where: { isActive: true } }),
        this.prisma.taskExecution.count({ where: { status: 'RUNNING' } }),
        this.prisma.taskExecution.count({
          where: {
            status: 'COMPLETED',
            completedAt: { gte: yesterday },
          },
        }),
        this.prisma.taskExecution.count({
          where: {
            status: 'FAILED',
            completedAt: { gte: yesterday },
          },
        }),
        this.prisma.workerNode.count({ where: { status: 'ONLINE' } }),
      ]);

      // Calculate average execution time for last 24 hours
      const executionsWithTime = await this.prisma.taskExecution.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: yesterday },
          durationMs: { not: null },
        },
        select: { durationMs: true },
      });

      const averageExecutionTime24h = executionsWithTime.length > 0
        ? executionsWithTime.reduce((sum, exec) => sum + Number(exec.durationMs), 0) / executionsWithTime.length
        : 0;

      // Get system load (would typically come from system monitoring)
      const systemLoad = process.cpuUsage().user / 1000000; // Simplified

      // Get dead letter queue size (would typically come from queue service)
      const deadLetterQueueSize = 0; // Placeholder

      return {
        totalTasks,
        activeTasks,
        runningExecutions,
        queuedExecutions: 0, // Would come from queue service
        completedExecutions24h,
        failedExecutions24h,
        averageExecutionTime24h,
        systemLoad,
        availableWorkers,
        deadLetterQueueSize,
      };
    } catch (error) {
      logger.error('Failed to get system metrics:', error);
      throw error;
    }
  }

  /**
   * Get metrics for all tasks
   */
  public async getAllTaskMetrics(): Promise<TaskMetrics[]> {
    try {
      const tasks = await this.prisma.scheduledTask.findMany({
        include: {
          executions: {
            orderBy: { startedAt: 'desc' },
            take: 100, // Limit to recent executions
          },
        },
      });

      return tasks.map(task => this.calculateTaskMetrics(task));
    } catch (error) {
      logger.error('Failed to get all task metrics:', error);
      throw error;
    }
  }

  /**
   * Get metrics for a specific task
   */
  public async getTaskMetrics(taskId: string): Promise<TaskMetrics | null> {
    try {
      const task = await this.prisma.scheduledTask.findUnique({
        where: { id: taskId },
        include: {
          executions: {
            orderBy: { startedAt: 'desc' },
            take: 100,
          },
        },
      });

      return task ? this.calculateTaskMetrics(task) : null;
    } catch (error) {
      logger.error(`Failed to get metrics for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate metrics for a task
   */
  private calculateTaskMetrics(task: ScheduledTask & { executions: TaskExecution[] }): TaskMetrics {
    const totalExecutions = task.executions.length;
    const successfulExecutions = task.executions.filter(e => e.status === 'COMPLETED').length;
    const failedExecutions = task.executions.filter(e => e.status === 'FAILED').length;
    
    const completedExecutions = task.executions.filter(e => e.status === 'COMPLETED' && e.durationMs);
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + Number(e.durationMs), 0) / completedExecutions.length
      : 0;

    const lastExecution = task.executions[0];
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;
    const failureRate = totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0;

    return {
      taskId: task.id,
      taskName: task.name,
      taskType: task.taskType,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      lastExecutionTime: lastExecution?.startedAt,
      nextExecutionTime: task.nextRunAt,
      successRate,
      failureRate,
    };
  }

  /**
   * Get metrics for all workers
   */
  public async getAllWorkerMetrics(): Promise<WorkerMetrics[]> {
    try {
      const workers = await this.prisma.workerNode.findMany({
        include: {
          executions: {
            where: { startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            orderBy: { startedAt: 'desc' },
          },
        },
      });

      return workers.map(worker => this.calculateWorkerMetrics(worker));
    } catch (error) {
      logger.error('Failed to get all worker metrics:', error);
      throw error;
    }
  }

  /**
   * Get metrics for a specific worker
   */
  public async getWorkerMetrics(nodeId: string): Promise<WorkerMetrics | null> {
    try {
      const worker = await this.prisma.workerNode.findUnique({
        where: { nodeId },
        include: {
          executions: {
            where: { startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            orderBy: { startedAt: 'desc' },
          },
        },
      });

      return worker ? this.calculateWorkerMetrics(worker) : null;
    } catch (error) {
      logger.error(`Failed to get metrics for worker ${nodeId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate metrics for a worker
   */
  private calculateWorkerMetrics(worker: WorkerNode & { executions: TaskExecution[] }): WorkerMetrics {
    const totalExecutions = worker.executions.length;
    const successfulExecutions = worker.executions.filter(e => e.status === 'COMPLETED').length;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    const completedExecutions = worker.executions.filter(e => e.status === 'COMPLETED' && e.durationMs);
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + Number(e.durationMs), 0) / completedExecutions.length
      : 0;

    const uptime = Date.now() - worker.createdAt.getTime();

    return {
      nodeId: worker.nodeId,
      hostname: worker.hostname,
      status: worker.status,
      currentLoad: worker.currentLoad,
      maxConcurrency: worker.maxConcurrency,
      totalProcessed: worker.totalProcessed,
      totalFailed: worker.totalFailed,
      successRate,
      averageExecutionTime,
      lastHeartbeat: worker.lastHeartbeat,
      uptime,
    };
  }

  /**
   * Get task execution logs
   */
  public async getTaskLogs(
    taskId: string,
    executionId?: string,
    level?: string,
    limit = 100
  ): Promise<TaskLog[]> {
    try {
      const whereClause: any = {};
      
      if (executionId) {
        whereClause.executionId = executionId;
      } else if (taskId) {
        // Get all execution IDs for this task
        const executions = await this.prisma.taskExecution.findMany({
          where: { taskId },
          select: { id: true },
        });
        whereClause.executionId = { in: executions.map(e => e.id) };
      }

      if (level) {
        whereClause.level = level;
      }

      return await this.prisma.taskLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get task logs:', error);
      throw error;
    }
  }

  /**
   * Add custom alert rule
   */
  public addAlertRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRule: AlertRule = { ...rule, id };
    this.alertRules.set(id, newRule);
    logger.info(`Custom alert rule added: ${newRule.name}`);
    return newRule;
  }

  /**
   * Remove alert rule
   */
  public removeAlertRule(ruleId: string): boolean {
    const deleted = this.alertRules.delete(ruleId);
    if (deleted) {
      logger.info(`Alert rule removed: ${ruleId}`);
    }
    return deleted;
  }

  /**
   * Get all alert rules
   */
  public getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Update alert rule
   */
  public updateAlertRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.alertRules.get(ruleId);
    if (!rule) return false;

    const updatedRule = { ...rule, ...updates };
    this.alertRules.set(ruleId, updatedRule);
    logger.info(`Alert rule updated: ${ruleId}`);
    return true;
  }
}

export const taskMonitoringService = new TaskMonitoringService();
