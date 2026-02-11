#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

exec "$ROOT_DIR/scripts/database/backup-database.sh"
