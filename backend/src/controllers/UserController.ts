import { Request, Response } from 'express';
import { UserService } from '@/services/UserService';
import { ApiResponse } from '@/types/api';
import { logger } from '@/utils/logger';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Get user's own profile and settings
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const profile = await this.userService.getUserProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error: any) {
      logger.error('Error in getProfile:', error);
      res.status(500).json({
        success: false,
        error: { code: 'PROFILE_ERROR', message: error.message }
      });
    }
  }

  /**
   * Discover all safes associated with the logged-in user
   */
  async discoverSafes(req: Request, res: Response): Promise<void> {
    try {
      const stellarAddress = req.user!.stellarAddress;
      const safes = await this.userService.findSafesBySigner(stellarAddress);

      res.status(200).json({
        success: true,
        data: safes,
        message: `Discovered indices: Found ${safes.length} associated safes.`
      });
    } catch (error: any) {
      logger.error('Error in discoverSafes:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DISCOVERY_ERROR', message: error.message }
      });
    }
  }

  /**
   * Update user-specific wallet settings (nickname, favorite, pinned)
   */
  async updateWalletSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { walletId } = req.params;
      const settings = req.body;

      const updatedSettings = await this.userService.updateWalletSettings(userId, walletId, settings);

      res.status(200).json({
        success: true,
        data: updatedSettings,
        message: 'Wallet preferences updated successfully'
      });
    } catch (error: any) {
      logger.error('Error in updateWalletSettings:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SETTINGS_ERROR', message: error.message }
      });
    }
  }

  /**
   * Invite a user to a safe (off-chain)
   */
  async inviteUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { walletId, inviteeAddress } = req.body;

      if (!walletId || !inviteeAddress) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'walletId and inviteeAddress are required' }
        });
        return;
      }

      const invitation = await this.userService.inviteToSafe(walletId, userId, inviteeAddress);

      res.status(201).json({
        success: true,
        data: invitation,
        message: `Invitations sent: ${inviteeAddress} has been invited to join the safe.`
      });
    } catch (error: any) {
      logger.error('Error in inviteUser:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INVITATION_ERROR', message: error.message }
      });
    }
  }

  /**
   * Update user's notification/theme preferences
   */
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const preferences = req.body;

      const updatedPrefs = await this.userService.updatePreferences(userId, preferences);

      res.json({
        success: true,
        data: updatedPrefs,
        message: 'Notification and theme preferences updated.'
      });
    } catch (error: any) {
      logger.error('Error in updatePreferences:', error);
      res.status(500).json({
        success: false,
        error: { code: 'PREFERENCES_ERROR', message: error.message }
      });
    }
  }
}
