#!/usr/bin/env bash

# Canonical Sanity + Smoke runner
# Produces a machine-readable one-line summary for CI consumers.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_FILE="/tmp/canonical-sanity-smoke.log"

: > "$LOG_FILE"

step_failures=0

run_step() {
  local name="$1"
  shift

  echo "=== RUN: ${name} ===" | tee -a "$LOG_FILE"
  "$@" 2>&1 | tee -a "$LOG_FILE"
  local rc=${PIPESTATUS[0]}
  echo "=== EXIT: ${name} rc=${rc} ===" | tee -a "$LOG_FILE"
  if [[ $rc -ne 0 ]]; then
    step_failures=$((step_failures + 1))
  fi
}

cd "$ROOT_DIR" || exit 1

run_step "sanity-and-smoke-test.js" node sanity-and-smoke-test.js
run_step "run-sanity-check.js" node run-sanity-check.js
run_step "run-smoke-test.js" node run-smoke-test.js
run_step "SANITY_CHECK_AND_SMOKE_TEST.js" node SANITY_CHECK_AND_SMOKE_TEST.js

critical_failed="0"
critical_line=$(grep -aE "Total Failed:[[:space:]]*[0-9]+/" "$LOG_FILE" | tail -n1 || true)
if [[ -n "$critical_line" ]]; then
  parsed=$(printf '%s' "$critical_line" | grep -aEo "[0-9]+/[0-9]+" | head -n1 || true)
  if [[ -n "$parsed" ]]; then
    critical_failed="${parsed%%/*}"
  fi
fi

warnings="0"
warnings_line=$(grep -aE "Warnings:[[:space:]]+[0-9]+" "$LOG_FILE" | tail -n1 || true)
if [[ -n "$warnings_line" ]]; then
  parsed=$(printf '%s' "$warnings_line" | grep -aEo "[0-9]+" | head -n1 || true)
  if [[ -n "$parsed" ]]; then
    warnings="$parsed"
  fi
fi

overall_exit=0
decision="GO"
if [[ $step_failures -gt 0 || $critical_failed -gt 0 ]]; then
  overall_exit=1
  decision="NO_GO"
fi

echo "CI_SUMMARY decision=${decision} overall_exit=${overall_exit} step_failures=${step_failures} critical_failed=${critical_failed} warnings=${warnings} log=${LOG_FILE}" | tee -a "$LOG_FILE"

exit $overall_exit
