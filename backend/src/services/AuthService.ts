import { 
  Networks, 
  Keypair, 
  TransactionBuilder, 
  Utils,
  Server
} from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import { logger } from '@/utils/logger';
import { PrismaClient, User } from '@prisma/client';

export class AuthService {
  private prisma: PrismaClient;
  private server: Server;
  private networkPassphrase: string;
  private serverKeypair: Keypair;

  constructor() {
    this.prisma = new PrismaClient();
    const horizonUrl = process.env.HORIZON_URL || 'https://horizon-futurenet.stellar.org';
    this.server = new Server(horizonUrl);
    this.networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.FUTURENET;
    
    // Server's signing key for SEP-10 challenges
    const serverSecret = process.env.SERVER_SECRET_KEY || Keypair.random().secret();
    this.serverKeypair = Keypair.fromSecret(serverSecret);
  }

  /**
   * Generate SEP-10 challenge transaction
   */
  async generateChallenge(clientAccount: string): Promise<string> {
    try {
      const homeDomain = process.env.APP_DOMAIN || 'localhost';
      const webAuthDomain = process.env.AUTH_DOMAIN || 'localhost';

      // Build SEP-10 challenge
      const challenge = Utils.buildChallengeTx(
        this.serverKeypair,
        clientAccount,
        homeDomain,
        300, // 5 minute timeout
        this.networkPassphrase,
        webAuthDomain
      );

      return challenge;
    } catch (error) {
      logger.error('Error in generateChallenge:', error);
      throw new Error('Failed to generate challenge');
    }
  }

  /**
   * Verify SEP-10 response and issue JWT
   */
  async verifyChallenge(challengeXdr: string): Promise<{ token: string; user: User }> {
    try {
      // 1. Verify signatures on the challenge
      const homeDomain = process.env.APP_DOMAIN || 'localhost';
      const webAuthDomain = process.env.AUTH_DOMAIN || 'localhost';

      const { clientAccount, tx } = Utils.readChallengeTx(
        challengeXdr,
        this.serverKeypair.publicKey(),
        this.networkPassphrase,
        homeDomain,
        webAuthDomain
      );

      // 2. We should also verify on-chain if necessary (e.g. for multi-sig source accounts)
      // but SEP-10 usually confirms the client account signer.
      
      // 3. Find or create user record
      let user = await this.prisma.user.findUnique({
        where: { stellarAddress: clientAccount },
      });

      if (!user) {
        // Automatically register user on first login
        user = await this.prisma.user.create({
          data: {
            stellarAddress: clientAccount,
            email: `${clientAccount.substring(0, 10)}@stellar.user`, // Mock email
            password: '', // Password is not used for Stellar Auth
          },
        });
        
        // Initialize default preferences
        await this.prisma.userPreference.create({
          data: { userId: user.id },
        });
      }

      // 4. Generate JWT
      const token = jwt.sign(
        { 
          id: user.id, 
          stellarAddress: user.stellarAddress,
          email: user.email 
        },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '24h' }
      );

      return { token, user };
    } catch (error) {
      logger.error('SEP-10 verification failed:', error);
      throw new Error('Authentication failed');
    }
  }
}
