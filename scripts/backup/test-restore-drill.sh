#!/usr/bin/env bash
# Static safety checks for restore-drill.sh. A live drill requires a local PostgreSQL instance.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/backup/restore-drill.sh"
bash -n "$SCRIPT"
grep -q 'refusing remote restore target' "$SCRIPT"
grep -q 'production-like restore database name' "$SCRIPT"
grep -q 'dropdb --if-exists' "$SCRIPT"
grep -q 'record_backup_status' "$SCRIPT"
echo "restore-drill safety checks passed"
