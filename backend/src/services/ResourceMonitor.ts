import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/utils/logger';

const execAsync = promisify(exec);

export interface ResourceMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  network?: {
    bytesReceived: number;
    bytesSent: number;
  };
}

export interface ResourceAlert {
  type: 'CPU' | 'MEMORY' | 'DISK';
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  value: number;
  threshold: number;
}

export class ResourceMonitor {
  private checkInterval: number = 60000; // 1 minute
  private isRunning: boolean = false;
  private monitorTimer?: NodeJS.Timeout;
  
  private thresholds = {
    cpuWarning: 70,
    cpuCritical: 90,
    memoryWarning: 75,
    memoryCritical: 90,
    diskWarning: 80,
    diskCritical: 95,
  };

  constructor(intervalMs?: number) {
    if (intervalMs) {
      this.checkInterval = intervalMs;
    }
  }

  /**
   * Start resource monitoring
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Resource monitor is already running');
      return;
    }

    this.isRunning = true;
    this.monitorResources();
    logger.info('Resource monitoring started');
  }

  /**
   * Stop resource monitoring
   */
  stop(): void {
    this.isRunning = false;
    if (this.monitorTimer) {
      clearTimeout(this.monitorTimer);
    }
    logger.info('Resource monitoring stopped');
  }

  /**
   * Monitor resources periodically
   */
  private async monitorResources(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const metrics = await this.getMetrics();
      
      // Log metrics
      this.logMetrics(metrics);
      
      // Check thresholds and trigger alerts
      await this.checkThresholds(metrics);
      
      // Store metrics (optional - could send to monitoring service)
      await this.storeMetrics(metrics);
    } catch (error: any) {
      logger.error('Failed to collect resource metrics:', error);
    }

