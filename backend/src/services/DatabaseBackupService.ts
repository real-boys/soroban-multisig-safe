import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface BackupConfig {
  backupDir: string;
  walArchiveDir: string;
  retentionDays: number;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  webhookUrl?: string;
}

export interface BackupInfo {
  id: string;
  timestamp: Date;
  location: string;
  size: string;
  type: 'full' | 'wal';
  status: 'success' | 'failed';
  logFile: string;
}

export class DatabaseBackupService {
  private config: BackupConfig;
  private isRunning: boolean = false;
  private backupInterval?: NodeJS.Timeout;

  constructor(config?: Partial<BackupConfig>) {
    this.config = {
      backupDir: config?.backupDir || '/app/backups/postgresql',
      walArchiveDir: config?.walArchiveDir || '/app/backups/wal_archive',
      retentionDays: config?.retentionDays || 7,
      dbHost: config?.dbHost || process.env.POSTGRES_HOST || 'localhost',
      dbPort: config?.dbPort || Number(process.env.POSTGRES_PORT) || 5432,
      dbName: config?.dbName || process.env.POSTGRES_DB || 'multisig_safe',
      dbUser: config?.dbUser || process.env.POSTGRES_USER || 'postgres',
      dbPassword: config?.dbPassword || process.env.POSTGRES_PASSWORD || 'postgres',
      webhookUrl: config?.webhookUrl || process.env.BACKUP_WEBHOOK_URL,
    };
  }

  /**
   * Start automated backups
   */
  start(scheduleMinutes: number = 360): void {
    if (this.isRunning) {
      logger.warn('Backup service is already running');
      return;
    }

    this.isRunning = true;
    
    // Run backup immediately
    this.performBackup();
    
    // Schedule regular backups (default: every 6 hours)
    this.backupInterval = setInterval(() => {
      this.performBackup();
    }, scheduleMinutes * 60 * 1000);

    logger.info(`Database backup service started (interval: ${scheduleMinutes} minutes)`);
  }

