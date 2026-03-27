import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

export interface AlertConfig {
  syncLagWarning: number;      // Ledger count for warning
  syncLagCritical: number;     // Ledger count for critical alert
  checkInterval: number;       // How often to check (ms)
  notificationChannels: string[]; // ['email', 'slack', 'webhook']
}

export interface Alert {
  id?: number;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  metadata: any;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  createdAt: Date;
}

export class SyncLagAlertService {
  private config: AlertConfig;
  private network: string;
  private isRunning: boolean = false;
  private checkTimer?: NodeJS.Timeout;

  constructor(config?: Partial<AlertConfig>) {
    this.config = {
      syncLagWarning: config?.syncLagWarning || 100,
      syncLagCritical: config?.syncLagCritical || 500,
      checkInterval: config?.checkInterval || 60000, // 1 minute
      notificationChannels: config?.notificationChannels || ['webhook'],
    };
    
    this.network = process.env.STELLAR_NETWORK || 'futurenet';
  }

  /**
   * Start monitoring sync lag
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Sync lag alert service is already running');
      return;
    }

    this.isRunning = true;
    this.checkSyncLag();
    logger.info('Sync lag alert service started');
  }

  /**
   * Stop monitoring sync lag
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }
    logger.info('Sync lag alert service stopped');
  }

  /**
   * Check sync lag and trigger alerts if needed
   */
  private async checkSyncLag(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const syncLagData = await this.calculateSyncLag();
      
      if (syncLagData) {
        const { lag, currentLedger, indexedLedger } = syncLagData;
        
        // Determine severity
        let severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
        if (lag > this.config.syncLagCritical) {
          severity = 'CRITICAL';
        } else if (lag > this.config.syncLagWarning) {
          severity = 'WARNING';
        }

        // Only alert if severity is WARNING or CRITICAL
        if (severity !== 'INFO') {
          await this.createAlert({
            type: 'SYNC_LAG',
            severity,
            message: `Indexer is ${lag} ledgers behind (Current: ${currentLedger}, Indexed: ${indexedLedger})`,
            metadata: {
              network: this.network,
              currentLedger,
              indexedLedger,
              lag,
              threshold: severity === 'CRITICAL' 
                ? this.config.syncLagCritical 
                : this.config.syncLagWarning,
            },
            acknowledged: false,
            createdAt: new Date(),
          });
        }
      }
    } catch (error: any) {
      logger.error('Error checking sync lag:', error);
    }

