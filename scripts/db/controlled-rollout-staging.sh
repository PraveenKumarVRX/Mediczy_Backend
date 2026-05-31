#!/usr/bin/env bash
set -euo pipefail

# Controlled rollout runner for expand-contract migrations.
# Staging-only by default. Refuses production-like targets unless explicitly bypassed.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG_DIR="${MIG_DIR:-$ROOT_DIR/server/db/migrations}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"

TARGET_DB="${TARGET_DB:-mediczy_ai_migration_staging}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-mediczy_helper}"
ROLLOUT_ENV="${ROLLOUT_ENV:-staging}"
ALLOW_PROD_BYPASS="${ALLOW_PROD_BYPASS:-false}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_LOG="$LOG_DIR/controlled-rollout-$TIMESTAMP.log"

MIGRATIONS=(
  "020-row-level-security-phi.sql"
  "021-fts-triggers.sql"
  "022-table-partitioning.sql"
  "023-hnsw-vector-index.sql"
  "024-ai-agent-runs-official.sql"
  "025-normalise-array-fields.sql"
  "026-anonymous-patients-consent.sql"
  "030-uuid-shadow-migration.sql"
)

mkdir -p "$LOG_DIR"

echo "[INFO] Controlled rollout start: $TIMESTAMP" | tee -a "$RUN_LOG"
echo "[INFO] Target: db=$TARGET_DB host=$PGHOST port=$PGPORT user=$PGUSER env=$ROLLOUT_ENV" | tee -a "$RUN_LOG"

if [[ "$ROLLOUT_ENV" != "staging" ]]; then
  echo "[ERROR] ROLLOUT_ENV must be 'staging'. Current: $ROLLOUT_ENV" | tee -a "$RUN_LOG"
  exit 1
fi

if [[ "$ALLOW_PROD_BYPASS" != "true" ]]; then
  if [[ "$TARGET_DB" == "mediczy_ai" || "$PGHOST" == *"mediczy-uat"* || "$PGHOST" == *"rds.amazonaws.com"* ]]; then
    echo "[ERROR] Refusing to run on production-like target. Set ALLOW_PROD_BYPASS=true only with explicit change approval." | tee -a "$RUN_LOG"
    exit 1
  fi
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[ERROR] psql is required" | tee -a "$RUN_LOG"
  exit 1
fi

for file in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$MIG_DIR/$file" ]]; then
    echo "[ERROR] Migration file missing: $MIG_DIR/$file" | tee -a "$RUN_LOG"
    exit 1
  fi
done

# Optional backup guardrails
if [[ -n "${BACKUP_ARTIFACT_PATH:-}" && ! -f "${BACKUP_ARTIFACT_PATH}" ]]; then
  echo "[ERROR] BACKUP_ARTIFACT_PATH not found: ${BACKUP_ARTIFACT_PATH}" | tee -a "$RUN_LOG"
  exit 1
fi
if [[ -n "${BACKUP_CHECKSUM_PATH:-}" && ! -f "${BACKUP_CHECKSUM_PATH}" ]]; then
  echo "[ERROR] BACKUP_CHECKSUM_PATH not found: ${BACKUP_CHECKSUM_PATH}" | tee -a "$RUN_LOG"
  exit 1
fi

if [[ -n "${BACKUP_ARTIFACT_PATH:-}" ]]; then
  echo "[INFO] Backup artifact present: ${BACKUP_ARTIFACT_PATH}" | tee -a "$RUN_LOG"
fi
if [[ -n "${BACKUP_CHECKSUM_PATH:-}" ]]; then
  echo "[INFO] Verifying backup checksum..." | tee -a "$RUN_LOG"
  sha256sum -c "$BACKUP_CHECKSUM_PATH" | tee -a "$RUN_LOG"
fi

# Connectivity check
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c "select current_database(), current_user;" | tee -a "$RUN_LOG"

for file in "${MIGRATIONS[@]}"; do
  echo "[INFO] Applying $file" | tee -a "$RUN_LOG"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -f "$MIG_DIR/$file" 2>&1 | tee -a "$RUN_LOG"
  echo "[OK] Applied $file" | tee -a "$RUN_LOG"
done

echo "[SUCCESS] Controlled rollout migrations completed in staging order." | tee -a "$RUN_LOG"
echo "[INFO] Log: $RUN_LOG" | tee -a "$RUN_LOG"
