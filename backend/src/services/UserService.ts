import { PrismaClient, User, Wallet, UserPreference, Invitation } from '@prisma/client';
import { logger } from '@/utils/logger';

export class UserService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Find all wallets where the given address is a signer
   * This is efficient because it queries the WalletOwner table directly.
   */
  async findSafesBySigner(stellarAddress: string): Promise<any[]> {
    try {
      const walletOwners = await this.prisma.walletOwner.findMany({
        where: {
          address: stellarAddress,
        },
        include: {
          wallet: {
            include: {
              owners: true,
              _count: {
                select: {
                  transactions: true,
                },
              },
            },
          },
        },
      });

      return walletOwners.map(wo => wo.wallet);
    } catch (error) {
      logger.error('Error in findSafesBySigner:', error);
      throw new Error('Failed to discover safes');
    }
  }

  /**
   * Get user profile with current preferences and wallet settings
   */
  async getUserProfile(userId: string): Promise<User & { 
    preferences: UserPreference | null; 
    walletSettings: any[]; 
    invitations: Invitation[];
  }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          preferences: true,
          walletSettings: {
            include: {
              wallet: true,
            },
          },
          invitations: {
            where: { status: 'PENDING' },
            include: {
              wallet: true,
              inviter: {
                select: {
                  email: true,
                  stellarAddress: true,
                },
              },
            },
          },
        },
      });

      return user as any;
    } catch (error) {
      logger.error('Error fetching user profile:', error);
      throw new Error('Failed to fetch user profile');
    }
  }

  /**
   * Invite a user to a safe (off-chain)
   */
  async inviteToSafe(
    walletId: string,
    inviterId: string,
    inviteeAddress: string
  ): Promise<Invitation> {
    try {
      // Find user by address if they already exist
      const invitee = await this.prisma.user.findUnique({
        where: { stellarAddress: inviteeAddress },
      });

      return await this.prisma.invitation.create({
        data: {
          walletId,
          inviterId,
          inviteeAddress,
          inviteeId: invitee?.id,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        },
      });
    } catch (error) {
      logger.error('Error creating invitation:', error);
      throw new Error('Failed to invite user');
    }
  }

  /**
   * Update individual wallet settings (nickname, favorite)
   */
  async updateWalletSettings(
    userId: string,
    walletId: string,
    settings: { nickname?: string; isFavorite?: boolean; isPinned?: boolean }
  ): Promise<any> {
    try {
      return await this.prisma.userWalletSettings.upsert({
        where: {
          userId_walletId: {
            userId,
            walletId,
          },
        },
        update: settings,
        create: {
          userId,
          walletId,
          ...settings,
        },
      });
    } catch (error) {
      logger.error('Error updating wallet settings:', error);
      throw new Error('Failed to update wallet settings');
    }
  }

  /**
   * Update user global notification preferences
   */
  async updatePreferences(
    userId: string,
    preferences: { 
      emailNotifications?: boolean; 
      pushNotifications?: boolean; 
      theme?: string;
    }
  ): Promise<UserPreference> {
    try {
      return await this.prisma.userPreference.upsert({
        where: { userId },
        update: preferences,
        create: {
          userId,
          emailNotifications: preferences.emailNotifications ?? true,
          pushNotifications: preferences.pushNotifications ?? true,
          theme: preferences.theme ?? 'dark',
        },
      });
    } catch (error) {
      logger.error('Error updating preferences:', error);
      throw new Error('Failed to update preferences');
    }
  }
}
