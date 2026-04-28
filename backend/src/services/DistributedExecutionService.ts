import { PrismaClient, WorkerNode, TaskExecution, ScheduledTask } from '@prisma/client';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';

export interface WorkerCapability {
  supportedTaskTypes: string[];
  resources: {
    memory: number;
    cpuCount: number;
  };
  maxConcurrency: number;
}

export interface TaskDistributionStrategy {
  selectWorker(workers: WorkerNode[], taskType: string): WorkerNode | null;
}

export class LoadBalancedStrategy implements TaskDistributionStrategy {
  selectWorker(workers: WorkerNode[], taskType: string): WorkerNode | null {
    // Filter workers that support the task type and are online
    const eligibleWorkers = workers.filter(worker => {
      if (worker.status !== 'ONLINE') return false;
      if (worker.currentLoad >= worker.maxConcurrency) return false;
      
      const capabilities = worker.capabilities as WorkerCapability;
      return capabilities?.supportedTaskTypes?.includes(taskType);
    });

    if (eligibleWorkers.length === 0) return null;

    // Select worker with lowest current load
    return eligibleWorkers.reduce((best, current) => 
      current.currentLoad < best.currentLoad ? current : best
    );
  }
}

export class RoundRobinStrategy implements TaskDistributionStrategy {
  private currentIndex = 0;

  selectWorker(workers: WorkerNode[], taskType: string): WorkerNode | null {
    const eligibleWorkers = workers.filter(worker => {
      if (worker.status !== 'ONLINE') return false;
      if (worker.currentLoad >= worker.maxConcurrency) return false;
      
      const capabilities = worker.capabilities as WorkerCapability;
      return capabilities?.supportedTaskTypes?.includes(taskType);
    });

    if (eligibleWorkers.length === 0) return null;

    const selectedWorker = eligibleWorkers[this.currentIndex % eligibleWorkers.length];
    this.currentIndex++;
    return selectedWorker;
  }
}

export class DistributedExecutionService extends EventEmitter {
  private prisma: PrismaClient;
  private distributionStrategy: TaskDistributionStrategy;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(strategy: TaskDistributionStrategy = new LoadBalancedStrategy()) {
    super();
    this.prisma = new PrismaClient();
    this.distributionStrategy = strategy;
  }

  /**
   * Start the distributed execution service
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Distributed execution service is already running');
      return;
    }

    try {
      logger.info('Starting Distributed Execution Service...');
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Clean up offline workers
      await this.cleanupOfflineWorkers();
      
      this.isRunning = true;
      logger.info('Distributed Execution Service started successfully');
      this.emit('started');
    } catch (error) {
      logger.error('Failed to start Distributed Execution Service:', error);
      throw error;
    }
  }

  /**
   * Stop the distributed execution service
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      logger.info('Stopping Distributed Execution Service...');
      
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      this.isRunning = false;
      logger.info('Distributed Execution Service stopped');
      this.emit('stopped');
    } catch (error) {
      logger.error('Error stopping Distributed Execution Service:', error);
      throw error;
    }
  }

  /**
   * Get optimal worker for task execution
   */
  public async selectOptimalWorker(taskType: string): Promise<WorkerNode | null> {
    try {
      const workers = await this.prisma.workerNode.findMany({
        where: { status: 'ONLINE' },
      });

      return this.distributionStrategy.selectWorker(workers, taskType);
    } catch (error) {
      logger.error('Failed to select optimal worker:', error);
      return null;
    }
  }

  /**
   * Get all active workers
   */
  public async getActiveWorkers(): Promise<WorkerNode[]> {
    try {
      return await this.prisma.workerNode.findMany({
        where: { status: 'ONLINE' },
        orderBy: { lastHeartbeat: 'desc' },
      });
    } catch (error) {
      logger.error('Failed to get active workers:', error);
      return [];
    }
  }

  /**
   * Get worker by node ID
   */
  public async getWorker(nodeId: string): Promise<WorkerNode | null> {
    try {
      return await this.prisma.workerNode.findUnique({
        where: { nodeId },
      });
    } catch (error) {
      logger.error(`Failed to get worker ${nodeId}:`, error);
      return null;
    }
  }

  /**
   * Update worker heartbeat
   */
  public async updateWorkerHeartbeat(nodeId: string, currentLoad: number): Promise<void> {
    try {
      await this.prisma.workerNode.update({
        where: { nodeId },
        data: {
          lastHeartbeat: new Date(),
          currentLoad,
          status: 'ONLINE',
        },
      });
    } catch (error) {
      logger.error(`Failed to update heartbeat for worker ${nodeId}:`, error);
    }
  }

