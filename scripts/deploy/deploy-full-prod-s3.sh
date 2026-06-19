#!/bin/bash
# Full production deployment: git pull → backend deps → client build → S3 → PM2 restart
#
# Usage:
#   On prod EC2:
#     cd /home/ubuntu/Mediczy && bash scripts/deploy/deploy-full-prod-s3.sh
#
#   From a machine with SSH key (~/.ssh/mediczy.pem):
#     bash scripts/deploy/deploy-full-prod-s3.sh --remote
#
#   Backend-only (skip S3):
#     SKIP_S3=true bash scripts/deploy/deploy-full-prod-s3.sh
#
#   Discard local server commits and match GitHub main exactly:
#     RESET_TO_ORIGIN_MAIN=true bash scripts/deploy/deploy-full-prod-s3.sh

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROD_SERVER="${PROD_SERVER:-ubuntu@13.127.125.93}"
PROD_PATH="${PROD_PATH:-/home/ubuntu/Mediczy}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/mediczy.pem}"
REMOTE_MODE=false
SKIP_S3="${SKIP_S3:-false}"
RESET_TO_ORIGIN_MAIN="${RESET_TO_ORIGIN_MAIN:-false}"

for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE_MODE=true ;;
    --skip-s3) SKIP_S3=true ;;
    --reset-to-origin) RESET_TO_ORIGIN_MAIN=true ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ssh_exec() {
  local ssh_args=(-o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=no)
  if [ -f "$SSH_KEY" ]; then
    ssh_args+=(-i "$SSH_KEY")
  fi
  ssh "${ssh_args[@]}" "$PROD_SERVER" "$@"
}

deploy_body() {
  set -euo pipefail
  cd "$PROD_PATH"

  echo -e "${BLUE}[1/7] Syncing to origin/main...${NC}"
  bash "$SCRIPT_DIR/sync-git-main.sh"
  HEAD_SHA="$(git rev-parse --short HEAD)"
  echo -e "${GREEN}✓ Code updated ($HEAD_SHA)${NC}"
  if ! git merge-base --is-ancestor c0bd4174 HEAD 2>/dev/null; then
    echo -e "${RED}❌ Welcome-campaign fix (c0bd4174) not in checked-out commit.${NC}"
    echo -e "${RED}   Refusing deploy — pull main or merge the fix first.${NC}"
    exit 1
  fi

  echo -e "${BLUE}[2/7] Installing server dependencies...${NC}"
  (cd server && npm ci --omit=dev --prefer-offline)
  echo -e "${GREEN}✓ Server dependencies installed${NC}"

  echo -e "${BLUE}[3/7] Building client...${NC}"
  (
    cd client
    export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
    npm ci --prefer-offline
    npm run build
  )
  TEAM_BUNDLE="$(ls client/dist/assets/TeamCorporateManagement-*.js 2>/dev/null | xargs -n1 basename | head -1 || true)"
  INDEX_BUNDLE="$(ls client/dist/assets/index-*.js 2>/dev/null | grep -v 'index.es' | xargs -n1 basename | head -1 || true)"
  echo -e "${GREEN}✓ Client build complete${NC}"
  echo -e "${GREEN}  index bundle: ${INDEX_BUNDLE:-unknown}${NC}"
  echo -e "${GREEN}  team bundle:  ${TEAM_BUNDLE:-unknown}${NC}"
  if [ "$TEAM_BUNDLE" = "TeamCorporateManagement-h5kXIWw0.js" ]; then
    echo -e "${RED}❌ Build still produced stale TeamCorporateManagement hash — aborting S3 upload${NC}"
    exit 1
  fi

  if [ "$SKIP_S3" != true ]; then
    echo -e "${BLUE}[4/7] Deploying frontend to S3 + CloudFront...${NC}"
    if ! command -v aws >/dev/null 2>&1; then
      echo -e "${RED}❌ aws CLI not found — install AWS CLI or set SKIP_S3=true${NC}"
      exit 1
    fi
    bash scripts/deploy/deploy-frontend-s3.sh
    echo -e "${GREEN}✓ S3 deployment complete${NC}"
  else
    echo -e "${YELLOW}[4/7] Skipping S3 (SKIP_S3=true)${NC}"
  fi

  echo -e "${BLUE}[5/7] Restarting backend (PM2)...${NC}"
  pm2 restart mediczy-server --update-env
  pm2 save --force 2>/dev/null || true
  echo -e "${GREEN}✓ Backend restarted${NC}"

  echo -e "${BLUE}[6/7] Health check...${NC}"
  sleep 4
  curl -sf http://localhost:8888/api/health || curl -sf http://localhost:8000/api/health || true
  echo ""

  if [ "$SKIP_S3" != true ] && [ -f "$SCRIPT_DIR/verify-prod-bundle.sh" ]; then
    echo -e "${BLUE}[7/7] Verifying live S3 bundle...${NC}"
    sleep 15
    bash "$SCRIPT_DIR/verify-prod-bundle.sh" || true
  fi
}

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Mediczy Full Prod + S3 Deployment    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

