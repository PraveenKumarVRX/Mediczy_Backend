#!/usr/bin/env bash
# Push PostgreSQL snapshot offsite to S3 and/or MinIO.
#
# Layout:
#   s3://mediczy-backups/db/YYYY-MM-DD/mediczy_prod.sql.gz
#   minio/mediczy-backups/db/YYYY-MM-DD/mediczy_prod.sql.gz  (if mc configured)
#
# Optional uploads mirror (expensive — off by default):
#   ./daily-offsite-backup.sh --with-uploads
#
# Cron:
#   0 2 * * * /home/ubuntu/Mediczy/scripts/backup/daily-offsite-backup.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1

set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/Mediczy}"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
LOG_PREFIX="[backup ${TIMESTAMP}]"
TMPDIR=$(mktemp -d)
WITH_UPLOADS=0
PG_DUMP_LOG="${TMPDIR}/pg_dump.err"

for arg in "$@"; do
  case "$arg" in
    --with-uploads) WITH_UPLOADS=1 ;;
    --db-only)      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log()  { echo "${LOG_PREFIX} $*"; }
fail() { echo "${LOG_PREFIX} ERROR: $*" >&2; rm -rf "$TMPDIR"; exit 1; }

cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

# shellcheck disable=SC1091
source "$ROOT/scripts/ops/load-prod-env.sh"

PG_HOST="$POSTGRES_HOST"
PG_PORT="$POSTGRES_PORT"
PG_DB="$POSTGRES_DATABASE"

# Default: mediczy_helper + exclude n8n (helper cannot LOCK n8n.* on RDS).
# Full dump: set RDS_MASTER_BACKUP=true plus POSTGRES_BACKUP_USER/PASSWORD in .env.
if [ "${RDS_MASTER_BACKUP:-}" = "true" ] && [ -n "${POSTGRES_BACKUP_PASSWORD:-}" ]; then
  PG_USER="${POSTGRES_BACKUP_USER:-postgres}"
  export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"
  DUMP_EXCLUDE_SCHEMAS="${PG_DUMP_EXCLUDE_SCHEMAS:-}"
  log "Using RDS master backup user: ${PG_USER}"
else
  PG_USER="${POSTGRES_USER:-mediczy_helper}"
  export PGPASSWORD="$POSTGRES_PASSWORD"
  DUMP_EXCLUDE_SCHEMAS="${PG_DUMP_EXCLUDE_SCHEMAS:-n8n}"
fi

AWS_REGION="${AWS_REGION:-ap-south-1}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-mediczy-backups}"
S3_UPLOADS_BUCKET="${S3_UPLOADS_BUCKET:-mediczy-uploads}"
MINIO_ALIAS="${MINIO_ALIAS:-minio}"
MINIO_BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-mediczy-backups}"

if [ -z "${PGPASSWORD:-}" ]; then
  fail "POSTGRES_PASSWORD not set — check $ROOT/.env and server/.env"
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  fail "pg_dump not found — run: sudo apt-get install -y postgresql-client"
fi

log "Starting offsite backup for ${PG_DB}@${PG_HOST} (user=${PG_USER}, ssl=${PGSSLMODE:-prefer})"

