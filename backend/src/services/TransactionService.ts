import { PrismaClient, Transaction, Comment } from '@prisma/client';
import { CreateTransactionRequest } from '@/types/transaction';
import { StellarService } from '@/services/StellarService';
import {
  BulkCreateTransactionRequest,
  BulkUpdateTransactionRequest,
  BulkDeleteTransactionRequest,
  BulkOperationContext,
  BulkOperationError
} from '@/types/bulk';

export class TransactionService {
  private prisma: PrismaClient;
  private stellarService: StellarService;

  constructor() {
    this.prisma = new PrismaClient();
    this.stellarService = new StellarService();
  }

  /**
   * Create a new transaction with off-chain metadata
   */
  async createTransaction(
    walletId: string,
    transactionData: CreateTransactionRequest & { transactionId: bigint }
  ): Promise<Transaction> {
    try {
      const transaction = await this.prisma.transaction.create({
        data: {
          walletId,
          transactionId: transactionData.transactionId,
          destination: transactionData.destination,
          amount: BigInt(transactionData.amount),
          data: transactionData.data,
          title: transactionData.title,
          description: transactionData.description,
          expiresAt: new Date(transactionData.expiresAt),
        },
      });

      return transaction;
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw new Error('Failed to create transaction');
    }
  }

  /**
   * Update metadata for an existing transaction
   */
  async updateTransactionMetadata(
    id: string,
    metadata: { title?: string; description?: string }
  ): Promise<Transaction | null> {
    try {
      return await this.prisma.transaction.update({
        where: { id, isDeleted: false },
        data: metadata,
      });
    } catch (error) {
      console.error('Error updating transaction metadata:', error);
      throw new Error('Failed to update transaction metadata');
    }
  }

