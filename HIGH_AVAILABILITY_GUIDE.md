# High Availability Implementation Guide

This document describes the high availability (HA) features implemented for the Stellar Multi-Sig Safe platform. These features ensure the backend and RPC connections are highly available, as a multi-sig wallet is a "mission-critical" tool.

## Table of Contents

1. [Overview](#overview)
2. [Load Balancer for Multiple Soroban RPC Providers](#1-load-balancer-for-multiple-soroban-rpc-providers)
3. [Health Check Scripts for Indexer Service](#2-health-check-scripts-for-indexer-service)
4. [Alerts for Sync Lag](#3-alerts-for-sync-lag)
5. [Automated Database Backups](#4-automated-database-backups)
6. [Cloudflare Integration for DDoS Protection](#5-cloudflare-integration-for-ddos-protection)
7. [Resource Monitoring](#6-resource-monitoring)
8. [Log Aggregation using ELK Stack](#7-log-aggregation-using-elk-stack)
9. [Configuration](#configuration)
10. [Deployment](#deployment)

---

## Overview

The HA implementation includes:

- ✅ **RPC Load Balancing** - Automatic failover between multiple Soroban RPC providers
- ✅ **Indexer Health Monitoring** - Real-time health checks with alerts
- ✅ **Sync Lag Detection** - Automated alerts when indexer falls behind
- ✅ **Database Backups** - Point-in-time recovery with automated scheduling
- ✅ **DDoS Protection** - Cloudflare integration with rate limiting
- ✅ **Resource Monitoring** - CPU, RAM, and disk usage tracking
- ✅ **Log Aggregation** - Centralized logging with ELK stack

---

## 1. Load Balancer for Multiple Soroban RPC Providers

### Features

- **Automatic Failover**: Switches to healthy providers on failure
- **Health Checking**: Continuous monitoring of all RPC endpoints
- **Response Time Optimization**: Routes to fastest available provider
- **Round-Robin Fallback**: Distributes load across healthy providers

### Configuration

```bash
# Single RPC URL (fallback)
STELLAR_RPC_URL=https://rpc.futurenet.stellar.org

# Multiple RPC URLs (recommended)
STELLAR_RPC_URLS=https://rpc1.futurenet.stellar.org,https://rpc2.futurenet.stellar.org,https://rpc3.futurenet.stellar.org
```

### How It Works

1. Providers are prioritized and health-checked every 30 seconds
2. Failed providers are marked unhealthy after 3 consecutive failures
3. Requests automatically route to the fastest healthy provider
4. Unhealthy providers are periodically re-tested and re-added when recovered

### Code Example

```typescript
import { RPCLoadBalancer } from '@/services/RPCLoadBalancer';

const rpcLoadBalancer = new RPCLoadBalancer([
  'https://rpc1.example.com',
  'https://rpc2.example.com',
]);

rpcLoadBalancer.start();

// Make RPC call with automatic failover
const result = await rpcLoadBalancer.makeRPCCall('getLatestLedger', {});
```

---

## 2. Health Check Scripts for Indexer Service

### Features

- **Real-time Monitoring**: Checks indexer health every 30 seconds
- **Comprehensive Metrics**: Tracks sync lag, response time, and event count
- **Automatic Alerts**: Triggers warnings for unhealthy states
- **Historical Tracking**: Maintains 24-hour health history

### Configuration

```bash
# Sync lag thresholds
SYNC_LAG_WARNING=100        # Alert if lag > 100 ledgers
SYNC_LAG_CRITICAL=500       # Critical if lag > 500 ledgers
SYNC_LAG_CHECK_INTERVAL=60000  # Check every 60 seconds
```

### Health Metrics

- `isHealthy`: Overall health status
- `lastIndexedLedger`: Last successfully indexed ledger
- `currentNetworkLedger`: Current network ledger from RPC
- `syncLag`: Difference between network and indexed ledgers
- `totalEvents`: Total indexed events
- `responseTime`: Health check response time
- `lastSyncTime`: Timestamp of last successful sync

### API Endpoint

```bash
GET /api/events/health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": {
      "isHealthy": true,
      "lastIndexedLedger": 1234567,
      "currentNetworkLedger": 1234570,
      "syncLag": 3,
      "totalEvents": 50000,
      "responseTime": 150,
      "lastSyncTime": "2024-01-15T10:30:00Z"
    },
    "uptime": 99.9
  }
}
```

---

## 3. Alerts for Sync Lag

### Features

- **Multi-Channel Notifications**: Webhook, Slack, Email
- **Severity Levels**: INFO, WARNING, CRITICAL
- **Configurable Thresholds**: Customizable alert triggers
- **Alert Management**: Acknowledge and track alerts

### Configuration

```bash
# Alert thresholds
SYNC_LAG_WARNING=100
SYNC_LAG_CRITICAL=500

# Notification channels
ALERT_CHANNELS=webhook,slack,email

# Webhook URLs
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
```

### Alert Flow

1. **Detection**: Sync lag exceeds threshold
2. **Classification**: Determines severity (WARNING/CRITICAL)
3. **Notification**: Sends alerts via configured channels
4. **Storage**: Stores alert in database for tracking
5. **Acknowledgment**: Manual or automatic resolution

### Example Alert Payload

```json
{
  "alertType": "SYNC_LAG",
  "severity": "CRITICAL",
  "message": "Indexer is 523 ledgers behind (Current: 1234567, Indexed: 1234044)",
  "metadata": {
    "network": "futurenet",
    "currentLedger": 1234567,
    "indexedLedger": 1234044,
    "lag": 523,
    "threshold": 500
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 4. Automated Database Backups

### Features

- **Point-in-Time Recovery (PITR)**: Restore to any moment using WAL archiving
- **Automated Scheduling**: Configurable backup intervals
- **Dual Backup Strategy**: Full backup + SQL dump
- **Retention Management**: Automatic cleanup of old backups
- **Remote Storage**: Optional upload to S3/GCS
- **Notifications**: Success/failure alerts

### Configuration

```bash
# Backup settings
BACKUP_DIR=/app/backups/postgresql
WAL_ARCHIVE_DIR=/app/backups/wal_archive
BACKUP_RETENTION_DAYS=7
BACKUP_INTERVAL_MINUTES=360  # Every 6 hours
BACKUP_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK

# Database connection
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=multisig_safe
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
```

### Backup Components

1. **Base Backup** (`pg_basebackup`): Full PostgreSQL cluster backup
2. **SQL Dump** (`pg_dump`): Logical backup for easy restoration
3. **WAL Archive**: Continuous archiving for PITR

### Backup Schedule

```bash
# Run backup script via cron
0 */6 * * * /app/scripts/database_backup.sh
```

### Restore Process

#### Full Restore

```bash
# List available backups
GET /api/admin/backups

# Restore from backup
POST /api/admin/backups/restore
{
  "backupId": "backup_20240115_103000",
  "targetTime": "2024-01-15T10:00:00Z"  // Optional for PITR
}
```

#### Manual Restore Steps

1. Stop application and PostgreSQL
2. Extract backup: `tar -xzf backup_*/base.tar.gz -C /var/lib/postgresql/data`
3. Configure recovery in `postgresql.auto.conf`:
   ```
   restore_command = 'cp /app/backups/wal_archive/%f %p'
   recovery_target_time = '2024-01-15T10:00:00Z'
   ```
4. Create `recovery.signal` file
5. Start PostgreSQL
6. Start application

---

## 5. Cloudflare Integration for DDoS Protection

### Features

- **Rate Limiting**: Protect against request floods
- **IP Whitelisting**: Trust Cloudflare IPs only
- **Connection Limits**: Prevent connection exhaustion
- **Security Headers**: XSS, clickjacking protection
- **SSL/TLS**: Modern encryption standards

### Nginx Configuration

The `nginx/nginx.conf` file includes:

- Cloudflare IP ranges auto-whitelisting
- Rate limiting zones (API: 10r/s, General: 50r/s)
- Connection limits per IP
- Security headers (HSTS, CSP, X-Frame-Options)
- HTTP/2 support
- OCSP stapling

### Deployment Steps

1. **Update DNS**: Point domain to Cloudflare
2. **Enable Proxy**: Orange cloud in Cloudflare DNS settings
3. **Configure SSL**: Use Cloudflare's Origin CA certificates
4. **Deploy Nginx**: Use provided configuration

### Cloudflare Settings

```yaml
# Recommended Cloudflare settings
Security Level: Medium
Auto SSL/TLS: Full (Strict)
Web Application Firewall: Enabled
Rate Limiting Rules:
  - Path: /api/*
    Threshold: 100 requests/minute
    Action: Challenge
```

---

## 6. Resource Monitoring

### Features

- **CPU Monitoring**: Usage percentage, load average, core count
- **Memory Tracking**: Total, used, free, percentage
- **Disk Space**: Capacity monitoring with threshold alerts
- **Network I/O**: Bytes sent/received (optional)
- **Automated Alerts**: Warning/critical notifications

### Configuration

```bash
# Monitoring interval
RESOURCE_CHECK_INTERVAL=60000  # 1 minute

# Alert thresholds
CPU_WARNING=70
CPU_CRITICAL=90
MEMORY_WARNING=75
MEMORY_CRITICAL=90
DISK_WARNING=80
DISK_CRITICAL=95

# Alert webhook
RESOURCE_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
```

### Metrics Collected

```typescript
interface ResourceMetrics {
  timestamp: Date;
  cpu: {
    usage: number;          // Percentage
    cores: number;
    loadAverage: number[];  // 1m, 5m, 15m
  };
  memory: {
    total: number;          // Bytes
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
}
```

### Alert Example

When CPU exceeds 90%:
```json
{
  "type": "RESOURCE_ALERT",
  "resourceType": "CPU",
  "severity": "CRITICAL",
  "message": "CPU usage is critically high: 94.5%",
  "value": 94.5,
  "threshold": 90,
  "metrics": {
    "cpu": 94.5,
    "memory": 65.2,
    "disk": 45.0
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 7. Log Aggregation using ELK Stack

### Architecture

```
Application → Filebeat → Logstash → Elasticsearch → Kibana
```

### Components

- **Filebeat**: Lightweight log shipper
- **Logstash**: Log processing pipeline
- **Elasticsearch**: Search and analytics engine
- **Kibana**: Visualization dashboard

### Deployment

```bash
# Start ELK stack
cd elk
docker-compose up -d
```

### Configuration Files

- `elk/docker-compose.yml`: ELK stack services
- `elk/logstash/pipeline/logstash.conf`: Log processing rules
- `elk/filebeat/filebeat.yml`: Log collection settings

### Log Format

```json
{
  "@timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "Transaction processed successfully",
  "service": "stellar-multisig-safe",
  "environment": "production",
  "transactionId": "abc123",
  "userId": "user456"
}
```

### Kibana Dashboards

Access Kibana at: `http://localhost:5601`

Recommended visualizations:
- Error rate over time
- Log level distribution
- Response time trends
- Geographic request map
- Resource usage correlation

### Search Examples

```
# Find all errors
level: ERROR

# Filter by service
service: "stellar-multisig-safe"

# Time range
@timestamp:[now-1h TO now]

# Combine filters
level: ERROR AND service: "stellar-multisig-safe" AND environment: "production"
```

---

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Copy example
cp .env.example .env

# Edit with your values
nano .env
```

### Complete Environment Reference

```bash
# RPC Load Balancing
STELLAR_RPC_URL=https://rpc.futurenet.stellar.org
STELLAR_RPC_URLS=https://rpc1.com,https://rpc2.com,https://rpc3.com

# Health Checks
SYNC_LAG_WARNING=100
SYNC_LAG_CRITICAL=500
SYNC_LAG_CHECK_INTERVAL=60000

# Alerts
ALERT_CHANNELS=webhook,slack,email
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Database Backups
BACKUP_DIR=/app/backups/postgresql
WAL_ARCHIVE_DIR=/app/backups/wal_archive
BACKUP_RETENTION_DAYS=7
BACKUP_INTERVAL_MINUTES=360
BACKUP_WEBHOOK_URL=https://hooks.slack.com/...
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=multisig_safe
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Resource Monitoring
RESOURCE_CHECK_INTERVAL=60000
RESOURCE_ALERT_WEBHOOK_URL=https://hooks.slack.com/...

# ELK Stack
LOGSTASH_URL=localhost:5000
ELASTICSEARCH_HOST=http://localhost:9200

# Cloudflare
CLOUDFLARE_API_KEY=your-api-key
CLOUDFLARE_ZONE_ID=your-zone-id
CLOUDFLARE_EMAIL=your-email@example.com
```

---

## Deployment

### Docker Compose (Production)

```bash
# Start all services
docker-compose -f docker-compose.yml --profile production up -d

# Start ELK stack
cd elk && docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f elasticsearch
```

### Kubernetes (Optional)

For Kubernetes deployments, see `k8s/` directory (not included in this repo).

### Health Check Endpoints

- **Backend Health**: `GET /api/health`
- **Indexer Health**: `GET /api/events/health`
- **Database Backups**: `GET /api/admin/backups`
- **Resource Metrics**: `GET /api/admin/resources`

### Monitoring Dashboard

Access dashboards:
- **Kibana**: http://localhost:5601
- **Backend Logs**: `./backend/logs/`
- **ELK Logs**: `./elk/elasticsearch/logs/`

### Testing High Availability

1. **Test RPC Failover**:
   ```bash
   # Stop one RPC provider
   # Verify automatic switch to healthy provider
   curl http://localhost:5001/api/health
   ```

2. **Test Sync Lag Alerts**:
   ```bash
   # Simulate lag by stopping indexer
   # Check for alert notifications
   ```

3. **Test Backup/Restore**:
   ```bash
   # Trigger manual backup
   POST /api/admin/backups/create
   
   # Verify backup files exist
   ls -lh /app/backups/postgresql/
   ```

---

## Troubleshooting

### Common Issues

**Issue**: RPC provider constantly failing
- **Solution**: Check provider status, update `STELLAR_RPC_URLS`

**Issue**: High sync lag
- **Solution**: Increase polling frequency, check RPC performance

**Issue**: Backup failures
- **Solution**: Verify disk space, check PostgreSQL credentials

**Issue**: No logs in Kibana
- **Solution**: Check Filebeat configuration, verify Logstash pipeline

### Support

For issues or questions:
- Check logs: `docker-compose logs -f backend`
- Review documentation: `README.md`
- Contact: support@yourdomain.com

---

## Conclusion

This high availability implementation ensures your Stellar Multi-Sig Safe platform is:

✅ **Resilient**: Multiple RPC providers with automatic failover  
✅ **Monitored**: Real-time health checks and alerts  
✅ **Recoverable**: Point-in-time database recovery  
✅ **Protected**: DDoS mitigation via Cloudflare  
✅ **Observable**: Centralized logging with ELK stack  
✅ **Efficient**: Resource monitoring and optimization  

All features are production-ready and configurable based on your specific needs.
