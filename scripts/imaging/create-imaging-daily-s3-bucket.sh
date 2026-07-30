#!/usr/bin/env bash
# Create the dedicated S3 bucket for daily clinical imaging (hot store).
# Objects land here from HyperGrid STOW / RIS / doctor imaging, then a nightly
# job copies them to MinIO (mediczy-imaging-archive).
#
# Usage:
#   AWS_REGION=ap-south-1 ./scripts/imaging/create-imaging-daily-s3-bucket.sh
#   S3_IMAGING_DAILY_BUCKET=mediczy-imaging-daily ./scripts/imaging/create-imaging-daily-s3-bucket.sh
#
# Requires: aws CLI credentials with s3:CreateBucket + s3:PutBucket* permission.

set -euo pipefail

BUCKET="${S3_IMAGING_DAILY_BUCKET:-mediczy-imaging-daily}"
REGION="${AWS_REGION:-ap-south-1}"

echo "[imaging-s3] Creating bucket s3://${BUCKET} in ${REGION}"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "[imaging-s3] Bucket already exists: ${BUCKET}"
else
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=${REGION}"
  fi
  echo "[imaging-s3] Created ${BUCKET}"
fi

# Block all public access — PHI
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Default encryption AES-256
aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": { "SSEAlgorithm": "AES256" },
      "BucketKeyEnabled": true
    }]
  }'

# Abort incomplete multipart uploads after 7 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "abort-incomplete-multipart",
        "Status": "Enabled",
        "Filter": { "Prefix": "" },
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
      },
      {
        "ID": "expire-after-transfer-window",
        "Status": "Disabled",
        "Filter": { "Prefix": "" },
        "Expiration": { "Days": 14 },
        "NoncurrentVersionExpiration": { "NoncurrentDays": 7 }
      }
    ]
  }'

# Optional versioning (enable for extra safety)
if [[ "${ENABLE_VERSIONING:-0}" == "1" ]]; then
  aws s3api put-bucket-versioning \
    --bucket "$BUCKET" \
    --versioning-configuration Status=Enabled
  echo "[imaging-s3] Versioning enabled"
fi

# Tag for cost allocation
aws s3api put-bucket-tagging \
  --bucket "$BUCKET" \
  --tagging 'TagSet=[{Key=project,Value=mediczy},{Key=purpose,Value=imaging-daily},{Key=phi,Value=true}]' \
  || echo "[imaging-s3] tagging skipped (optional)"

echo
echo "[imaging-s3] DONE"
echo "  Bucket:  s3://${BUCKET}"
echo "  Region:  ${REGION}"
echo "  Public:  blocked"
echo "  SSE:     AES256"
echo
echo "Add to server/.env:"
echo "  S3_IMAGING_DAILY_BUCKET=${BUCKET}"
echo "  AWS_REGION=${REGION}"
echo "  MINIO_ENDPOINT=http://127.0.0.1:9000"
echo "  MINIO_ACCESS_KEY=..."
echo "  MINIO_SECRET_KEY=..."
echo "  MINIO_IMAGING_BUCKET=mediczy-imaging-archive"
echo
echo "Then: pm2 restart mediczy-server"
echo "Create MinIO dest bucket: mc mb minio/mediczy-imaging-archive"