  /**
   * Register a new worker node
   */
  public async registerWorker(workerData: Omit<WorkerNode, 'id' | 'createdAt' | 'updatedAt' | 'lastHeartbeat' | 'totalProcessed' | 'totalFailed'>): Promise<WorkerNode> {
    try {
      const worker = await this.prisma.workerNode.create({
        data: {
          ...workerData,
          lastHeartbeat: new Date(),
          totalProcessed: BigInt(0),
          totalFailed: BigInt(0),
        },
      });

      logger.info(`Worker registered: ${worker.nodeId}`);
      this.emit('workerRegistered', worker);
      return worker;
    } catch (error) {
      logger.error('Failed to register worker:', error);
      throw error;
    }
  }

  /**
   * Unregister a worker node
   */
  public async unregisterWorker(nodeId: string): Promise<void> {
    try {
      await this.prisma.workerNode.delete({
        where: { nodeId },
      });

      logger.info(`Worker unregistered: ${nodeId}`);
      this.emit('workerUnregistered', { nodeId });
    } catch (error) {
      logger.error(`Failed to unregister worker ${nodeId}:`, error);
      throw error;
    }
  }

  /**
   * Get cluster statistics
   */
  public async getClusterStats(): Promise<{
    totalWorkers: number;
    onlineWorkers: number;
    totalCapacity: number;
    currentLoad: number;
    averageLoad: number;
    tasksProcessed: bigint;
    tasksFailed: bigint;
  }> {
    try {
      const workers = await this.prisma.workerNode.findMany();
      const onlineWorkers = workers.filter(w => w.status === 'ONLINE');
      
      const totalCapacity = onlineWorkers.reduce((sum, w) => sum + w.maxConcurrency, 0);
      const currentLoad = onlineWorkers.reduce((sum, w) => sum + w.currentLoad, 0);
      const tasksProcessed = onlineWorkers.reduce((sum, w) => sum + w.totalProcessed, BigInt(0));
      const tasksFailed = onlineWorkers.reduce((sum, w) => sum + w.totalFailed, BigInt(0));

      return {
        totalWorkers: workers.length,
        onlineWorkers: onlineWorkers.length,
        totalCapacity,
        currentLoad,
        averageLoad: onlineWorkers.length > 0 ? currentLoad / onlineWorkers.length : 0,
        tasksProcessed,
        tasksFailed,
      };
    } catch (error) {
      logger.error('Failed to get cluster stats:', error);
      throw error;
    }
  }

  /**
   * Get worker performance metrics
   */
  public async getWorkerMetrics(nodeId: string): Promise<{
    worker: WorkerNode;
    recentExecutions: TaskExecution[];
    successRate: number;
    averageExecutionTime: number;
  } | null> {
    try {
      const worker = await this.prisma.workerNode.findUnique({
        where: { nodeId },
      });

      if (!worker) return null;

      const recentExecutions = await this.prisma.taskExecution.findMany({
        where: { 
          nodeId,
          startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        },
        orderBy: { startedAt: 'desc' },
        take: 100,
      });

      const completedExecutions = recentExecutions.filter(e => e.status === 'COMPLETED');
      const successRate = recentExecutions.length > 0 
        ? completedExecutions.length / recentExecutions.length 
        : 0;

      const averageExecutionTime = completedExecutions.length > 0
        ? completedExecutions.reduce((sum, e) => sum + Number(e.durationMs || 0), 0) / completedExecutions.length
        : 0;

      return {
        worker,
        recentExecutions,
        successRate,
        averageExecutionTime,
      };
    } catch (error) {
      logger.error(`Failed to get worker metrics for ${nodeId}:`, error);
      return null;
    }
  }

