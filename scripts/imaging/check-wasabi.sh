#!/usr/bin/env bash
# Smoke-check Wasabi credentials (S3-compatible).
#
#   ./scripts/imaging/check-wasabi.sh
#
# Uses server/scripts/probe-wasabi.mjs — same createWasabiClient() as mediczy-server
# (path-style + WASABI_REGION only). Does not use the AWS CLI (on EC2 hosts in
# ap-southeast-1 the CLI often signs with the instance region and fails).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ ! -f "$ROOT/server/scripts/probe-wasabi.mjs" ]]; then
  echo "[wasabi] missing server/scripts/probe-wasabi.mjs" >&2
  exit 1
fi

if [[ ! -d "$ROOT/server/node_modules/@aws-sdk/client-s3" ]]; then
  echo "[wasabi] FAIL: @aws-sdk/client-s3 missing — run: (cd server && npm ci)" >&2
  exit 1
fi

cd "$ROOT/server"
# Clear ambient AWS region/creds in this shell before spawning Node
unset AWS_REGION AWS_DEFAULT_REGION AWS_PROFILE \
      AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN || true
export AWS_EC2_METADATA_DISABLED=true

node ./scripts/probe-wasabi.mjs

echo
echo "[wasabi] Live API probe (after pm2 restart --update-env):"
echo "  curl …/storage/tenant-isolation?live=1  →  .archive.wasabiLive.ok === true"
