import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { taskSchedulerService } from '@/services/TaskSchedulerService';
import { distributedExecutionService } from '@/services/DistributedExecutionService';
import { taskFailureHandlerService } from '@/services/TaskFailureHandlerService';
import { taskMonitoringService } from '@/services/TaskMonitoringService';
import { logger } from '@/utils/logger';

const router = express.Router();

// Middleware to handle validation errors
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array(),
      },
    });
  }
  next();
};

/**
 * GET /api/tasks
 * Get all scheduled tasks with optional filtering
 */
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('taskType').optional().isString(),
    query('isActive').optional().isBoolean(),
    query('search').optional().isString(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { page = 1, limit = 20, taskType, isActive, search } = req.query;
      
      // In a real implementation, you would query the database with filters
      // For now, we'll return a placeholder response
      const tasks = []; // Would fetch from database using Prisma
      
      res.json({
        success: true,
        data: {
          tasks,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: tasks.length,
            totalPages: Math.ceil(tasks.length / Number(limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch tasks',
        },
      });
    }
  }
);

/**
 * GET /api/tasks/:id
 * Get a specific scheduled task by ID
 */
router.get('/:id',
  [param('id').isString().notEmpty()],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;
      
      // In a real implementation, you would fetch from database
      const task = null; // Would fetch from Prisma
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task not found',
          },
        });
      }

      res.json({
        success: true,
        data: { task },
      });
    } catch (error) {
      logger.error(`Error fetching task ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch task',
        },
      });
    }
  }
);

/**
 * POST /api/tasks
 * Create a new scheduled task
 */
router.post('/',
  [
    body('name').isString().notEmpty().isLength({ min: 1, max: 255 }),
    body('description').optional().isString().isLength({ max: 1000 }),
    body('taskType').isString().notEmpty(),
    body('cronExpression').isString().notEmpty(),
    body('timezone').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('priority').optional().isInt({ min: 1, max: 10 }),
    body('maxRetries').optional().isInt({ min: 0, max: 10 }),
    body('timeoutMs').optional().isInt({ min: 1000 }),
    body('metadata').optional().isObject(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const taskData = req.body;
      
      // Create task using TaskSchedulerService
      const task = await taskSchedulerService.addTask({
        name: taskData.name,
        description: taskData.description,
        taskType: taskData.taskType,
        cronExpression: taskData.cronExpression,
        timezone: taskData.timezone || 'UTC',
        isActive: taskData.isActive !== false,
        priority: taskData.priority || 5,
        maxRetries: taskData.maxRetries || 3,
        timeoutMs: taskData.timeoutMs || 300000,
        metadata: taskData.metadata,
        createdBy: req.user?.id, // Would come from authentication middleware
      });

      res.status(201).json({
        success: true,
        data: { task },
        message: 'Task created successfully',
      });
    } catch (error) {
      logger.error('Error creating task:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create task',
        },
      });
    }
  }
);

/**
 * PUT /api/tasks/:id
 * Update a scheduled task
 */
router.put('/:id',
  [
    param('id').isString().notEmpty(),
    body('name').optional().isString().notEmpty().isLength({ min: 1, max: 255 }),
    body('description').optional().isString().isLength({ max: 1000 }),
    body('cronExpression').optional().isString().notEmpty(),
    body('timezone').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('priority').optional().isInt({ min: 1, max: 10 }),
    body('maxRetries').optional().isInt({ min: 0, max: 10 }),
    body('timeoutMs').optional().isInt({ min: 1000 }),
    body('metadata').optional().isObject(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const task = await taskSchedulerService.updateTask(id, updates);

      res.json({
        success: true,
        data: { task },
        message: 'Task updated successfully',
      });
    } catch (error) {
      logger.error(`Error updating task ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update task',
        },
      });
    }
  }
);

/**
 * DELETE /api/tasks/:id
 * Delete a scheduled task
 */
router.delete('/:id',
  [param('id').isString().notEmpty()],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;
      
      await taskSchedulerService.deleteTask(id);

      res.json({
        success: true,
        message: 'Task deleted successfully',
      });
    } catch (error) {
      logger.error(`Error deleting task ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete task',
        },
      });
    }
  }
);

/**
 * POST /api/tasks/:id/trigger
 * Manually trigger a task execution
 */
router.post('/:id/trigger',
  [param('id').isString().notEmpty()],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;
      
      // This would trigger immediate execution of the task
      // Implementation would depend on the TaskSchedulerService
      
      res.json({
        success: true,
        message: 'Task triggered successfully',
      });
    } catch (error) {
      logger.error(`Error triggering task ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to trigger task',
        },
      });
    }
  }
);

