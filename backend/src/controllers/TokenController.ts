import { Request, Response } from 'express';
import { TokenService } from '@/services/TokenService';
import { ApiResponse } from '@/types/api';
import { validationResult } from 'express-validator';
import { logger } from '@/utils/logger';

export class TokenController {
  private tokenService: TokenService;

  constructor() {
    this.tokenService = new TokenService();
  }

  /**
   * Get all token balances for a wallet
   */
  async getTokenBalances(req: Request, res: Response): Promise<void> {
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

      const { walletAddress } = req.params;
      const balances = await this.tokenService.getTokenBalances(walletAddress);

      const response: ApiResponse = {
        success: true,
        data: {
          balances: balances.map(b => ({
            contractId: b.contractId,
            symbol: b.tokenInfo.symbol,
            name: b.tokenInfo.name,
            decimals: b.tokenInfo.decimals,
            balance: b.amount.toString(),
            formattedBalance: (Number(b.amount) / Math.pow(10, b.tokenInfo.decimals)).toString(),
            iconUrl: b.tokenInfo.iconUrl,
            isVerified: b.tokenInfo.isVerified,
          })),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching token balances:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOKEN_BALANCE_FETCH_FAILED',
          message: 'Failed to fetch token balances',
        },
      });
    }
  }

  /**
   * Get current token prices in USD
   */
  async getTokenPrices(req: Request, res: Response): Promise<void> {
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

      const symbols = (req.query.symbols as string)?.split(',') || [];
      const prices = await this.tokenService.getTokenPrices(symbols);

      const response: ApiResponse = {
        success: true,
        data: prices,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching token prices:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOKEN_PRICE_FETCH_FAILED',
          message: 'Failed to fetch token prices',
        },
      });
    }
  }

  /**
   * Calculate total portfolio value
   */
  async getPortfolioValue(req: Request, res: Response): Promise<void> {
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

      const { walletAddress } = req.params;
      const balances = await this.tokenService.getTokenBalances(walletAddress);
      const portfolioValue = await this.tokenService.calculatePortfolioValue(balances);

      const response: ApiResponse = {
        success: true,
        data: {
          totalValueUsd: portfolioValue.totalUsd.toFixed(2),
          breakdown: portfolioValue.breakdown.map(b => ({
            symbol: b.symbol,
            amount: b.amount,
            valueUsd: b.valueUsd.toFixed(2),
            percentage: b.percentage.toFixed(2),
          })),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error calculating portfolio value:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PORTFOLIO_VALUE_CALCULATION_FAILED',
          message: 'Failed to calculate portfolio value',
        },
      });
    }
  }

  /**
   * Discover custom/unrecognized tokens
   */
  async discoverCustomTokens(req: Request, res: Response): Promise<void> {
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

      const { walletAddress } = req.params;
      const customTokens = await this.tokenService.discoverCustomTokens(walletAddress);

      const response: ApiResponse = {
        success: true,
        data: {
          tokens: customTokens.map(t => ({
            contractId: t.contractId,
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            iconUrl: t.iconUrl,
            isVerified: t.isVerified,
          })),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error discovering custom tokens:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOKEN_DISCOVERY_FAILED',
          message: 'Failed to discover custom tokens',
        },
      });
    }
  }

  /**
   * Get transaction history for wallet
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

      const { walletAddress } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = req.query.type as string;

      // This would query the TransactionHistory model
      // For now, returning mock data
      const mockTransactions = [
        {
          txHash: 'TX123456',
          type: 'TRANSFER_IN',
          token: 'XLM',
          amount: '1000000000',
          from: 'GABC...DEF',
          to: walletAddress,
          timestamp: new Date().toISOString(),
          blockNumber: 123456,
        },
      ];

      const response: ApiResponse = {
        success: true,
        data: {
          transactions: mockTransactions,
          pagination: {
            page,
            limit,
            total: 1,
          },
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching transaction history:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSACTION_HISTORY_FETCH_FAILED',
          message: 'Failed to fetch transaction history',
        },
      });
    }
  }
}
