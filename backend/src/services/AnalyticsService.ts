import { PrismaClient, Transaction, Signature, User, Wallet } from '@prisma/client';
import { format } from 'date-fns';
import { groupBy, sumBy, orderBy } from 'lodash';

export interface TransactionReport {
  id: string;
  transactionId: bigint;
  destination: string;
  amount: bigint;
  executed: boolean;
  signatures: number;
  createdAt: Date;
  executedAt?: Date;
  wallet: {
    name: string;
    contractAddress: string;
  };
  proposer?: {
    id: string;
    email: string;
    stellarAddress: string;
  };
  signers: Array<{
    id: string;
    email: string;
    stellarAddress: string;
    signedAt: Date;
  }>;
}

export interface AuditReportData {
  organization: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  totalTransactions: number;
  totalAmount: bigint;
  successfulTransactions: number;
  failedTransactions: number;
  transactions: TransactionReport[];
  topDestinations: Array<{
    destination: string;
    totalAmount: bigint;
    transactionCount: number;
  }>;
  spendingTrends: Array<{
    date: string;
    amount: bigint;
    transactionCount: number;
  }>;
  signerActivity: Array<{
    signer: {
      id: string;
      email: string;
      stellarAddress: string;
    };
    transactionsSigned: number;
    totalAmountSigned: bigint;
  }>;
}