# Build --exclude-schema flags (e.g. n8n — mediczy_helper cannot LOCK those tables)
PG_DUMP_EXCLUDE_ARGS=()
if [ -n "${DUMP_EXCLUDE_SCHEMAS:-}" ]; then
  IFS=',' read -ra _schemas <<< "$DUMP_EXCLUDE_SCHEMAS"
  for _schema in "${_schemas[@]}"; do
    _schema="${_schema#"${_schema%%[![:space:]]*}"}"
    _schema="${_schema%"${_schema##*[![:space:]]}"}"
    [ -n "$_schema" ] || continue
    PG_DUMP_EXCLUDE_ARGS+=(--exclude-schema="$_schema")
  done
  if [ "${#PG_DUMP_EXCLUDE_ARGS[@]}" -gt 0 ]; then
    log "Excluding schemas: ${DUMP_EXCLUDE_SCHEMAS}"
  fi
fi

# Quick connectivity check before full dump
if ! pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -t 10 >/dev/null 2>&1; then
  log "WARN: pg_isready failed — attempting dump anyway"
fi

# ── 1. PostgreSQL dump ────────────────────────────────────────────────────────
DUMP_FILE="${TMPDIR}/${PG_DB}.sql.gz"
log "Dumping PostgreSQL..."

set +o pipefail
pg_dump \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U "$PG_USER" \
  -d "$PG_DB" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  "${PG_DUMP_EXCLUDE_ARGS[@]}" \
  2>"$PG_DUMP_LOG" \
  | gzip -9 > "$DUMP_FILE"
DUMP_RC=${PIPESTATUS[0]}
set -o pipefail

if [ "$DUMP_RC" -ne 0 ] || [ ! -s "$DUMP_FILE" ]; then
  log "pg_dump stderr:"
  sed "s/^/${LOG_PREFIX}   /" "$PG_DUMP_LOG" >&2 || true
  fail "pg_dump failed (exit $DUMP_RC) — set POSTGRES_BACKUP_PASSWORD (RDS master) in .env or exclude schemas"
fi

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "Dump complete: ${DUMP_SIZE}"

DEST_KEY="db/${DATE}/${PG_DB}.sql.gz"
UPLOADED=0

# ── 2. Push to S3 (primary — uses EC2 instance role) ─────────────────────────
if command -v aws >/dev/null 2>&1; then
  S3_URI="s3://${S3_BACKUP_BUCKET}/${DEST_KEY}"
  log "Uploading → ${S3_URI}"
  if aws s3 cp "$DUMP_FILE" "$S3_URI" --region "$AWS_REGION" --only-show-errors; then
    log "S3 upload OK"
    UPLOADED=1
  else
    log "WARN: S3 upload failed — create bucket: aws s3 mb s3://${S3_BACKUP_BUCKET} --region ${AWS_REGION}"
  fi
else
  log "WARN: aws CLI not found — skipping S3"
fi

# ── 3. Push to MinIO (optional secondary) ─────────────────────────────────────
if command -v mc >/dev/null 2>&1; then
  MC_DEST="${MINIO_ALIAS}/${MINIO_BACKUP_BUCKET}/${DEST_KEY}"
  if mc stat "${MINIO_ALIAS}/${MINIO_BACKUP_BUCKET}" >/dev/null 2>&1; then
    log "Uploading → ${MC_DEST}"
    if mc cp "$DUMP_FILE" "$MC_DEST" --quiet; then
      log "MinIO upload OK"
      UPLOADED=1
    else
      log "WARN: MinIO upload failed"
    fi
  else
    log "MinIO not configured — skipping (S3-only is fine)"
  fi
else
  log "mc not installed — skipping MinIO"
fi

if [ "$UPLOADED" -eq 0 ]; then
  fail "No offsite destination succeeded — fix S3 bucket/IAM or MinIO mc alias"
fi

# ── 4. Optional: mirror uploads bucket to MinIO ───────────────────────────────
if [ "$WITH_UPLOADS" -eq 1 ] && command -v mc >/dev/null 2>&1 && command -v aws >/dev/null 2>&1; then
  log "Mirroring s3://${S3_UPLOADS_BUCKET} → minio/${MINIO_BACKUP_BUCKET}/s3/${DATE}/ ..."
  S3_MIRROR_DIR="${TMPDIR}/s3-mirror"
  mkdir -p "$S3_MIRROR_DIR"
  aws s3 sync "s3://${S3_UPLOADS_BUCKET}" "$S3_MIRROR_DIR" --region "$AWS_REGION" --quiet --no-progress \
    || fail "aws s3 sync failed"
  OBJECT_COUNT=$(find "$S3_MIRROR_DIR" -type f | wc -l)
  if [ "$OBJECT_COUNT" -gt 0 ]; then
    mc cp --recursive "$S3_MIRROR_DIR/" "${MINIO_ALIAS}/${MINIO_BACKUP_BUCKET}/s3/${DATE}/" --quiet \
      || fail "MinIO uploads mirror failed"
    log "Uploads mirror OK (${OBJECT_COUNT} files)"
  else
    log "Uploads bucket empty — skip mirror"
  fi
fi

# ── 5. Local retention (keep latest 2 after successful offsite upload) ──────────
LOCAL_DIR="/var/backups/mediczy"
mkdir -p "$LOCAL_DIR"
LOCAL_COPY="${LOCAL_DIR}/${PG_DB}_${DATE}.sql.gz"
cp "$DUMP_FILE" "$LOCAL_COPY"
mapfile -t LOCAL_DUMPS < <(ls -1t "$LOCAL_DIR"/${PG_DB}_*.sql.gz 2>/dev/null || true)
for ((i=2; i<${#LOCAL_DUMPS[@]}; i++)); do
  rm -f "${LOCAL_DUMPS[$i]}"
done
log "Local copy: ${LOCAL_COPY} (keep latest 2)"

log "Backup complete."
log "  Offsite: ${DEST_KEY} (${DUMP_SIZE})"
log "  S3:      s3://${S3_BACKUP_BUCKET}/${DEST_KEY}"
