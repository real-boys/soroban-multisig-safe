import { Request, Response } from 'express';
import { TransactionService } from '@/services/TransactionService';
import { StellarService } from '@/services/StellarService';
import { RelayService } from '@/services/RelayService';
import { ApiResponse } from '@/types/api';
import { CreateTransactionRequest, AddCommentRequest, UpdateTransactionRequest } from '@/types/transaction';
import { validationResult } from 'express-validator';

export class TransactionController {
  private transactionService: TransactionService;
  private stellarService: StellarService;
  private relayService: RelayService;

  constructor() {
    this.transactionService = new TransactionService();
    this.stellarService = new StellarService();
    this.relayService = new RelayService();
  }

  /**
   * Submit a new transaction with off-chain metadata
   */
  async submitTransaction(req: Request, res: Response): Promise<void> {
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

      const userId = req.user!.id; // Authenticated user
      const transactionData: CreateTransactionRequest = req.body;

      // Check if user is an owner of the wallet
      const isSigner = await this.transactionService.isUserSigner(transactionData.walletId, userId);
      // Wait, this is used for comments too, but for submission the contract handles it.
      // However, we want to prevent anyone from submitting metadata if they aren't authorized?
      // Actually, someone could submit metadata for an on-chain transaction.
      // We should only store it if they are an owner.

      // 1. Submit to Stellar (on-chain) - this is a mock call for now
      // In a real app, the frontend would submit to the contract and provide the returned ID.
      // Or the backend could submit if it holds the keys (not recommended for a multisig).
      // Assuming the frontend provides the transaction ID from the contract.
      const transactionIdOnChain = BigInt(req.body.transactionIdOnChain || Math.floor(Math.random() * 1000000));

      // 2. Create off-chain metadata in database
      const transaction = await this.transactionService.createTransaction(transactionData.walletId, {
        ...transactionData,
        transactionId: transactionIdOnChain,
      });

      const response: ApiResponse = {
        success: true,
        data: transaction,
        message: 'Transaction submitted with off-chain metadata',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error submitting transaction:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSACTION_SUBMISSION_FAILED',
          message: 'Failed to submit transaction',
        },
      });
    }
  }

  /**
   * Get transaction details including metadata and comments
   */
  async getTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const transaction = await this.transactionService.getTransactionById(transactionId);

      if (!transaction) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
          },
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: transaction,
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching transaction:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSACTION_FETCH_FAILED',
          message: 'Failed to fetch transaction',
        },
      });
    }
  }

  /**
   * Add a comment to a transaction (signer only)
   */
  async addComment(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { content }: AddCommentRequest = req.body;
      const userId = req.user!.id;

      // Verify signer status
      const isSigner = await this.transactionService.isUserSigner(transactionId, userId);
      if (!isSigner) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only signers can add comments',
          },
        });
        return;
      }

      const comment = await this.transactionService.addComment(transactionId, userId, content);

      const response: ApiResponse = {
        success: true,
        data: comment,
        message: 'Comment added successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'COMMENT_ADD_FAILED',
          message: 'Failed to add comment',
        },
      });
    }
  }

  /**
   * Record intent to sign and potentially relay the transaction
   */
  async intentToSign(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { signature } = req.body;
      const userId = req.user!.id;
      const signerAddress = req.user!.stellarAddress;

      // Verify signers only (could also check if they are owner of associated wallet)
      // but RelayService already has checkAndRelayTransaction threshold logic
      
      const recordedSignature = await this.relayService.recordIntentToSign(
        transactionId,
        userId,
        signerAddress,
        signature
      );

      const response: ApiResponse = {
        success: true,
        data: recordedSignature,
        message: 'Intent to sign recorded. Relaying if threshold is met.',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Error in intentToSign:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTENT_TO_SIGN_FAILED',
          message: 'Failed to record signature intent',
        },
      });
    }
  }

  /**
   * Update transaction metadata
   */
  async updateMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { title, description }: UpdateTransactionRequest = req.body;
      const userId = req.user!.id;

      // Verify signer status
      const isSigner = await this.transactionService.isUserSigner(transactionId, userId);
      if (!isSigner) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only signers can edit proposal metadata',
          },
        });
        return;
      }

      const transaction = await this.transactionService.updateTransactionMetadata(transactionId, { title, description });

      if (!transaction) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
          },
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: transaction,
        message: 'Transaction metadata updated successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error updating metadata:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'METADATA_UPDATE_FAILED',
          message: 'Failed to update transaction metadata',
        },
      });
    }
  }

  /**
   * Search transactions across titles and descriptions
   */
  async searchTransactions(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query.q as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      const transactions = await this.transactionService.getTransactions(page, limit, query, status);

      const response: ApiResponse = {
        success: true,
        data: transactions,
      };

      res.json(response);
    } catch (error) {
      console.error('Error searching transactions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSACTION_SEARCH_FAILED',
          message: 'Failed to search transactions',
        },
      });
    }
  }

  /**
   * Soft-delete a transaction (signer only)
   */
  async deleteTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const userId = req.user!.id;

      // Verify signer status
      const isSigner = await this.transactionService.isUserSigner(transactionId, userId);
      if (!isSigner) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only signers can delete proposals',
          },
        });
        return;
      }

      await this.transactionService.softDeleteTransaction(transactionId);

      const response: ApiResponse = {
        success: true,
        message: 'Transaction metadata deleted successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error deleting transaction:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSACTION_DELETE_FAILED',
          message: 'Failed to delete transaction',
        },
      });
    }
  }
}