export class AnalyticsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Generate comprehensive audit report for organization
   */
  async generateAuditReport(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    format: 'csv' | 'pdf' = 'csv'
  ): Promise<AuditReportData> {
    try {
      // Get all wallets for the organization
      const wallets = await this.prisma.wallet.findMany({
        where: {
          ownerId: organizationId,
          isActive: true,
        },
        include: {
          owners: true,
        },
      });

      const walletIds = wallets.map(w => w.id);

      // Get all transactions within date range
      const transactions = await this.prisma.transaction.findMany({
        where: {
          walletId: {
            in: walletIds,
          },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          executed: true, // Only successful transactions
        },
        include: {
          wallet: {
            select: {
              name: true,
              contractAddress: true,
            },
          },
          signatures: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  stellarAddress: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Transform transactions to report format
      const transactionReports: TransactionReport[] = transactions.map(tx => ({
        id: tx.id,
        transactionId: tx.transactionId,
        destination: tx.destination,
        amount: tx.amount,
        executed: tx.executed,
        signatures: tx.signatures.length,
        createdAt: tx.createdAt,
        executedAt: tx.executedAt || undefined,
        wallet: tx.wallet,
        proposer: tx.signatures[0]?.user, // First signer is typically the proposer
        signers: tx.signatures.map(sig => ({
          id: sig.user.id,
          email: sig.user.email,
          stellarAddress: sig.user.stellarAddress,
          signedAt: sig.signedAt,
        })),
      }));

      // Calculate aggregate statistics
      const totalTransactions = transactionReports.length;
      const totalAmount = sumBy(transactionReports, tx => Number(tx.amount));
      const successfulTransactions = transactionReports.filter(tx => tx.executed).length;
      const failedTransactions = totalTransactions - successfulTransactions;

      // Calculate top destinations
      const destinationGroups = groupBy(transactionReports, 'destination');
      const topDestinations = orderBy(
        Object.entries(destinationGroups).map(([destination, txs]) => ({
          destination,
          totalAmount: BigInt(sumBy(txs, tx => Number(tx.amount))),
          transactionCount: txs.length,
        })),
        ['totalAmount'],
        ['desc']
      ).slice(0, 10);

      // Calculate spending trends by date
      const dateGroups = groupBy(transactionReports, tx => 
        format(tx.createdAt, 'yyyy-MM-dd')
      );
      const spendingTrends = orderBy(
        Object.entries(dateGroups).map(([date, txs]) => ({
          date,
          amount: BigInt(sumBy(txs, tx => Number(tx.amount))),
          transactionCount: txs.length,
        })),
        ['date'],
        ['asc']
      );

      // Calculate signer activity
      const signerGroups = groupBy(
        transactionReports.flatMap(tx => tx.signers.map(signer => ({ ...signer, amount: tx.amount }))),
        'id'
      );
      const signerActivity = orderBy(
        Object.entries(signerGroups).map(([signerId, activities]) => ({
          signer: {
            id: activities[0].id,
            email: activities[0].email,
            stellarAddress: activities[0].stellarAddress,
          },
          transactionsSigned: activities.length,
          totalAmountSigned: BigInt(sumBy(activities, a => Number(a.amount))),
        })),
        ['transactionsSigned'],
        ['desc']
      );

      // Get organization name (using first wallet name as org name for now)
      const organization = wallets[0]?.name || 'Unknown Organization';

      return {
        organization,
        dateRange: {
          start: startDate,
          end: endDate,
        },
        totalTransactions,
        totalAmount: BigInt(totalAmount),
        successfulTransactions,
        failedTransactions,
        transactions: transactionReports,
        topDestinations,
        spendingTrends,
        signerActivity,
      };
    } catch (error) {
      console.error('Error generating audit report:', error);
      throw new Error('Failed to generate audit report');
    }
  }

  /**
   * Verify on-chain transaction data vs off-chain metadata
   */
  async verifyTransactionIntegrity(transactionId: string): Promise<{
    isVerified: boolean;
    discrepancies: string[];
    onChainData?: any;
    offChainData?: any;
  }> {
    try {
      // Get off-chain transaction data
      const offChainTx = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          wallet: true,
          signatures: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!offChainTx) {
        throw new Error('Transaction not found');
      }

      // TODO: Implement on-chain verification using Stellar SDK
      // This would involve querying the Stellar network for the transaction
      // and comparing it with our off-chain records
      
      const discrepancies: string[] = [];
      let isVerified = true;

      // For now, we'll simulate verification
      // In a real implementation, you would:
      // 1. Query the Stellar network for the transaction
      // 2. Compare amounts, destinations, signatures, etc.
      // 3. Check if the transaction was actually executed on-chain

      return {
        isVerified,
        discrepancies,
        offChainData: {
          id: offChainTx.id,
          transactionId: offChainTx.transactionId.toString(),
          destination: offChainTx.destination,
          amount: offChainTx.amount.toString(),
          executed: offChainTx.executed,
          signatureCount: offChainTx.signatures.length,
        },
      };
    } catch (error) {
      console.error('Error verifying transaction integrity:', error);
      throw new Error('Failed to verify transaction integrity');
    }
  }

  /**
   * Get weekly summary data for email reports
   */
  async getWeeklySummary(organizationId: string): Promise<{
    weekStart: Date;
    weekEnd: Date;
    newTransactions: number;
    totalAmount: bigint;
    pendingTransactions: number;
    topSigners: Array<{
      email: string;
      transactionsSigned: number;
    }>;
  }> {
    const now = new Date();
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
    const weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const wallets = await this.prisma.wallet.findMany({
      where: {
        ownerId: organizationId,
        isActive: true,
      },
    });

    const walletIds = wallets.map(w => w.id);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        walletId: {
          in: walletIds,
        },
        createdAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      include: {
        signatures: {
          include: {
            user: true,
          },
        },
      },
    });

    const newTransactions = transactions.length;
    const totalAmount = sumBy(transactions, tx => Number(tx.amount));
    const pendingTransactions = transactions.filter(tx => !tx.executed).length;

    // Calculate top signers
    const signerGroups = groupBy(
      transactions.flatMap(tx => tx.signatures.map(sig => sig.user)),
      'email'
    );
    const topSigners = orderBy(
      Object.entries(signerGroups).map(([email, signers]) => ({
        email,
        transactionsSigned: signers.length,
      })),
      ['transactionsSigned'],
      ['desc']
    ).slice(0, 5);

    return {
      weekStart,
      weekEnd,
      newTransactions,
      totalAmount: BigInt(totalAmount),
      pendingTransactions,
      topSigners,
    };
  }
}
