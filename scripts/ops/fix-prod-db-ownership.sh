#!/usr/bin/env bash
# Re-grant mediczy_helper ownership after pg_restore --no-owner (uat-to-prod sync).
# Without this, SIB startup fails with: must be owner of table sib_chat_history

set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/home/ubuntu/Mediczy}"
ENV_FILE="$ROOT_DIR/.env"
APP_USER="${APP_USER:-mediczy_helper}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DB_HOST="${POSTGRES_HOST:?POSTGRES_HOST not set}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DATABASE:?POSTGRES_DATABASE not set}"
DB_ADMIN_USER="${DB_ADMIN_USER:-postgres}"
DB_ADMIN_PASS="${DB_ADMIN_PASS:-}"

if [[ -z "$DB_ADMIN_PASS" ]]; then
  DB_ADMIN_PASS="$(aws ssm get-parameter \
    --with-decryption \
    --name "${SSM_POSTGRES_PASSWORD_PARAM:-/mediczy/POSTGRES_PASSWORD}" \
    --region "${AWS_REGION:-ap-south-1}" \
    --query 'Parameter.Value' \
    --output text)"
fi

if [[ ! "$APP_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "Invalid APP_USER: $APP_USER"
  exit 1
fi

echo "[$(date -Iseconds)] Fixing object ownership in $DB_NAME → $APP_USER"

PGPASSWORD="$DB_ADMIN_PASS" psql \
  "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_ADMIN_USER sslmode=require" <<SQL
GRANT ALL ON SCHEMA public TO ${APP_USER};
ALTER SCHEMA public OWNER TO ${APP_USER};

DO \$\$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO ${APP_USER}', r.tablename);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO ${APP_USER}', r.tablename);
  END LOOP;
END
\$\$;

DO \$\$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO ${APP_USER}', r.sequencename);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO ${APP_USER}', r.sequencename);
  END LOOP;
END
\$\$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_USER};
SQL

echo "[$(date -Iseconds)] Ownership fix complete"
