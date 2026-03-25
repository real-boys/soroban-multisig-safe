# Analytics and Audit Log Generator

This document describes the comprehensive analytics and audit log system implemented for the Soroban Multisig Safe backend.

## Overview

The Analytics and Audit Log Generator provides organizations with comprehensive compliance and reporting capabilities for their multisig wallet operations. It includes transaction aggregation, export functionality, automated reporting, and visual analytics.

## Features Implemented

### 1. Audit Report Generation
- **Aggregates all successful transactions** over a specified date range
- **Includes comprehensive data**: proposer, signers, timestamps, amounts, destinations
- **Supports multiple export formats**: JSON, CSV, PDF
- **Real-time data processing** with efficient database queries

### 2. Export Functionality
- **CSV Export**: 
  - Detailed transaction logs
  - Summary statistics
  - Top destinations analysis
  - Signer activity reports
- **PDF Export**: 
  - Professional formatted reports
  - Visual charts and graphs
  - Executive summary
  - Compliance-ready documentation

### 3. Visual Analytics
- **Spending Trends Chart**: Line chart showing daily spending and transaction volume
- **Top Destinations Pie Chart**: Visual breakdown of transaction destinations
- **Signer Activity Bar Chart**: Ranking of most active signers
- **Transaction Status Doughnut Chart**: Success/failure rate visualization

### 4. Automated Email Reports
- **Weekly Summary Emails**: Automated every Monday at 9:00 AM EST
- **Monthly Audit Reports**: Comprehensive monthly compliance reports
- **Custom Email Delivery**: Send reports to specified recipients
- **HTML Email Templates**: Professional, responsive email designs

### 5. Transaction Verification
- **On-chain vs Off-chain Verification**: Compares blockchain data with database records
- **Integrity Checks**: Validates transaction amounts, destinations, and signatures
- **Discrepancy Reporting**: Identifies and reports any inconsistencies

### 6. API Endpoints
- **RESTful API Design**: Comprehensive REST API for all analytics features
- **Authentication & Authorization**: Secure access to organization data
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Robust error responses and logging

## API Endpoints

### Generate Audit Report
```
POST /api/analytics/reports
```
**Body:**
```json
{
  "organizationId": "string",
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-01-31T23:59:59.999Z",
  "format": "json|csv|pdf"
}
```

### Generate Charts
```
POST /api/analytics/charts
```
**Response:**
```json
{
  "success": true,
  "data": {
    "charts": {
      "spendingTrends": "path/to/chart.png",
      "topDestinations": "path/to/chart.png",
      "signerActivity": "path/to/chart.png",
      "transactionStatus": "path/to/chart.png"
    }
  }
}
```

### Get Dashboard Data
```
GET /api/analytics/dashboard/:organizationId?period=30
```

### Verify Transaction
```
GET /api/analytics/verify/:transactionId
```

### Weekly Summary
```
GET /api/analytics/weekly/:organizationId
POST /api/analytics/weekly/send
```

### Email Reports
```
POST /api/analytics/email
```

### Download Reports
```
GET /api/analytics/download/:filename
```

## Database Schema Extensions

The system leverages the existing Prisma schema with these key models:

### Transaction Model
- Stores all multisig transaction data
- Links to wallets and signatures
- Includes execution status and timestamps

### Signature Model
- Records all transaction signatures
- Links signers to transactions
- Tracks signing timestamps

### User Model
- Organization owner information
- Contact details for email reports
- Authentication and authorization

### Wallet Model
- Multisig wallet configuration
- Owner relationships
- Network and threshold settings

## Service Architecture

### AnalyticsService
- Core business logic for data aggregation
- Report generation algorithms
- Statistical calculations

### ExportService
- CSV file generation
- Data formatting and validation
- File management

### PDFExportService
- PDF generation using Puppeteer
- HTML template rendering
- Chart integration

### ChartService
- Chart.js integration
- Visual analytics generation
- Image file management

### EmailService
- Nodemailer integration
- HTML email templates
- Automated scheduling

### CronService
- Automated task scheduling
- Weekly/monthly reports
- File cleanup jobs

## Configuration

