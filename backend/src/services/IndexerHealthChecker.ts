import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

interface HealthStatus {
  isHealthy: boolean;
  lastIndexedLedger: number;
  currentNetworkLedger: number;
  syncLag: number;
  totalEvents: number;
  lastSyncTime: Date | null;
  responseTime: number;
}

export class IndexerHealthChecker {
  private stellarRpcUrl: string;
  private network: string;
  private checkInterval: number = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;
  private alertThresholds = {
    syncLagWarning: 100,      // Alert if lag > 100 ledgers
    syncLagCritical: 500,     // Critical if lag > 500 ledgers
    maxResponseTime: 5000,    // Alert if response time > 5s
    minSyncFrequency: 300000, // Alert if no sync in 5 minutes
  };

  constructor() {
    this.stellarRpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-futurenet.stellar.org';
    this.network = process.env.STELLAR_NETWORK || 'futurenet';
  }

  /**
   * Start continuous health monitoring
   */
  start(): void {
    this.checkHealth();
    logger.info('Started indexer health checker');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
    }
    logger.info('Stopped indexer health checker');
  }

  /**
   * Perform comprehensive health check
   */
  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      // Get current network ledger
      const currentNetworkLedger = await this.getCurrentNetworkLedger();
      
      // Get last indexed ledger
      const indexerState = await this.getIndexerState();
      const lastIndexedLedger = indexerState ? Number(indexerState.lastLedger) : 0;
      
      // Calculate sync lag
      const syncLag = currentNetworkLedger - lastIndexedLedger;
      
      // Get event count
      const totalEvents = await this.getTotalEvents();
      
      // Calculate response time
      const responseTime = Date.now() - startTime;

      const healthStatus: HealthStatus = {
        isHealthy: this.determineHealth(syncLag, responseTime, indexerState?.lastSync),
        lastIndexedLedger,
        currentNetworkLedger,
        syncLag,
        totalEvents,
        lastSyncTime: indexerState?.lastSync || null,
        responseTime,
      };

      // Update indexer state
      await this.updateHealthStatus(healthStatus.isHealthy);

      // Check for alerts
      await this.checkAlerts(healthStatus);

      // Log status
      this.logHealthStatus(healthStatus);

      // Schedule next check
      this.healthCheckTimer = setTimeout(() => this.checkHealth(), this.checkInterval);

      return healthStatus;
    } catch (error: any) {
      logger.error('Health check failed:', error);
      
      const unhealthyStatus: HealthStatus = {
        isHealthy: false,
        lastIndexedLedger: 0,
        currentNetworkLedger: 0,
        syncLag: 999999,
        totalEvents: 0,
        lastSyncTime: null,
        responseTime: Date.now() - startTime,
      };

      await this.updateHealthStatus(false);
      return unhealthyStatus;
    }
  }

  /**
   * Determine overall health based on metrics
   */
  private determineHealth(
    syncLag: number,
    responseTime: number,
    lastSync?: Date
  ): boolean {
    // Unhealthy if sync lag is critical
    if (syncLag > this.alertThresholds.syncLagCritical) {
      return false;
    }

    // Unhealthy if response time is too high
    if (responseTime > this.alertThresholds.maxResponseTime) {
      return false;
    }

    // Unhealthy if no recent sync
    if (lastSync) {
      const timeSinceLastSync = Date.now() - lastSync.getTime();
      if (timeSinceLastSync > this.alertThresholds.minSyncFrequency) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check and trigger alerts based on thresholds
   */
  private async checkAlerts(status: HealthStatus): Promise<void> {
    const alerts: Array<{ level: string; message: string; value: any }> = [];

    // Sync lag warnings
    if (status.syncLag > this.alertThresholds.syncLagCritical) {
      alerts.push({
        level: 'CRITICAL',
        message: `Indexer sync lag is CRITICAL: ${status.syncLag} ledgers behind`,
        value: status.syncLag,
      });
    } else if (status.syncLag > this.alertThresholds.syncLagWarning) {
      alerts.push({
        level: 'WARNING',
        message: `Indexer sync lag is HIGH: ${status.syncLag} ledgers behind`,
        value: status.syncLag,
      });
    }

    // Response time warning
    if (status.responseTime > this.alertThresholds.maxResponseTime) {
      alerts.push({
        level: 'WARNING',
        message: `Indexer response time is SLOW: ${status.responseTime}ms`,
        value: status.responseTime,
      });
    }

    // No recent sync
    if (status.lastSyncTime) {
      const timeSinceLastSync = Date.now() - status.lastSyncTime.getTime();
      if (timeSinceLastSync > this.alertThresholds.minSyncFrequency) {
        alerts.push({
          level: 'CRITICAL',
          message: `Indexer has not synced in ${(timeSinceLastSync / 60000).toFixed(1)} minutes`,
          value: timeSinceLastSync,
        });
      }
    }

    // Emit alerts
    for (const alert of alerts) {
      logger[alert.level === 'CRITICAL' ? 'error' : 'warn'](alert.message);
      await this.emitAlert(alert);
    }
  }

  /**
   * Emit alert to monitoring systems
   */
  private async emitAlert(alert: { level: string; message: string; value: any }): Promise<void> {
    // Store alert in database
    try {
      await prisma.alert.create({
        data: {
          type: 'INDEXER_HEALTH',
          severity: alert.level,
          message: alert.message,
          metadata: {
            value: alert.value,
            network: this.network,
          },
          acknowledged: false,
        },
      });
    } catch (error) {
      logger.error('Failed to store alert:', error);
    }

    // TODO: Integrate with external alerting systems (PagerDuty, Slack, etc.)
    // Example: Send to webhook
    // await this.sendWebhookAlert(alert);
  }

  /**
   * Log health status
   */
  private logHealthStatus(status: HealthStatus): void {
    logger.info(`Indexer Health Check:
      Status: ${status.isHealthy ? '✓ HEALTHY' : '✗ UNHEALTHY'}
      Last Indexed Ledger: ${status.lastIndexedLedger}
      Current Network Ledger: ${status.currentNetworkLedger}
      Sync Lag: ${status.syncLag} ledgers
      Total Events: ${status.totalEvents}
      Response Time: ${status.responseTime}ms
      Last Sync: ${status.lastSyncTime?.toISOString() || 'Never'}
    `);
  }

  /**
   * Get current network ledger from RPC
   */
  private async getCurrentNetworkLedger(): Promise<number> {
    try {
      const response = await axios.post(this.stellarRpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestLedger',
        params: {},
      }, { timeout: 5000 });

      return response.data.result?.ledger || 0;
    } catch (error) {
      logger.error('Failed to get current network ledger:', error);
      return 0;
    }
  }

  /**
   * Get indexer state from database
   */
  private async getIndexerState(): Promise<any> {
    try {
      return await prisma.eventIndexerState.findUnique({
        where: { network: this.network },
      });
    } catch (error) {
      logger.error('Failed to get indexer state:', error);
      return null;
    }
  }

  /**
   * Get total indexed events
   */
  private async getTotalEvents(): Promise<number> {
    try {
      return await prisma.indexedEvent.count();
    } catch (error) {
      logger.error('Failed to get event count:', error);
      return 0;
    }
  }

  /**
   * Update indexer health status in database
   */
  private async updateHealthStatus(isHealthy: boolean): Promise<void> {
    try {
      await prisma.eventIndexerState.update({
        where: { network: this.network },
        data: {
          isHealthy,
          lastHealthCheck: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to update health status:', error);
    }
  }

  /**
   * Get detailed health report
   */
  async getHealthReport(): Promise<{
    status: HealthStatus;
    history: Array<{ timestamp: Date; isHealthy: boolean; syncLag: number }>;
    uptime: number;
  }> {
    const status = await this.checkHealth();
    
    // Get last 24 hours of health checks from alerts
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const healthHistory = await prisma.alert.findMany({
      where: {
        type: 'INDEXER_HEALTH',
        createdAt: { gte: twentyFourHoursAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const history = healthHistory.map(alert => ({
      timestamp: alert.createdAt,
      isHealthy: alert.severity !== 'CRITICAL',
      syncLag: typeof alert.metadata === 'object' && alert.metadata !== null 
        ? (alert.metadata as any).value || 0 
        : 0,
    }));

    // Calculate uptime percentage
    const totalChecks = history.length;
    const healthyChecks = history.filter(h => h.isHealthy).length;
    const uptime = totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 100;

    return {
      status,
      history,
      uptime,
    };
  }

  /**
   * Manual sync lag check (on-demand)
   */
  async getSyncLag(): Promise<{
    currentLedger: number;
    indexedLedger: number;
    lag: number;
    isAcceptable: boolean;
  }> {
    const currentLedger = await this.getCurrentNetworkLedger();
    const indexerState = await this.getIndexerState();
    const indexedLedger = indexerState ? Number(indexerState.lastLedger) : 0;
    const lag = currentLedger - indexedLedger;

    return {
      currentLedger,
      indexedLedger,
      lag,
      isAcceptable: lag <= this.alertThresholds.syncLagWarning,
    };
  }
}
