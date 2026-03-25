import puppeteer from 'puppeteer';
import { AuditReportData } from './AnalyticsService';
import { format } from 'date-fns';
import path from 'path';
import fs from 'fs/promises';

export class PDFExportService {
  /**
   * Export audit report to PDF format
   */
  async exportToPDF(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const filename = `audit_report_${reportData.organization}_${timestamp}.pdf`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      // Ensure exports directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Generate HTML content
      const htmlContent = this.generateHTMLReport(reportData);

      // Launch Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Set content and generate PDF
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      await page.pdf({
        path: filepath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      await browser.close();

      return filepath;
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      throw new Error('Failed to export to PDF');
    }
  }

  /**
   * Generate HTML content for PDF report
   */
  private generateHTMLReport(reportData: AuditReportData): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Audit Report - ${reportData.organization}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2c3e50;
            margin: 0;
        }
        .header p {
            color: #7f8c8d;
            margin: 5px 0;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #3498db;
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        .summary-card .value {
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
        }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            color: #2c3e50;
            border-bottom: 1px solid #ecf0f1;
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .text-right {
            text-align: right;
        }
        .status-yes {
            color: #27ae60;
            font-weight: bold;
        }
        .status-no {
            color: #e74c3c;
            font-weight: bold;
        }
        .chart-placeholder {
            background: #f8f9fa;
            border: 2px dashed #ddd;
            height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #7f8c8d;
            margin-bottom: 20px;
        }
        .page-break {
            page-break-before: always;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Audit Report</h1>
        <p><strong>${reportData.organization}</strong></p>
        <p>Period: ${format(reportData.dateRange.start, 'MMM dd, yyyy')} - ${format(reportData.dateRange.end, 'MMM dd, yyyy')}</p>
        <p>Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm:ss')}</p>
    </div>

    <div class="summary">
        <div class="summary-card">
            <h3>Total Transactions</h3>
            <div class="value">${reportData.totalTransactions}</div>
        </div>
        <div class="summary-card">
            <h3>Total Amount (XLM)</h3>
            <div class="value">${(Number(reportData.totalAmount) / 10000000).toFixed(2)}</div>
        </div>
        <div class="summary-card">
            <h3>Success Rate</h3>
            <div class="value">${((reportData.successfulTransactions / reportData.totalTransactions) * 100).toFixed(1)}%</div>
        </div>
        <div class="summary-card">
            <h3>Failed Transactions</h3>
            <div class="value">${reportData.failedTransactions}</div>
        </div>
    </div>

    <div class="section">
        <h2>Transaction Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Transaction ID</th>
                    <th>Wallet</th>
                    <th>Destination</th>
                    <th>Amount (XLM)</th>
                    <th>Status</th>
                    <th>Signatures</th>
                    <th>Created</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.transactions.slice(0, 20).map(tx => `
                    <tr>
                        <td>${tx.transactionId.toString()}</td>
                        <td>${tx.wallet.name}</td>
                        <td>${tx.destination}</td>
                        <td class="text-right">${(Number(tx.amount) / 10000000).toFixed(7)}</td>
                        <td class="${tx.executed ? 'status-yes' : 'status-no'}">${tx.executed ? 'Executed' : 'Pending'}</td>
                        <td class="text-right">${tx.signatures}</td>
                        <td>${format(tx.createdAt, 'MMM dd, yyyy HH:mm')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${reportData.transactions.length > 20 ? `<p><em>Showing first 20 of ${reportData.transactions.length} transactions</em></p>` : ''}
    </div>

    <div class="page-break"></div>

    <div class="section">
        <h2>Top Destinations</h2>
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Destination Address</th>
                    <th>Total Amount (XLM)</th>
                    <th>Transaction Count</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.topDestinations.map((dest, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${dest.destination}</td>
                        <td class="text-right">${(Number(dest.totalAmount) / 10000000).toFixed(2)}</td>
                        <td class="text-right">${dest.transactionCount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Spending Trends</h2>
        <div class="chart-placeholder">
            Spending trends chart would be displayed here
        </div>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Amount (XLM)</th>
                    <th>Transaction Count</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.spendingTrends.map(trend => `
                    <tr>
                        <td>${trend.date}</td>
                        <td class="text-right">${(Number(trend.amount) / 10000000).toFixed(2)}</td>
                        <td class="text-right">${trend.transactionCount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="page-break"></div>

    <div class="section">
        <h2>Signer Activity</h2>
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Email</th>
                    <th>Stellar Address</th>
                    <th>Transactions Signed</th>
                    <th>Total Amount Signed (XLM)</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.signerActivity.map((signer, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${signer.signer.email}</td>
                        <td>${signer.signer.stellarAddress}</td>
                        <td class="text-right">${signer.transactionsSigned}</td>
                        <td class="text-right">${(Number(signer.totalAmountSigned) / 10000000).toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Report Summary</h2>
        <p>This audit report provides a comprehensive overview of all multisig wallet transactions within the specified period. The report includes transaction details, spending patterns, top destinations, and signer activity to ensure transparency and compliance.</p>
        <p><strong>Key Metrics:</strong></p>
        <ul>
            <li>Total transactions processed: ${reportData.totalTransactions}</li>
            <li>Success rate: ${((reportData.successfulTransactions / reportData.totalTransactions) * 100).toFixed(1)}%</li>
            <li>Total value transacted: ${(Number(reportData.totalAmount) / 10000000).toFixed(2)} XLM</li>
            <li>Unique destinations: ${reportData.topDestinations.length}</li>
            <li>Active signers: ${reportData.signerActivity.length}</li>
        </ul>
    </div>
</body>
</html>
    `;
  }
}
