#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LOG_FILE="$LOG_DIR/ai-cto-daily.log"

{
  echo "===== AI CTO DAILY RUN START $TS ====="
  cd "$ROOT_DIR"
  npm run test:sanity-smoke:canonical
  echo "===== AI CTO DAILY RUN END $(date -u +"%Y-%m-%dT%H:%M:%SZ") ====="
} >> "$LOG_FILE" 2>&1