if [ "$REMOTE_MODE" = true ]; then
  echo "Mode: remote → $PROD_SERVER"
  echo "Path: $PROD_PATH"
  echo ""
  ssh_exec "SKIP_S3='$SKIP_S3' RESET_TO_ORIGIN_MAIN='$RESET_TO_ORIGIN_MAIN' PROD_PATH='$PROD_PATH' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
PROD_PATH="${PROD_PATH:-/home/ubuntu/Mediczy}"
SKIP_S3="${SKIP_S3:-false}"
RESET_TO_ORIGIN_MAIN="${RESET_TO_ORIGIN_MAIN:-false}"
cd "$PROD_PATH"

echo "[1/7] Syncing to origin/main..."
RESET_TO_ORIGIN_MAIN="$RESET_TO_ORIGIN_MAIN" bash scripts/deploy/sync-git-main.sh
HEAD_SHA="$(git rev-parse --short HEAD)"
echo "✓ Code updated ($HEAD_SHA)"
git merge-base --is-ancestor c0bd4174 HEAD || { echo "❌ Welcome-campaign fix (c0bd4174) not in HEAD"; exit 1; }

echo "[2/7] Installing server dependencies..."
(cd server && npm ci --omit=dev --prefer-offline)
echo "✓ Server dependencies installed"

echo "[3/7] Building client..."
(
  cd client
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
  npm ci --prefer-offline
  npm run build
)
TEAM_BUNDLE="$(ls client/dist/assets/TeamCorporateManagement-*.js 2>/dev/null | xargs -n1 basename | head -1 || true)"
INDEX_BUNDLE="$(ls client/dist/assets/index-*.js 2>/dev/null | grep -v 'index.es' | xargs -n1 basename | head -1 || true)"
echo "✓ Client build complete"
echo "  index bundle: ${INDEX_BUNDLE:-unknown}"
echo "  team bundle:  ${TEAM_BUNDLE:-unknown}"
[ "$TEAM_BUNDLE" != "TeamCorporateManagement-h5kXIWw0.js" ] || { echo "❌ Stale bundle hash"; exit 1; }

if [ "$SKIP_S3" != true ]; then
  echo "[4/7] Deploying frontend to S3 + CloudFront..."
  command -v aws >/dev/null || { echo "❌ aws CLI not found"; exit 1; }
  bash scripts/deploy/deploy-frontend-s3.sh
  echo "✓ S3 deployment complete"
else
  echo "[4/7] Skipping S3"
fi

echo "[5/7] Restarting backend..."
pm2 restart mediczy-server --update-env
pm2 save --force 2>/dev/null || true
echo "✓ Backend restarted"

echo "[6/7] Health check..."
sleep 4
curl -sf http://localhost:8888/api/health || curl -sf http://localhost:8000/api/health || true
echo ""
if [ "$SKIP_S3" != true ] && [ -f scripts/deploy/verify-prod-bundle.sh ]; then
  echo "[7/7] Verifying live S3 bundle..."
  sleep 15
  bash scripts/deploy/verify-prod-bundle.sh || true
fi
REMOTE_SCRIPT
else
  if [ ! -d "$PROD_PATH" ] && [ -d "$REPO_ROOT/.git" ]; then
    PROD_PATH="$REPO_ROOT"
  fi
  if [ ! -d "$PROD_PATH/.git" ]; then
    echo -e "${RED}❌ Not on production server and --remote not set.${NC}"
    echo "Run: bash scripts/deploy/deploy-full-prod-s3.sh --remote"
    exit 1
  fi
  echo "Mode: local → $PROD_PATH"
  echo ""
  PROD_PATH="$PROD_PATH" deploy_body
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment Complete! 🚀            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo -e "${BLUE}🌐 https://app.mediqzy.com${NC}"
