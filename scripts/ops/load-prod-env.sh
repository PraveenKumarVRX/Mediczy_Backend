#!/usr/bin/env bash
# Load production env the same way PM2 does (root .env then server/.env).
# Usage: source "$(dirname "$0")/load-prod-env.sh"
#
# Exports POSTGRES_*, AWS_*, S3_*, MINIO_*, DB_*, JWT_* when present.

load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    case "$val" in
      \"*\") val="${val:1:${#val}-2}" ;;
      \'*\') val="${val:1:${#val}-2}" ;;
    esac
    [ -n "$key" ] || continue
    export "$key=$val"
  done < "$file"
}

ROOT="${MEDICZY_HOME:-${ROOT:-/home/ubuntu/Mediczy}}"
load_env_file "$ROOT/.env"
load_env_file "$ROOT/server/.env"

# RDS requires TLS from EC2
if [ "${POSTGRES_SSL:-}" = "true" ] || [ "${PGSSLMODE:-}" = "require" ]; then
  export PGSSLMODE="${PGSSLMODE:-require}"
fi

# Password fallbacks used elsewhere in the repo
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${POSTGRES_PRIMARY_PASSWORD:-${DB_PASSWORD:-${DB_PASS:-}}}}"
export POSTGRES_USER="${POSTGRES_USER:-mediczy_helper}"
export POSTGRES_DATABASE="${POSTGRES_DATABASE:-mediczy_prod}"
export POSTGRES_HOST="${POSTGRES_HOST:-mediczy-prod.cloqkwiey4k0.ap-south-1.rds.amazonaws.com}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# Optional RDS master credentials — set ONLY in .env when RDS_MASTER_BACKUP=true
# Do NOT auto-fill from POSTGRES_PASSWORD (helper ≠ postgres user).
