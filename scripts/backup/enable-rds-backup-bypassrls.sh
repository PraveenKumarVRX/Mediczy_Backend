#!/usr/bin/env bash
# One-time: allow RDS master user to pg_dump FORCE RLS tables (anonymous_patients, etc.)
#
# Run once on EC2 as ubuntu:
#   bash scripts/backup/enable-rds-backup-bypassrls.sh

set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/Mediczy}"
AWS_REGION="${AWS_REGION:-ap-south-1}"

# shellcheck disable=SC1091
source "$ROOT/scripts/ops/load-prod-env.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/backup/pg-dump-prod.lib.sh"

MASTER_USER="$(pg_resolve_rds_master_user)"
MASTER_PASS=""

if [ -n "${POSTGRES_BACKUP_PASSWORD:-}" ] && [ "${RDS_MASTER_BACKUP:-}" = "true" ]; then
  MASTER_PASS="$POSTGRES_BACKUP_PASSWORD"
else
  MASTER_PASS="$(pg_get_ssm_master_password || true)"
fi

if [ -z "$MASTER_PASS" ] || [ "$MASTER_PASS" = "YOUR_RDS_POSTGRES_MASTER_PASSWORD" ]; then
  echo "ERROR: Set real RDS master password in SSM /mediczy/prod/RDS_MASTER_PASSWORD" >&2
  exit 1
fi

echo "Granting BYPASSRLS to ${MASTER_USER} on ${POSTGRES_HOST}..."
PGPASSWORD="$MASTER_PASS" psql \
  -h "$POSTGRES_HOST" \
  -p "${POSTGRES_PORT:-5432}" \
  -U "$MASTER_USER" \
  -d "${POSTGRES_DATABASE}" \
  -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE ${MASTER_USER} BYPASSRLS;"

echo "Verifying..."
PGPASSWORD="$MASTER_PASS" psql \
  -h "$POSTGRES_HOST" \
  -p "${POSTGRES_PORT:-5432}" \
  -U "$MASTER_USER" \
  -d "${POSTGRES_DATABASE}" \
  -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = '${MASTER_USER}';"

echo "Done. Retry: bash scripts/database/daily-backup.sh"
