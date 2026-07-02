#!/bin/bash
# Ensure CloudFront serves index.html for SPA deep links (e.g. /scm/dashboard).
#
# S3 static origins return 404 for paths that are not real objects. React Router
# needs the CDN to rewrite 403/404 → /index.html (HTTP 200) on the default
# frontend behavior only — never on /api/* behaviors.
#
# Usage:
#   CLOUDFRONT_ID=E1UX9F7HUS472M bash scripts/deploy/configure-cloudfront-spa-routing.sh
#   DRY_RUN=true bash scripts/deploy/configure-cloudfront-spa-routing.sh

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

CLOUDFRONT_ID="${CLOUDFRONT_ID:-E1UX9F7HUS472M}"
DRY_RUN="${DRY_RUN:-false}"

if ! command -v aws >/dev/null 2>&1; then
  echo -e "${RED}❌ aws CLI required${NC}"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo -e "${RED}❌ jq required${NC}"
  exit 1
fi

echo -e "${BLUE}Configuring SPA fallback on CloudFront distribution ${CLOUDFRONT_ID}...${NC}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

aws cloudfront get-distribution-config --id "$CLOUDFRONT_ID" > "$TMP_DIR/cf.json"
ETAG="$(jq -r '.ETag' "$TMP_DIR/cf.json")"
CONFIG="$(jq '.DistributionConfig' "$TMP_DIR/cf.json")"

patch_errors() {
  local cfg="$1"
  local errors
  errors="$(echo "$cfg" | jq '.CustomErrorResponses.Items // []')"
  for code in 403 404; do
    errors="$(echo "$errors" | jq --argjson code "$code" '
      (map(select(.ErrorCode != $code))) + [{
        ErrorCode: $code,
        ResponsePagePath: "/index.html",
        ResponseCode: "200",
        ErrorCachingMinTTL: 0
      }]
    ')"
  done
  echo "$cfg" | jq --argjson errors "$errors" '
    .CustomErrorResponses = {
      Quantity: ($errors | length),
      Items: $errors
    }
  '
}

UPDATED="$(patch_errors "$CONFIG")"

if diff <(echo "$CONFIG" | jq '.CustomErrorResponses') <(echo "$UPDATED" | jq '.CustomErrorResponses') >/dev/null 2>&1; then
  echo -e "${GREEN}✅ SPA custom error responses already configured (403/404 → /index.html)${NC}"
  exit 0
fi

echo -e "${YELLOW}Current custom errors:${NC}"
echo "$CONFIG" | jq '.CustomErrorResponses'
echo -e "${YELLOW}Proposed custom errors:${NC}"
echo "$UPDATED" | jq '.CustomErrorResponses'

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY_RUN=true — no changes applied${NC}"
  exit 0
fi

echo "$UPDATED" > "$TMP_DIR/updated-config.json"
aws cloudfront update-distribution \
  --id "$CLOUDFRONT_ID" \
  --if-match "$ETAG" \
  --distribution-config "file://$TMP_DIR/updated-config.json" \
  > /dev/null

echo -e "${GREEN}✅ CloudFront SPA routing updated. Propagation may take 5–15 minutes.${NC}"
echo -e "${BLUE}Verify: curl -sI https://app.mediqzy.com/scm/dashboard | head -1${NC}"
