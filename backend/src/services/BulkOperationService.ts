import { PrismaClient } from '@prisma/client';
import {
  BulkOperationRequest,
  BulkOperationResult,
  BulkOperationError,
  BulkOperationProgress,
  BulkOperationContext,
  ProgressCallback,
  BulkTransactionOptions,
  BulkValidationResult,
  BulkValidationError,
  BulkOperationOptions
} from '@/types/bulk';
import { v4 as uuidv4 } from 'uuid';
import { ErrorHandlingService } from './ErrorHandlingService';

export class BulkOperationService {
  private prisma: PrismaClient;
  private activeOperations: Map<string, BulkOperationContext> = new Map();
  private progressCallbacks: Map<string, ProgressCallback[]> = new Map();
  private webSocketService?: any; // Optional WebSocket service for real-time updates
  private errorHandlingService: ErrorHandlingService;

  constructor(webSocketService?: any) {
    this.prisma = new PrismaClient();
    this.webSocketService = webSocketService;
    this.errorHandlingService = new ErrorHandlingService();
  }

  /**
   * Execute a bulk operation with transaction support and progress tracking
   */
  async executeBulkOperation<T, R>(
    request: BulkOperationRequest<T>,
    operation: (items: T[], context: BulkOperationContext) => Promise<R[]>,
    userId: string,
    options?: BulkTransactionOptions
  ): Promise<BulkOperationResult<R>> {
    const operationId = uuidv4();
    const startTime = new Date();
    
    const context: BulkOperationContext = {
      userId,
      operationId,
      startTime,
      progressCallbacks: [],
      cancellationToken: { cancelled: false }
    };

    this.activeOperations.set(operationId, context);

    const progress: BulkOperationProgress = {
      operationId,
      status: 'pending',
      totalItems: request.items.length,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      percentage: 0,
      startedAt: startTime,
      updatedAt: startTime,
      errors: []
    };

    this.updateProgress(progress);

    try {
      this.updateProgress({ ...progress, status: 'running' });

      let retryCount = 0;
      const maxRetries = options?.maxRetries || 3;
      
      while (retryCount <= maxRetries) {
        try {
          const result = await this.executeWithTransaction(
            async (tx) => {
              return await this.processItemsInBatches(
                request.items,
                operation,
                context,
                request.options
              );
            },
            options
          );

          const endTime = new Date();
          const duration = endTime.getTime() - startTime.getTime();

          const finalResult: BulkOperationResult<R> = {
            successful: result.successful,
            failed: result.failed,
            totalProcessed: result.successful.length + result.failed.length,
            operationId,
            duration
          };

          this.updateProgress({
            ...progress,
            status: 'completed',
            processedItems: request.items.length,
            successfulItems: result.successful.length,
            failedItems: result.failed.length,
            percentage: 100,
            updatedAt: endTime,
            errors: result.failed
          });

          this.activeOperations.delete(operationId);
          this.progressCallbacks.delete(operationId);

          return finalResult;
        } catch (error) {
          const errorHandling = await this.errorHandlingService.handleBulkError(
            error as Error,
            context,
            'bulk_operation',
            progress.processedItems,
            progress.totalItems
          );

          if (!errorHandling.shouldRetry || retryCount >= maxRetries) {
            // Attempt rollback if available
            if (errorHandling.rollbackRequired) {
              try {
                const rollbackResult = await this.errorHandlingService.executeRollback(operationId, this.prisma);
                console.log(`Rollback completed for operation ${operationId}:`, rollbackResult);
              } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
              }
            }

            const endTime = new Date();
            
            this.updateProgress({
              ...progress,
              status: 'failed',
              updatedAt: endTime,
              errors: [{
                item: null,
                error: errorHandling.errorMessage,
                code: 'BULK_OPERATION_FAILED',
                index: -1
              }]
            });

            this.activeOperations.delete(operationId);
            this.progressCallbacks.delete(operationId);

            throw new Error(errorHandling.errorMessage);
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, errorHandling.retryDelay));
          retryCount++;
          
          this.updateProgress({
            ...progress,
            status: 'running',
            errors: [{
              item: null,
              error: `Retry attempt ${retryCount}/${maxRetries}: ${errorHandling.errorMessage}`,
              code: 'RETRY_ATTEMPT',
              index: -1
            }]
          });
        }
      }

