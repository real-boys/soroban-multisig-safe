import { BulkOperationError, BulkOperationContext } from '@/types/bulk';

export interface BulkErrorContext {
  operationId: string;
  userId: string;
  operationType: string;
  startTime: Date;
  itemsProcessed: number;
  totalItems: number;
}

export interface RollbackStrategy {
  canRollback: boolean;
  rollbackOperations: RollbackOperation[];
}

export interface RollbackOperation {
  type: 'DELETE' | 'UPDATE' | 'RESTORE';
  tableName: string;
  recordId: string;
  previousState?: any;
  newState?: any;
}

export class ErrorHandlingService {
  private rollbackStrategies: Map<string, RollbackStrategy> = new Map();
  private errorLog: BulkErrorContext[] = [];

  /**
   * Handle bulk operation errors with intelligent rollback
   */
  async handleBulkError(
    error: Error,
    context: BulkOperationContext,
    operationType: string,
    itemsProcessed: number,
    totalItems: number,
    rollbackOperations?: RollbackOperation[]
  ): Promise<{
    shouldRetry: boolean;
    retryDelay: number;
    errorMessage: string;
    rollbackRequired: boolean;
  }> {
    const errorContext: BulkErrorContext = {
      operationId: context.operationId,
      userId: context.userId,
      operationType,
      startTime: context.startTime,
      itemsProcessed,
      totalItems,
    };

    this.logError(errorContext, error);

    // Analyze error type to determine handling strategy
    const errorAnalysis = this.analyzeError(error);

    // Create rollback strategy if rollback operations are provided
    if (rollbackOperations && rollbackOperations.length > 0) {
      this.rollbackStrategies.set(context.operationId, {
        canRollback: true,
        rollbackOperations,
      });
    }

    return {
      shouldRetry: errorAnalysis.shouldRetry,
      retryDelay: errorAnalysis.retryDelay,
      errorMessage: errorAnalysis.errorMessage,
      rollbackRequired: rollbackOperations && rollbackOperations.length > 0,
    };
  }

  /**
   * Execute rollback operations
   */
  async executeRollback(operationId: string, prisma: any): Promise<{
    success: boolean;
    rolledBackItems: number;
    errors: string[];
  }> {
    const strategy = this.rollbackStrategies.get(operationId);
    if (!strategy || !strategy.canRollback) {
      return {
        success: false,
        rolledBackItems: 0,
        errors: ['No rollback strategy available'],
      };
    }

    const errors: string[] = [];
    let rolledBackItems = 0;

    // Execute rollback operations in reverse order
    for (const operation of strategy.rollbackOperations.reverse()) {
      try {
        await this.executeRollbackOperation(operation, prisma);
        rolledBackItems++;
      } catch (error) {
        errors.push(`Failed to rollback ${operation.type} on ${operation.tableName}: ${error}`);
      }
    }

    // Clear rollback strategy after execution
    this.rollbackStrategies.delete(operationId);

    return {
      success: errors.length === 0,
      rolledBackItems,
      errors,
    };
  }

  /**
   * Execute individual rollback operation
   */
  private async executeRollbackOperation(operation: RollbackOperation, prisma: any): Promise<void> {
    switch (operation.type) {
      case 'DELETE':
        await prisma[operation.tableName].delete({
          where: { id: operation.recordId },
        });
        break;

      case 'UPDATE':
        if (operation.previousState) {
          await prisma[operation.tableName].update({
            where: { id: operation.recordId },
            data: operation.previousState,
          });
        }
        break;

      case 'RESTORE':
        if (operation.previousState) {
          await prisma[operation.tableName].create({
            data: operation.previousState,
          });
        }
        break;

      default:
        throw new Error(`Unknown rollback operation type: ${operation.type}`);
    }
  }

  /**
   * Analyze error to determine handling strategy
   */
  private analyzeError(error: Error): {
    shouldRetry: boolean;
    retryDelay: number;
    errorMessage: string;
  } {
    const errorMessage = error.message.toLowerCase();

    // Network-related errors - should retry
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('connection') || 
        errorMessage.includes('network') ||
        errorMessage.includes('econnreset')) {
      return {
        shouldRetry: true,
        retryDelay: 5000, // 5 seconds
        errorMessage: 'Network error occurred, retrying...',
      };
    }

