#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "Running git hygiene checks in $ROOT_DIR"

fail=0

check_pattern() {
  local label="$1"
  local pattern="$2"
  local found
  found="$(git ls-files "$pattern")"
  if [[ -n "$found" ]]; then
    echo
    echo "[FAIL] $label"
    echo "$found"
    fail=1
  else
    echo "[PASS] $label"
  fi
}

check_pattern "No Python cache artifacts tracked" "*__pycache__*"
check_pattern "No .pyc artifacts tracked" "*.pyc"
check_pattern "No .bak artifacts tracked" "*.bak"
check_pattern "No .new artifacts tracked" "*.new"
check_pattern "No DuckDB runtime artifacts tracked" "*.duckdb"
check_pattern "No DuckDB WAL artifacts tracked" "*.duckdb.wal"

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "Git hygiene check failed."
  exit 1
fi

echo

echo "Git hygiene check passed."