    // Schedule next check
    this.checkTimer = setTimeout(() => this.checkSyncLag(), this.config.checkInterval);
  }

  /**
   * Calculate current sync lag
   */
  private async calculateSyncLag(): Promise<{
    currentLedger: number;
    indexedLedger: number;
    lag: number;
  } | null> {
    try {
      // Get indexer state
      const indexerState = await prisma.eventIndexerState.findUnique({
        where: { network: this.network },
      });

      if (!indexerState) {
        logger.warn('No indexer state found');
        return null;
      }

      const indexedLedger = Number(indexerState.lastLedger);
      
      // Get current ledger from RPC (using cached value from indexer state if available)
      const currentLedger = await this.getCurrentNetworkLedger();
      
      const lag = currentLedger - indexedLedger;

      return { currentLedger, indexedLedger, lag };
    } catch (error) {
      logger.error('Failed to calculate sync lag:', error);
      return null;
    }
  }

  /**
   * Get current network ledger
   */
  private async getCurrentNetworkLedger(): Promise<number> {
    try {
      // Try to get from indexer state first (more efficient)
      const indexerState = await prisma.eventIndexerState.findUnique({
        where: { network: this.network },
      });

      if (indexerState?.lastHealthCheck) {
        // If health check was recent (within last 5 minutes), use cached value
        const timeSinceCheck = Date.now() - indexerState.lastHealthCheck.getTime();
        if (timeSinceCheck < 300000) {
          return Number(indexerState.lastLedger);
        }
      }

      // Otherwise, fetch from RPC (this would be implemented in IndexerHealthChecker)
      // For now, return a placeholder
      return 0;
    } catch (error) {
      logger.error('Failed to get current ledger:', error);
      return 0;
    }
  }

  /**
   * Create and store an alert
   */
  async createAlert(alert: Omit<Alert, 'id'>): Promise<void> {
    try {
      await prisma.alert.create({
        data: {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          metadata: alert.metadata,
          acknowledged: alert.acknowledged,
          createdAt: alert.createdAt,
        },
      });

      logger[alert.severity === 'CRITICAL' ? 'error' : 'warn'](
        `[${alert.severity}] ${alert.type}: ${alert.message}`
      );

      // Send notifications
      await this.sendNotifications(alert);
    } catch (error) {
      logger.error('Failed to create alert:', error);
    }
  }

  /**
   * Send notifications through configured channels
   */
  private async sendNotifications(alert: Omit<Alert, 'id'>): Promise<void> {
    for (const channel of this.config.notificationChannels) {
      try {
        switch (channel) {
          case 'webhook':
            await this.sendWebhookNotification(alert);
            break;
          case 'slack':
            await this.sendSlackNotification(alert);
            break;
          case 'email':
            await this.sendEmailNotification(alert);
            break;
          default:
            logger.warn(`Unknown notification channel: ${channel}`);
        }
      } catch (error) {
        logger.error(`Failed to send ${channel} notification:`, error);
      }
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: Omit<Alert, 'id'>): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.debug('No webhook URL configured, skipping webhook notification');
      return;
    }

    const axios = require('axios');
    await axios.post(webhookUrl, {
      alertType: alert.type,
      severity: alert.severity,
      message: alert.message,
      metadata: alert.metadata,
      timestamp: alert.createdAt.toISOString(),
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    logger.info(`Webhook notification sent for ${alert.type}`);
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: Omit<Alert, 'id'>): Promise<void> {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) {
      logger.debug('No Slack webhook configured, skipping Slack notification');
      return;
    }

    const axios = require('axios');
    const color = alert.severity === 'CRITICAL' ? 'danger' 
      : alert.severity === 'WARNING' ? 'warning' : 'good';

    await axios.post(slackWebhookUrl, {
      attachments: [{
        color,
        title: `🚨 ${alert.severity}: ${alert.type}`,
        text: alert.message,
        fields: [
          {
            title: 'Network',
            value: alert.metadata?.network || this.network,
            short: true,
          },
          {
            title: 'Timestamp',
            value: alert.createdAt.toISOString(),
            short: true,
          },
        ],
      }],
    });

    logger.info(`Slack notification sent for ${alert.type}`);
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: Omit<Alert, 'id'>): Promise<void> {
    const smtpUser = process.env.SMTP_USER;
    if (!smtpUser) {
      logger.debug('No email configured, skipping email notification');
      return;
    }

    // TODO: Implement email sending using EmailService or nodemailer
    logger.info(`Email notification would be sent for ${alert.type}`);
  }

  /**
   * Get all unacknowledged alerts
   */
  async getUnacknowledgedAlerts(): Promise<Alert[]> {
    try {
      return await prisma.alert.findMany({
        where: { acknowledged: false },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      logger.error('Failed to get unacknowledged alerts:', error);
      return [];
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: number, acknowledgedBy: string): Promise<void> {
    try {
      await prisma.alert.update({
        where: { id: alertId },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy,
        },
      });
      logger.info(`Alert ${alertId} acknowledged by ${acknowledgedBy}`);
    } catch (error) {
      logger.error('Failed to acknowledge alert:', error);
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(): Promise<{
    total: number;
    unacknowledged: number;
    critical: number;
    warning: number;
    info: number;
  }> {
    try {
      const [total, unacknowledged, critical, warning, info] = await Promise.all([
        prisma.alert.count(),
        prisma.alert.count({ where: { acknowledged: false } }),
        prisma.alert.count({ where: { severity: 'CRITICAL' } }),
        prisma.alert.count({ where: { severity: 'WARNING' } }),
        prisma.alert.count({ where: { severity: 'INFO' } }),
      ]);

      return { total, unacknowledged, critical, warning, info };
    } catch (error) {
      logger.error('Failed to get alert stats:', error);
      return { total: 0, unacknowledged: 0, critical: 0, warning: 0, info: 0 };
    }
  }

  /**
   * Clear old resolved alerts
   */
  async clearOldAlerts(daysOld: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.alert.deleteMany({
        where: {
          acknowledged: true,
          createdAt: { lt: cutoffDate },
        },
      });

      logger.info(`Cleared ${result.count} old alerts`);
      return result.count;
    } catch (error) {
      logger.error('Failed to clear old alerts:', error);
      return 0;
    }
  }
}
