#!/usr/bin/env bash
# Smoke-check Wasabi credentials (S3-compatible).
#
#   ./scripts/imaging/check-wasabi.sh
# Loads server/.env automatically if WASABI_* are not already exported.
#
# Prefer the Node SDK (same path as mediczy-server). The AWS CLI on this host
# often signs with ambient AWS_REGION (ap-south-1 / ap-southeast-1) even when
# --region us-east-1 is passed for custom endpoints.

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
  # Resolve @aws-sdk/client-s3 from server/node_modules (repo root has none).
  if [[ ! -d "$ROOT/server/node_modules/@aws-sdk/client-s3" ]]; then
    echo "[wasabi] FAIL: @aws-sdk/client-s3 missing under server/node_modules — run: (cd server && npm ci)" >&2
    return 1
  fi
  (
    cd "$ROOT/server"
    WASABI_ENDPOINT="$WASABI_ENDPOINT" \
    WASABI_REGION="$REGION" \
    WASABI_IMAGING_BUCKET="$BUCKET" \
    WASABI_ACCESS_KEY="$WASABI_ACCESS_KEY" \
    WASABI_SECRET_KEY="$WASABI_SECRET_KEY" \
    # Prevent SDK from picking ambient AWS region/creds
    env -u AWS_REGION -u AWS_DEFAULT_REGION -u AWS_PROFILE \
      -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
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
  console.log(`[wasabi] OK — HeadBucket ok, objects≈${listed.KeyCount ?? 0} (node sdk)`);
} catch (err) {
  console.error('[wasabi] FAIL:', err.name || '', err.message);
  process.exit(1);
}
EOF
  )
}

probe_with_aws_cli() {
  command -v aws >/dev/null 2>&1 || return 1
  local tmp
  tmp="$(mktemp -d)"
  # Explicit config beats ambient ~/.aws + broken custom-endpoint region resolution
  cat >"$tmp/config" <<EOF
[default]
region = ${REGION}
output = json
EOF
  cat >"$tmp/credentials" <<EOF
[default]
aws_access_key_id = ${WASABI_ACCESS_KEY}
aws_secret_access_key = ${WASABI_SECRET_KEY}
EOF
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN

  env -u AWS_REGION -u AWS_DEFAULT_REGION -u AWS_PROFILE \
    -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
    AWS_CONFIG_FILE="$tmp/config" \
    AWS_SHARED_CREDENTIALS_FILE="$tmp/credentials" \
    AWS_EC2_METADATA_DISABLED=true \
    AWS_REGION="$REGION" \
    AWS_DEFAULT_REGION="$REGION" \
    aws s3api list-objects-v2 \
      --bucket "$BUCKET" \
      --max-items 5 \
      --endpoint-url "$WASABI_ENDPOINT" \
      --region "$REGION" >/dev/null
}

# App path first — authoritative for mediczy-server
if probe_with_node; then
  :
elif probe_with_aws_cli; then
  echo "[wasabi] OK — bucket reachable (aws cli)"
else
  echo "[wasabi] bucket list failed — check WASABI_* keys, region/endpoint, and bucket name in Wasabi console" >&2
  exit 1
fi

echo
echo "[wasabi] App env (after pm2 restart --update-env) already reports:"
echo "  GET /api/imaging/platform/storage/tenant-isolation → .archive.wasabi.configured === true"
echo "  strategy: wasabi-only | minio-then-wasabi-fallback | mirror-both"
echo
echo "[wasabi] Re-check API (wait a few seconds after pm2 restart so login is not a 502 HTML page):"
echo "  LAB_TOKEN=\$(curl -s -X POST https://app.mediqzy.com/api/lab/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"lab@…\",\"password\":\"…\"}' | jq -r .token)"
echo "  curl -s https://app.mediqzy.com/api/imaging/platform/storage/tenant-isolation \\"
echo "    -H \"Authorization: Bearer \$LAB_TOKEN\" | jq '.archive'"
