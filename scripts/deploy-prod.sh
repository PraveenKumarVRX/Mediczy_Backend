#!/bin/bash
# deploy-prod.sh — Promote main → prod branch and deploy to ECS Fargate (mediczy.in)
# Usage: ./scripts/deploy-prod.sh v1.1.0 "short release note"
# Usage: ./scripts/deploy-prod.sh          (auto-increments patch version)

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_DIR="/home/ubuntu/Mediczy"
ECR_REGISTRY="480664947830.dkr.ecr.ap-south-1.amazonaws.com"
ECR_REPO="mediczy-app"
ECS_CLUSTER="control-plane-cluster"
ECS_SERVICES=("mediczy-app" "mediczy-worker")
AWS_REGION="ap-south-1"
HEALTH_URL="https://mediczy.in/api/health"
LOCK_FILE="/tmp/mediczy-prod-deploy.lock"
LOG_DIR="$REPO_DIR/logs"
LOG_FILE="$LOG_DIR/deploy-prod-$(date +%Y%m%d-%H%M%S).log"
# ─────────────────────────────────────────────────────────────────────────────

mkdir -p "$LOG_DIR"

# Redirect all output to log + terminal
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "  Mediczy Prod Deploy — $(date)"
echo "  Log: $LOG_FILE"
echo "============================================================"

# ── Lock: prevent concurrent deploys ─────────────────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  echo "ERROR: Another prod deploy is already running (lock: $LOCK_FILE)."
  echo "If stale, remove it: rm $LOCK_FILE"
  exit 1
fi
touch "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"; echo "Lock released."' EXIT

# ── Pre-flight checks ─────────────────────────────────────────────────────────
echo ""
echo "[CHECK] Pre-flight..."

command -v docker   >/dev/null || { echo "ERROR: docker not found"; exit 1; }
command -v aws      >/dev/null || { echo "ERROR: aws CLI not found"; exit 1; }
command -v git      >/dev/null || { echo "ERROR: git not found"; exit 1; }

# Must be run from repo root or scripts dir
cd "$REPO_DIR"

# Ensure we are on main before starting
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "ERROR: You are on branch '$CURRENT_BRANCH'. Switch to main first."
  echo "  git checkout main && git pull origin main"
  exit 1
fi

# Abort if there are uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Uncommitted changes detected. Commit or stash before deploying."
  git status --short
  exit 1
fi

# Pull latest main
echo "[CHECK] Pulling latest main..."
git pull origin main

# ── Determine version ─────────────────────────────────────────────────────────
echo ""
echo "[VERSION] Determining release version..."

if [ -n "${1:-}" ]; then
  VERSION="$1"
  # Validate format: vX.Y.Z
  if ! echo "$VERSION" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "ERROR: Version must be in format vX.Y.Z (e.g. v1.2.0). Got: $VERSION"
    exit 1
  fi
else
  # Auto-increment: find last tag, bump patch
  LAST_TAG=$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)
  if [ -z "$LAST_TAG" ]; then
    VERSION="v1.0.0"
  else
    MAJOR=$(echo "$LAST_TAG" | cut -d. -f1 | tr -d 'v')
    MINOR=$(echo "$LAST_TAG" | cut -d. -f2)
    PATCH=$(echo "$LAST_TAG" | cut -d. -f3)
    VERSION="v${MAJOR}.${MINOR}.$((PATCH + 1))"
  fi
fi

RELEASE_NOTE="${2:-No release note provided}"
LAST_TAG=$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || echo "none")

# Check tag doesn't already exist
if git tag | grep -q "^${VERSION}$"; then
  echo "ERROR: Tag $VERSION already exists. Choose a higher version."
  exit 1
fi

# ── Confirmation prompt ───────────────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────────────┐"
echo "│  PROD DEPLOY SUMMARY                                │"
echo "├─────────────────────────────────────────────────────┤"
printf "│  Version   : %-38s│\n" "$VERSION"
printf "│  Note      : %-38s│\n" "${RELEASE_NOTE:0:38}"
printf "│  From tag  : %-38s│\n" "$LAST_TAG"
printf "│  Branch    : main → prod                            │\n"
printf "│  Target    : mediczy.in (ECS Fargate)               │\n"
echo "└─────────────────────────────────────────────────────┘"
echo ""
read -r -p "  Proceed? [yes/N] " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# ── Step 1: Merge main → prod and tag ─────────────────────────────────────────
echo ""
echo "[1/5] Merging main → prod and tagging $VERSION..."

git checkout prod
git pull origin prod
git merge main --no-ff -m "Release $VERSION — $RELEASE_NOTE"
git tag "$VERSION" -m "$VERSION — $RELEASE_NOTE"
git push origin prod
git push origin "$VERSION"

echo "  main merged into prod. Tag $VERSION pushed."

# ── Step 2: Authenticate to ECR ───────────────────────────────────────────────
echo ""
echo "[2/5] Authenticating to ECR..."

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "  ECR login successful."

# ── Step 3: Build Docker image ────────────────────────────────────────────────
echo ""
echo "[3/5] Building Docker image (this takes 3-5 minutes)..."

docker build \
  -f Dockerfile.mediczy-app \
  -t "$ECR_REPO:latest" \
  -t "$ECR_REPO:$VERSION" \
  .

echo "  Build complete."

# ── Step 4: Push to ECR ───────────────────────────────────────────────────────
echo ""
echo "[4/5] Pushing images to ECR..."

docker tag "$ECR_REPO:latest"   "$ECR_REGISTRY/$ECR_REPO:latest"
docker tag "$ECR_REPO:$VERSION" "$ECR_REGISTRY/$ECR_REPO:$VERSION"

docker push "$ECR_REGISTRY/$ECR_REPO:latest"
docker push "$ECR_REGISTRY/$ECR_REPO:$VERSION"

echo "  Pushed :latest and :$VERSION to ECR."

# ── Step 5: Force ECS deployment ──────────────────────────────────────────────
echo ""
echo "[5/5] Triggering ECS rolling deployment..."

for SERVICE in "${ECS_SERVICES[@]}"; do
  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service  "$SERVICE" \
    --force-new-deployment \
    --region   "$AWS_REGION" \
    --query    'service.{service:serviceName,status:status,desired:desiredCount}' \
    --output   table
done

# ── Wait for stability ────────────────────────────────────────────────────────
echo ""
echo "[WAIT] Waiting for mediczy-app to stabilise (up to 8 min)..."

aws ecs wait services-stable \
  --cluster  "$ECS_CLUSTER" \
  --services "mediczy-app" \
  --region   "$AWS_REGION" && echo "  Service stable." \
  || echo "  WARN: wait timed out — check ECS console."

# ── Health check ─────────────────────────────────────────────────────────────
echo ""
echo "[HEALTH] Checking $HEALTH_URL ..."
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
HEALTH_BODY=$(curl -s "$HEALTH_URL" || echo "unreachable")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "  Health check PASSED (HTTP $HTTP_STATUS)"
  echo "  $HEALTH_BODY"
else
  echo "  WARN: Health check returned HTTP $HTTP_STATUS"
  echo "  $HEALTH_BODY"
  echo ""
  echo "  If prod is broken, rollback with:"
  echo "    ./scripts/deploy-prod.sh rollback $LAST_TAG"
fi

# ── Return to main ────────────────────────────────────────────────────────────
git checkout main

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  DEPLOY COMPLETE"
echo "  Version : $VERSION"
echo "  URL     : https://mediczy.in"
echo "  Log     : $LOG_FILE"
echo "  Rollback: ./scripts/deploy-prod.sh rollback $LAST_TAG"
echo "============================================================"
