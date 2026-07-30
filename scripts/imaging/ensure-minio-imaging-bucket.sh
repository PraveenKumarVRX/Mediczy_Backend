#!/usr/bin/env bash
# Ensure MinIO archive bucket exists (requires mc alias already configured).
#
#   mc alias set mediczy http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
#   ./scripts/imaging/ensure-minio-imaging-bucket.sh

set -euo pipefail

ALIAS="${MINIO_ALIAS:-mediczy}"
BUCKET="${MINIO_IMAGING_BUCKET:-mediczy-imaging-archive}"

if ! command -v mc >/dev/null 2>&1; then
  echo "ERROR: MinIO client 'mc' not found. Install: https://min.io/docs/minio/linux/reference/minio-mc.html" >&2
  exit 1
fi

if mc ls "${ALIAS}/${BUCKET}" >/dev/null 2>&1; then
  echo "[minio] bucket exists: ${ALIAS}/${BUCKET}"
else
  mc mb "${ALIAS}/${BUCKET}"
  echo "[minio] created: ${ALIAS}/${BUCKET}"
fi

# Private by default — do not set anonymous download for PHI
mc anonymous set none "${ALIAS}/${BUCKET}" || true
echo "[minio] ready: ${ALIAS}/${BUCKET}"
