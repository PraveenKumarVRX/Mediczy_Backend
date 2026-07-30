#!/usr/bin/env bash
# One-shot / cron-friendly: transfer S3 imaging-daily → MinIO.
#
#   ./scripts/imaging/sync-imaging-daily-to-minio.sh
#   ./scripts/imaging/sync-imaging-daily-to-minio.sh --dry-run
#   LOOKBACK_HOURS=72 ./scripts/imaging/sync-imaging-daily-to-minio.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/scripts/ops/load-prod-env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/ops/load-prod-env.sh" || true
elif [[ -f "$ROOT/server/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/server/.env"
  set +a
fi

DRY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
  esac
done

export IMAGING_TRANSFER_LOOKBACK_HOURS="${LOOKBACK_HOURS:-${IMAGING_TRANSFER_LOOKBACK_HOURS:-36}}"

node --input-type=module <<EOF
import { transferImagingDailyToMinio } from './server/services/imaging/imaging-daily-minio-transfer.service.js';

const result = await transferImagingDailyToMinio({
  dryRun: ${DRY} === 1,
  force: ${FORCE} === 1,
  lookbackHours: Number(process.env.IMAGING_TRANSFER_LOOKBACK_HOURS || 36),
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.failed > 0 ? 1 : 0);
EOF
