#!/usr/bin/env bash
# Smoke-check Wasabi credentials (S3-compatible).
#
#   ./scripts/imaging/check-wasabi.sh
# Loads server/.env automatically if WASABI_* are not already exported.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  set -a
  # Only Wasabi keys — do NOT import AWS_REGION (often ap-south-1 / ap-southeast-1),
  # which breaks Wasabi SigV4 signing when the bucket is in us-east-1.
  # shellcheck disable=SC1090
  source <(grep -E '^WASABI_[A-Z0-9_]*=' "$f" | sed 's/\r$//')
  set +a
}

# Prefer already-exported vars; otherwise load from server/.env
if [[ -z "${WASABI_ENDPOINT:-}" || -z "${WASABI_ACCESS_KEY:-}" || -z "${WASABI_SECRET_KEY:-}" ]]; then
  load_env_file "$ROOT/server/.env"
  load_env_file "$ROOT/.env"
fi

: "${WASABI_ENDPOINT:?Set WASABI_ENDPOINT in server/.env e.g. https://s3.wasabisys.com}"
: "${WASABI_ACCESS_KEY:?Set WASABI_ACCESS_KEY in server/.env}"
: "${WASABI_SECRET_KEY:?Set WASABI_SECRET_KEY in server/.env}"
BUCKET="${WASABI_IMAGING_BUCKET:-mediczy-imaging-archive}"
REGION="${WASABI_REGION:-us-east-1}"

echo "[wasabi] endpoint=${WASABI_ENDPOINT}"
echo "[wasabi] region=${REGION}"
echo "[wasabi] bucket=${BUCKET}"
echo "[wasabi] access_key=${WASABI_ACCESS_KEY:0:4}…${WASABI_ACCESS_KEY: -4}"

probe_with_node() {
  # Same client path as the app — ignores ambient AWS_REGION / ~/.aws/config
  WASABI_ENDPOINT="$WASABI_ENDPOINT" \
  WASABI_REGION="$REGION" \
  WASABI_IMAGING_BUCKET="$BUCKET" \
  WASABI_ACCESS_KEY="$WASABI_ACCESS_KEY" \
  WASABI_SECRET_KEY="$WASABI_SECRET_KEY" \
  node --input-type=module <<'EOF'
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const endpoint = process.env.WASABI_ENDPOINT.replace(/\/$/, '');
const region = process.env.WASABI_REGION || 'us-east-1';
const bucket = process.env.WASABI_IMAGING_BUCKET || 'mediczy-imaging-archive';
const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY,
  },
});

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }));
  console.log(`[wasabi] OK — HeadBucket ok, objects≈${listed.KeyCount ?? 0}`);
} catch (err) {
  console.error('[wasabi] FAIL:', err.name || '', err.message);
  process.exit(1);
}
EOF
}

if command -v aws >/dev/null 2>&1; then
  # Isolate from shell AWS_REGION, profiles, and ~/.aws/config (often ap-south-1 /
  # ap-southeast-1 on this host). Custom endpoints sometimes ignore --region and
  # still sign with ambient AWS_REGION — so wipe those vars and config files.
  if env -u AWS_REGION -u AWS_DEFAULT_REGION -u AWS_PROFILE \
     -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
     AWS_ACCESS_KEY_ID="$WASABI_ACCESS_KEY" \
     AWS_SECRET_ACCESS_KEY="$WASABI_SECRET_KEY" \
     AWS_REGION="$REGION" \
     AWS_DEFAULT_REGION="$REGION" \
     AWS_CONFIG_FILE=/dev/null \
     AWS_SHARED_CREDENTIALS_FILE=/dev/null \
     AWS_EC2_METADATA_DISABLED=true \
     aws s3 ls "s3://${BUCKET}" \
       --endpoint-url "$WASABI_ENDPOINT" \
       --region "$REGION"; then
    echo "[wasabi] OK — bucket reachable (aws cli)"
  else
    echo "[wasabi] aws cli list failed — retrying with Node SDK (app path)…" >&2
    if ! probe_with_node; then
      echo "[wasabi] bucket list failed — check region/endpoint match the bucket, or create it in Wasabi console" >&2
      exit 1
    fi
  fi
else
  probe_with_node
fi

echo
echo "[wasabi] App env check (after pm2 restart --update-env):"
echo "  GET /api/imaging/platform/storage/tenant-isolation  →  .archive.wasabi.configured === true"
echo "  strategy: wasabi-only | minio-then-wasabi-fallback | mirror-both"
