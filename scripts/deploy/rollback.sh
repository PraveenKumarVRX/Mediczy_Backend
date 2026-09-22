#!/bin/bash
# Roll production back to the last commit that was live and healthy (WP-0.6).
#
# deploy-full-prod-s3.sh writes .deploy/last-good-sha (the commit that WAS live, before this run) and
# .deploy/current-live-sha (the commit that IS live, once its own health check passes) on every run.
# This script exists for the one case the deploy script's own automatic revert can't cover: a check that
# only runs AFTER the script has already exited 0 — e.g. the GitHub Actions workflow's public-endpoint
# check, which this box's own localhost health check can't see (CloudFront/ALB/DNS issues, mainly).
#
# Usage:
#   On prod EC2:
#     bash scripts/deploy/rollback.sh                # rolls back to .deploy/last-good-sha
#     bash scripts/deploy/rollback.sh <git-sha>       # rolls back to an explicit commit
#
#   From a machine with SSH key (~/.ssh/mediczy.pem):
#     bash scripts/deploy/rollback.sh --remote [<git-sha>]
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

PROD_SERVER="${PROD_SERVER:-ubuntu@13.127.125.93}"
PROD_PATH="${PROD_PATH:-/home/ubuntu/Mediczy}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/mediczy.pem}"
S3_BUCKET="${S3_BUCKET:-s3://app.mediqzy.com}"
CLOUDFRONT_ID="${CLOUDFRONT_ID:-E1UX9F7HUS472M}"

REMOTE_MODE=false
TARGET_SHA=""
for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE_MODE=true ;;
    *) TARGET_SHA="$arg" ;;
  esac
done

rollback_body() {
  set -euo pipefail
  cd "$PROD_PATH"
  local target="${1:-}"
  if [ -z "$target" ]; then
    [ -f .deploy/last-good-sha ] || { echo -e "${RED}❌ No target SHA given and .deploy/last-good-sha does not exist${NC}"; exit 1; }
    target="$(cat .deploy/last-good-sha)"
  fi
  echo -e "${BLUE}Rolling back to $target...${NC}"
  git reset --hard "$target"
  (cd server && npm ci --omit=dev --prefer-offline)
  pm2 restart mediczy-server --update-env
  pm2 save --force 2>/dev/null || true
  if [ -f client/dist/index.html ] && command -v aws >/dev/null 2>&1; then
    aws s3 cp client/dist/index.html "$S3_BUCKET/index.html" --cache-control "no-cache,no-store,must-revalidate" || true
    aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/index.html" "/" >/dev/null 2>&1 || true
  fi
  sleep 4
  if curl -sf http://localhost:8888/api/health >/dev/null 2>&1 || curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Rolled back to $(git rev-parse --short HEAD) and healthy${NC}"
  else
    echo -e "${RED}⚠ Rolled back to $(git rev-parse --short HEAD) but the health check still fails — this needs a human now${NC}"
    exit 1
  fi
  echo -e "${RED}Note: database migrations, if any ran since $target, were NOT rolled back — check by hand.${NC}"
}

if [ "$REMOTE_MODE" = true ]; then
  ssh_args=(-o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=no)
  [ -f "$SSH_KEY" ] && ssh_args+=(-i "$SSH_KEY")
  ssh "${ssh_args[@]}" "$PROD_SERVER" "PROD_PATH='$PROD_PATH' TARGET_SHA='$TARGET_SHA' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
PROD_PATH="${PROD_PATH:-/home/ubuntu/Mediczy}"
cd "$PROD_PATH"
target="${TARGET_SHA:-}"
if [ -z "$target" ]; then
  [ -f .deploy/last-good-sha ] || { echo "❌ No target SHA given and .deploy/last-good-sha does not exist"; exit 1; }
  target="$(cat .deploy/last-good-sha)"
fi
echo "Rolling back to $target..."
git reset --hard "$target"
(cd server && npm ci --omit=dev --prefer-offline)
pm2 restart mediczy-server --update-env
pm2 save --force 2>/dev/null || true
if [ -f client/dist/index.html ] && command -v aws >/dev/null 2>&1; then
  aws s3 cp client/dist/index.html "${S3_BUCKET:-s3://app.mediqzy.com}/index.html" --cache-control "no-cache,no-store,must-revalidate" || true
  aws cloudfront create-invalidation --distribution-id "${CLOUDFRONT_ID:-E1UX9F7HUS472M}" --paths "/index.html" "/" >/dev/null 2>&1 || true
fi
sleep 4
curl -sf http://localhost:8888/api/health >/dev/null 2>&1 || curl -sf http://localhost:8000/api/health >/dev/null 2>&1 || { echo "⚠ Rolled back but health check still fails"; exit 1; }
echo "✓ Rolled back to $(git rev-parse --short HEAD) and healthy"
REMOTE_SCRIPT
else
  rollback_body "$TARGET_SHA"
fi