    this.monitorTimer = setTimeout(() => this.monitorResources(), this.checkInterval);
  }

  /**
   * Get comprehensive resource metrics
   */
  async getMetrics(): Promise<ResourceMetrics> {
    const [cpuInfo, memoryInfo, diskInfo] = await Promise.all([
      this.getCPUUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
    ]);

    return {
      timestamp: new Date(),
      cpu: cpuInfo,
      memory: memoryInfo,
      disk: diskInfo,
    };
  }

  /**
   * Get CPU usage
   */
  private async getCPUUsage(): Promise<ResourceMetrics['cpu']> {
    try {
      // Get CPU cores
      const coresCmd = await execAsync('nproc || sysctl -n hw.ncpu || echo 1');
      const cores = parseInt(coresCmd.stdout.trim()) || 1;

      // Get load average
      const loadCmd = await execAsync('cat /proc/loadavg 2>/dev/null || uptime');
      const loadParts = loadCmd.stdout.trim().split(/\s+/);
      const loadAverage = [
        parseFloat(loadParts[0]) || 0,
        parseFloat(loadParts[1]) || 0,
        parseFloat(loadParts[2]) || 0,
      ];

      // Calculate CPU usage percentage
      const cpuPercent = await this.calculateCPUPercent();

      return {
        usage: cpuPercent,
        cores,
        loadAverage,
      };
    } catch (error) {
      logger.error('Failed to get CPU info:', error);
      return {
        usage: 0,
        cores: 1,
        loadAverage: [0, 0, 0],
      };
    }
  }

  /**
   * Calculate CPU percentage using /proc/stat
   */
  private async calculateCPUPercent(): Promise<number> {
    try {
      const readCpuStat = async () => {
        const cmd = await execAsync('cat /proc/stat | head -1');
        const parts = cmd.stdout.trim().split(/\s+/);
        return {
          user: parseInt(parts[1]),
          nice: parseInt(parts[2]),
          system: parseInt(parts[3]),
          idle: parseInt(parts[4]),
          iowait: parseInt(parts[5]) || 0,
          irq: parseInt(parts[6]) || 0,
          softirq: parseInt(parts[7]) || 0,
        };
      };

      const stat1 = await readCpuStat();
      await new Promise(resolve => setTimeout(resolve, 1000));
      const stat2 = await readCpuStat();

      const totals1 = stat1.user + stat1.nice + stat1.system + stat1.idle + stat1.iowait + stat1.irq + stat1.softirq;
      const totals2 = stat2.user + stat2.nice + stat2.system + stat2.idle + stat2.iowait + stat2.irq + stat2.softirq;

      const idleDiff = stat2.idle - stat1.idle;
      const totalDiff = totals2 - totals1;

      const usage = totalDiff === 0 ? 0 : ((totalDiff - idleDiff) / totalDiff) * 100;
      return Math.round(usage * 100) / 100;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get memory usage
   */
  private async getMemoryUsage(): Promise<ResourceMetrics['memory']> {
    try {
      const cmd = await execAsync('free -b | grep Mem');
      const parts = cmd.stdout.trim().split(/\s+/);
      
      const total = parseInt(parts[1]);
      const used = parseInt(parts[2]);
      const free = parseInt(parts[3]);
      const percent = total > 0 ? (used / total) * 100 : 0;

      return {
        total,
        used,
        free,
        percent: Math.round(percent * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get memory info:', error);
      return {
        total: 0,
        used: 0,
        free: 0,
        percent: 0,
      };
    }
  }

  /**
   * Get disk usage
   */
  private async getDiskUsage(): Promise<ResourceMetrics['disk']> {
    try {
      const cmd = await execAsync('df -B1 / | tail -1');
      const parts = cmd.stdout.trim().split(/\s+/);
      
      const total = parseInt(parts[1]);
      const used = parseInt(parts[2]);
      const free = parseInt(parts[3]);
      const percent = total > 0 ? (used / total) * 100 : 0;

      return {
        total,
        used,
        free,
        percent: Math.round(percent * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get disk info:', error);
      return {
        total: 0,
        used: 0,
        free: 0,
        percent: 0,
      };
    }
  }

  /**
   * Check resource thresholds and trigger alerts
   */
  private async checkThresholds(metrics: ResourceMetrics): Promise<void> {
    const alerts: ResourceAlert[] = [];

    // CPU checks
    if (metrics.cpu.usage >= this.thresholds.cpuCritical) {
      alerts.push({
        type: 'CPU',
        severity: 'CRITICAL',
        message: `CPU usage is critically high: ${metrics.cpu.usage}%`,
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpuCritical,
      });
    } else if (metrics.cpu.usage >= this.thresholds.cpuWarning) {
      alerts.push({
        type: 'CPU',
        severity: 'WARNING',
        message: `CPU usage is elevated: ${metrics.cpu.usage}%`,
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpuWarning,
      });
    }

    // Memory checks
    if (metrics.memory.percent >= this.thresholds.memoryCritical) {
      alerts.push({
        type: 'MEMORY',
        severity: 'CRITICAL',
        message: `Memory usage is critically high: ${metrics.memory.percent}%`,
        value: metrics.memory.percent,
        threshold: this.thresholds.memoryCritical,
      });
    } else if (metrics.memory.percent >= this.thresholds.memoryWarning) {
      alerts.push({
        type: 'MEMORY',
        severity: 'WARNING',
        message: `Memory usage is elevated: ${metrics.memory.percent}%`,
        value: metrics.memory.percent,
        threshold: this.thresholds.memoryWarning,
      });
    }

    // Disk checks
    if (metrics.disk.percent >= this.thresholds.diskCritical) {
      alerts.push({
        type: 'DISK',
        severity: 'CRITICAL',
        message: `Disk usage is critically high: ${metrics.disk.percent}%`,
        value: metrics.disk.percent,
        threshold: this.thresholds.diskCritical,
      });
    } else if (metrics.disk.percent >= this.thresholds.diskWarning) {
      alerts.push({
        type: 'DISK',
        severity: 'WARNING',
        message: `Disk usage is elevated: ${metrics.disk.percent}%`,
        value: metrics.disk.percent,
        threshold: this.thresholds.diskWarning,
      });
    }

    // Process alerts
    for (const alert of alerts) {
      await this.handleAlert(alert, metrics);
    }
  }

  /**
   * Handle resource alert
   */
  private async handleAlert(alert: ResourceAlert, metrics: ResourceMetrics): Promise<void> {
    logger[alert.severity === 'CRITICAL' ? 'error' : 'warn'](alert.message);

    // Store alert in database
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      await prisma.alert.create({
        data: {
          type: `RESOURCE_${alert.type}`,
          severity: alert.severity,
          message: alert.message,
          metadata: {
            value: alert.value,
            threshold: alert.threshold,
            metrics: {
              cpu: metrics.cpu.usage,
              memory: metrics.memory.percent,
              disk: metrics.disk.percent,
            },
          },
          acknowledged: false,
        },
      });
    } catch (error) {
      logger.error('Failed to store resource alert:', error);
    }

    // Send webhook notification for critical alerts
    if (alert.severity === 'CRITICAL') {
      await this.sendWebhookNotification(alert, metrics);
    }
  }

  /**
   * Log metrics
   */
  private logMetrics(metrics: ResourceMetrics): void {
    logger.info(`Resource Metrics:
      CPU: ${metrics.cpu.usage}% (Load: ${metrics.cpu.loadAverage.join(', ')})
      Memory: ${metrics.memory.percent}% (${Math.round(metrics.memory.used / 1024 / 1024)}MB / ${Math.round(metrics.memory.total / 1024 / 1024)}MB)
      Disk: ${metrics.disk.percent}% (${Math.round(metrics.disk.used / 1024 / 1024 / 1024)}GB / ${Math.round(metrics.disk.total / 1024 / 1024 / 1024)}GB)
    `);
  }

  /**
   * Store metrics (placeholder for integration with monitoring systems)
   */
  private async storeMetrics(metrics: ResourceMetrics): Promise<void> {
    // TODO: Integrate with Prometheus, Grafana, or other monitoring systems
    // For now, just log to file
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: ResourceAlert, metrics: ResourceMetrics): Promise<void> {
    const webhookUrl = process.env.RESOURCE_ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.debug('No webhook URL configured for resource alerts');
      return;
    }

    const axios = require('axios');
    
    try {
      await axios.post(webhookUrl, {
        type: 'RESOURCE_ALERT',
        resourceType: alert.type,
        severity: alert.severity,
        message: alert.message,
        value: alert.value,
        threshold: alert.threshold,
        metrics: {
          cpu: metrics.cpu.usage,
          memory: metrics.memory.percent,
          disk: metrics.disk.percent,
        },
        timestamp: new Date().toISOString(),
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      logger.info('Resource alert notification sent');
    } catch (error) {
      logger.error('Failed to send resource alert notification:', error);
    }
  }

  /**
   * Get current metrics (on-demand)
   */
  async getCurrentMetrics(): Promise<ResourceMetrics> {
    return await this.getMetrics();
  }

  /**
   * Update thresholds
   */
  updateThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('Resource monitoring thresholds updated');
  }

  /**
   * Get threshold configuration
   */
  getThresholds(): typeof this.thresholds {
    return { ...this.thresholds };
  }
}
