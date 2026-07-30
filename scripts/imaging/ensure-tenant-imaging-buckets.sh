#!/usr/bin/env bash
# Ensure S3/MinIO imaging buckets for one or more tenants.
#
#   TENANT_IDS=12,56 ./scripts/imaging/ensure-tenant-imaging-buckets.sh
#   IMAGING_TENANT_ISOLATION=minio-bucket TENANT_IDS=56 ./scripts/imaging/ensure-tenant-imaging-buckets.sh
#
# Modes:
#   prefix       — only ensures shared daily + shared archive (no per-tenant buckets)
#   minio-bucket — ensures MinIO mediczy-imaging-t{id}
#   s3-bucket    — ensures S3 mediczy-imaging-daily-t{id} + MinIO mediczy-imaging-t{id}

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

IDS="${TENANT_IDS:-${1:-}}"
if [[ -z "$IDS" ]]; then
  echo "Usage: TENANT_IDS=12,56 $0" >&2
  echo "   or: $0 12,56" >&2
  exit 1
fi

export IMAGING_TENANT_ISOLATION="${IMAGING_TENANT_ISOLATION:-prefix}"

node --input-type=module <<EOF
import { ensureTenantImagingStorage, describeTenantIsolation } from './server/services/imaging/imaging-tenant-storage.service.js';

const ids = String(process.env.TENANT_IDS || '${IDS}').split(',').map(s => s.trim()).filter(Boolean);
console.log(JSON.stringify(describeTenantIsolation(), null, 2));
for (const id of ids) {
  const result = await ensureTenantImagingStorage(id);
  console.log(JSON.stringify({ tenantId: id, ...result }, null, 2));
}
EOF