  /**
   * Stop automated backups
   */
  stop(): void {
    this.isRunning = false;
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }
    logger.info('Database backup service stopped');
  }

  /**
   * Perform a database backup
   */
  async performBackup(): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup_${timestamp}`;
    const backupLocation = path.join(this.config.backupDir, backupId);
    const logFile = path.join(this.config.backupDir, 'backup.log');

    logger.info(`Starting database backup: ${backupId}`);

    try {
      // Ensure directories exist
      await this.ensureDirectories();

      // Execute backup script
      const env = {
        ...process.env,
        BACKUP_DIR: this.config.backupDir,
        WAL_ARCHIVE_DIR: this.config.walArchiveDir,
        RETENTION_DAYS: this.config.retentionDays.toString(),
        POSTGRES_DB: this.config.dbName,
        POSTGRES_USER: this.config.dbUser,
        POSTGRES_PASSWORD: this.config.dbPassword,
        POSTGRES_HOST: this.config.dbHost,
        POSTGRES_PORT: this.config.dbPort.toString(),
      };

      const scriptPath = path.join(__dirname, '../../scripts/database_backup.sh');
      
      await execAsync(`bash ${scriptPath}`, {
        env,
        timeout: 30 * 60 * 1000, // 30 minute timeout
      });

      // Get backup size
      const size = await this.getDirectorySize(backupLocation);

      const backupInfo: BackupInfo = {
        id: backupId,
        timestamp: new Date(),
        location: backupLocation,
        size,
        type: 'full',
        status: 'success',
        logFile,
      };

      logger.info(`Backup completed successfully: ${backupId} (${size})`);

      // Send notification
      await this.sendNotification('success', backupInfo);

      return backupInfo;
    } catch (error: any) {
      logger.error('Backup failed:', error);

      const backupInfo: BackupInfo = {
        id: backupId,
        timestamp: new Date(),
        location: backupLocation,
        size: '0',
        type: 'full',
        status: 'failed',
        logFile,
      };

      await this.sendNotification('failed', backupInfo, error.message);

      throw error;
    }
  }

  /**
   * Restore database from backup
   */
  async restoreFromBackup(backupId: string, targetTime?: string): Promise<void> {
    logger.info(`Starting restore from backup: ${backupId}`);

    try {
      const backupLocation = path.join(this.config.backupDir, backupId);

      // Verify backup exists
      if (!fs.existsSync(backupLocation)) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Stop the application to prevent data corruption
      logger.warn('Application should be stopped before restore!');

      // Extract base backup
      await execAsync(`tar -xzf ${backupLocation}/base.tar.gz -C ${this.config.backupDir}/restore`);

      // Configure recovery if point-in-time recovery is requested
      if (targetTime) {
        const recoveryConf = path.join(this.config.backupDir, 'restore', 'postgresql.auto.conf');
        fs.appendFileSync(recoveryConf, `\nrecovery_target_time = '${targetTime}'`);
        logger.info(`Configured point-in-time recovery to: ${targetTime}`);
      }

      // Copy WAL files
      const walSource = this.config.walArchiveDir;
      const walDest = path.join(this.config.backupDir, 'restore', 'pg_wal');
      
      if (fs.existsSync(walSource)) {
        await execAsync(`cp ${walSource}/*.gz ${walDest}/ 2>/dev/null || true`);
        await execAsync(`cd ${walDest} && gunzip *.gz 2>/dev/null || true`);
      }

      logger.info(`Restore prepared. Manual steps required:`);
      logger.info(`1. Stop PostgreSQL`);
      logger.info(`2. Replace data directory with ${this.config.backupDir}/restore`);
      logger.info(`3. Create recovery.signal file`);
      logger.info(`4. Start PostgreSQL`);

    } catch (error: any) {
      logger.error('Restore failed:', error);
      throw error;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    const backups: BackupInfo[] = [];

    try {
      if (!fs.existsSync(this.config.backupDir)) {
        return backups;
      }

      const entries = fs.readdirSync(this.config.backupDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('backup_'))
        .sort((a, b) => b.name.localeCompare(a.name));

      for (const entry of entries) {
        const backupPath = path.join(this.config.backupDir, entry.name);
        const size = await this.getDirectorySize(backupPath);
        
        backups.push({
          id: entry.name,
          timestamp: new Date(entry.name.replace('backup_', '').replace(/-/g, ':').replace(/(\d{4}):(\d{2}):(\d{2})-(\d{2})-(\d{2})-(\d{2})/, '$1-$2-$3T$4:$5:$6')),
          location: backupPath,
          size,
          type: 'full',
          status: 'success',
          logFile: path.join(this.config.backupDir, 'backup.log'),
        });
      }
    } catch (error) {
      logger.error('Failed to list backups:', error);
    }

    return backups;
  }

  /**
   * Delete old backups
   */
  async cleanupOldBackups(): Promise<number> {
    let deletedCount = 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const backups = await this.listBackups();

      for (const backup of backups) {
        if (backup.timestamp < cutoffDate) {
          await execAsync(`rm -rf ${backup.location}`);
          deletedCount++;
          logger.info(`Deleted old backup: ${backup.id}`);
        }
      }

      // Clean up old WAL files
      if (fs.existsSync(this.config.walArchiveDir)) {
        const walFiles = fs.readdirSync(this.config.walArchiveDir)
          .filter(f => f.endsWith('.gz'));
        
        for (const file of walFiles) {
          const filePath = path.join(this.config.walArchiveDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${deletedCount} old backup(s)`);
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }

    return deletedCount;
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: string;
    oldestBackup: Date | null;
    newestBackup: Date | null;
    lastSuccessfulBackup: Date | null;
  }> {
    const backups = await this.listBackups();
    
    if (backups.length === 0) {
      return {
        totalBackups: 0,
        totalSize: '0',
        oldestBackup: null,
        newestBackup: null,
        lastSuccessfulBackup: null,
      };
    }

    const totalSizeBytes = backups.reduce((sum, b) => {
      const sizeMatch = b.size.match(/(\d+(?:\.\d+)?)/);
      return sum + (sizeMatch ? parseFloat(sizeMatch[0]) : 0);
    }, 0);

    const totalSize = this.formatBytes(totalSizeBytes);
    const oldestBackup = backups[backups.length - 1].timestamp;
    const newestBackup = backups[0].timestamp;
    const lastSuccessful = backups.find(b => b.status === 'success')?.timestamp || null;

    return {
      totalBackups: backups.length,
      totalSize,
      oldestBackup,
      newestBackup,
      lastSuccessfulBackup: lastSuccessful,
    };
  }

  /**
   * Ensure backup directories exist
   */
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.config.backupDir,
      this.config.walArchiveDir,
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    }
  }

  /**
   * Get directory size
   */
  private async getDirectorySize(dirPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`du -sh "${dirPath}" | cut -f1`);
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Send backup notification
   */
  private async sendNotification(
    status: 'success' | 'failed',
    backupInfo: BackupInfo,
    errorMessage?: string
  ): Promise<void> {
    if (!this.config.webhookUrl) {
      logger.debug('No webhook URL configured, skipping notification');
      return;
    }

    const axios = require('axios');
    
    try {
      await axios.post(this.config.webhookUrl, {
        type: 'DATABASE_BACKUP',
        status,
        backupId: backupInfo.id,
        timestamp: backupInfo.timestamp.toISOString(),
        location: backupInfo.location,
        size: backupInfo.size,
        errorMessage: errorMessage || null,
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      logger.info('Backup notification sent');
    } catch (error) {
      logger.error('Failed to send notification:', error);
    }
  }

  /**
   * Test backup process
   */
  async testBackup(): Promise<boolean> {
    logger.info('Testing backup process...');
    
    try {
      await this.performBackup();
      logger.info('Backup test successful');
      return true;
    } catch (error) {
      logger.error('Backup test failed:', error);
      return false;
    }
  }
}
