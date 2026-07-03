#!/usr/bin/env bash
# Push PostgreSQL snapshot offsite to S3 and/or MinIO.
#
# RDS prod uses FORCE ROW LEVEL SECURITY — pg_dump needs the RDS master user
# (or upload the nightly local cron dump as fallback).
#
# Layout:
#   s3://mediczy-backups/db/YYYY-MM-DD/mediczy_prod.sql.gz
#
# Cron:
#   0 3 * * * /home/ubuntu/Mediczy/scripts/backup/daily-offsite-backup.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1

set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/Mediczy}"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
LOG_PREFIX="[backup ${TIMESTAMP}]"
TMPDIR=$(mktemp -d)
WITH_UPLOADS=0
UPLOAD_LOCAL_ONLY=0
PG_DUMP_LOG="${TMPDIR}/pg_dump.err"
DUMP_FILE="${TMPDIR}/mediczy_prod.sql.gz"
DUMP_SOURCE="pg_dump"
LOCAL_CRON_DIR="/var/backups/mediczy"

for arg in "$@"; do
  case "$arg" in
    --with-uploads)     WITH_UPLOADS=1 ;;
    --upload-local-only) UPLOAD_LOCAL_ONLY=1 ;;
    --db-only)          ;;
    -h|--help)
      sed -n '2,14p' "$0"
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
AWS_REGION="${AWS_REGION:-ap-south-1}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-mediczy-backups}"
S3_UPLOADS_BUCKET="${S3_UPLOADS_BUCKET:-mediczy-uploads}"
MINIO_ALIAS="${MINIO_ALIAS:-minio}"
MINIO_BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-mediczy-backups}"
RDS_INSTANCE_ID="${RDS_INSTANCE_ID:-mediczy-prod}"