  /**
   * Redistribute tasks from overloaded workers
   */
  public async rebalanceTasks(): Promise<void> {
    try {
      logger.info('Starting task rebalancing...');
      
      const workers = await this.prisma.workerNode.findMany({
        where: { status: 'ONLINE' },
      });

      const overloadedWorkers = workers.filter(w => w.currentLoad > w.maxConcurrency * 0.8);
      const underloadedWorkers = workers.filter(w => w.currentLoad < w.maxConcurrency * 0.5);

      if (overloadedWorkers.length === 0 || underloadedWorkers.length === 0) {
        logger.info('No rebalancing needed');
        return;
      }

      // Find tasks that can be rescheduled
      for (const overloadedWorker of overloadedWorkers) {
        const runningTasks = await this.prisma.taskExecution.findMany({
          where: { 
            nodeId: overloadedWorker.nodeId,
            status: 'RUNNING',
          },
          include: { task: true },
        });

        for (const taskExecution of runningTasks) {
          const optimalWorker = await this.selectOptimalWorker(taskExecution.task.taskType);
          
          if (optimalWorker && optimalWorker.nodeId !== overloadedWorker.nodeId) {
            logger.info(`Rescheduling task ${taskExecution.taskId} from ${overloadedWorker.nodeId} to ${optimalWorker.nodeId}`);
            
            // Update execution to new worker
            await this.prisma.taskExecution.update({
              where: { id: taskExecution.id },
              data: {
                nodeId: optimalWorker.nodeId,
                workerId: optimalWorker.nodeId,
              },
            });

            // Update worker loads
            await this.prisma.workerNode.update({
              where: { nodeId: overloadedWorker.nodeId },
              data: { currentLoad: { decrement: 1 } },
            });

            await this.prisma.workerNode.update({
              where: { nodeId: optimalWorker.nodeId },
              data: { currentLoad: { increment: 1 } },
            });
          }
        }
      }

      logger.info('Task rebalancing completed');
      this.emit('tasksRebalanced');
    } catch (error) {
      logger.error('Failed to rebalance tasks:', error);
    }
  }

  /**
   * Start health monitoring for workers
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkWorkerHealth();
    }, 60000); // Check every minute
  }

  /**
   * Check health of all workers
   */
  private async checkWorkerHealth(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      
      const offlineWorkers = await this.prisma.workerNode.updateMany({
        where: {
          lastHeartbeat: { lt: cutoffTime },
          status: 'ONLINE',
        },
        data: { status: 'OFFLINE' },
      });

      if (offlineWorkers.count > 0) {
        logger.warn(`Marked ${offlineWorkers.count} workers as offline`);
        this.emit('workersOffline', { count: offlineWorkers.count });
      }
    } catch (error) {
      logger.error('Failed to check worker health:', error);
    }
  }

  /**
   * Clean up offline workers that have been offline for too long
   */
  private async cleanupOfflineWorkers(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const result = await this.prisma.workerNode.deleteMany({
        where: {
          status: 'OFFLINE',
          lastHeartbeat: { lt: cutoffTime },
        },
      });

      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} offline workers`);
      }
    } catch (error) {
      logger.error('Failed to cleanup offline workers:', error);
    }
  }

  /**
   * Set distribution strategy
   */
  public setDistributionStrategy(strategy: TaskDistributionStrategy): void {
    this.distributionStrategy = strategy;
    logger.info('Distribution strategy updated');
  }

  /**
   * Get task distribution recommendations
   */
  public async getDistributionRecommendations(): Promise<{
    taskType: string;
    recommendedWorkers: string[];
    currentDistribution: { [workerId: string]: number };
  }[]> {
    try {
      const tasks = await this.prisma.scheduledTask.findMany({
        where: { isActive: true },
        distinct: ['taskType'],
      });

      const recommendations = [];

      for (const task of tasks) {
        const workers = await this.getActiveWorkers();
        const eligibleWorkers = workers.filter(worker => {
          const capabilities = worker.capabilities as WorkerCapability;
          return capabilities?.supportedTaskTypes?.includes(task.taskType);
        });

        const currentDistribution = await this.getTaskTypeDistribution(task.taskType);

        recommendations.push({
          taskType: task.taskType,
          recommendedWorkers: eligibleWorkers.map(w => w.nodeId),
          currentDistribution,
        });
      }

      return recommendations;
    } catch (error) {
      logger.error('Failed to get distribution recommendations:', error);
      return [];
    }
  }

  /**
   * Get current task distribution by task type
   */
  private async getTaskTypeDistribution(taskType: string): Promise<{ [workerId: string]: number }> {
    try {
      const executions = await this.prisma.taskExecution.groupBy({
        by: ['nodeId'],
        where: {
          task: { taskType },
          status: 'RUNNING',
        },
        _count: true,
      });

      return executions.reduce((acc, exec) => {
        acc[exec.nodeId] = exec._count;
        return acc;
      }, {} as { [workerId: string]: number });
    } catch (error) {
      logger.error(`Failed to get task distribution for ${taskType}:`, error);
      return {};
    }
  }
}

export const distributedExecutionService = new DistributedExecutionService();
