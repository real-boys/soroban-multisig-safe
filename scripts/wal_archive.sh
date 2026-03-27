#!/bin/bash

# WAL Archiving Script for Point-in-Time Recovery
# Configure postgresql.conf to use this script:
# archive_mode = on
# archive_command = '/path/to/wal_archive.sh %p %f'

set -e

WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/app/backups/wal_archive}"
LOG_FILE="$WAL_ARCHIVE_DIR/archive.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Create archive directory if it doesn't exist
mkdir -p "$WAL_ARCHIVE_DIR"

WAL_PATH=$1
WAL_FILE=$2

if [ -z "$WAL_PATH" ] || [ -z "$WAL_FILE" ]; then
    log "ERROR: Missing arguments. Usage: $0 <wal_path> <wal_file>"
    exit 1
fi

# Compress and archive WAL file
log "Archiving WAL file: $WAL_FILE"
gzip -c "$WAL_PATH" > "$WAL_ARCHIVE_DIR/$WAL_FILE.gz"

if [ $? -eq 0 ]; then
    log "Successfully archived: $WAL_FILE"
    exit 0
else
    log "ERROR: Failed to archive: $WAL_FILE"
    exit 1
fi