build_exclude_args() {
  PG_DUMP_EXCLUDE_ARGS=()
  local schemas="$1"
  [ -n "$schemas" ] || return 0
  IFS=',' read -ra _schemas <<< "$schemas"
  for _schema in "${_schemas[@]}"; do
    _schema="${_schema#"${_schema%%[![:space:]]*}"}"
    _schema="${_schema%"${_schema##*[![:space:]]}"}"
    [ -n "$_schema" ] || continue
    PG_DUMP_EXCLUDE_ARGS+=(--exclude-schema="$_schema")
  done
}

run_pg_dump() {
  local user="$1" pass="$2" excludes="$3"
  build_exclude_args "$excludes"
  log "pg_dump as ${user}@${PG_HOST} (excludes: ${excludes:-none})"
  : >"$PG_DUMP_LOG"
  set +o pipefail
  PGPASSWORD="$pass" pg_dump \
    -h "$PG_HOST" \
    -p "$PG_PORT" \
    -U "$user" \
    -d "$PG_DB" \
    --no-password \
    --format=plain \
    --no-owner \
    --no-acl \
    "${PG_DUMP_EXCLUDE_ARGS[@]}" \
    2>"$PG_DUMP_LOG" \
    | gzip -9 > "$DUMP_FILE"
  local rc=${PIPESTATUS[0]}
  set -o pipefail
  if [ "$rc" -ne 0 ] || [ ! -s "$DUMP_FILE" ]; then
    log "pg_dump failed (exit $rc) for user ${user}:"
    sed "s/^/${LOG_PREFIX}   /" "$PG_DUMP_LOG" >&2 || true
    return 1
  fi
  return 0
}

try_rds_secrets_manager() {
  command -v aws >/dev/null 2>&1 || return 1
  local secret_arn secret_json user pass
  secret_arn=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE_ID" \
    --region "$AWS_REGION" \
    --query 'DBInstances[0].MasterUserSecret.SecretArn' \
    --output text 2>/dev/null || true)
  [ -n "$secret_arn" ] && [ "$secret_arn" != "None" ] || return 1
  log "Trying RDS Secrets Manager master credentials..."
  secret_json=$(aws secretsmanager get-secret-value \
    --secret-id "$secret_arn" \
    --region "$AWS_REGION" \
    --query SecretString --output text 2>/dev/null || true)
  [ -n "$secret_json" ] || return 1
  if command -v jq >/dev/null 2>&1; then
    user=$(echo "$secret_json" | jq -r '.username // "postgres"')
    pass=$(echo "$secret_json" | jq -r '.password // empty')
  else
    user=$(echo "$secret_json" | sed -n 's/.*"username"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    pass=$(echo "$secret_json" | sed -n 's/.*"password"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    user="${user:-postgres}"
  fi
  [ -n "$pass" ] || return 1
  run_pg_dump "$user" "$pass" ""
}

try_env_master() {
  [ "${RDS_MASTER_BACKUP:-}" = "true" ] && [ -n "${POSTGRES_BACKUP_PASSWORD:-}" ] || return 1
  log "Trying .env RDS master credentials..."
  run_pg_dump "${POSTGRES_BACKUP_USER:-postgres}" "$POSTGRES_BACKUP_PASSWORD" ""
}

try_root_backup_env() {
  local env_file="/root/.mediczy-backup.env"
  [ -f "$env_file" ] || sudo test -f "$env_file" 2>/dev/null || return 1
  log "Trying ${env_file}..."
  # shellcheck disable=SC1090
  local _user _pass
  eval "$(sudo grep -E '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_BACKUP_USER|POSTGRES_BACKUP_PASSWORD)=' "$env_file" 2>/dev/null \
    | sed 's/^POSTGRES_BACKUP_/POSTGRES_/')"
  _user="${POSTGRES_BACKUP_USER:-${POSTGRES_USER:-postgres}}"
  _pass="${POSTGRES_BACKUP_PASSWORD:-${POSTGRES_PASSWORD:-}}"
  [ -n "$_pass" ] || return 1
  run_pg_dump "$_user" "$_pass" ""
}

use_local_cron_backup() {
  local latest age_hours
  latest=$(ls -1t "$LOCAL_CRON_DIR"/mediczy_db_*.sql.gz 2>/dev/null | head -1 || true)
  [ -n "$latest" ] && [ -f "$latest" ] || return 1
  age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest")) / 3600 ))
  if [ "$age_hours" -gt 48 ]; then
    log "Local cron backup too old (${age_hours}h): $latest"
    return 1
  fi
  log "Using local cron backup (${age_hours}h old): $latest"
  cp "$latest" "$DUMP_FILE"
  DUMP_SOURCE="local-cron:$latest"
  return 0
}

log "Starting offsite backup for ${PG_DB}@${PG_HOST}"

if [ "$UPLOAD_LOCAL_ONLY" -eq 1 ]; then
  use_local_cron_backup || fail "No recent local backup in ${LOCAL_CRON_DIR}"
else
  if ! command -v pg_dump >/dev/null 2>&1; then
    log "WARN: pg_dump not installed — falling back to local cron backup"
    use_local_cron_backup || fail "Install postgresql-client or ensure ${LOCAL_CRON_DIR} has a recent dump"
  else
    DUMP_OK=0
    try_rds_secrets_manager && DUMP_OK=1
    [ "$DUMP_OK" -eq 1 ] || try_env_master && DUMP_OK=1
    [ "$DUMP_OK" -eq 1 ] || try_root_backup_env && DUMP_OK=1
    if [ "$DUMP_OK" -eq 0 ]; then
      log "WARN: master pg_dump unavailable — mediczy_helper cannot bypass RLS on PHI tables"
      if run_pg_dump "${POSTGRES_USER:-mediczy_helper}" "$POSTGRES_PASSWORD" "${PG_DUMP_EXCLUDE_SCHEMAS:-n8n}"; then
        DUMP_OK=1
      fi
    fi
    if [ "$DUMP_OK" -eq 0 ]; then
      log "WARN: live pg_dump failed — falling back to local cron backup"
      use_local_cron_backup || fail "All dump methods failed. Set RDS master in Secrets Manager or upload manually."
    fi
  fi
fi

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "Backup ready (${DUMP_SOURCE}): ${DUMP_SIZE}"

DEST_KEY="db/${DATE}/${PG_DB}.sql.gz"
UPLOADED=0

if command -v aws >/dev/null 2>&1; then
  S3_URI="s3://${S3_BACKUP_BUCKET}/${DEST_KEY}"
  log "Uploading → ${S3_URI}"
  if aws s3 cp "$DUMP_FILE" "$S3_URI" --region "$AWS_REGION" --only-show-errors; then
    log "S3 upload OK"
    UPLOADED=1
  else
    log "WARN: S3 upload failed — check IAM s3:PutObject on ${S3_BACKUP_BUCKET}"
  fi
fi

if command -v mc >/dev/null 2>&1; then
  MC_DEST="${MINIO_ALIAS}/${MINIO_BACKUP_BUCKET}/${DEST_KEY}"
  if mc stat "${MINIO_ALIAS}/${MINIO_BACKUP_BUCKET}" >/dev/null 2>&1; then
    log "Uploading → ${MC_DEST}"
    mc cp "$DUMP_FILE" "$MC_DEST" --quiet && UPLOADED=1 || log "WARN: MinIO upload failed"
  fi
fi

[ "$UPLOADED" -eq 1 ] || fail "No offsite destination succeeded"

if [ "$WITH_UPLOADS" -eq 1 ] && command -v mc >/dev/null 2>&1 && command -v aws >/dev/null 2>&1; then
  log "Mirroring s3://${S3_UPLOADS_BUCKET} → minio/${MINIO_BACKUP_BUCKET}/s3/${DATE}/ ..."
  S3_MIRROR_DIR="${TMPDIR}/s3-mirror"
  mkdir -p "$S3_MIRROR_DIR"
  aws s3 sync "s3://${S3_UPLOADS_BUCKET}" "$S3_MIRROR_DIR" --region "$AWS_REGION" --quiet --no-progress \
    || fail "aws s3 sync failed"
  OBJECT_COUNT=$(find "$S3_MIRROR_DIR" -type f | wc -l)
  [ "$OBJECT_COUNT" -gt 0 ] && mc cp --recursive "$S3_MIRROR_DIR/" "${MINIO_ALIAS}/${MINIO_BACKUP_BUCKET}/s3/${DATE}/" --quiet
fi

log "Backup complete."
log "  Source:  ${DUMP_SOURCE}"
log "  Offsite: s3://${S3_BACKUP_BUCKET}/${DEST_KEY} (${DUMP_SIZE})"