/**
 * GET /api/tasks/:id/executions
 * Get execution history for a specific task
 */
router.get('/:id/executions',
  [
    param('id').isString().notEmpty(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isString(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, status } = req.query;
      
      const executions = await taskSchedulerService.getTaskExecutions(id, Number(limit));
      
      // Filter by status if provided
      const filteredExecutions = status 
        ? executions.filter(e => e.status === status)
        : executions;

      res.json({
        success: true,
        data: {
          executions: filteredExecutions.slice(0, Number(limit)),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: filteredExecutions.length,
            totalPages: Math.ceil(filteredExecutions.length / Number(limit)),
          },
        },
      });
    } catch (error) {
      logger.error(`Error fetching executions for task ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch task executions',
        },
      });
    }
  }
);

/**
 * GET /api/tasks/:id/executions/:executionId
 * Get details of a specific task execution
 */
router.get('/:id/executions/:executionId',
  [
    param('id').isString().notEmpty(),
    param('executionId').isString().notEmpty(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { executionId } = req.params;
      
      // In a real implementation, you would fetch execution details from database
      const execution = null; // Would fetch from Prisma with logs
      
      if (!execution) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Task execution not found',
          },
        });
      }

      res.json({
        success: true,
        data: { execution },
      });
    } catch (error) {
      logger.error(`Error fetching execution ${req.params.executionId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch task execution',
        },
      });
    }
  }
);

/**
 * GET /api/tasks/:id/logs
 * Get logs for a specific task
 */
router.get('/:id/logs',
  [
    param('id').isString().notEmpty(),
    query('executionId').optional().isString(),
    query('level').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { id } = req.params;
      const { executionId, level, limit = 100 } = req.query;
      
      const logs = await taskMonitoringService.getTaskLogs(
        id,
        executionId as string,
        level as string,
        Number(limit)
      );

      res.json({
        success: true,
        data: { logs },
      });
    } catch (error) {
      logger.error(`Error fetching logs for task ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch task logs',
        },
      });
    }
  }
);

/**
 * GET /api/tasks/metrics
 * Get metrics for all tasks
 */
router.get('/metrics',
  [
    query('taskId').optional().isString(),
    query('timeRange').optional().isString(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { taskId, timeRange } = req.query;
      
      let metrics;
      if (taskId) {
        metrics = await taskMonitoringService.getTaskMetrics(taskId as string);
      } else {
        metrics = await taskMonitoringService.getAllTaskMetrics();
      }

      res.json({
        success: true,
        data: { metrics },
      });
    } catch (error) {
      logger.error('Error fetching task metrics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch task metrics',
        },
      });
    }
  }
);

/**
 * GET /api/system/status
 * Get system-wide status and metrics
 */
router.get('/system/status',
  async (req: express.Request, res: express.Response) => {
    try {
      const [schedulerStatus, systemMetrics, workerMetrics] = await Promise.all([
        taskSchedulerService.getStatus(),
        taskMonitoringService.getSystemMetrics(),
        taskMonitoringService.getAllWorkerMetrics(),
      ]);

      res.json({
        success: true,
        data: {
          scheduler: schedulerStatus,
          system: systemMetrics,
          workers: workerMetrics,
        },
      });
    } catch (error) {
      logger.error('Error fetching system status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch system status',
        },
      });
    }
  }
);

/**
 * GET /api/workers
 * Get all worker nodes
 */
router.get('/workers',
  [
    query('status').optional().isString(),
    query('nodeId').optional().isString(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { status, nodeId } = req.query;
      
      let workers;
      if (nodeId) {
        const worker = await distributedExecutionService.getWorker(nodeId as string);
        workers = worker ? [worker] : [];
      } else {
        workers = await distributedExecutionService.getActiveWorkers();
        if (status) {
          workers = workers.filter(w => w.status === status);
        }
      }

      res.json({
        success: true,
        data: { workers },
      });
    } catch (error) {
      logger.error('Error fetching workers:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch workers',
        },
      });
    }
  }
);

/**
 * GET /api/workers/:nodeId/metrics
 * Get metrics for a specific worker
 */
router.get('/workers/:nodeId/metrics',
  [param('nodeId').isString().notEmpty()],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { nodeId } = req.params;
      
      const metrics = await distributedExecutionService.getWorkerMetrics(nodeId);
      
      if (!metrics) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Worker not found',
          },
        });
      }

      res.json({
        success: true,
        data: { metrics },
      });
    } catch (error) {
      logger.error(`Error fetching metrics for worker ${req.params.nodeId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch worker metrics',
        },
      });
    }
  }
);

