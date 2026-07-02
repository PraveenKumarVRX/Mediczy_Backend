#!/bin/bash
# Sync prod checkout to origin/main (discards divergent server-only commits) and run billing migrations.
#
# Usage on prod EC2:
#   cd /home/ubuntu/Mediczy && bash scripts/deploy/prod-sync-and-migrate-billing.sh
#
# Preserves uncommitted work via stash before reset.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== [1/3] Syncing to origin/main ==="
RESET_TO_ORIGIN_MAIN=true bash "$SCRIPT_DIR/sync-git-main.sh"
echo "At commit: $(git rev-parse --short HEAD)"

echo ""
echo "=== [2/3] hospital-billing-suite migration ==="
node server/migrations/hospital-billing-suite.migration.js

echo ""
echo "=== [3/3] fee-schedule-versioning migration ==="
node server/migrations/fee-schedule-versioning.migration.js

echo ""
echo "✓ Billing migrations complete ($(git rev-parse --short HEAD))"
