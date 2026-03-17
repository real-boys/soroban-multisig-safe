import { Request, Response } from 'express';
import { WalletService } from '@/services/WalletService';
import { StellarService } from '@/services/StellarService';
import { ApiResponse } from '@/types/api';
import { CreateWalletRequest, UpdateWalletRequest } from '@/types/wallet';
import { validationResult } from 'express-validator';

export class WalletController {
  private walletService: WalletService;
  private stellarService: StellarService;

  constructor() {
    this.walletService = new WalletService();
    this.stellarService = new StellarService();
  }

  /**
   * Create a new multi-signature wallet
   */
  async createWallet(req: Request, res: Response): Promise<void> {
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
      const walletData: CreateWalletRequest = req.body;

      // Deploy smart contract
      const contractAddress = await this.stellarService.deployMultisigContract(
        walletData.owners,
        walletData.threshold,
        walletData.recoveryAddress,
        walletData.recoveryDelay
      );

      // Create wallet in database
      const wallet = await this.walletService.createWallet({
        ...walletData,
        contractAddress,
        ownerId: userId,
        stellarNetwork: process.env.STELLAR_NETWORK || 'futurenet',
      });

      const response: ApiResponse = {
        success: true,
        data: wallet,
        message: 'Multi-signature wallet created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error creating wallet:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WALLET_CREATION_FAILED',
          message: 'Failed to create wallet',
        },
      });
    }
  }

  /**
   * Get user's wallets
   */
  async getWallets(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const wallets = await this.walletService.getWalletsByUser(userId, page, limit);

      const response: ApiResponse = {
        success: true,
        data: wallets,
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching wallets:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WALLET_FETCH_FAILED',
          message: 'Failed to fetch wallets',
        },
      });
    }
  }

  /**
   * Get specific wallet details
   */
  async getWallet(req: Request, res: Response): Promise<void> {
    try {
      const { walletId } = req.params;
      const userId = req.user!.id;

      const wallet = await this.walletService.getWalletById(walletId, userId);

      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      // Get contract state
      const contractState = await this.stellarService.getContractState(wallet.contractAddress);

      const response: ApiResponse = {
        success: true,
        data: {
          ...wallet,
          contractState,
        },
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching wallet:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WALLET_FETCH_FAILED',
          message: 'Failed to fetch wallet',
        },
      });
    }
  }

  /**
   * Update wallet settings
   */
  async updateWallet(req: Request, res: Response): Promise<void> {
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

      const { walletId } = req.params;
      const userId = req.user!.id;
      const updateData: UpdateWalletRequest = req.body;

      const wallet = await this.walletService.updateWallet(walletId, userId, updateData);

      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: wallet,
        message: 'Wallet updated successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error updating wallet:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WALLET_UPDATE_FAILED',
          message: 'Failed to update wallet',
        },
      });
    }
  }

  /**
   * Add owner to wallet
   */
  async addOwner(req: Request, res: Response): Promise<void> {
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

      const { walletId } = req.params;
      const { ownerAddress } = req.body;
      const userId = req.user!.id;

      // Check if user is wallet owner
      const wallet = await this.walletService.getWalletById(walletId, userId);
      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      // Add owner via smart contract
      await this.stellarService.addOwner(wallet.contractAddress, ownerAddress);

      // Update database
      await this.walletService.addOwner(walletId, ownerAddress);

      const response: ApiResponse = {
        success: true,
        message: 'Owner added successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error adding owner:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'OWNER_ADD_FAILED',
          message: 'Failed to add owner',
        },
      });
    }
  }

  /**
   * Remove owner from wallet
   */
  async removeOwner(req: Request, res: Response): Promise<void> {
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

      const { walletId, ownerAddress } = req.params;
      const userId = req.user!.id;

      // Check if user is wallet owner
      const wallet = await this.walletService.getWalletById(walletId, userId);
      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      // Remove owner via smart contract
      await this.stellarService.removeOwner(wallet.contractAddress, ownerAddress);

      // Update database
      await this.walletService.removeOwner(walletId, ownerAddress);

      const response: ApiResponse = {
        success: true,
        message: 'Owner removed successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error removing owner:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'OWNER_REMOVE_FAILED',
          message: 'Failed to remove owner',
        },
      });
    }
  }

  /**
   * Update threshold
   */
  async updateThreshold(req: Request, res: Response): Promise<void> {
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

      const { walletId } = req.params;
      const { threshold } = req.body;
      const userId = req.user!.id;

      // Check if user is wallet owner
      const wallet = await this.walletService.getWalletById(walletId, userId);
      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      // Update threshold via smart contract
      await this.stellarService.updateThreshold(wallet.contractAddress, threshold);

      // Update database
      await this.walletService.updateThreshold(walletId, threshold);

      const response: ApiResponse = {
        success: true,
        message: 'Threshold updated successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error updating threshold:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'THRESHOLD_UPDATE_FAILED',
          message: 'Failed to update threshold',
        },
      });
    }
  }

  /**
   * Update recovery settings
   */
  async updateRecoverySettings(req: Request, res: Response): Promise<void> {
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

      const { walletId } = req.params;
      const { recoveryAddress, recoveryDelay } = req.body;
      const userId = req.user!.id;

      // Check if user is wallet owner
      const wallet = await this.walletService.getWalletById(walletId, userId);
      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      // Update recovery settings via smart contract
      await this.stellarService.updateRecoverySettings(
        wallet.contractAddress,
        recoveryAddress,
        recoveryDelay
      );

      // Update database
      await this.walletService.updateRecoverySettings(walletId, recoveryAddress, recoveryDelay);

      const response: ApiResponse = {
        success: true,
        message: 'Recovery settings updated successfully',
      };

      res.json(response);
    } catch (error) {
      console.error('Error updating recovery settings:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECOVERY_UPDATE_FAILED',
          message: 'Failed to update recovery settings',
        },
      });
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(req: Request, res: Response): Promise<void> {
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

      const { walletId } = req.params;
      const userId = req.user!.id;

      const wallet = await this.walletService.getWalletById(walletId, userId);
      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      // Get balance from Stellar
      const balance = await this.stellarService.getBalance(wallet.contractAddress);

      const response: ApiResponse = {
        success: true,
        data: { balance },
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching balance:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BALANCE_FETCH_FAILED',
          message: 'Failed to fetch balance',
        },
      });
    }
  }

  /**
   * Get wallet transaction history
   */
  async getTransactionHistory(req: Request, res: Response): Promise<void> {
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

      const { walletId } = req.params;
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      const wallet = await this.walletService.getWalletById(walletId, userId);
      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      const transactions = await this.walletService.getTransactionHistory(
        walletId,
        page,
        limit,
        status
      );

      const response: ApiResponse = {
        success: true,
        data: transactions,
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSACTION_HISTORY_FETCH_FAILED',
          message: 'Failed to fetch transaction history',
        },
      });
    }
  }

  /**
   * Export wallet data
   */
  async exportWalletData(req: Request, res: Response): Promise<void> {
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

      const { walletId } = req.params;
      const userId = req.user!.id;
      const format = req.query.format as string || 'json';

      const wallet = await this.walletService.getWalletById(walletId, userId);
      if (!wallet) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WALLET_NOT_FOUND',
            message: 'Wallet not found',
          },
        });
        return;
      }

      const exportData = await this.walletService.exportWalletData(walletId, format);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=wallet-${walletId}.csv`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=wallet-${walletId}.json`);
      }

      res.send(exportData);
    } catch (error) {
      console.error('Error exporting wallet data:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WALLET_EXPORT_FAILED',
          message: 'Failed to export wallet data',
        },
      });
    }
  }

  /**
   * Import wallet data
   */
  async importWalletData(req: Request, res: Response): Promise<void> {
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

      const { walletData, format } = req.body;
      const userId = req.user!.id;

      const wallet = await this.walletService.importWalletData(walletData, format, userId);

      const response: ApiResponse = {
        success: true,
        data: wallet,
        message: 'Wallet data imported successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error importing wallet data:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WALLET_IMPORT_FAILED',
          message: 'Failed to import wallet data',
        },
      });
    }
  }
}
