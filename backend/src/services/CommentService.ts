import { PrismaClient, Comment } from '@prisma/client';
import {
  BulkCreateCommentRequest,
  BulkDeleteCommentRequest,
  BulkOperationContext,
  BulkOperationError
} from '@/types/bulk';

export class CommentService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new comment
   */
  async createComment(transactionId: string, userId: string, content: string): Promise<Comment> {
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
      console.error('Error creating comment:', error);
      throw new Error('Failed to create comment');
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    try {
      const result = await this.prisma.comment.deleteMany({
        where: {
          id: commentId,
          userId: userId,
        },
      });

      if (result.count === 0) {
        throw new Error('Comment not found or user not authorized');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw new Error('Failed to delete comment');
    }
  }

  /**
   * Get comments for a transaction
   */
  async getCommentsByTransaction(transactionId: string, page: number = 1, limit: number = 10): Promise<{
    comments: Comment[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [comments, total] = await Promise.all([
        this.prisma.comment.findMany({
          where: {
            transactionId,
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
          orderBy: {
            createdAt: 'asc',
          },
          skip,
          take: limit,
        }),
        this.prisma.comment.count({
          where: {
            transactionId,
          },
        }),
      ]);

      return {
        comments,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw new Error('Failed to fetch comments');
    }
  }

  /**
   * Bulk create comments
   */
  async bulkCreateComments(
    requests: BulkCreateCommentRequest[],
    context: BulkOperationContext
  ): Promise<Comment[]> {
    const createdComments: Comment[] = [];
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        // Verify user is authorized to comment on the transaction
        const isAuthorized = await this.isUserAuthorizedForTransaction(request.transactionId, context.userId);
        if (!isAuthorized) {
          throw new Error(`User is not authorized to comment on transaction: ${request.transactionId}`);
        }

        const comment = await this.createComment(request.transactionId, context.userId, request.content);
        createdComments.push(comment);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'COMMENT_CREATE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All comment creation operations failed: ${errors.map(e => e.error).join(', ')}`);
    }

    return createdComments;
  }

  /**
   * Bulk delete comments
   */
  async bulkDeleteComments(
    requests: BulkDeleteCommentRequest[],
    context: BulkOperationContext
  ): Promise<void> {
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        await this.deleteComment(request.id, context.userId);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'COMMENT_DELETE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All comment delete operations failed: ${errors.map(e => e.error).join(', ')}`);
    }
  }

  /**
   * Verify if a user is authorized to comment on a transaction
   */
  private async isUserAuthorizedForTransaction(transactionId: string, userId: string): Promise<boolean> {
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

      return transaction.wallet.owners.some((owner: any) => owner.address === user.stellarAddress);
    } catch (error) {
      console.error('Error verifying authorization:', error);
      return false;
    }
  }

  /**
   * Validate bulk comment creation requests
   */
  validateBulkCreateRequests(requests: BulkCreateCommentRequest[]): string[] {
    const errors: string[] = [];

    requests.forEach((request, index) => {
      const itemErrors: string[] = [];

      if (!request.transactionId || request.transactionId.trim().length === 0) {
        itemErrors.push('Transaction ID is required');
      }

      if (!request.content || request.content.trim().length === 0) {
        itemErrors.push('Content is required');
      }

      if (request.content && request.content.length > 1000) {
        itemErrors.push('Content must be less than 1000 characters');
      }

      if (itemErrors.length > 0) {
        errors.push(`Item ${index}: ${itemErrors.join(', ')}`);
      }
    });

    return errors;
  }

  /**
   * Validate bulk comment delete requests
   */
  validateBulkDeleteRequests(requests: BulkDeleteCommentRequest[]): string[] {
    const errors: string[] = [];

    requests.forEach((request, index) => {
      const itemErrors: string[] = [];

      if (!request.id || request.id.trim().length === 0) {
        itemErrors.push('Comment ID is required');
      }

      if (itemErrors.length > 0) {
        errors.push(`Item ${index}: ${itemErrors.join(', ')}`);
      }
    });

    return errors;
  }
}
