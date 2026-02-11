#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      POSTGRES_*|DB_*)
        if [ -z "${!key:-}" ]; then
          value="${value%"\""}"
          value="${value#"\""}"
          export "$key"="$value"
        fi
        ;;
    esac
  done < <(grep -E '^(POSTGRES_|DB_)' "$ENV_FILE")
fi

exec "$ROOT_DIR/scripts/database/backup-database.sh"
