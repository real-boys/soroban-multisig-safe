import nodemailer from 'nodemailer';
import { format } from 'date-fns';
import { AnalyticsService } from './AnalyticsService';
import { circuitBreakerService } from './CircuitBreakerService';
import { retryService } from './RetryService';
import { EMAIL_RETRY_CONFIG } from '@/config/retryConfig';
import { logger } from '@/utils/logger';

export interface WeeklySummaryData {
  weekStart: Date;
  weekEnd: Date;
  newTransactions: number;
  totalAmount: bigint;
  pendingTransactions: number;
  topSigners: Array<{
    email: string;
    transactionsSigned: number;
  }>;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private analyticsService: AnalyticsService;
  private readonly circuitName = 'email-service';
  private fallbackEmailQueue: Array<{ mailOptions: any; timestamp: Date }> = [];

  constructor() {
    this.analyticsService = new AnalyticsService();
    
    // Initialize email transporter
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send weekly summary email to all signers
   */
  async sendWeeklySummary(organizationId: string): Promise<void> {
    try {
      // Get weekly summary data
      const summaryData = await this.analyticsService.getWeeklySummary(organizationId);

      // Get all signers for the organization
      const signers = await this.getOrganizationSigners(organizationId);

      // Send email to each signer
      const emailPromises = signers.map(signer => 
        this.sendWeeklySummaryEmail(signer.email, summaryData, signer.stellarAddress)
      );

      await Promise.all(emailPromises);
      
      console.log(`Weekly summary sent to ${signers.length} signers for organization ${organizationId}`);
    } catch (error) {
      console.error('Error sending weekly summary:', error);
      throw new Error('Failed to send weekly summary');
    }
  }

  /**
   * Send weekly summary email to a specific signer
   */
  private async sendWeeklySummaryEmail(
    email: string, 
    summaryData: WeeklySummaryData,
    signerAddress: string
  ): Promise<void> {
    const htmlContent = this.generateWeeklySummaryHTML(summaryData, signerAddress);

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@multisig-safe.com',
      to: email,
      subject: `Weekly Multisig Summary - ${format(summaryData.weekStart, 'MMM dd')} - ${format(summaryData.weekEnd, 'MMM dd, yyyy')}`,
      html: htmlContent,
    };

    await this.sendEmailWithCircuitBreaker(mailOptions);
  }

  /**
   * Send email with circuit breaker protection and retry logic
   */
  private async sendEmailWithCircuitBreaker(mailOptions: any): Promise<void> {
    try {
      await circuitBreakerService.execute(
        this.circuitName,
        async () => {
          const result = await retryService.executeWithRetry(
            async () => {
              return await this.transporter.sendMail(mailOptions);
            },
            {
              ...EMAIL_RETRY_CONFIG,
              onRetry: (attempt, error, delay) => {
                logger.warn(
                  `Email send failed (attempt ${attempt}): ${error.message}. ` +
                  `Retrying in ${delay}ms...`
                );
              },
            }
          );

          if (!result.success) {
            throw result.error || new Error('Email send failed');
          }

          return result.result;
        },
        {
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 300000, // 5 minutes
          monitoringPeriod: 600000, // 10 minutes
        }
      );

      logger.info(`Email sent successfully to ${mailOptions.to}`);
    } catch (error: any) {
      logger.error(`Failed to send email to ${mailOptions.to}:`, error);
      
      // Fallback: Queue email for later retry
      if (error.circuitState === 'OPEN') {
        logger.warn('Email circuit breaker is OPEN, queueing email for later');
        this.queueEmailForLater(mailOptions);
      }
      
      throw error;
    }
  }

  /**
   * Queue email for later retry when circuit is open
   */
  private queueEmailForLater(mailOptions: any): void {
    this.fallbackEmailQueue.push({
      mailOptions,
      timestamp: new Date(),
    });

    // Limit queue size to prevent memory issues
    if (this.fallbackEmailQueue.length > 1000) {
      this.fallbackEmailQueue.shift();
      logger.warn('Email fallback queue is full, removing oldest email');
    }
  }

