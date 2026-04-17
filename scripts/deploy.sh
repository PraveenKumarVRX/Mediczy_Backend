#!/bin/bash
# Safe Deployment Script - Prevents SSH disconnection during build
# Uses nohup and nice to prevent resource exhaustion

set -e

LOG_FILE="/home/ubuntu/Mediczy/logs/deploy-$(date +%Y%m%d-%H%M%S).log"
LOCK_FILE="/tmp/mediczy-deploy.lock"

# Prevent concurrent deployments
if [ -f "$LOCK_FILE" ]; then
    echo "⚠️  Deployment already in progress. Check $LOG_FILE"
    exit 1
fi

touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

echo "🚀 Starting Mediczy Deployment..."
echo "📝 Logs: $LOG_FILE"

{
    echo "============================================"
    echo "Deployment started at $(date)"
    echo "============================================"

    cd /home/ubuntu/Mediczy

    # 1. Git pull latest changes
    echo ""
    echo "[1/5] Pulling latest code..."
    git pull origin main || echo "Git pull skipped (may have local changes)"

    # 2. Install server dependencies (if needed)
    echo ""
    echo "[2/5] Installing server dependencies..."
    cd /home/ubuntu/Mediczy/server
    npm install --production --silent 2>&1 || true

    # 3. Build frontend with memory limits
    echo ""
    echo "[3/5] Building frontend (this may take a few minutes)..."
    cd /home/ubuntu/Mediczy/client
    
    # Use nice to lower priority and limit Node memory
    export NODE_OPTIONS="--max-old-space-size=2048"
    nice -n 10 npm run build 2>&1
    
    echo "✅ Frontend build complete"

    # 4. Restart PM2 services gracefully (one at a time)
    echo ""
    echo "[4/5] Restarting services gracefully..."
    cd /home/ubuntu/Mediczy
    
    # Reload instead of restart to minimize downtime
    pm2 reload mediczy-server --update-env 2>&1 || pm2 restart mediczy-server
    sleep 5
    
    pm2 reload mediczy-worker --update-env 2>&1 || pm2 restart mediczy-worker
    sleep 2

    # 5. Save PM2 config
    echo ""
    echo "[5/5] Saving PM2 configuration..."
    pm2 save

    echo ""
    echo "============================================"
    echo "✅ Deployment completed at $(date)"
    echo "============================================"
    
    # Quick health check
    echo ""
    echo "Health Check:"
    HEALTH_BASE=${HEALTH_BASE:-http://localhost:8888}
    curl -s -o /dev/null -w "  Backend (/v1/health): HTTP %{http_code}\n" "$HEALTH_BASE/v1/health" || echo "  Backend (/v1/health): Check failed"
    curl -s -o /dev/null -w "  Backend (/api/health): HTTP %{http_code}\n" "$HEALTH_BASE/api/health" || echo "  Backend (/api/health): Check failed"
    curl -s -o /dev/null -w "  Frontend: HTTP %{http_code}\n" https://app.mediqzy.com || echo "  Frontend: Check failed"

} >> "$LOG_FILE" 2>&1 &

DEPLOY_PID=$!
echo ""
echo "✅ Deployment running in background (PID: $DEPLOY_PID)"
echo "📋 Monitor progress: tail -f $LOG_FILE"
echo ""
echo "You can safely disconnect SSH. Deployment will continue."
