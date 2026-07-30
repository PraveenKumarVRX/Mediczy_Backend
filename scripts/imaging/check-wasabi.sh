#!/usr/bin/env bash
# Smoke-check Wasabi credentials (S3-compatible).
#
#   source server/.env
#   ./scripts/imaging/check-wasabi.sh

set -euo pipefail

: "${WASABI_ENDPOINT:?Set WASABI_ENDPOINT e.g. https://s3.ap-southeast-1.wasabisys.com}"
: "${WASABI_ACCESS_KEY:?Set WASABI_ACCESS_KEY}"
: "${WASABI_SECRET_KEY:?Set WASABI_SECRET_KEY}"
BUCKET="${WASABI_IMAGING_BUCKET:-mediczy-imaging-archive}"
REGION="${WASABI_REGION:-us-east-1}"

echo "[wasabi] endpoint=${WASABI_ENDPOINT}"
echo "[wasabi] region=${REGION}"
echo "[wasabi] bucket=${BUCKET}"

# Use AWS CLI with custom endpoint if available
if command -v aws >/dev/null 2>&1; then
  AWS_ACCESS_KEY_ID="$WASABI_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$WASABI_SECRET_KEY" \
  aws s3 ls "s3://${BUCKET}" \
    --endpoint-url "$WASABI_ENDPOINT" \
    --region "$REGION" \
    && echo "[wasabi] OK — bucket reachable" \
    || echo "[wasabi] bucket list failed (create bucket in Wasabi console if missing)"
else
  echo "[wasabi] aws CLI not installed — skipping live probe"
fi

echo
echo "Add to server/.env:"
echo "  WASABI_ENDPOINT=${WASABI_ENDPOINT}"
echo "  WASABI_REGION=${REGION}"
echo "  WASABI_ACCESS_KEY=..."
echo "  WASABI_SECRET_KEY=..."
echo "  WASABI_IMAGING_BUCKET=${BUCKET}"
echo "  # optional dual-write: IMAGING_WASABI_MIRROR=true"
echo "Then: pm2 restart mediczy-server --update-env"
