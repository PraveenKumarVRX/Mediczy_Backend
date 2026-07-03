#!/bin/bash
# Database Backup Script for Mediczy
# Cron: 0 2 * * * /home/ubuntu/Mediczy/scripts/database/daily-backup.sh

set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/home/ubuntu/Mediczy}"
BACKUP_DIR="/var/backups/mediczy"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mediczy_db_$TIMESTAMP.sql"
PG_DUMP_LOG="/tmp/mediczy-pg-dump.err"

mkdir -p "$BACKUP_DIR"
mkdir -p "$ROOT_DIR/logs"

ROOT="$ROOT_DIR"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/ops/load-prod-env.sh"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/backup/pg-dump-prod.lib.sh"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found — sudo apt-get install -y postgresql-client" >&2
  exit 1
fi

echo "Starting database backup (${POSTGRES_DATABASE}@${POSTGRES_HOST})..."

if ! pg_dump_prod_to_file "$BACKUP_FILE"; then
  echo "ERROR: pg_dump failed — mediczy_helper cannot dump n8n/RLS tables." >&2
  echo "  Fix: store RDS master password in SSM:" >&2
  echo "    aws ssm put-parameter --name /mediczy/prod/RDS_MASTER_PASSWORD \\" >&2
  echo "      --type SecureString --value '<rds-postgres-password>' --region ap-south-1" >&2
  echo "  Or upload last good dump: bash scripts/backup/daily-offsite-backup.sh --upload-local-only" >&2
  exit 1
fi

gzip -f "$BACKUP_FILE"
echo "Backup completed: ${BACKUP_FILE}.gz"
du -h "${BACKUP_FILE}.gz"

find "$BACKUP_DIR" -name "mediczy_db_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "Old backups cleaned (retention: ${RETENTION_DAYS} days)"

if [ -f "$ROOT_DIR/scripts/backup/daily-offsite-backup.sh" ]; then
  echo "Syncing to offsite storage..."
  ROOT="$ROOT_DIR" bash "$ROOT_DIR/scripts/backup/daily-offsite-backup.sh" --upload-local-only \
    >> "$ROOT_DIR/logs/backup.log" 2>&1 || echo "WARN: offsite sync failed (see logs/backup.log)"
fi