### Environment Variables
```bash
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@multisig-safe.com

# Frontend URL
FRONTEND_URL=https://app.multisig-safe.com

# File Storage
EXPORTS_DIR=./exports
MAX_FILE_AGE_DAYS=7
```

### Cron Schedule
- **Weekly Summary**: Every Monday at 9:00 AM EST
- **Monthly Reports**: 1st of every month at 9:00 AM EST
- **File Cleanup**: Every Sunday at 2:00 AM EST

## Security Considerations

### Authentication
- JWT-based authentication required
- Organization-level access control
- API rate limiting

### Data Privacy
- Organization data isolation
- Secure file handling
- Encrypted email transmission

### Input Validation
- Comprehensive request validation
- SQL injection prevention
- XSS protection

## Performance Optimizations

### Database Queries
- Optimized Prisma queries
- Efficient joins and aggregations
- Indexed date ranges

### File Management
- Stream-based file processing
- Automatic cleanup of old files
- Memory-efficient chart generation

### Caching
- Redis integration for frequently accessed data
- Report result caching
- Chart image caching

## Compliance Features

### Audit Trail
- Complete transaction history
- Signature tracking
- Timestamp records

### Reporting Standards
- GAAP-compliant formatting
- Regulatory-ready exports
- Data retention policies

### Verification
- On-chain data validation
- Integrity checksums
- Discrepancy alerts

## Usage Examples

### Generate Monthly Compliance Report
```javascript
const response = await fetch('/api/analytics/reports', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    organizationId: 'org-123',
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2024-01-31T23:59:59.999Z',
    format: 'pdf'
  })
});
```

### Get Weekly Summary
```javascript
const summary = await fetch(`/api/analytics/weekly/${organizationId}`, {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
```

### Verify Transaction Integrity
```javascript
const verification = await fetch(`/api/analytics/verify/${transactionId}`, {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
```

## File Structure

```
backend/src/
├── controllers/
│   └── AnalyticsController.ts    # API endpoint handlers
├── services/
│   ├── AnalyticsService.ts        # Core analytics logic
│   ├── ExportService.ts          # CSV export functionality
│   ├── PDFExportService.ts       # PDF generation
│   ├── ChartService.ts          # Chart generation
│   ├── EmailService.ts          # Email automation
│   └── CronService.ts          # Scheduled tasks
├── routes/
│   └── analytics.ts             # Route definitions
└── exports/                    # Generated report files
```

## Dependencies Added

### Production Dependencies
- `csv-writer`: CSV file generation
- `puppeteer`: PDF generation and HTML rendering
- `chart.js`: Chart generation library
- `chartjs-node-canvas`: Server-side chart rendering
- `nodemailer`: Email sending functionality
- `cron`: Scheduled task management
- `date-fns`: Date manipulation and formatting

### Development Dependencies
- `@types/nodemailer`: TypeScript definitions
- `@types/cron`: TypeScript definitions

## Testing

### Unit Tests
- Service layer testing
- API endpoint testing
- Data validation testing

### Integration Tests
- End-to-end report generation
- Email delivery testing
- File export validation

### Performance Tests
- Large dataset handling
- Concurrent request processing
- Memory usage optimization

## Deployment Considerations

### File Storage
- Configurable export directory
- Automatic cleanup scheduling
- Cloud storage integration options

### Email Configuration
- SMTP setup requirements
- Template customization
- Delivery monitoring

### Monitoring
- Error tracking and logging
- Performance metrics
- Usage analytics

## Future Enhancements

### Advanced Analytics
- Machine learning for anomaly detection
- Predictive spending analysis
- Risk assessment scoring

### Integration Options
- Third-party analytics platforms
- Blockchain explorers
- Compliance software integration

### Customization
- Custom report templates
- White-label options
- Advanced filtering options

## Support and Troubleshooting

### Common Issues
- File permission errors for exports directory
- SMTP authentication failures
- Memory issues with large datasets

### Debug Mode
- Enable verbose logging
- Database query inspection
- Email preview mode

### Performance Tuning
- Database indexing optimization
- Caching configuration
- Concurrent processing limits

This comprehensive analytics and audit system provides organizations with the tools needed for compliance, transparency, and effective management of their multisig wallet operations.