      throw new Error('Maximum retries exceeded');
    } catch (error) {
      // Final error handling - this catches any errors not handled above
      const endTime = new Date();
      
      this.updateProgress({
        ...progress,
        status: 'failed',
        updatedAt: endTime,
        errors: [{
          item: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'BULK_OPERATION_FAILED',
          index: -1
        }]
      });

      this.activeOperations.delete(operationId);
      this.progressCallbacks.delete(operationId);

      throw error;
    }
  }

  /**
   * Process items in batches with concurrency control
   */
  private async processItemsInBatches<T, R>(
    items: T[],
    operation: (items: T[], context: BulkOperationContext) => Promise<R[]>,
    context: BulkOperationContext,
    options?: BulkOperationOptions
  ): Promise<{ successful: R[]; failed: BulkOperationError[] }> {
    const maxConcurrency = options?.maxConcurrency || 10;
    const continueOnError = options?.continueOnError || false;
    
    const successful: R[] = [];
    const failed: BulkOperationError[] = [];

    // Process items in batches
    for (let i = 0; i < items.length; i += maxConcurrency) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const batch = items.slice(i, i + maxConcurrency);
      
      try {
        const batchResults = await operation(batch, context);
        successful.push(...batchResults);
      } catch (error) {
        if (!continueOnError) {
          throw error;
        }
        
        // Add all items in batch to failed if continueOnError is true
        batch.forEach((item, index) => {
          failed.push({
            item,
            error: error instanceof Error ? error.message : 'Unknown error',
            code: 'BATCH_OPERATION_FAILED',
            index: i + index
          });
        });
      }

      // Update progress
      const processedCount = Math.min(i + maxConcurrency, items.length);
      this.updateProgressForOperation(context.operationId, {
        processedItems: processedCount,
        successfulItems: successful.length,
        failedItems: failed.length,
        percentage: (processedCount / items.length) * 100
      });
    }

    return { successful, failed };
  }

  /**
   * Execute operation within a database transaction
   */
  private async executeWithTransaction<T>(
    operation: (tx: PrismaClient) => Promise<T>,
    options?: BulkTransactionOptions
  ): Promise<T> {
    const maxRetries = options?.maxRetries || 3;
    const timeout = options?.timeout || 30000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(
          operation,
          {
            isolationLevel: options?.isolationLevel || 'READ_COMMITTED',
            timeout: timeout
          }
        );
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Transaction failed after maximum retries');
  }

  /**
   * Validate items before processing
   */
  async validateItems<T>(
    items: T[],
    validator: (item: T, index: number) => string[]
  ): Promise<BulkValidationResult<T>> {
    const valid: T[] = [];
    const invalid: BulkValidationError[] = [];

    items.forEach((item, index) => {
      const errors = validator(item, index);
      
      if (errors.length === 0) {
        valid.push(item);
      } else {
        invalid.push({
          item,
          errors,
          index
        });
      }
    });

    return { valid, invalid };
  }

  /**
   * Get progress for an operation
   */
  getProgress(operationId: string): BulkOperationProgress | null {
    const context = this.activeOperations.get(operationId);
    if (!context) {
      return null;
    }

    // Return current progress state
    return this.getCurrentProgress(operationId);
  }

  /**
   * Cancel an ongoing operation
   */
  cancelOperation(operationId: string): boolean {
    const context = this.activeOperations.get(operationId);
    if (!context) {
      return false;
    }

    context.cancellationToken.cancelled = true;
    
    this.updateProgressForOperation(operationId, {
      status: 'cancelled',
      updatedAt: new Date()
    });

    this.activeOperations.delete(operationId);
    this.progressCallbacks.delete(operationId);

    return true;
  }

  /**
   * Subscribe to progress updates
   */
  subscribeToProgress(operationId: string, callback: ProgressCallback): void {
    if (!this.progressCallbacks.has(operationId)) {
      this.progressCallbacks.set(operationId, []);
    }
    
    this.progressCallbacks.get(operationId)!.push(callback);
  }

  /**
   * Unsubscribe from progress updates
   */
  unsubscribeFromProgress(operationId: string, callback: ProgressCallback): void {
    const callbacks = this.progressCallbacks.get(operationId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Update progress for an operation
   */
  private updateProgressForOperation(
    operationId: string,
    updates: Partial<BulkOperationProgress>
  ): void {
    const currentProgress = this.getCurrentProgress(operationId);
    if (!currentProgress) {
      return;
    }

    const updatedProgress = {
      ...currentProgress,
      ...updates,
      updatedAt: new Date()
    };

    this.updateProgress(updatedProgress);
  }

  /**
   * Get current progress for an operation
   */
  private getCurrentProgress(operationId: string): BulkOperationProgress | null {
    // This would typically be stored in a database or cache
    // For now, we'll return a basic structure
    const context = this.activeOperations.get(operationId);
    if (!context) {
      return null;
    }

    return {
      operationId,
      status: 'running',
      totalItems: 0,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      percentage: 0,
      startedAt: context.startTime,
      updatedAt: new Date(),
      errors: []
    };
  }

  /**
   * Update progress and notify subscribers
   */
  private updateProgress(progress: BulkOperationProgress): void {
    // Notify local callbacks
    const callbacks = this.progressCallbacks.get(progress.operationId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(progress);
        } catch (error) {
          console.error('Error in progress callback:', error);
        }
      });
    }

    // Broadcast through WebSocket if available
    if (this.webSocketService) {
      try {
        this.webSocketService.broadcastProgressUpdate(progress);
      } catch (error) {
        console.error('Error broadcasting progress via WebSocket:', error);
      }
    }
  }

  /**
   * Get all active operations for a user
   */
  getActiveOperations(userId: string): string[] {
    const operations: string[] = [];
    
    this.activeOperations.forEach((context, operationId) => {
      if (context.userId === userId) {
        operations.push(operationId);
      }
    });

    return operations;
  }

  /**
   * Clean up completed/failed operations
   */
  cleanupOperations(olderThanHours: number = 24): void {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);

    this.activeOperations.forEach((context, operationId) => {
      if (context.startTime < cutoffTime) {
        this.activeOperations.delete(operationId);
        this.progressCallbacks.delete(operationId);
      }
    });
  }
}
