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

export PGSSLMODE="${PGSSLMODE:-require}"

echo "=== RDS backup diagnostics ==="
echo "Host:     ${POSTGRES_HOST}"
echo "Database: ${POSTGRES_DATABASE}"
echo "SSL:      ${PGSSLMODE}"
echo "App user: ${POSTGRES_USER}"

if command -v aws >/dev/null 2>&1; then
  RDS_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE_ID" \
    --region "$AWS_REGION" \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text 2>/dev/null || echo "unknown")
  echo "RDS status: ${RDS_STATUS} (must be 'available' after password reset)"
fi

MASTER_USER="$(pg_resolve_rds_master_user)"
echo "RDS master username: ${MASTER_USER}"

SSM_LEN=0
SSM_RAW_LEN=0
SSM_PREVIEW=""
if SSM_VAL="$(pg_get_ssm_master_password 2>/dev/null)"; then
  SSM_LEN=${#SSM_VAL}
  SSM_RAW_LEN=$(printf '%s' "$SSM_VAL" | wc -c)
  if [ "$SSM_VAL" = "YOUR_RDS_POSTGRES_MASTER_PASSWORD" ]; then
    SSM_PREVIEW="PLACEHOLDER (fix SSM)"
  else
    SSM_PREVIEW="set (${SSM_LEN} chars)"
    if [ "$SSM_LEN" != "$SSM_RAW_LEN" ]; then
      SSM_PREVIEW="${SSM_PREVIEW} — WARNING: may contain whitespace"
    fi
  fi
else
  SSM_PREVIEW="not readable"
fi
echo "SSM RDS_MASTER_PASSWORD: ${SSM_PREVIEW}"

echo ""
echo "Testing app user (${POSTGRES_USER}) login..."
if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" \
  -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" -c "SELECT 1;" >/dev/null 2>/tmp/rds-diag-helper.err; then
  echo "App user login: OK"
else
  echo "App user login: FAILED (network/SSL issue?)"
  sed 's/^/  /' /tmp/rds-diag-helper.err
fi
rm -f /tmp/rds-diag-helper.err

echo ""
echo "Testing master (${MASTER_USER}) login..."
if [ "$SSM_LEN" -gt 5 ] && [ "$SSM_VAL" != "YOUR_RDS_POSTGRES_MASTER_PASSWORD" ]; then
  if PGPASSWORD="$SSM_VAL" psql -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" \
    -U "$MASTER_USER" -d "$POSTGRES_DATABASE" \
    -c "SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user;" >/dev/null 2>/tmp/rds-diag.err; then
    echo "Master login: OK"
  else
    echo "Master login: FAILED — SSM password does not match RDS"
    sed 's/^/  /' /tmp/rds-diag.err
    echo ""
    echo "Reset RDS master password via CLI (app uses mediczy_helper — unaffected):"
    echo "  NEW_PASS='YourNewStrongPassword123!'"
    echo "  aws rds modify-db-instance --db-instance-identifier mediczy-prod \\"
    echo "    --master-user-password \"\$NEW_PASS\" --apply-immediately --region ap-south-1"
    echo "  aws rds wait db-instance-available --db-instance-identifier mediczy-prod --region ap-south-1"
    echo "  aws ssm put-parameter --name /mediczy/prod/RDS_MASTER_PASSWORD \\"
    echo "    --type SecureString --value \"\$NEW_PASS\" --region ap-south-1 --overwrite"
    echo "  bash scripts/backup/diagnose-rds-backup.sh"
  fi
  rm -f /tmp/rds-diag.err
else
  echo "Skip master login — fix SSM first"
fi

echo ""
echo "S3 offsite backups:"
aws s3 ls "s3://mediczy-backups/db/" --region "$AWS_REGION" --recursive 2>/dev/null | tail -5 || echo "  (cannot list)"
