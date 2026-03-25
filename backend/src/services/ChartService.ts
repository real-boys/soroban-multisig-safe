import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { AuditReportData } from './AnalyticsService';
import path from 'path';
import fs from 'fs/promises';

export class ChartService {
  private chartRenderer: ChartJSNodeCanvas;

  constructor() {
    this.chartRenderer = new ChartJSNodeCanvas({
      width: 800,
      height: 400,
      backgroundColour: 'white',
    });
  }

  /**
   * Generate spending trends chart
   */
  async generateSpendingTrendsChart(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      const filename = `spending_trends_${reportData.organization}_${timestamp}.png`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      // Ensure exports directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      const configuration = {
        type: 'line' as const,
        data: {
          labels: reportData.spendingTrends.map(trend => trend.date),
          datasets: [
            {
              label: 'Daily Spending (XLM)',
              data: reportData.spendingTrends.map(trend => Number(trend.amount) / 10000000),
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              tension: 0.1,
              yAxisID: 'y',
            },
            {
              label: 'Transaction Count',
              data: reportData.spendingTrends.map(trend => trend.transactionCount),
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              tension: 0.1,
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          responsive: true,
          interaction: {
            mode: 'index' as const,
            intersect: false,
          },
          plugins: {
            title: {
              display: true,
              text: 'Spending Trends Over Time',
              font: {
                size: 16,
              },
            },
            legend: {
              display: true,
              position: 'top' as const,
            },
          },
          scales: {
            x: {
              display: true,
              title: {
                display: true,
                text: 'Date',
              },
            },
            y: {
              type: 'linear' as const,
              display: true,
              position: 'left' as const,
              title: {
                display: true,
                text: 'Amount (XLM)',
              },
            },
            y1: {
              type: 'linear' as const,
              display: true,
              position: 'right' as const,
              title: {
                display: true,
                text: 'Transaction Count',
              },
              grid: {
                drawOnChartArea: false,
              },
            },
          },
        },
      };

      const imageBuffer = await this.chartRenderer.renderToBuffer(configuration);
      await fs.writeFile(filepath, imageBuffer);

      return filepath;
    } catch (error) {
      console.error('Error generating spending trends chart:', error);
      throw new Error('Failed to generate spending trends chart');
    }
  }

  /**
   * Generate top destinations pie chart
   */
  async generateTopDestinationsChart(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      const filename = `top_destinations_${reportData.organization}_${timestamp}.png`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Take top 10 destinations for readability
      const topDestinations = reportData.topDestinations.slice(0, 10);
      
      const configuration = {
        type: 'pie' as const,
        data: {
          labels: topDestinations.map(dest => 
            dest.destination.substring(0, 20) + (dest.destination.length > 20 ? '...' : '')
          ),
          datasets: [
            {
              data: topDestinations.map(dest => Number(dest.totalAmount) / 10000000),
              backgroundColor: [
                '#FF6384',
                '#36A2EB',
                '#FFCE56',
                '#4BC0C0',
                '#9966FF',
                '#FF9F40',
                '#FF6384',
                '#C9CBCF',
                '#4BC0C0',
                '#FF6384',
              ],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Top 10 Destinations by Amount',
              font: {
                size: 16,
              },
            },
            legend: {
              display: true,
              position: 'right' as const,
            },
            tooltip: {
              callbacks: {
                label: function(context: any) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value.toFixed(2)} XLM (${percentage}%)`;
                },
              },
            },
          },
        },
      };

      const imageBuffer = await this.chartRenderer.renderToBuffer(configuration);
      await fs.writeFile(filepath, imageBuffer);

      return filepath;
    } catch (error) {
      console.error('Error generating top destinations chart:', error);
      throw new Error('Failed to generate top destinations chart');
    }
  }

  /**
   * Generate signer activity bar chart
   */
  async generateSignerActivityChart(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      const filename = `signer_activity_${reportData.organization}_${timestamp}.png`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Take top 10 signers for readability
      const topSigners = reportData.signerActivity.slice(0, 10);

      const configuration = {
        type: 'bar' as const,
        data: {
          labels: topSigners.map(signer => signer.signer.email.split('@')[0]),
          datasets: [
            {
              label: 'Transactions Signed',
              data: topSigners.map(signer => signer.transactionsSigned),
              backgroundColor: 'rgba(54, 162, 235, 0.8)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Top 10 Signers by Activity',
              font: {
                size: 16,
              },
            },
            legend: {
              display: false,
            },
          },
          scales: {
            x: {
              display: true,
              title: {
                display: true,
                text: 'Signer',
              },
            },
            y: {
              display: true,
              title: {
                display: true,
                text: 'Number of Transactions',
              },
              beginAtZero: true,
            },
          },
        },
      };

      const imageBuffer = await this.chartRenderer.renderToBuffer(configuration);
      await fs.writeFile(filepath, imageBuffer);

      return filepath;
    } catch (error) {
      console.error('Error generating signer activity chart:', error);
      throw new Error('Failed to generate signer activity chart');
    }
  }

  /**
   * Generate transaction status pie chart
   */
  async generateTransactionStatusChart(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      const filename = `transaction_status_${reportData.organization}_${timestamp}.png`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      await fs.mkdir(path.dirname(filepath), { recursive: true });

      const configuration = {
        type: 'doughnut' as const,
        data: {
          labels: ['Successful', 'Failed'],
          datasets: [
            {
              data: [reportData.successfulTransactions, reportData.failedTransactions],
              backgroundColor: ['#4CAF50', '#F44336'],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Transaction Status Distribution',
              font: {
                size: 16,
              },
            },
            legend: {
              display: true,
              position: 'bottom' as const,
            },
            tooltip: {
              callbacks: {
                label: function(context: any) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${value} (${percentage}%)`;
                },
              },
            },
          },
        },
      };

      const imageBuffer = await this.chartRenderer.renderToBuffer(configuration);
      await fs.writeFile(filepath, imageBuffer);

      return filepath;
    } catch (error) {
      console.error('Error generating transaction status chart:', error);
      throw new Error('Failed to generate transaction status chart');
    }
  }

  /**
   * Generate all charts for a report
   */
  async generateAllCharts(reportData: AuditReportData): Promise<{
    spendingTrends: string;
    topDestinations: string;
    signerActivity: string;
    transactionStatus: string;
  }> {
    const [spendingTrends, topDestinations, signerActivity, transactionStatus] = await Promise.all([
      this.generateSpendingTrendsChart(reportData),
      this.generateTopDestinationsChart(reportData),
      this.generateSignerActivityChart(reportData),
      this.generateTransactionStatusChart(reportData),
    ]);

    return {
      spendingTrends,
      topDestinations,
      signerActivity,
      transactionStatus,
    };
  }
}
