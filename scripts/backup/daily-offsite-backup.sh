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
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
LOG_PREFIX="[backup ${TIMESTAMP}]"
TMPDIR=$(mktemp -d)
WITH_UPLOADS=0

for arg in "$@"; do
  case "$arg" in
    --with-uploads) WITH_UPLOADS=1 ;;
    --db-only)      ;; # default behaviour
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

# Load production env (POSTGRES_*, AWS_*, MINIO_*)
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(POSTGRES_|AWS_|S3_|MINIO_|DB_)' "$ENV_FILE" | sed 's/\r$//')
  set +a
fi

PG_HOST="${POSTGRES_HOST:-mediczy-prod.cloqkwiey4k0.ap-south-1.rds.amazonaws.com}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_DB="${POSTGRES_DATABASE:-mediczy_prod}"
PG_USER="${POSTGRES_USER:-postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

AWS_REGION="${AWS_REGION:-ap-south-1}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-mediczy-backups}"
S3_UPLOADS_BUCKET="${S3_UPLOADS_BUCKET:-mediczy-uploads}"
MINIO_ALIAS="${MINIO_ALIAS:-minio}"
MINIO_BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-mediczy-backups}"

if [ -z "${PGPASSWORD:-}" ]; then
  fail "POSTGRES_PASSWORD not set — add to $ENV_FILE or export PGPASSWORD"
fi

log "Starting offsite backup for ${PG_DB}@${PG_HOST}"

# ── 1. PostgreSQL dump ────────────────────────────────────────────────────────
DUMP_FILE="${TMPDIR}/${PG_DB}.sql.gz"
log "Dumping PostgreSQL..."
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
    log "WARN: S3 upload failed — ensure bucket ${S3_BACKUP_BUCKET} exists and IAM allows s3:PutObject"
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
    log "MinIO alias '${MINIO_ALIAS}' or bucket '${MINIO_BACKUP_BUCKET}' not configured — skipping"
    log "  Setup: mc alias set minio http://127.0.0.1:9000 ACCESS_KEY SECRET_KEY"
    log "         mc mb minio/mediczy-backups"
  fi
else
  log "mc not installed — skipping MinIO (S3-only backup is fine)"
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

# ── 5. Local retention (small copy for quick restore) ─────────────────────────
LOCAL_DIR="/var/backups/mediczy"
mkdir -p "$LOCAL_DIR"
LOCAL_COPY="${LOCAL_DIR}/${PG_DB}_${DATE}.sql.gz"
cp "$DUMP_FILE" "$LOCAL_COPY"
find "$LOCAL_DIR" -type f -name "${PG_DB}_*.sql.gz" -mtime +7 -delete 2>/dev/null || true
log "Local copy: ${LOCAL_COPY} (7-day retention)"

log "Backup complete."
log "  Offsite: ${DEST_KEY} (${DUMP_SIZE})"
log "  S3:      s3://${S3_BACKUP_BUCKET}/${DEST_KEY}"
log "  MinIO:   ${MINIO_ALIAS}/${MINIO_BACKUP_BUCKET}/${DEST_KEY} (if configured)"
