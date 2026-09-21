#!/bin/bash
# Database Backup Script for Mediczy
# Cron: 0 2 * * * /home/ubuntu/Mediczy/scripts/database/daily-backup.sh

set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/home/ubuntu/Mediczy}"
BACKUP_DIR="/var/backups/mediczy"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mediczy_db_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"
mkdir -p "$ROOT_DIR/logs"

ROOT="$ROOT_DIR"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/ops/load-prod-env.sh"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/backup/pg-dump-prod.lib.sh"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/backup/backup-integrity.lib.sh"

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
  record_backup_status fail "pg_dump failed: no credential could dump the database"
  exit 1
fi

# WP-0.7: a dump that "succeeded" is not proof it is complete. Production uses FORCE ROW LEVEL SECURITY, so a
# role that cannot bypass it dumps without the protected rows. Verify the role, then the per-table row counts.
export PGHOST="$POSTGRES_HOST" PGPORT="${POSTGRES_PORT:-5432}" PGDATABASE="$POSTGRES_DATABASE" \
       PGUSER="${PG_DUMP_USED_USER:-${POSTGRES_USER:-}}" PGPASSWORD="${PG_DUMP_USED_PASS:-${POSTGRES_PASSWORD:-}}"
integrity_fail() {
  echo "ERROR: backup integrity check failed — $1" >&2
  mv -f "$BACKUP_FILE" "${BACKUP_FILE}.INCOMPLETE" 2>/dev/null || true
  record_backup_status fail "$1"
  unset PGPASSWORD PG_DUMP_USED_PASS
  exit 1
}
if [ -n "${PG_DUMP_USED_EXCLUDES:-}" ]; then
  integrity_fail "schemas were excluded from the dump (${PG_DUMP_USED_EXCLUDES}); this is not a complete backup"
fi
assert_dump_role_reads_everything || integrity_fail "the dumping role cannot read every row (or could not be verified)"
verify_dump_row_counts "$BACKUP_FILE" || integrity_fail "row counts in the dump do not match the live database (see ${BACKUP_FILE}.counts.tsv)"
unset PGPASSWORD PG_DUMP_USED_PASS

gzip -f "$BACKUP_FILE"
echo "Backup completed: ${BACKUP_FILE}.gz"
du -h "${BACKUP_FILE}.gz"
record_backup_status ok "local dump verified: $(basename "${BACKUP_FILE}.gz") $(stat -c %s "${BACKUP_FILE}.gz") bytes"

find "$BACKUP_DIR" -name "mediczy_db_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "Old backups cleaned (retention: ${RETENTION_DAYS} days)"

if [ -f "$ROOT_DIR/scripts/backup/daily-offsite-backup.sh" ]; then
  echo "Syncing to offsite storage..."
  ROOT="$ROOT_DIR" bash "$ROOT_DIR/scripts/backup/daily-offsite-backup.sh" --upload-local-only \
    >> "$ROOT_DIR/logs/backup.log" 2>&1 || echo "WARN: offsite sync failed (see logs/backup.log)"
fi
