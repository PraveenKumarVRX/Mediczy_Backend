#!/bin/bash
# ===========================================
# Mediqzy Staging Deployment Script
# ===========================================
# Usage: ./scripts/deploy-staging.sh
#
# This script deploys the latest code to the staging server.
# Run this on the staging server after pushing changes.
# ===========================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/home/ubuntu/Mediczy"
BRANCH="${DEPLOY_BRANCH:-staging}"
LOG_FILE="/home/ubuntu/Mediczy/logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Banner
echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║       🚀 Mediqzy Staging Deployment Script        ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Ensure we're in the right directory
cd "$APP_DIR" || error "Failed to change to app directory: $APP_DIR"

# Create logs directory if it doesn't exist
mkdir -p logs

log "Starting deployment to staging..."
log "Branch: $BRANCH"
log "Log file: $LOG_FILE"

# Step 1: Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    warn "Uncommitted changes detected. Stashing..."
    git stash
fi

# Step 2: Pull latest code
log "📥 Fetching latest code from origin..."
git fetch origin

log "📥 Checking out $BRANCH branch..."
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"

log "📥 Pulling latest changes..."
git pull origin "$BRANCH"

COMMIT_HASH=$(git rev-parse --short HEAD)
log "Current commit: $COMMIT_HASH"

# Step 3: Install server dependencies
log "📦 Installing server dependencies..."
cd server
npm ci --omit=dev 2>&1 | tee -a "$LOG_FILE"
cd ..

# Step 4: Install client dependencies and build
log "📦 Installing client dependencies..."
cd client
npm ci 2>&1 | tee -a "$LOG_FILE"

log "🔨 Building frontend..."
npm run build 2>&1 | tee -a "$LOG_FILE"
cd ..

# Step 5: Run database migrations (if any)
if [ -f "server/knexfile.js" ] || [ -f "server/knex.js" ]; then
    log "🗄️ Running database migrations..."
    cd server
    NODE_ENV=staging npx knex migrate:latest --env staging 2>&1 | tee -a "$LOG_FILE" || warn "Migrations may have failed or no migrations to run"
    cd ..
fi

# Step 6: Restart PM2 services
log "🔄 Restarting PM2 services..."
pm2 reload ecosystem.staging.config.js --update-env 2>&1 | tee -a "$LOG_FILE"

# Step 7: Wait for services to stabilize
log "⏳ Waiting for services to stabilize..."
sleep 10

# Step 8: Health check
log "✅ Running health check..."
HEALTH_URL="${HEALTH_CHECK_URL:-https://staging.mediqzy.com/api/health}"

HEALTH_RESPONSE=$(curl -sf "$HEALTH_URL" 2>&1) || {
    error "Health check failed! Server may not be responding. Check logs: pm2 logs mediqzy-staging"
}

echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"

# Check if response contains success
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"\|"success":true'; then
    log "✅ Health check passed!"
else
    warn "Health check returned unexpected response. Please verify manually."
fi

# Step 9: PM2 status
log "📊 PM2 Status:"
pm2 status | tee -a "$LOG_FILE"

# Step 10: Summary
echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║           ✅ Deployment Complete!                 ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
log "Deployment completed successfully!"
log "Commit: $COMMIT_HASH"
log "Branch: $BRANCH"
log "Environment: staging"
log "URL: https://staging.mediqzy.com"
log ""
log "View logs: pm2 logs mediqzy-staging"
log "View status: pm2 status"
echo ""
