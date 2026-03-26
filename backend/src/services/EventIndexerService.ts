import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

interface SorobanEvent {
  contract_id: string;
  type: string;
  topics: string[];
  data: any;
  ledger: number;
  tx_hash: string;
}

export class EventIndexerService {
  private stellarRpcUrl: string;
  private network: string;
  private isRunning: boolean = false;
  private pollInterval: number = 5000; // 5 seconds
  private pollTimer?: NodeJS.Timeout;

  constructor() {
    this.stellarRpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-futurenet.stellar.org';
    this.network = process.env.STELLAR_NETWORK || 'futurenet';
  }

  /**
   * Start the event indexer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Event indexer is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting event indexer...');

    // Initialize indexer state if not exists
    await this.initializeIndexerState();

    // Start polling
    this.poll();
  }

  /**
   * Stop the event indexer
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    logger.info('Event indexer stopped');
  }

  /**
   * Poll for new events
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.fetchAndIndexEvents();
    } catch (error) {
      logger.error('Error polling events:', error);
      await this.updateIndexerHealth(false);
    }

    this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
  }

  /**
   * Fetch and index new events from the network
   */
  private async fetchAndIndexEvents(): Promise<void> {
    const state = await this.getIndexerState();
    if (!state) return;

    const startLedger = Number(state.lastLedger) + 1;
    
    logger.info(`Fetching events from ledger ${startLedger}...`);

    try {
      // Get latest ledger
      const latestLedger = await this.getLatestLedger();
      
      if (latestLedger < startLedger) {
        // No new ledgers
        await this.updateIndexerHealth(true);
        return;
      }

      // Fetch events in batches
      const batchSize = 100;
      for (let ledger = startLedger; ledger <= latestLedger; ledger += batchSize) {
        const endLedger = Math.min(ledger + batchSize - 1, latestLedger);
        await this.fetchEventsForLedgerRange(ledger, endLedger);
        
        // Update state
        await this.updateLastLedger(BigInt(endLedger));
      }

      await this.updateIndexerHealth(true);
      logger.info(`Indexed up to ledger ${latestLedger}`);
    } catch (error) {
      logger.error('Error fetching events:', error);
      throw error;
    }
  }