/**
 * GET /api/alerts/rules
 * Get all alert rules
 */
router.get('/alerts/rules',
  async (req: express.Request, res: express.Response) => {
    try {
      const rules = taskMonitoringService.getAlertRules();
      
      res.json({
        success: true,
        data: { rules },
      });
    } catch (error) {
      logger.error('Error fetching alert rules:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch alert rules',
        },
      });
    }
  }
);

/**
 * POST /api/alerts/rules
 * Create a new alert rule
 */
router.post('/alerts/rules',
  [
    body('name').isString().notEmpty().isLength({ min: 1, max: 255 }),
    body('description').isString().notEmpty().isLength({ min: 1, max: 1000 }),
    body('condition').isString().notEmpty(),
    body('threshold').isNumeric(),
    body('timeWindow').isInt({ min: 1 }),
    body('severity').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('notificationChannels').isArray(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const ruleData = req.body;
      
      const rule = taskMonitoringService.addAlertRule({
        name: ruleData.name,
        description: ruleData.description,
        condition: ruleData.condition,
        threshold: ruleData.threshold,
        timeWindow: ruleData.timeWindow,
        severity: ruleData.severity,
        isActive: ruleData.isActive !== false,
        notificationChannels: ruleData.notificationChannels,
      });

      res.status(201).json({
        success: true,
        data: { rule },
        message: 'Alert rule created successfully',
      });
    } catch (error) {
      logger.error('Error creating alert rule:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create alert rule',
        },
      });
    }
  }
);

/**
 * PUT /api/alerts/rules/:ruleId
 * Update an alert rule
 */
router.put('/alerts/rules/:ruleId',
  [
    param('ruleId').isString().notEmpty(),
    body('name').optional().isString().notEmpty().isLength({ min: 1, max: 255 }),
    body('description').optional().isString().notEmpty().isLength({ min: 1, max: 1000 }),
    body('condition').optional().isString().notEmpty(),
    body('threshold').optional().isNumeric(),
    body('timeWindow').optional().isInt({ min: 1 }),
    body('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('isActive').optional().isBoolean(),
    body('notificationChannels').optional().isArray(),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;
      
      const updated = taskMonitoringService.updateAlertRule(ruleId, updates);
      
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Alert rule not found',
          },
        });
      }

      res.json({
        success: true,
        message: 'Alert rule updated successfully',
      });
    } catch (error) {
      logger.error(`Error updating alert rule ${req.params.ruleId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update alert rule',
        },
      });
    }
  }
);

/**
 * DELETE /api/alerts/rules/:ruleId
 * Delete an alert rule
 */
router.delete('/alerts/rules/:ruleId',
  [param('ruleId').isString().notEmpty()],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { ruleId } = req.params;
      
      const deleted = taskMonitoringService.removeAlertRule(ruleId);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Alert rule not found',
          },
        });
      }

      res.json({
        success: true,
        message: 'Alert rule deleted successfully',
      });
    } catch (error) {
      logger.error(`Error deleting alert rule ${req.params.ruleId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete alert rule',
        },
      });
    }
  }
);

/**
 * GET /api/dead-letter
 * Get dead letter queue jobs
 */
router.get('/dead-letter',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { limit = 50 } = req.query;
      
      const deadLetterJobs = await taskFailureHandlerService.getDeadLetterJobs(Number(limit));

      res.json({
        success: true,
        data: { deadLetterJobs },
      });
    } catch (error) {
      logger.error('Error fetching dead letter jobs:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch dead letter jobs',
        },
      });
    }
  }
);

/**
 * POST /api/dead-letter/:jobId/retry
 * Retry a dead letter job
 */
router.post('/dead-letter/:jobId/retry',
  [param('jobId').isString().notEmpty()],
  handleValidationErrors,
  async (req: express.Request, res: express.Response) => {
    try {
      const { jobId } = req.params;
      
      // In a real implementation, you would fetch the dead letter job and retry it
      // For now, we'll return a placeholder response
      
      res.json({
        success: true,
        message: 'Dead letter job retry initiated',
      });
    } catch (error) {
      logger.error(`Error retrying dead letter job ${req.params.jobId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retry dead letter job',
        },
      });
    }
  }
);

export default router;
