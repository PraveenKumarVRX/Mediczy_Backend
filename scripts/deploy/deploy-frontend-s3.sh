#!/bin/bash
# Frontend S3 Deployment Script

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

S3_BUCKET="s3://app.mediqzy.com"
CLOUDFRONT_ID="E1UX9F7HUS472M"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/client/dist}"
if [ ! -d "$BUILD_DIR" ] && [ -d "/home/ubuntu/Mediczy/client/dist" ]; then
  BUILD_DIR="/home/ubuntu/Mediczy/client/dist"
fi

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Frontend Deployment to AWS S3       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Verify build exists
echo -e "${YELLOW}📦 Step 1/4: Verifying build...${NC}"
if [ ! -d "$BUILD_DIR" ] || [ ! -f "$BUILD_DIR/index.html" ]; then
  echo -e "${RED}❌ Build not found. Run 'npm run build' first.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Build verified${NC}"
echo ""

# Step 2: Sync to S3
# Never delete hashed assets during a deploy. Existing browser tabs can hold an
# older index.html for hours and still request its chunks. Removing those files
# creates the exact dynamic-import 404/white-screen failure this deployment is
# intended to prevent. Use scripts/ops/prune-client-assets.mjs as a separate,
# retention-based cleanup after the release window.
echo -e "${YELLOW}☁️  Step 2/4: Uploading to S3...${NC}"
aws s3 sync "$BUILD_DIR" "$S3_BUCKET" \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --exclude "*.mjs" \
  --exclude "serviceWorker.js" \
  --exclude "service-worker.js" \
  --exclude "firebase-messaging-sw.js"

# Upload .mjs files with correct MIME type (S3 defaults to application/octet-stream for .mjs)
aws s3 sync "$BUILD_DIR" "$S3_BUCKET" \
  --cache-control "public,max-age=31536000,immutable" \
  --content-type "application/javascript" \
  --exclude "*" \
  --include "*.mjs"

# Upload HTML and service workers with no-cache
aws s3 sync "$BUILD_DIR" "$S3_BUCKET" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --exclude "*" \
  --include "*.html" \
  --include "serviceWorker.js" \
  --include "*service-worker*.js"

echo -e "${GREEN}✅ Files uploaded to S3${NC}"
echo ""

# Step 2b: Ensure CloudFront rewrites SPA deep links (idempotent)
if [ "${SKIP_CF_SPA_CONFIG:-false}" != true ]; then
  echo -e "${YELLOW}🌐 Step 2b/4: CloudFront SPA routing...${NC}"
  if bash "$SCRIPT_DIR/configure-cloudfront-spa-routing.sh" 2>/dev/null; then
    echo -e "${GREEN}✅ CloudFront SPA routing OK${NC}"
  else
    echo -e "${YELLOW}⚠️  CloudFront SPA config skipped (no AWS permissions or jq missing)${NC}"
    echo -e "${YELLOW}   Run manually: bash scripts/deploy/configure-cloudfront-spa-routing.sh${NC}"
  fi
  echo ""
fi

# Step 3: Try to invalidate CloudFront
echo -e "${YELLOW}🔄 Step 3/4: Attempting CloudFront cache invalidation...${NC}"
if aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_ID" \
    --paths "/index.html" "/" "/*" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ CloudFront cache invalidated${NC}"
  # Keep old hashed chunks available. Browsers that already have the OLD
  # index.html in memory may request those URLs long after this invalidation.
  # The frontend also handles stale shells with a cache-busting reload.
  echo -e "${GREEN}✅ Existing hashed assets retained for stale browser sessions${NC}"
  echo -e "${YELLOW}   Run the retention-based asset prune separately after the release window.${NC}"
else
  echo -e "${YELLOW}⚠️  CloudFront invalidation skipped (no permissions)${NC}"
  echo -e "${YELLOW}   Old assets kept in S3 to avoid white screen during cache TTL${NC}"
  echo -e "${YELLOW}   To fix: invalidate CloudFront distribution ${CLOUDFRONT_ID} manually${NC}"
fi
echo ""

# Step 4: Verification
echo -e "${YELLOW}✓ Step 4/4: Verifying deployment...${NC}"
if aws s3 ls "$S3_BUCKET/index.html" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ S3 index.html present${NC}"
  if bash "$SCRIPT_DIR/verify-spa-routes.sh"; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
  else
    echo -e "${YELLOW}⚠️  S3 upload OK but SPA route check failed — see above${NC}"
    exit 1
  fi
  echo -e "${BLUE}🌐 Frontend URL: https://app.mediqzy.com${NC}"
  echo -e "${BLUE}📦 SCM Dashboard: https://app.mediqzy.com/scm/dashboard${NC}"
else
  echo -e "${RED}❌ Deployment verification failed${NC}"
  exit 1
fi
echo ""

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment Complete! 🚀            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