  /**
   * Fetch events for a range of ledgers
   */
  private async fetchEventsForLedgerRange(startLedger: number, endLedger: number): Promise<void> {
    try {
      const response = await axios.post(this.stellarRpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getEvents',
        params: {
          start_ledger: startLedger,
          filters: [
            {
              type: 'contract',
            },
          ],
        },
      });

      if (response.data.result?.events) {
        await this.indexEvents(response.data.result.events);
      }
    } catch (error) {
      logger.error(`Error fetching events for ledgers ${startLedger}-${endLedger}:`, error);
    }
  }

  /**
   * Index events in the database
   */
  private async indexEvents(events: SorobanEvent[]): Promise<void> {
    if (events.length === 0) return;

    logger.info(`Indexing ${events.length} events...`);

    for (const event of events) {
      try {
        await prisma.indexedEvent.create({
          data: {
            contractId: event.contract_id,
            eventType: event.type,
            ledger: BigInt(event.ledger),
            transactionHash: event.tx_hash,
            timestamp: new Date(),
            data: event.data,
            topics: event.topics,
          },
        });
      } catch (error: any) {
        // Handle duplicate events gracefully
        if (error.code !== 'P2002') {
          logger.error('Error indexing event:', error);
        }
      }
    }
  }

  /**
   * Get events by contract ID
   */
  async getEventsByContract(contractId: string, limit: number = 100): Promise<any[]> {
    try {
      return await prisma.indexedEvent.findMany({
        where: { contractId },
        orderBy: { ledger: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Error fetching events by contract:', error);
      return [];
    }
  }

  /**
   * Get events by user address (searching topics)
   */
  async getEventsByAddress(address: string, limit: number = 100): Promise<any[]> {
    try {
      // Search in topics array
      return await prisma.indexedEvent.findMany({
        where: {
          topics: {
            has: address,
          },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Error fetching events by address:', error);
      return [];
    }
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType: string, limit: number = 100): Promise<any[]> {
    try {
      return await prisma.indexedEvent.findMany({
        where: { eventType },
        orderBy: { ledger: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Error fetching events by type:', error);
      return [];
    }
  }

  /**
   * Backfill historical events
   */
  async backfillEvents(fromLedger: number, toLedger: number): Promise<number> {
    logger.info(`Backfilling events from ledger ${fromLedger} to ${toLedger}...`);
    
    let totalIndexed = 0;
    const batchSize = 100;

    for (let ledger = fromLedger; ledger <= toLedger; ledger += batchSize) {
      const endLedger = Math.min(ledger + batchSize - 1, toLedger);
      
      try {
        const response = await axios.post(this.stellarRpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getEvents',
          params: {
            start_ledger: ledger,
            filters: [{ type: 'contract' }],
          },
        });

        if (response.data.result?.events) {
          await this.indexEvents(response.data.result.events);
          totalIndexed += response.data.result.events.length;
        }
      } catch (error) {
        logger.error(`Error backfilling events for ledgers ${ledger}-${endLedger}:`, error);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info(`Backfilled ${totalIndexed} events`);
    return totalIndexed;
  }

  /**
   * Handle chain reorgs by removing events from orphaned ledgers
   */
  async handleReorg(affectedLedger: number): Promise<void> {
    logger.info(`Handling reorg at ledger ${affectedLedger}...`);

    try {
      // Delete events from the affected ledger onwards
      await prisma.indexedEvent.deleteMany({
        where: {
          ledger: { gte: BigInt(affectedLedger) },
        },
      });

      // Reset indexer state
      await this.updateLastLedger(BigInt(affectedLedger - 1));

      logger.info(`Removed events from ledger ${affectedLedger} onwards`);
    } catch (error) {
      logger.error('Error handling reorg:', error);
      throw error;
    }
  }

  /**
   * Initialize indexer state
   */
  private async initializeIndexerState(): Promise<void> {
    try {
      const existingState = await prisma.eventIndexerState.findUnique({
        where: { network: this.network },
      });

      if (!existingState) {
        const latestLedger = await this.getLatestLedger();
        
        await prisma.eventIndexerState.create({
          data: {
            network: this.network,
            lastLedger: BigInt(latestLedger),
            isHealthy: true,
          },
        });

        logger.info(`Initialized indexer state at ledger ${latestLedger}`);
      }
    } catch (error) {
      logger.error('Error initializing indexer state:', error);
    }
  }

  /**
   * Get current indexer state
   */
  private async getIndexerState(): Promise<any> {
    try {
      return await prisma.eventIndexerState.findUnique({
        where: { network: this.network },
      });
    } catch (error) {
      logger.error('Error getting indexer state:', error);
      return null;
    }
  }

  /**
   * Update last indexed ledger
   */
  private async updateLastLedger(ledger: bigint): Promise<void> {
    try {
      await prisma.eventIndexerState.update({
        where: { network: this.network },
        data: {
          lastLedger: ledger,
          lastSync: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error updating last ledger:', error);
    }
  }

  /**
   * Update indexer health status
   */
  private async updateIndexerHealth(isHealthy: boolean): Promise<void> {
    try {
      await prisma.eventIndexerState.update({
        where: { network: this.network },
        data: { isHealthy },
      });
    } catch (error) {
      logger.error('Error updating indexer health:', error);
    }
  }

  /**
   * Get latest ledger from RPC
   */
  private async getLatestLedger(): Promise<number> {
    try {
      const response = await axios.post(this.stellarRpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestLedger',
        params: {},
      });

      return response.data.result?.ledger || 0;
    } catch (error) {
      logger.error('Error getting latest ledger:', error);
      return 0;
    }
  }

  /**
   * Get indexer statistics
   */
  async getIndexerStats(): Promise<{
    totalEvents: number;
    lastLedger: number;
    isHealthy: boolean;
    lastSync: Date | null;
  }> {
    try {
      const state = await this.getIndexerState();
      const totalEvents = await prisma.indexedEvent.count();

      return {
        totalEvents,
        lastLedger: state ? Number(state.lastLedger) : 0,
        isHealthy: state?.isHealthy || false,
        lastSync: state?.lastSync || null,
      };
    } catch (error) {
      logger.error('Error getting indexer stats:', error);
      return {
        totalEvents: 0,
        lastLedger: 0,
        isHealthy: false,
        lastSync: null,
      };
    }
  }
}
