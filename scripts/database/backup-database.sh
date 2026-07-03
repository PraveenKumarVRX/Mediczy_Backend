#!/bin/bash
# Database Backup Script for Mediczy
# Run daily via cron: 0 2 * * * /home/ubuntu/Mediczy/backup-database.sh

set -e

ROOT_DIR="${ROOT_DIR:-/home/ubuntu/Mediczy}"

# Configuration
BACKUP_DIR="/var/backups/mediczy"
DB_NAME="${DB_NAME:-mediczy}"
DB_USER="${DB_USER:-root}"
DB_HOST="${DB_HOST:-localhost}"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mediczy_db_$TIMESTAMP.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Perform backup (prefer PostgreSQL when configured)
echo "Starting database backup..."
if [ -n "$POSTGRES_HOST" ] && command -v pg_dump >/dev/null 2>&1; then
  PGHOST="${POSTGRES_HOST}" \
  PGPORT="${POSTGRES_PORT:-5432}" \
  PGUSER="${POSTGRES_USER}" \
  PGPASSWORD="${POSTGRES_PASSWORD}" \
  pg_dump -F p "${POSTGRES_DATABASE}" > "$BACKUP_FILE"
else
  mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_FILE"
fi

# Compress backup
gzip "$BACKUP_FILE"
echo "Backup completed: ${BACKUP_FILE}.gz"

# Remove old backups
find "$BACKUP_DIR" -name "mediczy_db_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "Old backups cleaned (retention: $RETENTION_DAYS days)"

# Show backup size
du -h "${BACKUP_FILE}.gz"

# Push latest dump offsite (S3/MinIO) — uses local file if live pg_dump lacks RDS master
if [ -f "$ROOT_DIR/scripts/backup/daily-offsite-backup.sh" ]; then
  echo "Syncing to offsite storage..."
  ROOT="$ROOT_DIR" bash "$ROOT_DIR/scripts/backup/daily-offsite-backup.sh" --upload-local-only \
    >> "$ROOT_DIR/logs/backup.log" 2>&1 || echo "WARN: offsite sync failed (see logs/backup.log)"
fi
