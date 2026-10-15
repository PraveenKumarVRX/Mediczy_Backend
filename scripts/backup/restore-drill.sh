#!/usr/bin/env bash
# WP-0.7 — restore a database backup into a disposable local database and verify it.
# This is an operator-run drill. It refuses remote/production-like targets by default.
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BACKUP_ARTIFACT_PATH="${BACKUP_ARTIFACT_PATH:-}"
RESTORE_DB="${RESTORE_DB:-mediczy_restore_drill_$(date -u +%Y%m%d%H%M%S)}"
PGHOST="${PGHOST:-/var/run/postgresql}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGMAINTENANCE_DB="${PGMAINTENANCE_DB:-postgres}"
KEEP_RESTORE_DB="${KEEP_RESTORE_DB:-false}"
EXPECTED_TABLES="${EXPECTED_TABLES:-users,appointments}"

# shellcheck disable=SC1091
source "$ROOT/scripts/backup/backup-integrity.lib.sh"

fail() {
  echo "[restore-drill] FAIL: $*" >&2
  record_backup_status fail "restore-drill: $*"
  exit 1
}

[[ -n "$BACKUP_ARTIFACT_PATH" ]] || fail "BACKUP_ARTIFACT_PATH is required"
[[ -f "$BACKUP_ARTIFACT_PATH" ]] || fail "backup artifact not found: $BACKUP_ARTIFACT_PATH"
command -v psql >/dev/null 2>&1 || fail "psql is required"

# A restore drill must not be able to overwrite production by accident. The drill
# is intentionally local-only unless an operator explicitly opts into a remote
# non-production target after a separate change review.
if [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" && "$PGHOST" != "::1" && "$PGHOST" != /\/* ]]; then
  [[ "${ALLOW_RESTORE_DRILL_REMOTE:-false}" == "true" ]] || fail "refusing remote restore target '$PGHOST'; use a local PostgreSQL socket or explicitly review ALLOW_RESTORE_DRILL_REMOTE=true"
fi
if [[ "$RESTORE_DB" =~ (mediczy_prod|mediczy_ai|production|prod) ]]; then
  fail "refusing production-like restore database name '$RESTORE_DB'"
fi

if [[ -n "${BACKUP_CHECKSUM_PATH:-}" ]]; then
  [[ -f "$BACKUP_CHECKSUM_PATH" ]] || fail "checksum file not found: $BACKUP_CHECKSUM_PATH"
  sha256sum -c "$BACKUP_CHECKSUM_PATH" || fail "backup checksum verification failed"
fi

cleanup() {
  if [[ "$KEEP_RESTORE_DB" != "true" ]]; then
    dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --maintenance-db="$PGMAINTENANCE_DB" "$RESTORE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --maintenance-db="$PGMAINTENANCE_DB" "$RESTORE_DB" >/dev/null 2>&1 || true
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --maintenance-db="$PGMAINTENANCE_DB" "$RESTORE_DB"

case "$BACKUP_ARTIFACT_PATH" in
  *.dump|*.backup|*.tar|*.custom)
    command -v pg_restore >/dev/null 2>&1 || fail "pg_restore is required for custom-format backups"
    pg_restore --exit-on-error --no-owner --no-acl --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$RESTORE_DB" "$BACKUP_ARTIFACT_PATH"
    ;;
  *)
    psql -X --set ON_ERROR_STOP=1 --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$RESTORE_DB" < "$BACKUP_ARTIFACT_PATH"
    ;;
esac

psql -X --set ON_ERROR_STOP=1 --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$RESTORE_DB" -Atc 'SELECT 1' | grep -qx '1' || fail "restored database did not answer a validation query"
IFS=',' read -r -a tables <<< "$EXPECTED_TABLES"
for table in "${tables[@]}"; do
  table="${table//[[:space:]]/}"
  [[ -n "$table" ]] || continue
  exists=$(psql -X --set ON_ERROR_STOP=1 --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$RESTORE_DB" -Atc "SELECT to_regclass('$table') IS NOT NULL") || fail "could not verify table $table"
  [[ "$exists" == "t" ]] || fail "restored database is missing expected table $table"
done

echo "[restore-drill] OK: restored $BACKUP_ARTIFACT_PATH into $RESTORE_DB and verified ${#tables[@]} expected table(s)"
record_backup_status ok "restore-drill: $BACKUP_ARTIFACT_PATH restored and validated"
