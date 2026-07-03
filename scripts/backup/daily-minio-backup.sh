#!/usr/bin/env bash
# Legacy entrypoint — delegates to daily-offsite-backup.sh (S3 + optional MinIO).
# Kept for existing cron jobs that reference this path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$ROOT/scripts/backup/daily-offsite-backup.sh" "$@"
