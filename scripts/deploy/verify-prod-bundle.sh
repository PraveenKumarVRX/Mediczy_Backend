#!/bin/bash
# Verify production frontend bundle is not stale (post-deploy check).
set -euo pipefail

PROD_URL="${PROD_URL:-https://app.mediqzy.com}"
STALE_HASH="${STALE_HASH:-h5kXIWw0}"
MIN_COMMIT="${MIN_COMMIT:-c0bd4174}"

echo "Checking production bundle at $PROD_URL ..."

INDEX_HTML="$(curl -fsSL "$PROD_URL/index.html")"
INDEX_JS="$(echo "$INDEX_HTML" | rg -o 'assets/index-[^"]+\.js' | head -1 || true)"
TEAM_JS="$(curl -fsSL "$PROD_URL/$INDEX_JS" 2>/dev/null | rg -o 'TeamCorporateManagement-[^"]+\.js' | head -1 || true)"

echo "  index: $INDEX_JS"
echo "  team:  ${TEAM_JS:-not found in index chunk}"

if echo "$TEAM_JS" | grep -q "$STALE_HASH"; then
  echo ""
  echo "❌ STALE BUNDLE STILL LIVE: TeamCorporateManagement-$STALE_HASH"
  echo "   Fix is on main ($MIN_COMMIT+) but S3/CloudFront was not updated."
  echo "   Run: bash scripts/deploy/deploy-full-prod-s3.sh --remote"
  echo "   Or: GitHub → Actions → Production Deployment → Run workflow"
  exit 1
fi

if [ -z "$TEAM_JS" ]; then
  echo "⚠️  Could not detect TeamCorporateManagement chunk (lazy-loaded). Check Network tab manually."
  exit 0
fi

echo ""
echo "✅ Production bundle updated ($TEAM_JS)"
