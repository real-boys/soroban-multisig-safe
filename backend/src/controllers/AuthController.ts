import { Request, Response } from 'express';
import { AuthService } from '@/services/AuthService';
import { ApiResponse } from '@/types/api';
import { logger } from '@/utils/logger';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Get SEP-10 challenge transaction
   */
  async getAuthChallenge(req: Request, res: Response): Promise<void> {
    try {
      const { account } = req.query;
      if (!account || typeof account !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_ACCOUNT', message: 'account parameter is required' }
        });
        return;
      }

      const challenge = await this.authService.generateChallenge(account);

      res.status(200).json({
        success: true,
        data: {
          challenge_xdr: challenge,
          network: process.env.STELLAR_NETWORK || 'futurenet'
        }
      });
    } catch (error) {
      logger.error('Error in getAuthChallenge:', error);
      res.status(500).json({
        success: false,
        error: { code: 'CHALLENGE_ERROR', message: 'Failed to generate auth challenge' }
      });
    }
  }

  /**
   * Login using signed SEP-10 challenge
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { transaction: challengeXdr } = req.body;
      if (!challengeXdr) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_TRANSACTION', message: 'signed transaction is required' }
        });
        return;
      }

      const { token, user } = await this.authService.verifyChallenge(challengeXdr);

      res.status(200).json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            stellarAddress: user.stellarAddress,
            email: user.email
          }
        },
        message: 'Authentication successful'
      });
    } catch (error: any) {
      logger.error('Error in login:', error);
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: error.message || 'Authentication failed' }
      });
    }
  }
}
