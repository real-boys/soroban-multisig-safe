import { Request, Response } from 'express';
import { BulkOperationService } from '@/services/BulkOperationService';
import { WalletService } from '@/services/WalletService';
import { TransactionService } from '@/services/TransactionService';
import { CommentService } from '@/services/CommentService';
import { ApiResponse } from '@/types/api';
import {
  BulkOperationRequest,
  BulkOperationResponse,
  BulkCreateWalletRequest,
  BulkUpdateWalletRequest,
  BulkDeleteWalletRequest,
  BulkCreateTransactionRequest,
  BulkUpdateTransactionRequest,
  BulkDeleteTransactionRequest,
  BulkCreateCommentRequest,
  BulkDeleteCommentRequest,
  BulkOperationOptions
} from '@/types/bulk';
import { validationResult } from 'express-validator';

export class BulkOperationController {
  private bulkOperationService: BulkOperationService;
  private walletService: WalletService;
  private transactionService: TransactionService;
  private commentService: CommentService;

  constructor() {
    this.bulkOperationService = new BulkOperationService();
    this.walletService = new WalletService();
    this.transactionService = new TransactionService();
    this.commentService = new CommentService();
  }

  /**
   * Bulk create wallets
   */
  async bulkCreateWallets(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkCreateWalletRequest> = req.body;

      // Validate requests
      const validationErrors = this.walletService.validateBulkCreateRequests(request.items);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: validationErrors,
          },
        });
        return;
      }

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          return await this.walletService.bulkCreateWallets(items, context);
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk wallet creation completed',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error in bulk create wallets:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_WALLET_CREATE_FAILED',
          message: 'Failed to create wallets in bulk',
        },
      });
    }
  }

  /**
   * Bulk update wallets
   */
  async bulkUpdateWallets(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkUpdateWalletRequest> = req.body;

      // Validate requests
      const validationErrors = this.walletService.validateBulkUpdateRequests(request.items);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: validationErrors,
          },
        });
        return;
      }

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          return await this.walletService.bulkUpdateWallets(items, context);
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk wallet update completed',
      };

      res.json(response);
    } catch (error) {
      console.error('Error in bulk update wallets:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_WALLET_UPDATE_FAILED',
          message: 'Failed to update wallets in bulk',
        },
      });
    }
  }

  /**
   * Bulk delete wallets
   */
  async bulkDeleteWallets(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkDeleteWalletRequest> = req.body;

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          await this.walletService.bulkDeleteWallets(items, context);
          return []; // No return value for delete operations
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk wallet deletion completed',
      };

      res.json(response);
    } catch (error) {
      console.error('Error in bulk delete wallets:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_WALLET_DELETE_FAILED',
          message: 'Failed to delete wallets in bulk',
        },
      });
    }
  }

  /**
   * Bulk create transactions
   */
  async bulkCreateTransactions(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkCreateTransactionRequest> = req.body;

      // Validate requests
      const validationErrors = this.transactionService.validateBulkCreateRequests(request.items);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: validationErrors,
          },
        });
        return;
      }

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          return await this.transactionService.bulkCreateTransactions(items, context);
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk transaction creation completed',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error in bulk create transactions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_TRANSACTION_CREATE_FAILED',
          message: 'Failed to create transactions in bulk',
        },
      });
    }
  }

  /**
   * Bulk update transactions
   */
  async bulkUpdateTransactions(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkUpdateTransactionRequest> = req.body;

      // Validate requests
      const validationErrors = this.transactionService.validateBulkUpdateRequests(request.items);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: validationErrors,
          },
        });
        return;
      }

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          return await this.transactionService.bulkUpdateTransactions(items, context);
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk transaction update completed',
      };

      res.json(response);
    } catch (error) {
      console.error('Error in bulk update transactions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_TRANSACTION_UPDATE_FAILED',
          message: 'Failed to update transactions in bulk',
        },
      });
    }
  }

  /**
   * Bulk delete transactions
   */
  async bulkDeleteTransactions(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkDeleteTransactionRequest> = req.body;

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          await this.transactionService.bulkDeleteTransactions(items, context);
          return []; // No return value for delete operations
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk transaction deletion completed',
      };

      res.json(response);
    } catch (error) {
      console.error('Error in bulk delete transactions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_TRANSACTION_DELETE_FAILED',
          message: 'Failed to delete transactions in bulk',
        },
      });
    }
  }

  /**
   * Bulk create comments
   */
  async bulkCreateComments(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkCreateCommentRequest> = req.body;

      // Validate requests
      const validationErrors = this.commentService.validateBulkCreateRequests(request.items);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: validationErrors,
          },
        });
        return;
      }

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          return await this.commentService.bulkCreateComments(items, context);
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk comment creation completed',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error in bulk create comments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_COMMENT_CREATE_FAILED',
          message: 'Failed to create comments in bulk',
        },
      });
    }
  }

  /**
   * Bulk delete comments
   */
  async bulkDeleteComments(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array(),
          },
        });
        return;
      }

      const userId = req.user!.id;
      const request: BulkOperationRequest<BulkDeleteCommentRequest> = req.body;

      // Validate requests
      const validationErrors = this.commentService.validateBulkDeleteRequests(request.items);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: validationErrors,
          },
        });
        return;
      }

      const result = await this.bulkOperationService.executeBulkOperation(
        request,
        async (items, context) => {
          await this.commentService.bulkDeleteComments(items, context);
          return []; // No return value for delete operations
        },
        userId
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Bulk comment deletion completed',
      };

      res.json(response);
    } catch (error) {
      console.error('Error in bulk delete comments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_COMMENT_DELETE_FAILED',
          message: 'Failed to delete comments in bulk',
        },
      });
    }
  }

  /**
   * Get operation progress
   */
  async getOperationProgress(req: Request, res: Response): Promise<void> {
    try {
      const { operationId } = req.params;
      const userId = req.user!.id;

      const progress = this.bulkOperationService.getProgress(operationId);
      
      if (!progress) {
        res.status(404).json({
          success: false,
          error: {
            code: 'OPERATION_NOT_FOUND',
            message: 'Operation not found',
          },
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: progress,
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting operation progress:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROGRESS_FETCH_FAILED',
          message: 'Failed to fetch operation progress',
        },
      });
    }
  }

  /**
   * Cancel an operation
   */
  async cancelOperation(req: Request, res: Response): Promise<void> {
    try {
      const { operationId } = req.params;
      const userId = req.user!.id;

      const cancelled = this.bulkOperationService.cancelOperation(operationId);
      
      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: {
            code: 'OPERATION_NOT_FOUND',
            message: 'Operation not found or already completed',
          },
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        message: 'Operation cancelled successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error cancelling operation:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'OPERATION_CANCEL_FAILED',
          message: 'Failed to cancel operation',
        },
      });
    }
  }

  /**
   * Get user's active operations
   */
  async getActiveOperations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const activeOperations = this.bulkOperationService.getActiveOperations(userId);

      const response: ApiResponse = {
        success: true,
        data: { activeOperations },
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting active operations:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ACTIVE_OPERATIONS_FETCH_FAILED',
          message: 'Failed to fetch active operations',
        },
      });
    }
  }
}
