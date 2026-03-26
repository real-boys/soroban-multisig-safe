import { Request, Response } from 'express';
import { EventIndexerService } from '@/services/EventIndexerService';
import { ApiResponse } from '@/types/api';
import { validationResult } from 'express-validator';
import { logger } from '@/utils/logger';

export class EventIndexerController {
  private eventIndexerService: EventIndexerService;

  constructor() {
    this.eventIndexerService = new EventIndexerService();
  }

  /**
   * Get indexer statistics
   */
  async getIndexerStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.eventIndexerService.getIndexerStats();

      const response: ApiResponse = {
        success: true,
        data: stats,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching indexer stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INDEXER_STATS_FETCH_FAILED',
          message: 'Failed to fetch indexer statistics',
        },
      });
    }
  }

  /**
   * Get events by contract ID
   */
  async getEventsByContract(req: Request, res: Response): Promise<void> {
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

      const { contractId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const events = await this.eventIndexerService.getEventsByContract(contractId, limit);

      const response: ApiResponse = {
        success: true,
        data: {
          contractId,
          events,
          count: events.length,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching events by contract:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENTS_FETCH_FAILED',
          message: 'Failed to fetch events',
        },
      });
    }
  }

  /**
   * Get events by address
   */
  async getEventsByAddress(req: Request, res: Response): Promise<void> {
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

      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const events = await this.eventIndexerService.getEventsByAddress(address, limit);

      const response: ApiResponse = {
        success: true,
        data: {
          address,
          events,
          count: events.length,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching events by address:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENTS_FETCH_FAILED',
          message: 'Failed to fetch events',
        },
      });
    }
  }

  /**
   * Trigger backfill
   */
  async triggerBackfill(req: Request, res: Response): Promise<void> {
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

      const { fromLedger, toLedger } = req.body;
      
      const totalIndexed = await this.eventIndexerService.backfillEvents(fromLedger, toLedger);

      const response: ApiResponse = {
        success: true,
        data: {
          fromLedger,
          toLedger,
          totalIndexed,
        },
        message: `Backfilled ${totalIndexed} events`,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error triggering backfill:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BACKFILL_FAILED',
          message: 'Failed to backfill events',
        },
      });
    }
  }

  /**
   * Handle chain reorg
   */
  async handleReorg(req: Request, res: Response): Promise<void> {
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

      const { ledger } = req.body;
      
      await this.eventIndexerService.handleReorg(ledger);

      const response: ApiResponse = {
        success: true,
        message: `Handled reorg at ledger ${ledger}`,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error handling reorg:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REORG_HANDLING_FAILED',
          message: 'Failed to handle chain reorg',
        },
      });
    }
  }
}
