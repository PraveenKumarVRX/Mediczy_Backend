#!/usr/bin/env bash
# Diagnose RDS backup credentials (no passwords printed).
set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/Mediczy}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
RDS_INSTANCE_ID="${RDS_INSTANCE_ID:-mediczy-prod}"

# shellcheck disable=SC1091
source "$ROOT/scripts/ops/load-prod-env.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/backup/pg-dump-prod.lib.sh"

echo "=== RDS backup diagnostics ==="
echo "Host:     ${POSTGRES_HOST}"
echo "Database: ${POSTGRES_DATABASE}"
echo "App user: ${POSTGRES_USER}"

MASTER_USER="$(pg_resolve_rds_master_user)"
echo "RDS master username (from API): ${MASTER_USER}"

SSM_LEN=0
SSM_PREVIEW=""
if SSM_VAL="$(pg_get_ssm_master_password 2>/dev/null)"; then
  SSM_LEN=${#SSM_VAL}
  if [ "$SSM_VAL" = "YOUR_RDS_POSTGRES_MASTER_PASSWORD" ]; then
    SSM_PREVIEW="PLACEHOLDER (fix SSM)"
  else
    SSM_PREVIEW="set (${SSM_LEN} chars)"
  fi
else
  SSM_PREVIEW="not readable"
fi
echo "SSM RDS_MASTER_PASSWORD: ${SSM_PREVIEW}"

echo ""
echo "Testing master login (no output = OK)..."
if [ "$SSM_LEN" -gt 5 ] && [ "$SSM_VAL" != "YOUR_RDS_POSTGRES_MASTER_PASSWORD" ]; then
  if PGPASSWORD="$SSM_VAL" psql -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" \
    -U "$MASTER_USER" -d "$POSTGRES_DATABASE" -c "SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user;" 2>/tmp/rds-diag.err; then
    echo "Master login: OK"
  else
    echo "Master login: FAILED"
    sed 's/^/  /' /tmp/rds-diag.err
    echo ""
    echo "Fix: reset RDS master password in AWS Console, then:"
    echo "  aws ssm put-parameter --name /mediczy/prod/RDS_MASTER_PASSWORD \\"
    echo "    --type SecureString --value 'NEW_PASSWORD' --region ap-south-1 --overwrite"
  fi
  rm -f /tmp/rds-diag.err
else
  echo "Skip master login test — fix SSM first"
fi

echo ""
echo "S3 offsite backups:"
aws s3 ls "s3://mediczy-backups/db/" --region "$AWS_REGION" --recursive 2>/dev/null | tail -5 || echo "  (cannot list)"
