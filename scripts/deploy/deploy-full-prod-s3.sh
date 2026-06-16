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

for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE_MODE=true ;;
    --skip-s3) SKIP_S3=true ;;
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

  echo -e "${BLUE}[1/6] Pulling latest main...${NC}"
  git fetch origin main
  git pull origin main
  echo -e "${GREEN}✓ Code updated ($(git rev-parse --short HEAD))${NC}"

  echo -e "${BLUE}[2/6] Installing server dependencies...${NC}"
  (cd server && npm ci --omit=dev --prefer-offline)
  echo -e "${GREEN}✓ Server dependencies installed${NC}"

  echo -e "${BLUE}[3/6] Building client...${NC}"
  (
    cd client
    export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
    npm ci --prefer-offline
    npm run build
  )
  echo -e "${GREEN}✓ Client build complete${NC}"

  if [ "$SKIP_S3" != true ]; then
    echo -e "${BLUE}[4/6] Deploying frontend to S3 + CloudFront...${NC}"
    if ! command -v aws >/dev/null 2>&1; then
      echo -e "${RED}❌ aws CLI not found — install AWS CLI or set SKIP_S3=true${NC}"
      exit 1
    fi
    bash scripts/deploy/deploy-frontend-s3.sh
    echo -e "${GREEN}✓ S3 deployment complete${NC}"
  else
    echo -e "${YELLOW}[4/6] Skipping S3 (SKIP_S3=true)${NC}"
  fi

  echo -e "${BLUE}[5/6] Restarting backend (PM2)...${NC}"
  pm2 restart mediczy-server --update-env
  pm2 save --force 2>/dev/null || true
  echo -e "${GREEN}✓ Backend restarted${NC}"

  echo -e "${BLUE}[6/6] Health check...${NC}"
  sleep 4
  curl -sf http://localhost:8888/api/health || curl -sf http://localhost:8000/api/health || true
  echo ""
}

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Mediczy Full Prod + S3 Deployment    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

if [ "$REMOTE_MODE" = true ]; then
  echo "Mode: remote → $PROD_SERVER"
  echo "Path: $PROD_PATH"
  echo ""
  ssh_exec "SKIP_S3='$SKIP_S3' PROD_PATH='$PROD_PATH' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
PROD_PATH="${PROD_PATH:-/home/ubuntu/Mediczy}"
SKIP_S3="${SKIP_S3:-false}"
cd "$PROD_PATH"

echo "[1/6] Pulling latest main..."
git fetch origin main
git pull origin main
echo "✓ Code updated ($(git rev-parse --short HEAD))"

echo "[2/6] Installing server dependencies..."
(cd server && npm ci --omit=dev --prefer-offline)
echo "✓ Server dependencies installed"

echo "[3/6] Building client..."
(
  cd client
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
  npm ci --prefer-offline
  npm run build
)
echo "✓ Client build complete"

if [ "$SKIP_S3" != true ]; then
  echo "[4/6] Deploying frontend to S3 + CloudFront..."
  command -v aws >/dev/null || { echo "❌ aws CLI not found"; exit 1; }
  bash scripts/deploy/deploy-frontend-s3.sh
  echo "✓ S3 deployment complete"
else
  echo "[4/6] Skipping S3"
fi

echo "[5/6] Restarting backend..."
pm2 restart mediczy-server --update-env
pm2 save --force 2>/dev/null || true
echo "✓ Backend restarted"

echo "[6/6] Health check..."
sleep 4
curl -sf http://localhost:8888/api/health || curl -sf http://localhost:8000/api/health || true
echo ""
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
