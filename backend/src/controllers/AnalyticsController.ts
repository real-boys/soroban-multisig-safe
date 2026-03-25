import { Request, Response } from 'express';
import { AnalyticsService } from '@/services/AnalyticsService';
import { ExportService } from '@/services/ExportService';
import { PDFExportService } from '@/services/PDFExportService';
import { ChartService } from '@/services/ChartService';
import { EmailService } from '@/services/EmailService';
import { ApiResponse } from '@/types/api';
import { validationResult } from 'express-validator';
import fs from 'fs/promises';
import path from 'path';

export class AnalyticsController {
  private analyticsService: AnalyticsService;
  private exportService: ExportService;
  private pdfExportService: PDFExportService;
  private chartService: ChartService;
  private emailService: EmailService;

  constructor() {
    this.analyticsService = new AnalyticsService();
    this.exportService = new ExportService();
    this.pdfExportService = new PDFExportService();
    this.chartService = new ChartService();
    this.emailService = new EmailService();
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(req: Request, res: Response): Promise<void> {
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

      const { organizationId, startDate, endDate, format = 'json' } = req.body;
      const userId = req.user!.id;

      // Convert string dates to Date objects
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Generate audit report data
      const reportData = await this.analyticsService.generateAuditReport(
        organizationId,
        start,
        end
      );

      let response: any = {
        success: true,
        data: reportData,
      };

      // Handle different export formats
      if (format === 'csv') {
        const csvPath = await this.exportService.exportToCSV(reportData);
        const summaryPath = await this.exportService.exportTopDestinations(reportData);
        const signerPath = await this.exportService.exportSignerActivity(reportData);

        response = {
          success: true,
          data: {
            message: 'CSV reports generated successfully',
            files: [
              { name: 'transactions', path: csvPath },
              { name: 'summary', path: summaryPath },
              { name: 'signers', path: signerPath },
            ],
          },
        };
      } else if (format === 'pdf') {
        const pdfPath = await this.pdfExportService.exportToPDF(reportData);
        
        response = {
          success: true,
          data: {
            message: 'PDF report generated successfully',
            file: pdfPath,
          },
        };
      }

      res.json(response);
    } catch (error) {
      console.error('Error generating audit report:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate audit report',
        },
      });
    }
  }

  /**
   * Download audit report file
   */
  async downloadReport(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      const filepath = path.join(process.cwd(), 'exports', filename);

      // Check if file exists
      try {
        await fs.access(filepath);
      } catch {
        res.status(404).json({
          success: false,
          error: {
            code: 'FILE_NOT_FOUND',
            message: 'Report file not found',
          },
        });
        return;
      }

      // Get file stats
      const stats = await fs.stat(filepath);
      
      // Set appropriate headers
      res.setHeader('Content-Type', this.getContentType(filename));
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Stream file to response
      const fileStream = fs.createReadStream(filepath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error downloading report:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to download report',
        },
      });
    }
  }

  /**
   * Generate charts for analytics
   */
  async generateCharts(req: Request, res: Response): Promise<void> {
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

      const { organizationId, startDate, endDate } = req.body;

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Generate audit report data first
      const reportData = await this.analyticsService.generateAuditReport(
        organizationId,
        start,
        end
      );

      // Generate charts
      const charts = await this.chartService.generateAllCharts(reportData);

      res.json({
        success: true,
        data: {
          message: 'Charts generated successfully',
          charts: {
            spendingTrends: charts.spendingTrends,
            topDestinations: charts.topDestinations,
            signerActivity: charts.signerActivity,
            transactionStatus: charts.transactionStatus,
          },
        },
      });
    } catch (error) {
      console.error('Error generating charts:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate charts',
        },
      });
    }
  }

  /**
   * Verify transaction integrity
   */
  async verifyTransaction(req: Request, res: Response): Promise<void> {
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

      const { transactionId } = req.params;

      const verification = await this.analyticsService.verifyTransactionIntegrity(transactionId);

      res.json({
        success: true,
        data: verification,
      });
    } catch (error) {
      console.error('Error verifying transaction:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to verify transaction',
        },
      });
    }
  }

  /**
   * Get weekly summary
   */
  async getWeeklySummary(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const userId = req.user!.id;

      const summary = await this.analyticsService.getWeeklySummary(organizationId);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error('Error getting weekly summary:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get weekly summary',
        },
      });
    }
  }

  /**
   * Send weekly summary email
   */
  async sendWeeklySummary(req: Request, res: Response): Promise<void> {
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

      const { organizationId } = req.body;

      await this.emailService.sendWeeklySummary(organizationId);

      res.json({
        success: true,
        data: {
          message: 'Weekly summary sent successfully',
        },
      });
    } catch (error) {
      console.error('Error sending weekly summary:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to send weekly summary',
        },
      });
    }
  }

  /**
   * Email audit report
   */
  async emailAuditReport(req: Request, res: Response): Promise<void> {
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

      const { organizationId, startDate, endDate, email, format = 'pdf' } = req.body;

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Generate audit report data
      const reportData = await this.analyticsService.generateAuditReport(
        organizationId,
        start,
        end
      );

      let attachmentPaths: string[] = [];

      if (format === 'pdf') {
        const pdfPath = await this.pdfExportService.exportToPDF(reportData);
        attachmentPaths.push(pdfPath);
      } else if (format === 'csv') {
        const csvPath = await this.exportService.exportToCSV(reportData);
        attachmentPaths.push(csvPath);
      }

      // Send email
      await this.emailService.sendAuditReport(email, reportData, attachmentPaths);

      res.json({
        success: true,
        data: {
          message: 'Audit report sent successfully via email',
        },
      });
    } catch (error) {
      console.error('Error emailing audit report:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to email audit report',
        },
      });
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getDashboardData(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      const { period = '30' } = req.query; // Default to 30 days

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - parseInt(period as string));

      // Generate audit report data
      const reportData = await this.analyticsService.generateAuditReport(
        organizationId,
        startDate,
        endDate
      );

      // Generate charts
      const charts = await this.chartService.generateAllCharts(reportData);

      res.json({
        success: true,
        data: {
          summary: {
            totalTransactions: reportData.totalTransactions,
            totalAmount: reportData.totalAmount,
            successRate: (reportData.successfulTransactions / reportData.totalTransactions) * 100,
            pendingTransactions: reportData.failedTransactions,
          },
          topDestinations: reportData.topDestinations.slice(0, 5),
          signerActivity: reportData.signerActivity.slice(0, 5),
          spendingTrends: reportData.spendingTrends.slice(-7), // Last 7 days
          charts,
        },
      });
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get dashboard data',
        },
      });
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'csv':
        return 'text/csv';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      default:
        return 'application/octet-stream';
    }
  }
}
