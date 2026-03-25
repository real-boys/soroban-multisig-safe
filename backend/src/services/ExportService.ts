import { createObjectCsvWriter } from 'csv-writer';
import { AuditReportData, TransactionReport } from './AnalyticsService';
import { format } from 'date-fns';
import path from 'path';
import fs from 'fs/promises';

export class ExportService {
  /**
   * Export audit report to CSV format
   */
  async exportToCSV(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const filename = `audit_report_${reportData.organization}_${timestamp}.csv`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      // Ensure exports directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Create CSV writer for transactions
      const csvWriter = createObjectCsvWriter({
        path: filepath,
        header: [
          { id: 'transactionId', title: 'Transaction ID' },
          { id: 'walletName', title: 'Wallet Name' },
          { id: 'contractAddress', title: 'Contract Address' },
          { id: 'destination', title: 'Destination Address' },
          { id: 'amount', title: 'Amount (stroops)' },
          { id: 'amountXLM', title: 'Amount (XLM)' },
          { id: 'executed', title: 'Executed' },
          { id: 'signatures', title: 'Number of Signatures' },
          { id: 'proposerEmail', title: 'Proposer Email' },
          { id: 'proposerAddress', title: 'Proposer Address' },
          { id: 'createdAt', title: 'Created At' },
          { id: 'executedAt', title: 'Executed At' },
          { id: 'signers', title: 'Signers (Email:Address:SignedAt)' },
        ],
      });

      // Prepare transaction data
      const records = reportData.transactions.map((tx: TransactionReport) => ({
        transactionId: tx.transactionId.toString(),
        walletName: tx.wallet.name,
        contractAddress: tx.wallet.contractAddress,
        destination: tx.destination,
        amount: tx.amount.toString(),
        amountXLM: (Number(tx.amount) / 10000000).toFixed(7), // Convert stroops to XLM
        executed: tx.executed ? 'Yes' : 'No',
        signatures: tx.signatures,
        proposerEmail: tx.proposer?.email || 'N/A',
        proposerAddress: tx.proposer?.stellarAddress || 'N/A',
        createdAt: format(tx.createdAt, 'yyyy-MM-dd HH:mm:ss'),
        executedAt: tx.executedAt ? format(tx.executedAt, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
        signers: tx.signers
          .map(s => `${s.email}:${s.stellarAddress}:${format(s.signedAt, 'yyyy-MM-dd HH:mm:ss')}`)
          .join('; '),
      }));

      // Write CSV file
      await csvWriter.writeRecords(records);

      // Create summary CSV
      const summaryFilename = `audit_summary_${reportData.organization}_${timestamp}.csv`;
      const summaryFilepath = path.join(process.cwd(), 'exports', summaryFilename);

      const summaryWriter = createObjectCsvWriter({
        path: summaryFilepath,
        header: [
          { id: 'metric', title: 'Metric' },
          { id: 'value', title: 'Value' },
        ],
      });

      const summaryRecords = [
        { metric: 'Organization', value: reportData.organization },
        { metric: 'Report Period Start', value: format(reportData.dateRange.start, 'yyyy-MM-dd') },
        { metric: 'Report Period End', value: format(reportData.dateRange.end, 'yyyy-MM-dd') },
        { metric: 'Total Transactions', value: reportData.totalTransactions.toString() },
        { metric: 'Total Amount (stroops)', value: reportData.totalAmount.toString() },
        { metric: 'Total Amount (XLM)', value: (Number(reportData.totalAmount) / 10000000).toFixed(7) },
        { metric: 'Successful Transactions', value: reportData.successfulTransactions.toString() },
        { metric: 'Failed Transactions', value: reportData.failedTransactions.toString() },
        { metric: 'Success Rate', value: `${((reportData.successfulTransactions / reportData.totalTransactions) * 100).toFixed(2)}%` },
      ];

      await summaryWriter.writeRecords(summaryRecords);

      return filepath;
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      throw new Error('Failed to export to CSV');
    }
  }

  /**
   * Export top destinations to CSV
   */
  async exportTopDestinations(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const filename = `top_destinations_${reportData.organization}_${timestamp}.csv`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      await fs.mkdir(path.dirname(filepath), { recursive: true });

      const csvWriter = createObjectCsvWriter({
        path: filepath,
        header: [
          { id: 'rank', title: 'Rank' },
          { id: 'destination', title: 'Destination Address' },
          { id: 'totalAmount', title: 'Total Amount (stroops)' },
          { id: 'totalAmountXLM', title: 'Total Amount (XLM)' },
          { id: 'transactionCount', title: 'Transaction Count' },
        ],
      });

      const records = reportData.topDestinations.map((dest, index) => ({
        rank: (index + 1).toString(),
        destination: dest.destination,
        totalAmount: dest.totalAmount.toString(),
        totalAmountXLM: (Number(dest.totalAmount) / 10000000).toFixed(7),
        transactionCount: dest.transactionCount.toString(),
      }));

      await csvWriter.writeRecords(records);

      return filepath;
    } catch (error) {
      console.error('Error exporting top destinations:', error);
      throw new Error('Failed to export top destinations');
    }
  }

  /**
   * Export signer activity to CSV
   */
  async exportSignerActivity(reportData: AuditReportData): Promise<string> {
    try {
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const filename = `signer_activity_${reportData.organization}_${timestamp}.csv`;
      const filepath = path.join(process.cwd(), 'exports', filename);

      await fs.mkdir(path.dirname(filepath), { recursive: true });

      const csvWriter = createObjectCsvWriter({
        path: filepath,
        header: [
          { id: 'rank', title: 'Rank' },
          { id: 'email', title: 'Email' },
          { id: 'stellarAddress', title: 'Stellar Address' },
          { id: 'transactionsSigned', title: 'Transactions Signed' },
          { id: 'totalAmountSigned', title: 'Total Amount Signed (stroops)' },
          { id: 'totalAmountSignedXLM', title: 'Total Amount Signed (XLM)' },
        ],
      });

      const records = reportData.signerActivity.map((signer, index) => ({
        rank: (index + 1).toString(),
        email: signer.signer.email,
        stellarAddress: signer.signer.stellarAddress,
        transactionsSigned: signer.transactionsSigned.toString(),
        totalAmountSigned: signer.totalAmountSigned.toString(),
        totalAmountSignedXLM: (Number(signer.totalAmountSigned) / 10000000).toFixed(7),
      }));

      await csvWriter.writeRecords(records);

      return filepath;
    } catch (error) {
      console.error('Error exporting signer activity:', error);
      throw new Error('Failed to export signer activity');
    }
  }
}
