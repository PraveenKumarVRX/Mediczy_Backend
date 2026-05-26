#!/bin/bash
# daily-minio-backup.sh
# Backs up PostgreSQL + S3 uploads to MinIO mediczy-backups bucket.
# 30-day retention is enforced by MinIO lifecycle policy (set on bucket).
#
# Layout in MinIO:
#   mediczy-backups/db/YYYY-MM-DD/mediczy_prod.sql.gz
#   mediczy-backups/s3/YYYY-MM-DD/   ← mirror of mediczy-uploads S3 bucket
#
# Cron (runs daily at 2 AM):
#   0 2 * * * /home/ubuntu/Mediczy/scripts/backup/daily-minio-backup.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
MINIO_ALIAS="minio"
BACKUP_BUCKET="mediczy-backups"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
TMPDIR=$(mktemp -d)
LOG_PREFIX="[backup ${TIMESTAMP}]"

PG_HOST="${POSTGRES_HOST:-mediczy-prod.cloqkwiey4k0.ap-south-1.rds.amazonaws.com}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_DB="${POSTGRES_DATABASE:-mediczy_prod}"
PG_USER="${POSTGRES_USER:-postgres}"
PGPASSWORD="${POSTGRES_PASSWORD}"
export PGPASSWORD

S3_BUCKET="${S3_UPLOADS_BUCKET:-mediczy-uploads}"
AWS_REGION="${AWS_REGION:-ap-south-1}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "${LOG_PREFIX} $*"; }
fail() { echo "${LOG_PREFIX} ERROR: $*" >&2; rm -rf "$TMPDIR"; exit 1; }

cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

log "Starting daily backup → minio/${BACKUP_BUCKET}/..."

# ── 1. PostgreSQL dump ────────────────────────────────────────────────────────
log "Dumping PostgreSQL: ${PG_DB}..."
DUMP_FILE="${TMPDIR}/${PG_DB}.sql.gz"

pg_dump \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U "$PG_USER" \
  -d "$PG_DB" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  2>/dev/null \
  | gzip -9 > "$DUMP_FILE" \
  || fail "pg_dump failed"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "Dump complete: ${DUMP_SIZE} compressed"

MC_DB_DEST="${MINIO_ALIAS}/${BACKUP_BUCKET}/db/${DATE}/${PG_DB}.sql.gz"
mc cp "$DUMP_FILE" "$MC_DB_DEST" --quiet \
  || fail "MinIO upload failed for DB dump"
log "DB backup uploaded → ${MC_DB_DEST}"

# ── 2. S3 uploads mirror ──────────────────────────────────────────────────────
log "Mirroring s3://${S3_BUCKET} → minio/${BACKUP_BUCKET}/s3/${DATE}/..."

# Use aws s3 sync to download to /tmp, then mc cp to MinIO
# (mc mirror directly from S3 requires S3 credentials on mc side — aws cli is simpler)
S3_MIRROR_DIR="${TMPDIR}/s3-mirror"
mkdir -p "$S3_MIRROR_DIR"

aws s3 sync "s3://${S3_BUCKET}" "$S3_MIRROR_DIR" \
  --region "$AWS_REGION" \
  --quiet \
  --no-progress \
  || fail "aws s3 sync failed"

OBJECT_COUNT=$(find "$S3_MIRROR_DIR" -type f | wc -l)
log "Downloaded ${OBJECT_COUNT} objects from s3://${S3_BUCKET}"

if [ "$OBJECT_COUNT" -gt 0 ]; then
  mc cp --recursive "$S3_MIRROR_DIR/" \
    "${MINIO_ALIAS}/${BACKUP_BUCKET}/s3/${DATE}/" \
    --quiet \
    || fail "MinIO upload failed for S3 mirror"
  log "S3 mirror uploaded → minio/${BACKUP_BUCKET}/s3/${DATE}/ (${OBJECT_COUNT} files)"
else
  log "S3 bucket is empty — skipping mirror upload"
fi

# ── 3. Summary ────────────────────────────────────────────────────────────────
log "Backup complete."
log "  DB:    minio/${BACKUP_BUCKET}/db/${DATE}/${PG_DB}.sql.gz  (${DUMP_SIZE})"
log "  Files: minio/${BACKUP_BUCKET}/s3/${DATE}/  (${OBJECT_COUNT} objects)"
log "  Retention: 30 days (MinIO lifecycle policy enforces auto-delete)"
