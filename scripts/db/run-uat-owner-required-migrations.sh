#!/usr/bin/env bash
set -euo pipefail

# Runs only the owner-required remaining UAT migrations.
# Requires owner-capable DB credentials in env:
#   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD
# Optional role-assumption path (when connecting user is a member of owner role):
#   DB_MIGRATION_ROLE=mediczy_admin
# Optional:
#   ENCRYPTION_KEY for PHI backfill execution

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="$ROOT_DIR/server/db/migrations"
LOG_DIR="$ROOT_DIR/logs"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/uat-owner-rollout-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

required_env=(POSTGRES_HOST POSTGRES_PORT POSTGRES_DATABASE POSTGRES_USER POSTGRES_PASSWORD)
for key in "${required_env[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "[ERROR] Missing required env: $key" | tee -a "$LOG_FILE"
    exit 1
  fi
done

export PGPASSWORD="$POSTGRES_PASSWORD"
export PGSSLMODE="${PGSSLMODE:-require}"
DB_MIGRATION_ROLE="${DB_MIGRATION_ROLE:-}"

run_psql_file() {
  local file_path="$1"

  if [[ -n "$DB_MIGRATION_ROLE" ]]; then
    psql \
      -h "$POSTGRES_HOST" \
      -p "$POSTGRES_PORT" \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DATABASE" \
      -v ON_ERROR_STOP=1 <<SQL
SET ROLE ${DB_MIGRATION_ROLE};
\\i ${file_path}
RESET ROLE;
SQL
  else
    psql \
      -h "$POSTGRES_HOST" \
      -p "$POSTGRES_PORT" \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DATABASE" \
      -v ON_ERROR_STOP=1 \
      -f "$file_path"
  fi
}

migrations=(
  "020-row-level-security-phi.sql"
  "021-fts-triggers.sql"
  "023-hnsw-vector-index.sql"
  "024-ai-agent-runs-official.sql"
  "027-phi-encryption.sql"
  "030-uuid-shadow-migration.sql"
)

for f in "${migrations[@]}"; do
  echo "[INFO] Applying $f" | tee -a "$LOG_FILE"
  run_psql_file "$MIG_DIR/$f" 2>&1 | tee -a "$LOG_FILE"
  echo "[OK] $f" | tee -a "$LOG_FILE"
done

echo "[INFO] Running verification gates" | tee -a "$LOG_FILE"
cd "$ROOT_DIR/server"
POSTGRES_SSL=true npm run test:rls-coverage 2>&1 | tee -a "$LOG_FILE"
POSTGRES_SSL=true npm run test:uuid-shadow-parity 2>&1 | tee -a "$LOG_FILE"

if [[ -n "${ENCRYPTION_KEY:-}" ]]; then
  POSTGRES_SSL=true ENCRYPTION_KEY="$ENCRYPTION_KEY" npm run backfill:phi-encryption -- --dry-run 2>&1 | tee -a "$LOG_FILE"
  POSTGRES_SSL=true ENCRYPTION_KEY="$ENCRYPTION_KEY" npm run backfill:phi-encryption 2>&1 | tee -a "$LOG_FILE"
else
  echo "[WARN] ENCRYPTION_KEY is not set. Skipping PHI encryption backfill execution." | tee -a "$LOG_FILE"
fi

echo "[SUCCESS] Owner-required UAT migration flow completed" | tee -a "$LOG_FILE"
echo "[INFO] Log: $LOG_FILE" | tee -a "$LOG_FILE"
