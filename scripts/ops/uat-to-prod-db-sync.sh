#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
ENV_FILE="$ROOT_DIR/.env"
LOG_DIR="$ROOT_DIR/logs/db-sync"
BACKUP_DIR="$ROOT_DIR/backups/db-sync"
LOCK_FILE="/tmp/uat-to-prod-db-sync.lock"

# Target PROD database currently used by mediczy.in ECS app service.
PROD_HOST="mediczy-prod.cloqkwiey4k0.ap-south-1.rds.amazonaws.com"
PROD_PORT="5432"
PROD_DB="mediczy_prod"
PROD_USER="postgres"
PROD_PASS_PARAM="/mediczy/POSTGRES_PASSWORD"
AWS_REGION="ap-south-1"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RUN_LOG="$LOG_DIR/uat-to-prod-sync-$TIMESTAMP.log"

mkdir -p "$LOG_DIR" "$BACKUP_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date -Iseconds)] Another sync is already running; exiting."
  exit 1
fi

exec > >(tee -a "$RUN_LOG") 2>&1

echo "[$(date -Iseconds)] Starting UAT -> PROD sync"

for cmd in aws psql pg_dump pg_restore; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[$(date -Iseconds)] Missing required command: $cmd"
    exit 1
  fi
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[$(date -Iseconds)] Missing env file: $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

UAT_HOST="${POSTGRES_HOST:-}"
UAT_PORT="${POSTGRES_PORT:-5432}"
UAT_DB="${POSTGRES_DATABASE:-}"
UAT_USER="${POSTGRES_USER:-}"
UAT_PASS="${POSTGRES_PASSWORD:-}"

if [[ -z "$UAT_HOST" || -z "$UAT_DB" || -z "$UAT_USER" || -z "$UAT_PASS" ]]; then
  echo "[$(date -Iseconds)] UAT DB configuration is incomplete in $ENV_FILE"
  exit 1
fi

PROD_PASS="$(aws ssm get-parameter \
  --with-decryption \
  --name "$PROD_PASS_PARAM" \
  --region "$AWS_REGION" \
  --query 'Parameter.Value' \
  --output text)"

if [[ -z "$PROD_PASS" ]]; then
  echo "[$(date -Iseconds)] Failed to resolve PROD DB password from SSM"
  exit 1
fi

echo "[$(date -Iseconds)] Connectivity check"
PGPASSWORD="$UAT_PASS" psql "host=$UAT_HOST port=$UAT_PORT dbname=$UAT_DB user=$UAT_USER sslmode=require" -c "select 1" >/dev/null
PGPASSWORD="$PROD_PASS" psql "host=$PROD_HOST port=$PROD_PORT dbname=$PROD_DB user=$PROD_USER sslmode=require" -c "select 1" >/dev/null

UAT_DUMP="$BACKUP_DIR/uat_dump_$TIMESTAMP.dump"
PROD_PRE_BACKUP="$BACKUP_DIR/prod_pre_sync_$TIMESTAMP.dump"

echo "[$(date -Iseconds)] Taking PROD pre-sync backup: $PROD_PRE_BACKUP"
PGPASSWORD="$PROD_PASS" pg_dump \
  --format=custom \
  --host="$PROD_HOST" \
  --port="$PROD_PORT" \
  --username="$PROD_USER" \
  --dbname="$PROD_DB" \
  --no-owner \
  --no-privileges \
  --file="$PROD_PRE_BACKUP"

echo "[$(date -Iseconds)] Taking UAT source dump: $UAT_DUMP"
PGPASSWORD="$UAT_PASS" pg_dump \
  --format=custom \
  --host="$UAT_HOST" \
  --port="$UAT_PORT" \
  --username="$UAT_USER" \
  --dbname="$UAT_DB" \
  --no-owner \
  --no-privileges \
  --file="$UAT_DUMP"

echo "[$(date -Iseconds)] Resetting PROD public schema"
PGPASSWORD="$PROD_PASS" psql "host=$PROD_HOST port=$PROD_PORT dbname=$PROD_DB user=$PROD_USER sslmode=require" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
SQL

echo "[$(date -Iseconds)] Restoring UAT dump into PROD"
PGPASSWORD="$PROD_PASS" pg_restore \
  --host="$PROD_HOST" \
  --port="$PROD_PORT" \
  --username="$PROD_USER" \
  --dbname="$PROD_DB" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  "$UAT_DUMP"

echo "[$(date -Iseconds)] Post-sync validation summary"
UAT_TABLES=$(PGPASSWORD="$UAT_PASS" psql "host=$UAT_HOST port=$UAT_PORT dbname=$UAT_DB user=$UAT_USER sslmode=require" -At -c "select count(*) from pg_tables where schemaname='public';")
PROD_TABLES=$(PGPASSWORD="$PROD_PASS" psql "host=$PROD_HOST port=$PROD_PORT dbname=$PROD_DB user=$PROD_USER sslmode=require" -At -c "select count(*) from pg_tables where schemaname='public';")
echo "[$(date -Iseconds)] public tables: uat=$UAT_TABLES prod=$PROD_TABLES"

echo "[$(date -Iseconds)] Sync complete"

echo "[$(date -Iseconds)] Reassigning table ownership to mediczy_helper"
bash "$ROOT_DIR/scripts/ops/fix-prod-db-ownership.sh" || {
  echo "[$(date -Iseconds)] WARNING: ownership fix failed — run scripts/ops/fix-prod-db-ownership.sh manually"
}
