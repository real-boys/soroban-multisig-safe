#!/bin/bash

# Automated PostgreSQL Backup Script with Point-in-Time Recovery
# This script creates backups and manages WAL archiving for PITR

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/app/backups/postgresql}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/app/backups/wal_archive}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DB_NAME="${POSTGRES_DB:-multisig_safe}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"
export PGPASSWORD

# Timestamps
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/full_backup_$TIMESTAMP"
LOG_FILE="$BACKUP_DIR/backup.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Create backup directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$WAL_ARCHIVE_DIR"

log "Starting PostgreSQL backup..."

# Step 1: Create base backup using pg_basebackup (for PITR)
log "Creating base backup with pg_basebackup..."
pg_basebackup \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -D "$BACKUP_FILE" \
    -Ft \
    -z \
    -P \
    -X stream \
    -c fast \
    -w 2>&1 | tee -a "$LOG_FILE"

if [ $? -eq 0 ]; then
    log "Base backup created successfully: $BACKUP_FILE"
else
    log "ERROR: Base backup failed!"
    exit 1
fi

# Step 2: Create SQL dump as well (for easier restoration if needed)
SQL_DUMP_FILE="$BACKUP_DIR/sql_dump_$TIMESTAMP.sql.gz"
log "Creating SQL dump..."
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-privileges \
    2>&1 | gzip > "$SQL_DUMP_FILE"

if [ $? -eq 0 ]; then
    log "SQL dump created successfully: $SQL_DUMP_FILE"
else
    log "ERROR: SQL dump failed!"
fi

# Step 3: Create recovery configuration file
RECOVERY_CONF="$BACKUP_FILE/recovery.signal"
touch "$RECOVERY_CONF"

cat > "$BACKUP_FILE/postgresql.auto.conf" << EOF
restore_command = 'cp $WAL_ARCHIVE_DIR/%f %p'
recovery_target_timeline = 'latest'
EOF

log "Recovery configuration created"

# Step 4: Verify backup integrity
log "Verifying backup integrity..."
if [ -f "$BACKUP_FILE/base.tar.gz" ]; then
    BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    log "Backup verified. Size: $BACKUP_SIZE"
else
    log "ERROR: Backup file not found!"
    exit 1
fi

# Step 5: Clean up old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "full_backup_*" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
find "$BACKUP_DIR" -name "sql_dump_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
find "$WAL_ARCHIVE_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

log "Old backups cleaned up"

# Step 6: Upload to remote storage (optional - configure as needed)
# Uncomment and configure for S3, GCS, or other cloud storage
# log "Uploading backup to remote storage..."
# aws s3 cp "$BACKUP_FILE" "s3://your-bucket/postgresql/$TIMESTAMP/" --recursive
# if [ $? -eq 0 ]; then
#     log "Backup uploaded to remote storage"
# else
#     log "WARNING: Remote upload failed"
# fi

# Step 7: Send notification (optional)
send_notification() {
    local status=$1
    local message=$2
    
    # Webhook notification
    if [ -n "$BACKUP_WEBHOOK_URL" ]; then
        curl -X POST "$BACKUP_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"status\":\"$status\",\"message\":\"$message\",\"timestamp\":\"$(date -Iseconds)\"}" \
            || true
    fi
    
    # Email notification (if mail command is available)
    if command -v mail &> /dev/null && [ -n "$ADMIN_EMAIL" ]; then
        echo "$message" | mail -s "PostgreSQL Backup $status" "$ADMIN_EMAIL" || true
    fi
}

if [ $? -eq 0 ]; then
    log "✓ Backup completed successfully!"
    send_notification "SUCCESS" "PostgreSQL backup completed successfully. Backup location: $BACKUP_FILE"
else
    log "✗ Backup failed!"
    send_notification "FAILURE" "PostgreSQL backup failed! Check logs at $LOG_FILE"
    exit 1
fi

log "Backup process finished"