  /**
   * Get transaction with metadata and comments
   */
  async getTransactionById(id: string): Promise<Transaction & { comments: Comment[] } | null> {
    try {
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  stellarAddress: true,
                  email: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          signatures_rel: true,
          wallet: {
            include: {
              owners: true,
            },
          },
        },
      });

      return transaction as any;
    } catch (error) {
      console.error('Error fetching transaction:', error);
      throw new Error('Failed to fetch transaction');
    }
  }

  /**
   * Get all transactions with search filter
   */
  async getTransactions(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string
  ): Promise<{
    transactions: Transaction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const whereClause: any = {
        isDeleted: false,
        OR: search ? [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ] : undefined,
      };

      if (status) {
        if (status === 'executed') whereClause.executed = true;
        if (status === 'pending') whereClause.executed = false;
      }

      const [transactions, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where: whereClause,
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.transaction.count({
          where: whereClause,
        }),
      ]);

      return {
        transactions,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  /**
   * Add a comment to a transaction
   */
  async addComment(transactionId: string, userId: string, content: string): Promise<Comment> {
    try {
      const comment = await this.prisma.comment.create({
        data: {
          transactionId,
          userId,
          content,
        },
        include: {
          user: {
            select: {
              id: true,
              stellarAddress: true,
              email: true,
            },
          },
        },
      });

      return comment;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw new Error('Failed to add comment');
    }
  }

  /**
   * Soft-delete a transaction
   */
  async softDeleteTransaction(id: string): Promise<void> {
    try {
      await this.prisma.transaction.update({
        where: { id },
        data: { isDeleted: true },
      });
    } catch (error) {
      console.error('Error deleting transaction:', error);
      throw new Error('Failed to delete transaction');
    }
  }

  /**
   * Verify if a user is a signer for the wallet associated with the transaction
   */
  async isUserSigner(transactionId: string, userId: string): Promise<boolean> {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          wallet: {
            include: {
              owners: true,
            },
          },
        },
      });

      if (!transaction) return false;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) return false;

      return transaction.wallet.owners.some(owner => owner.address === user.stellarAddress);
    } catch (error) {
      console.error('Error verifying signer status:', error);
      return false;
    }
  }

  /**
   * Bulk create transactions
   */
  async bulkCreateTransactions(
    requests: BulkCreateTransactionRequest[],
    context: BulkOperationContext
  ): Promise<Transaction[]> {
    const createdTransactions: Transaction[] = [];
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        // Verify user is signer for the wallet
        const isSigner = await this.isUserSignerForWallet(request.walletId, context.userId);
        if (!isSigner) {
          throw new Error(`User is not authorized to create transactions for wallet: ${request.walletId}`);
        }

        // Generate transaction ID (in real implementation, this would come from Stellar)
        const transactionId = BigInt(Date.now() + i);

        const transaction = await this.createTransaction(request.walletId, {
          ...request,
          transactionId,
          expiresAt: new Date(request.expiresAt),
        });

        createdTransactions.push(transaction);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'TRANSACTION_CREATE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All transaction creation operations failed: ${errors.map(e => e.error).join(', ')}`);
    }

    return createdTransactions;
  }

  /**
   * Bulk update transactions
   */
  async bulkUpdateTransactions(
    requests: BulkUpdateTransactionRequest[],
    context: BulkOperationContext
  ): Promise<Transaction[]> {
    const updatedTransactions: Transaction[] = [];
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        // Verify user is signer for the transaction
        const isSigner = await this.isUserSigner(request.id, context.userId);
        if (!isSigner) {
          throw new Error(`User is not authorized to update transaction: ${request.id}`);
        }

        const transaction = await this.updateTransactionMetadata(request.id, {
          title: request.title,
          description: request.description,
        });

        if (!transaction) {
          throw new Error(`Transaction not found: ${request.id}`);
        }

        updatedTransactions.push(transaction);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'TRANSACTION_UPDATE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All transaction update operations failed: ${errors.map(e => e.error).join(', ')}`);
    }

    return updatedTransactions;
  }

  /**
   * Bulk delete transactions (soft delete)
   */
  async bulkDeleteTransactions(
    requests: BulkDeleteTransactionRequest[],
    context: BulkOperationContext
  ): Promise<void> {
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        // Verify user is signer for the transaction
        const isSigner = await this.isUserSigner(request.id, context.userId);
        if (!isSigner) {
          throw new Error(`User is not authorized to delete transaction: ${request.id}`);
        }

        await this.softDeleteTransaction(request.id);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'TRANSACTION_DELETE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All transaction delete operations failed: ${errors.map(e => e.error).join(', ')}`);
    }
  }

  /**
   * Verify if a user is a signer for a wallet
   */
  private async isUserSignerForWallet(walletId: string, userId: string): Promise<boolean> {
    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: { id: walletId },
        include: {
          owners: true,
        },
      });

      if (!wallet) return false;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) return false;

      return wallet.owners.some(owner => owner.address === user.stellarAddress);
    } catch (error) {
      console.error('Error verifying wallet signer status:', error);
      return false;
    }
  }

  /**
   * Validate bulk transaction creation requests
   */
  validateBulkCreateRequests(requests: BulkCreateTransactionRequest[]): string[] {
    const errors: string[] = [];

    requests.forEach((request, index) => {
      const itemErrors: string[] = [];

      if (!request.walletId || request.walletId.trim().length === 0) {
        itemErrors.push('Wallet ID is required');
      }

      if (!request.destination || request.destination.trim().length === 0) {
        itemErrors.push('Destination address is required');
      }

      if (!request.amount || request.amount.trim().length === 0) {
        itemErrors.push('Amount is required');
      }

      if (request.amount && isNaN(Number(request.amount)) || Number(request.amount) <= 0) {
        itemErrors.push('Amount must be a positive number');
      }

      if (!request.title || request.title.trim().length === 0) {
        itemErrors.push('Title is required');
      }

      if (!request.description || request.description.trim().length === 0) {
        itemErrors.push('Description is required');
      }

      if (!request.expiresAt || new Date(request.expiresAt) <= new Date()) {
        itemErrors.push('Expiry date must be in the future');
      }

      if (itemErrors.length > 0) {
        errors.push(`Item ${index}: ${itemErrors.join(', ')}`);
      }
    });

    return errors;
  }

  /**
   * Validate bulk transaction update requests
   */
  validateBulkUpdateRequests(requests: BulkUpdateTransactionRequest[]): string[] {
    const errors: string[] = [];

    requests.forEach((request, index) => {
      const itemErrors: string[] = [];

      if (!request.id || request.id.trim().length === 0) {
        itemErrors.push('Transaction ID is required');
      }

      if (!request.title && !request.description) {
        itemErrors.push('At least title or description must be provided');
      }

      if (request.title && request.title.trim().length === 0) {
        itemErrors.push('Title cannot be empty');
      }

      if (request.description && request.description.trim().length === 0) {
        itemErrors.push('Description cannot be empty');
      }

      if (itemErrors.length > 0) {
        errors.push(`Item ${index}: ${itemErrors.join(', ')}`);
      }
    });

    return errors;
  }
}
