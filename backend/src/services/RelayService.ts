import { PrismaClient, Transaction, Signature } from '@prisma/client';
import { StellarService } from '@/services/StellarService';
import { logger } from '@/utils/logger';
import { io, emitTransactionUpdate } from '@/services/socketService';

export class RelayService {
  private prisma: PrismaClient;
  private stellarService: StellarService;

  constructor() {
    this.prisma = new PrismaClient();
    this.stellarService = new StellarService();
  }

  /**
   * Receive intent to sign from a user
   */
  async recordIntentToSign(
    transactionId: string,
    userId: string,
    signerAddress: string,
    signatureFragment?: string
  ): Promise<Signature> {
    try {
      const signature = await this.prisma.signature.upsert({
        where: {
          transactionId_userId: {
            transactionId,
            userId,
          },
        },
        update: {
          signature: signatureFragment,
          signedAt: new Date(),
        },
        create: {
          transactionId,
          userId,
          signerAddress,
          signature: signatureFragment,
        },
      });

      // Update aggregate counts in Transaction
      const signatureCount = await this.prisma.signature.count({
        where: { transactionId },
      });

      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { signatures: signatureCount },
      });

      // Check if threshold met to auto-submit
      await this.checkAndRelayTransaction(transactionId);

      return signature;
    } catch (error) {
      logger.error('Error recording intent to sign:', error);
      throw new Error('Failed to record intent to sign');
    }
  }

  /**
   * Check on-chain/aggregation state and relay if threshold is met
   */
  async checkAndRelayTransaction(transactionId: string): Promise<void> {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          wallet: true,
          signatures_rel: true,
        },
      });

      if (!transaction || transaction.executed || transaction.isDeleted) return;

      // Threshold check
      const threshold = transaction.wallet.threshold;
      if (transaction.signatures < threshold) {
        logger.info(`Transaction ${transactionId} not ready: ${transaction.signatures}/${threshold} signatures`);
        return;
      }

      // If we have enough signatures, proceed to relay
      logger.info(`Relaying transaction ${transactionId} (Threshold met: ${threshold})`);
      
      try {
        // Submission results
        const contractAddress = transaction.wallet.contractAddress;
        
        // Finalize transaction with all collected signatures 
        // In a real implementation we'd assemble and submit the TX envelope.
        // For now, this is a mock relay call to the Stellar service.
        const result = await this.stellarService.submitMultisigTransaction(
          contractAddress,
          transaction,
          transaction.signatures_rel.map(s => s.signature).filter(Boolean) as string[]
        );

        if (result.success) {
          // Success update
          await this.prisma.transaction.update({
            where: { id: transactionId },
            data: { 
              executed: true,
              executedAt: new Date(),
            },
          });

          // Notify frontend
          emitTransactionUpdate(io as any, transactionId, {
            status: 'EXECUTED',
            txHash: result.txHash,
          });
          
          logger.info(`Transaction ${transactionId} relayed successfully: ${result.txHash}`);
        } else {
          // Failure update
          emitTransactionUpdate(io as any, transactionId, {
            status: 'FAILED',
            error: result.error,
          });
          
          logger.warn(`Transaction Relay ${transactionId} failed: ${result.error}`);
        }

      } catch (submitError: any) {
        logger.error(`Relay submission failed for ${transactionId}:`, submitError);
        
        // Handle specific errors like "TX_BAD_AUTH_EXTRA"
        let errorCode = 'RELAY_ERROR';
        if (submitError.message?.includes('TX_BAD_AUTH_EXTRA')) {
          errorCode = 'BAD_AUTH_EXTRA';
        }

        emitTransactionUpdate(io as any, transactionId, {
          status: 'FAILED',
          error: errorCode,
          message: submitError.message,
        });
      }

    } catch (error) {
      logger.error('Error in checkAndRelayTransaction:', error);
    }
  }
}
