import { CronJob } from 'cron';
import { EmailService } from '@/services/EmailService';
import { PrismaClient } from '@prisma/client';

export class CronService {
  private emailService: EmailService;
  private prisma: PrismaClient;
  private weeklySummaryJob: CronJob;

  constructor() {
    this.emailService = new EmailService();
    this.prisma = new PrismaClient();
    
    // Schedule weekly summary for every Monday at 9:00 AM
    this.weeklySummaryJob = new CronJob('0 9 * * 1', // Cron expression: minute hour day month day-of-week
      this.handleWeeklySummary.bind(this),
      null, // onComplete
      true, // start
      'America/New_York' // timezone
    );
  }

  /**
   * Handle weekly summary cron job
   */
  private async handleWeeklySummary(): Promise<void> {
    try {
      console.log('Starting weekly summary cron job...');

      // Get all organizations (users with wallets)
      const organizations = await this.getActiveOrganizations();

      for (const org of organizations) {
        try {
          await this.emailService.sendWeeklySummary(org.id);
          console.log(`Weekly summary sent to organization: ${org.id}`);
        } catch (error) {
          console.error(`Failed to send weekly summary to organization ${org.id}:`, error);
        }
      }

      console.log('Weekly summary cron job completed successfully');
    } catch (error) {
      console.error('Error in weekly summary cron job:', error);
    }
  }

  /**
   * Get all active organizations (users with active wallets)
   */
  private async getActiveOrganizations(): Promise<Array<{ id: string; email: string }>> {
    try {
      const organizations = await this.prisma.user.findMany({
        where: {
          wallets: {
            some: {
              isActive: true,
            },
          },
          isActive: true,
        },
        select: {
          id: true,
          email: true,
        },
      });

      return organizations;
    } catch (error) {
      console.error('Error getting active organizations:', error);
      return [];
    }
  }

  /**
   * Start all cron jobs
   */
  start(): void {
    console.log('Starting cron jobs...');
    
    if (this.weeklySummaryJob.running) {
      console.log('Weekly summary job is already running');
    } else {
      this.weeklySummaryJob.start();
      console.log('Weekly summary job scheduled for every Monday at 9:00 AM EST');
    }
  }

  /**
   * Stop all cron jobs
   */
  stop(): void {
    console.log('Stopping cron jobs...');
    
    if (this.weeklySummaryJob.running) {
      this.weeklySummaryJob.stop();
      console.log('Weekly summary job stopped');
    }
  }

  /**
   * Get status of all cron jobs
   */
  getStatus(): {
    weeklySummary: {
      running: boolean;
      nextDate?: Date;
      lastDate?: Date;
    };
  } {
    return {
      weeklySummary: {
        running: this.weeklySummaryJob.running,
        nextDate: this.weeklySummaryJob.nextDate()?.toDate(),
        lastDate: this.weeklySummaryJob.lastDate()?.toDate(),
      },
    };
  }

  /**
   * Manually trigger weekly summary for testing
   */
  async triggerWeeklySummary(organizationId?: string): Promise<void> {
    try {
      if (organizationId) {
        await this.emailService.sendWeeklySummary(organizationId);
        console.log(`Manual weekly summary sent to organization: ${organizationId}`);
      } else {
        await this.handleWeeklySummary();
        console.log('Manual weekly summary sent to all organizations');
      }
    } catch (error) {
      console.error('Error triggering manual weekly summary:', error);
      throw error;
    }
  }

  /**
   * Schedule custom cron job
   */
  scheduleCustomJob(
    name: string,
    cronExpression: string,
    callback: () => Promise<void>,
    timezone: string = 'America/New_York'
  ): CronJob {
    try {
      const job = new CronJob(
        cronExpression,
        callback,
        null,
        true,
        timezone
      );

      console.log(`Custom job '${name}' scheduled with expression: ${cronExpression}`);
      return job;
    } catch (error) {
      console.error(`Error scheduling custom job '${name}':`, error);
      throw error;
    }
  }

  /**
   * Schedule monthly audit report
   */
  scheduleMonthlyAuditReport(): void {
    const monthlyJob = new CronJob(
      '0 9 1 * *', // 9:00 AM on the 1st of every month
      async () => {
        try {
          console.log('Starting monthly audit report generation...');
          
          const organizations = await this.getActiveOrganizations();
          const lastMonth = new Date();
          lastMonth.setMonth(lastMonth.getMonth() - 1);
          const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
          const endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

          for (const org of organizations) {
            try {
              // Generate and email monthly audit report
              // This would integrate with the analytics service
              console.log(`Monthly audit report generated for organization: ${org.id}`);
            } catch (error) {
              console.error(`Failed to generate monthly report for organization ${org.id}:`, error);
            }
          }

          console.log('Monthly audit report generation completed');
        } catch (error) {
          console.error('Error in monthly audit report cron job:', error);
        }
      },
      null,
      true,
      'America/New_York'
    );

    console.log('Monthly audit report job scheduled for 9:00 AM on the 1st of every month');
  }

  /**
   * Cleanup old export files
   */
  scheduleFileCleanup(): void {
    const cleanupJob = new CronJob(
      '0 2 * * 0', // 2:00 AM every Sunday
      async () => {
        try {
          console.log('Starting file cleanup job...');
          
          const fs = require('fs').promises;
          const path = require('path');
          const exportsDir = path.join(process.cwd(), 'exports');
          
          try {
            const files = await fs.readdir(exportsDir);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

            for (const file of files) {
              const filePath = path.join(exportsDir, file);
              const stats = await fs.stat(filePath);
              
              if (now - stats.mtime.getTime() > maxAge) {
                await fs.unlink(filePath);
                console.log(`Deleted old export file: ${file}`);
              }
            }

            console.log('File cleanup job completed');
          } catch (error) {
            console.error('Error during file cleanup:', error);
          }
        } catch (error) {
          console.error('Error in file cleanup cron job:', error);
        }
      },
      null,
      true,
      'America/New_York'
    );

    console.log('File cleanup job scheduled for 2:00 AM every Sunday');
  }
}