    // Database constraint errors - should not retry
    if (errorMessage.includes('constraint') || 
        errorMessage.includes('duplicate') || 
        errorMessage.includes('foreign key') ||
        errorMessage.includes('unique')) {
      return {
        shouldRetry: false,
        retryDelay: 0,
        errorMessage: 'Data constraint violation, cannot retry',
      };
    }

    // Database deadlock - should retry with exponential backoff
    if (errorMessage.includes('deadlock') || 
        errorMessage.includes('lock') ||
        errorMessage.includes('serialization')) {
      return {
        shouldRetry: true,
        retryDelay: 10000, // 10 seconds
        errorMessage: 'Database conflict occurred, retrying...',
      };
    }

    // Validation errors - should not retry
    if (errorMessage.includes('validation') || 
        errorMessage.includes('invalid') ||
        errorMessage.includes('required')) {
      return {
        shouldRetry: false,
        retryDelay: 0,
        errorMessage: 'Validation error, cannot retry',
      };
    }

    // Authorization errors - should not retry
    if (errorMessage.includes('unauthorized') || 
        errorMessage.includes('forbidden') ||
        errorMessage.includes('permission')) {
      return {
        shouldRetry: false,
        retryDelay: 0,
        errorMessage: 'Authorization error, cannot retry',
      };
    }

    // Resource limit errors - should retry with longer delay
    if (errorMessage.includes('limit') || 
        errorMessage.includes('quota') ||
        errorMessage.includes('rate limit')) {
      return {
        shouldRetry: true,
        retryDelay: 30000, // 30 seconds
        errorMessage: 'Resource limit reached, retrying...',
      };
    }

    // Unknown errors - should retry with caution
    return {
      shouldRetry: true,
      retryDelay: 15000, // 15 seconds
      errorMessage: 'Unknown error occurred, retrying with caution...',
    };
  }

  /**
   * Log error for monitoring and debugging
   */
  private logError(context: BulkErrorContext, error: Error): void {
    const errorLog = {
      ...context,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      timestamp: new Date(),
    };

    this.errorLog.push(errorLog);

    // Keep only last 1000 error logs
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-1000);
    }

    // In production, this would log to external monitoring service
    console.error('Bulk operation error:', errorLog);
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByOperation: Record<string, number>;
    recentErrors: BulkErrorContext[];
  } {
    const errorsByType: Record<string, number> = {};
    const errorsByOperation: Record<string, number> = {};

    this.errorLog.forEach(log => {
      const errorType = log.error?.name || 'Unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      errorsByOperation[log.operationType] = (errorsByOperation[log.operationType] || 0) + 1;
    });

    return {
      totalErrors: this.errorLog.length,
      errorsByType,
      errorsByOperation,
      recentErrors: this.errorLog.slice(-10),
    };
  }

  /**
   * Clear error logs
   */
  clearErrorLogs(): void {
    this.errorLog = [];
  }

  /**
   * Create rollback operations for bulk create
   */
  createRollbackForCreate(
    tableName: string,
    createdRecords: any[]
  ): RollbackOperation[] {
    return createdRecords.map(record => ({
      type: 'DELETE' as const,
      tableName,
      recordId: record.id,
      previousState: record,
    }));
  }

  /**
   * Create rollback operations for bulk update
   */
  createRollbackForUpdate(
    tableName: string,
    updatedRecords: { id: string; previousState: any; newState: any }[]
  ): RollbackOperation[] {
    return updatedRecords.map(record => ({
      type: 'UPDATE' as const,
      tableName,
      recordId: record.id,
      previousState: record.previousState,
      newState: record.newState,
    }));
  }

  /**
   * Create rollback operations for bulk delete
   */
  createRollbackForDelete(
    tableName: string,
    deletedRecords: any[]
  ): RollbackOperation[] {
    return deletedRecords.map(record => ({
      type: 'RESTORE' as const,
      tableName,
      recordId: record.id,
      previousState: record,
    }));
  }
}
