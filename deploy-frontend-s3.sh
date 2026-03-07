#!/bin/bash
# Frontend S3 Deployment Script

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

S3_BUCKET="s3://app.mediqzy.com"
CLOUDFRONT_ID="E2HLJC0N634ZOM"
BUILD_DIR="/home/ubuntu/Mediczy/client/dist"

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
# NOTE: Do NOT use --delete — CloudFront may still cache old index.html referencing
# old asset hashes. Removing old assets causes white screen until cache expires.
# Old assets are cleaned up by a separate cleanup step after cache invalidation confirms.
echo -e "${YELLOW}☁️  Step 2/4: Uploading to S3...${NC}"
aws s3 sync "$BUILD_DIR" "$S3_BUCKET" \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html" \
  --exclude "serviceWorker.js" \
  --exclude "service-worker.js" \
  --exclude "firebase-messaging-sw.js"

# Upload HTML and service workers with no-cache
aws s3 sync "$BUILD_DIR" "$S3_BUCKET" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --exclude "*" \
  --include "*.html" \
  --include "serviceWorker.js" \
  --include "*service-worker*.js"

echo -e "${GREEN}✅ Files uploaded to S3${NC}"
echo ""

# Step 3: Try to invalidate CloudFront
echo -e "${YELLOW}🔄 Step 3/4: Attempting CloudFront cache invalidation...${NC}"
if aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_ID" \
    --paths "/index.html" "/" "/*" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ CloudFront cache invalidated${NC}"
  # Safe to clean up old assets now that cache is invalidated
  echo -e "${YELLOW}🧹 Cleaning up old S3 assets (post-invalidation)...${NC}"
  aws s3 sync "$BUILD_DIR" "$S3_BUCKET" --delete --cache-control "public,max-age=31536000,immutable" --exclude "*.html" --exclude "serviceWorker.js" --exclude "service-worker.js" > /dev/null 2>&1
  echo -e "${GREEN}✅ Old assets cleaned up${NC}"
else
  echo -e "${YELLOW}⚠️  CloudFront invalidation skipped (no permissions)${NC}"
  echo -e "${YELLOW}   Old assets kept in S3 to avoid white screen during cache TTL${NC}"
  echo -e "${YELLOW}   To fix: invalidate CloudFront distribution ${CLOUDFRONT_ID} manually${NC}"
fi
echo ""

# Step 4: Verification
echo -e "${YELLOW}✓ Step 4/4: Verifying deployment...${NC}"
if aws s3 ls "$S3_BUCKET/index.html" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Deployment successful!${NC}"
  echo -e "${BLUE}🌐 Frontend URL: https://app.mediqzy.com${NC}"
  echo -e "${BLUE}📝 Team Settings: https://app.mediqzy.com/team/settings${NC}"
  echo -e "${BLUE}🤖 AI Doctor: https://app.mediqzy.com/ai-doctor${NC}"
else
  echo -e "${RED}❌ Deployment verification failed${NC}"
  exit 1
fi
echo ""

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment Complete! 🚀            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
