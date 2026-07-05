#!/bin/bash
# Print shell export statements for smoke-test JWTs (stdout only — safe for eval).
#
# Usage on prod EC2:
#   cd ~/Mediczy
#   eval "$(bash scripts/testing/export-smoke-tokens.sh)"
#   echo "DOC_TOKEN length: ${#DOC_TOKEN}"
#
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/smoke-test-prod.sh" --export-tokens