  /**
   * Process queued emails (should be called periodically)
   */
  async processQueuedEmails(): Promise<void> {
    if (this.fallbackEmailQueue.length === 0) {
      return;
    }

    // Check if circuit is closed
    if (circuitBreakerService.isOpen(this.circuitName)) {
      logger.info('Email circuit is still open, skipping queued emails');
      return;
    }

    logger.info(`Processing ${this.fallbackEmailQueue.length} queued emails`);

    const emailsToProcess = [...this.fallbackEmailQueue];
    this.fallbackEmailQueue = [];

    for (const { mailOptions, timestamp } of emailsToProcess) {
      try {
        // Skip emails older than 24 hours
        const age = Date.now() - timestamp.getTime();
        if (age > 24 * 60 * 60 * 1000) {
          logger.warn(`Skipping email older than 24 hours: ${mailOptions.to}`);
          continue;
        }

        await this.sendEmailWithCircuitBreaker(mailOptions);
      } catch (error) {
        logger.error(`Failed to process queued email:`, error);
        // Re-queue if still failing
        this.fallbackEmailQueue.push({ mailOptions, timestamp });
      }
    }
  }

  /**
   * Get email service health status
   */
  getHealthStatus(): {
    circuitState: string;
    queuedEmails: number;
    isHealthy: boolean;
  } {
    const stats = circuitBreakerService.getStats(this.circuitName);
    
    return {
      circuitState: stats?.state || 'UNKNOWN',
      queuedEmails: this.fallbackEmailQueue.length,
      isHealthy: stats?.state === 'CLOSED' || stats?.state === 'HALF_OPEN',
    };
  }

