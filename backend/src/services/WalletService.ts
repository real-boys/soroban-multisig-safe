import { PrismaClient } from '@prisma/client';
import { CreateWalletRequest, UpdateWalletRequest } from '@/types/wallet';
import { Wallet, Transaction } from '@prisma/client';
import {
  BulkCreateWalletRequest,
  BulkUpdateWalletRequest,
  BulkDeleteWalletRequest,
  BulkOperationContext,
  BulkOperationError
} from '@/types/bulk';

export class WalletService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new wallet
   */
  async createWallet(walletData: CreateWalletRequest & { ownerId: string; contractAddress: string; stellarNetwork: string }): Promise<Wallet> {
    try {
      const wallet = await this.prisma.wallet.create({
        data: {
          name: walletData.name,
          contractAddress: walletData.contractAddress,
          stellarNetwork: walletData.stellarNetwork,
          threshold: walletData.threshold,
          recoveryAddress: walletData.recoveryAddress,
          recoveryDelay: BigInt(walletData.recoveryDelay),
          ownerId: walletData.ownerId,
          owners: {
            create: walletData.owners.map(address => ({
              address,
            })),
          },
        },
        include: {
          owners: true,
        },
      });

      return wallet;
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw new Error('Failed to create wallet');
    }
  }

  /**
   * Get wallets by user ID
   */
  async getWalletsByUser(userId: string, page: number = 1, limit: number = 10): Promise<{
    wallets: Wallet[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [wallets, total] = await Promise.all([
        this.prisma.wallet.findMany({
          where: {
            ownerId: userId,
            isActive: true,
          },
          include: {
            owners: true,
            transactions: {
              take: 5,
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.wallet.count({
          where: {
            ownerId: userId,
            isActive: true,
          },
        }),
      ]);

      return {
        wallets,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching wallets:', error);
      throw new Error('Failed to fetch wallets');
    }
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string, userId?: string): Promise<Wallet | null> {
    try {
      const wallet = await this.prisma.wallet.findFirst({
        where: {
          id: walletId,
          isActive: true,
          ...(userId && { ownerId: userId }),
        },
        include: {
          owners: true,
          transactions: {
            orderBy: {
              createdAt: 'desc',
            },
          },
          recoveries: {
            orderBy: {
              initiatedAt: 'desc',
            },
          },
        },
      });

      return wallet;
    } catch (error) {
      console.error('Error fetching wallet:', error);
      throw new Error('Failed to fetch wallet');
    }
  }

  /**
   * Update wallet
   */
  async updateWallet(walletId: string, userId: string, updateData: UpdateWalletRequest): Promise<Wallet | null> {
    try {
      const wallet = await this.prisma.wallet.updateMany({
        where: {
          id: walletId,
          ownerId: userId,
          isActive: true,
        },
        data: updateData,
      });

      if (wallet.count === 0) {
        return null;
      }

      return this.getWalletById(walletId, userId);
    } catch (error) {
      console.error('Error updating wallet:', error);
      throw new Error('Failed to update wallet');
    }
  }

  /**
   * Add owner to wallet
   */
  async addOwner(walletId: string, ownerAddress: string): Promise<void> {
    try {
      await this.prisma.walletOwner.create({
        data: {
          walletId,
          address: ownerAddress,
        },
      });
    } catch (error) {
      console.error('Error adding owner:', error);
      throw new Error('Failed to add owner');
    }
  }

  /**
   * Remove owner from wallet
   */
  async removeOwner(walletId: string, ownerAddress: string): Promise<void> {
    try {
      await this.prisma.walletOwner.deleteMany({
        where: {
          walletId,
          address: ownerAddress,
        },
      });
    } catch (error) {
      console.error('Error removing owner:', error);
      throw new Error('Failed to remove owner');
    }
  }

  /**
   * Update threshold
   */
  async updateThreshold(walletId: string, threshold: number): Promise<void> {
    try {
      await this.prisma.wallet.update({
        where: {
          id: walletId,
        },
        data: {
          threshold,
        },
      });
    } catch (error) {
      console.error('Error updating threshold:', error);
      throw new Error('Failed to update threshold');
    }
  }

  /**
   * Update recovery settings
   */
  async updateRecoverySettings(walletId: string, recoveryAddress: string, recoveryDelay: number): Promise<void> {
    try {
      await this.prisma.wallet.update({
        where: {
          id: walletId,
        },
        data: {
          recoveryAddress,
          recoveryDelay: BigInt(recoveryDelay),
        },
      });
    } catch (error) {
      console.error('Error updating recovery settings:', error);
      throw new Error('Failed to update recovery settings');
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    walletId: string,
    page: number = 1,
    limit: number = 10,
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
        walletId,
      };

      if (status) {
        whereClause.executed = status === 'executed';
      }

      const [transactions, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where: whereClause,
          include: {
            signatures: true,
          },
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
      console.error('Error fetching transaction history:', error);
      throw new Error('Failed to fetch transaction history');
    }
  }

  /**
   * Export wallet data
   */
  async exportWalletData(walletId: string, format: string): Promise<string> {
    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: {
          id: walletId,
        },
        include: {
          owners: true,
          transactions: {
            include: {
              signatures: true,
            },
          },
          recoveries: true,
        },
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      if (format === 'csv') {
        return this.convertToCSV(wallet);
      } else {
        return JSON.stringify(wallet, null, 2);
      }
    } catch (error) {
      console.error('Error exporting wallet data:', error);
      throw new Error('Failed to export wallet data');
    }
  }

  /**
   * Import wallet data
   */
  async importWalletData(walletData: any, format: string, userId: string): Promise<Wallet> {
    try {
      let parsedData;

      if (format === 'csv') {
        parsedData = this.parseFromCSV(walletData);
      } else {
        parsedData = JSON.parse(walletData);
      }

      // Create wallet with imported data
      const wallet = await this.createWallet({
        ...parsedData,
        ownerId: userId,
        contractAddress: parsedData.contractAddress,
        stellarNetwork: parsedData.stellarNetwork,
      });

      return wallet;
    } catch (error) {
      console.error('Error importing wallet data:', error);
      throw new Error('Failed to import wallet data');
    }
  }

  /**
   * Convert wallet data to CSV
   */
  private convertToCSV(wallet: any): string {
    const headers = [
      'ID',
      'Name',
      'Contract Address',
      'Network',
      'Threshold',
      'Recovery Address',
      'Recovery Delay',
      'Created At',
      'Updated At',
      'Owners',
      'Transaction Count',
    ];

    const row = [
      wallet.id,
      wallet.name,
      wallet.contractAddress,
      wallet.stellarNetwork,
      wallet.threshold,
      wallet.recoveryAddress,
      wallet.recoveryDelay.toString(),
      wallet.createdAt.toISOString(),
      wallet.updatedAt.toISOString(),
      wallet.owners.map((owner: any) => owner.address).join(';'),
      wallet.transactions.length,
    ];

    return [headers.join(','), row.join(',')].join('\n');
  }

  /**
   * Parse wallet data from CSV
   */
  private parseFromCSV(csvData: string): any {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    const values = lines[1].split(',');

    const wallet: any = {};
    headers.forEach((header, index) => {
      const value = values[index];
      switch (header) {
        case 'Name':
          wallet.name = value;
          break;
        case 'Contract Address':
          wallet.contractAddress = value;
          break;
        case 'Network':
          wallet.stellarNetwork = value;
          break;
        case 'Threshold':
          wallet.threshold = parseInt(value);
          break;
        case 'Recovery Address':
          wallet.recoveryAddress = value;
          break;
        case 'Recovery Delay':
          wallet.recoveryDelay = parseInt(value);
          break;
        case 'Owners':
          wallet.owners = value.split(';');
          break;
      }
    });

    // Set default values for required fields
    wallet.owners = wallet.owners || [];
    wallet.threshold = wallet.threshold || 2;
    wallet.recoveryAddress = wallet.recoveryAddress || '';
    wallet.recoveryDelay = wallet.recoveryDelay || 7 * 24 * 60 * 60; // 7 days

    return wallet;
  }

  /**
   * Bulk create wallets
   */
  async bulkCreateWallets(
    requests: BulkCreateWalletRequest[],
    context: BulkOperationContext
  ): Promise<Wallet[]> {
    const createdWallets: Wallet[] = [];
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        // Generate contract address (in real implementation, this would call Stellar service)
        const contractAddress = `generated_contract_${Date.now()}_${i}`;
        
        const wallet = await this.createWallet({
          ...request,
          ownerId: context.userId,
          contractAddress,
          stellarNetwork: process.env.STELLAR_NETWORK || 'futurenet',
        });

        createdWallets.push(wallet);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'WALLET_CREATE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All wallet creation operations failed: ${errors.map(e => e.error).join(', ')}`);
    }

    return createdWallets;
  }

  /**
   * Bulk update wallets
   */
  async bulkUpdateWallets(
    requests: BulkUpdateWalletRequest[],
    context: BulkOperationContext
  ): Promise<Wallet[]> {
    const updatedWallets: Wallet[] = [];
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        const wallet = await this.updateWallet(request.id, context.userId, request);
        
        if (!wallet) {
          throw new Error(`Wallet not found: ${request.id}`);
        }

        updatedWallets.push(wallet);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'WALLET_UPDATE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All wallet update operations failed: ${errors.map(e => e.error).join(', ')}`);
    }

    return updatedWallets;
  }

  /**
   * Bulk delete wallets (soft delete)
   */
  async bulkDeleteWallets(
    requests: BulkDeleteWalletRequest[],
    context: BulkOperationContext
  ): Promise<void> {
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        const result = await this.prisma.wallet.updateMany({
          where: {
            id: request.id,
            ownerId: context.userId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        if (result.count === 0) {
          throw new Error(`Wallet not found or already deleted: ${request.id}`);
        }
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'WALLET_DELETE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All wallet delete operations failed: ${errors.map(e => e.error).join(', ')}`);
    }
  }

  /**
   * Bulk add owners to wallets
   */
  async bulkAddOwners(
    requests: { walletId: string; ownerAddress: string }[],
    context: BulkOperationContext
  ): Promise<void> {
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        // Verify wallet ownership
        const wallet = await this.getWalletById(request.walletId, context.userId);
        if (!wallet) {
          throw new Error(`Wallet not found: ${request.walletId}`);
        }

        await this.addOwner(request.walletId, request.ownerAddress);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'OWNER_ADD_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All add owner operations failed: ${errors.map(e => e.error).join(', ')}`);
    }
  }

  /**
   * Bulk remove owners from wallets
   */
  async bulkRemoveOwners(
    requests: { walletId: string; ownerAddress: string }[],
    context: BulkOperationContext
  ): Promise<void> {
    const errors: BulkOperationError[] = [];

    for (let i = 0; i < requests.length; i++) {
      if (context.cancellationToken.cancelled) {
        throw new Error('Operation cancelled');
      }

      const request = requests[i];
      
      try {
        // Verify wallet ownership
        const wallet = await this.getWalletById(request.walletId, context.userId);
        if (!wallet) {
          throw new Error(`Wallet not found: ${request.walletId}`);
        }

        await this.removeOwner(request.walletId, request.ownerAddress);
      } catch (error) {
        errors.push({
          item: request,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'OWNER_REMOVE_FAILED',
          index: i
        });
      }
    }

    if (errors.length > 0 && errors.length === requests.length) {
      throw new Error(`All remove owner operations failed: ${errors.map(e => e.error).join(', ')}`);
    }
  }

  /**
   * Validate bulk wallet creation requests
   */
  validateBulkCreateRequests(requests: BulkCreateWalletRequest[]): string[] {
    const errors: string[] = [];

    requests.forEach((request, index) => {
      const itemErrors: string[] = [];

      if (!request.name || request.name.trim().length === 0) {
        itemErrors.push('Name is required');
      }

      if (!request.owners || request.owners.length === 0) {
        itemErrors.push('At least one owner is required');
      }

      if (request.threshold && (request.threshold < 1 || request.threshold > request.owners.length)) {
        itemErrors.push('Threshold must be between 1 and number of owners');
      }

      if (!request.recoveryAddress || request.recoveryAddress.trim().length === 0) {
        itemErrors.push('Recovery address is required');
      }

      if (!request.recoveryDelay || request.recoveryDelay < 0) {
        itemErrors.push('Recovery delay must be a positive number');
      }

      if (itemErrors.length > 0) {
        errors.push(`Item ${index}: ${itemErrors.join(', ')}`);
      }
    });

    return errors;
  }

  /**
   * Validate bulk wallet update requests
   */
  validateBulkUpdateRequests(requests: BulkUpdateWalletRequest[]): string[] {
    const errors: string[] = [];

    requests.forEach((request, index) => {
      const itemErrors: string[] = [];

      if (!request.id || request.id.trim().length === 0) {
        itemErrors.push('Wallet ID is required');
      }

      if (request.threshold !== undefined && request.threshold < 1) {
        itemErrors.push('Threshold must be at least 1');
      }

      if (request.recoveryDelay !== undefined && request.recoveryDelay < 0) {
        itemErrors.push('Recovery delay must be a positive number');
      }

      if (itemErrors.length > 0) {
        errors.push(`Item ${index}: ${itemErrors.join(', ')}`);
      }
    });

    return errors;
  }
}