  /**
   * Generate HTML content for weekly summary email
   */
  private generateWeeklySummaryHTML(summaryData: WeeklySummaryData, signerAddress: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Weekly Multisig Summary</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
        }
        .content {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 0 0 8px 8px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin: 20px 0;
        }
        .summary-item {
            background: white;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-item .number {
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
        }
        .summary-item .label {
            font-size: 14px;
            color: #7f8c8d;
            margin-top: 5px;
        }
        .section {
            margin: 20px 0;
        }
        .section h3 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 10px;
            text-align: left;
        }
        th {
            background-color: #3498db;
            color: white;
        }
        .cta-button {
            display: inline-block;
            background: #3498db;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #7f8c8d;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Weekly Multisig Summary</h1>
        <p>${format(summaryData.weekStart, 'MMMM dd, yyyy')} - ${format(summaryData.weekEnd, 'MMMM dd, yyyy')}</p>
    </div>

    <div class="content">
        <p>Hello,</p>
        <p>Here's your weekly summary for the multisig wallet activities:</p>

        <div class="summary-grid">
            <div class="summary-item">
                <div class="number">${summaryData.newTransactions}</div>
                <div class="label">New Transactions</div>
            </div>
            <div class="summary-item">
                <div class="number">${(Number(summaryData.totalAmount) / 10000000).toFixed(2)} XLM</div>
                <div class="label">Total Amount</div>
            </div>
            <div class="summary-item">
                <div class="number">${summaryData.pendingTransactions}</div>
                <div class="label">Pending Transactions</div>
            </div>
            <div class="summary-item">
                <div class="number">${summaryData.topSigners.length}</div>
                <div class="label">Active Signers</div>
            </div>
        </div>

        ${summaryData.topSigners.length > 0 ? `
            <div class="section">
                <h3>Top Signers This Week</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Transactions Signed</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summaryData.topSigners.map(signer => `
                            <tr>
                                <td>${signer.email}</td>
                                <td>${signer.transactionsSigned}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : ''}

        ${summaryData.pendingTransactions > 0 ? `
            <div class="section">
                <h3>Action Required</h3>
                <p>You have <strong>${summaryData.pendingTransactions}</strong> pending transaction(s) that require your signature.</p>
                <a href="${process.env.FRONTEND_URL || 'https://app.multisig-safe.com'}/transactions" class="cta-button">
                    Review Pending Transactions
                </a>
            </div>
        ` : ''}

        <div class="section">
            <h3>Security Reminder</h3>
            <p>Always verify transaction details before signing. Never share your private keys or approve suspicious transactions.</p>
        </div>

        <div class="footer">
            <p>This is an automated message from Soroban Multisig Safe.</p>
            <p>Your Stellar address: ${signerAddress}</p>
            <p>If you didn't expect this email, please contact support.</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Get all signers for an organization
   */
  private async getOrganizationSigners(organizationId: string): Promise<Array<{ email: string; stellarAddress: string }>> {
    // This would typically query your database for all users who are signers
    // For now, we'll return a placeholder implementation
    try {
      // You would need to implement this based on your user/wallet structure
      // This might involve querying wallet owners and getting their user details
      
      // Placeholder implementation - you'll need to adapt this to your actual schema
      const wallets = await this.analyticsService['prisma'].wallet.findMany({
        where: {
          ownerId: organizationId,
        },
        include: {
          owners: true,
        },
      });

      const uniqueSigners = new Map();
      
      wallets.forEach(wallet => {
        wallet.owners.forEach(owner => {
          if (!uniqueSigners.has(owner.address)) {
            uniqueSigners.set(owner.address, owner.address);
          }
        });
      });

      // Convert addresses to user details (you'll need to implement this mapping)
      const signers = Array.from(uniqueSigners.keys()).map(address => ({
        email: `user@${address.replace('G', '')}.com`, // Placeholder email
        stellarAddress: address,
      }));

      return signers;
    } catch (error) {
      console.error('Error getting organization signers:', error);
      return [];
    }
  }

  /**
   * Send audit report email
   */
  async sendAuditReport(
    email: string,
    reportData: any,
    attachmentPaths: string[] = []
  ): Promise<void> {
    try {
      const mailOptions = {
        from: process.env.FROM_EMAIL || 'noreply@multisig-safe.com',
        to: email,
        subject: `Audit Report - ${reportData.organization} (${format(reportData.dateRange.start, 'MMM dd')} - ${format(reportData.dateRange.end, 'MMM dd, yyyy')})`,
        html: this.generateAuditReportEmail(reportData),
        attachments: attachmentPaths.map(path => ({
          filename: path.split('/').pop() || 'report',
          path: path,
        })),
      };

      await this.sendEmailWithCircuitBreaker(mailOptions);
    } catch (error) {
      logger.error('Error sending audit report email:', error);
      throw new Error('Failed to send audit report email');
    }
  }

  /**
   * Generate HTML content for audit report email
   */
  private generateAuditReportEmail(reportData: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Audit Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
        }
        .content {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 0 0 8px 8px;
        }
        .summary {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #7f8c8d;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Audit Report</h1>
        <p>${reportData.organization}</p>
        <p>${format(reportData.dateRange.start, 'MMMM dd, yyyy')} - ${format(reportData.dateRange.end, 'MMMM dd, yyyy')}</p>
    </div>

    <div class="content">
        <p>Hello,</p>
        <p>Your audit report is ready. Here's a summary of the findings:</p>

        <div class="summary">
            <h3>Key Metrics</h3>
            <ul>
                <li><strong>Total Transactions:</strong> ${reportData.totalTransactions}</li>
                <li><strong>Total Amount:</strong> ${(Number(reportData.totalAmount) / 10000000).toFixed(2)} XLM</li>
                <li><strong>Success Rate:</strong> ${((reportData.successfulTransactions / reportData.totalTransactions) * 100).toFixed(1)}%</li>
                <li><strong>Failed Transactions:</strong> ${reportData.failedTransactions}</li>
            </ul>
        </div>

        <p>The detailed audit report is attached to this email in both CSV and PDF formats for your records.</p>

        <div class="footer">
            <p>This is an automated message from Soroban Multisig Safe.</p>
            <p>Please keep this email for your compliance records.</p>
        </div>
    </div>
</body>
</html>
    `;
  }
}
