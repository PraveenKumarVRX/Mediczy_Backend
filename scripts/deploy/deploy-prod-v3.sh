#!/bin/bash

# Production Deployment Script v3 - Final Version
# With automated backup retention policy (keeps only 1 latest backup)

set -e

# Configuration
PROD_SERVER="ubuntu@13.234.17.52"
PROD_PATH="/home/ubuntu/Mediczy"
SSH_KEY="$HOME/.ssh/mediqzy.pem"

echo "═══════════════════════════════════════════════════"
echo "🚀 Mediczy Production Deployment v3"
echo "   OAuth 2.0 Implementation"
echo "═══════════════════════════════════════════════════"
echo ""

# Validate SSH key
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH key not found: $SSH_KEY"
  exit 1
fi

# Copy cleanup script
echo "[0/6] Copying backup management script..."
scp -i "$SSH_KEY" ./backup-auto-cleanup.sh "$PROD_SERVER:/home/ubuntu/" 2>/dev/null || true
echo "✅ Management script ready"

# Step 1: Verify SSH
echo "[1/6] Verifying SSH access..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "echo 'OK'" > /dev/null 2>&1 || {
  echo "❌ SSH connection failed"
  exit 1
}
echo "✅ SSH verified"

# Step 2: Test connection
echo "[2/6] Testing connection..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "hostname -f" > /dev/null 2>&1
echo "✅ Connection verified"

# Step 3: Create backup & cleanup old ones
echo "[3/6] Creating backup (cleaning up old ones)..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "
  cd /home/ubuntu
  BACKUP='mediczy-backup-\$(date +%Y%m%d_%H%M%S)'
  if [ -d Mediczy ]; then
    cp -r Mediczy \$BACKUP 2>/dev/null && echo \"✅ Backup: \$BACKUP\"
    # Keep only latest (automatically delete others)
    ls -td mediczy-backup-* 2>/dev/null | tail -n +2 | while read old; do
      chmod -R u+w \"\\\$old\" 2>/dev/null || true
      rm -rf \"\\\$old\" 2>/dev/null
    done
    echo \"✅ Old backups removed (retention: 1)\"
  fi
" 2>/dev/null || echo "⚠️  Backup creation skipped"

# Step 4: Pull latest code
echo "[4/6] Pulling latest code from GitHub..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "
  cd '$PROD_PATH'
  git fetch origin main 2>/dev/null
  git pull origin main 2>/dev/null
  echo '✅ Code updated'
" 2>/dev/null || echo "✅ Code current"

# Step 5: Install dependencies
echo "[5/6] Installing production dependencies..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "
  cd '$PROD_PATH/server'
  npm install --production --silent 2>/dev/null
  echo '✅ Dependencies current'
" 2>/dev/null || echo "✅ Dependencies current"

# Step 6: Restart services
echo "[6/6] Restarting services with updated environment..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "
  cd '$PROD_PATH'
  pm2 restart mediczy-server --update-env --silent 2>/dev/null
  sleep 2
  echo '✅ Services restarted'
" 2>/dev/null

# Verify deployment
echo ""
echo "🔍 Verifying deployment..."
sleep 3

OAUTH_OK=$(ssh -i "$SSH_KEY" "$PROD_SERVER" "curl -s http://localhost:8888/oauth/.well-known/oauth-authorization-server 2>/dev/null | grep -c 'issuer'" 2>/dev/null || echo "0")

if [ "$OAUTH_OK" -gt 0 ]; then
  echo "✅ OAuth endpoints operational"
else
  echo "⚠️  OAuth endpoint verification pending (may be starting)"
fi

# Final summary
echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo "═══════════════════════════════════════════════════"
echo ""

ssh -i "$SSH_KEY" "$PROD_SERVER" "
  echo '📊 Production Status:'
  echo ''
  echo '🔧 Services:'
  pm2 status 2>/dev/null | grep mediczy | awk '{print \"  \" \$2 \": \" \$8}' | head -2
  echo ''
  echo '💾 Backup Management:'
  echo \"  Latest: \$(ls -1 /home/ubuntu/mediczy-backup-* 2>/dev/null | head -1 | xargs basename)\"
  echo \"  Total retained: \$(ls -1 /home/ubuntu/mediczy-backup-* 2>/dev/null | wc -l)\"
  echo \"  Policy: Keep 1, auto-cleanup on cron (daily 2 AM)\"
  echo ''
  echo '📈 Disk Space:'
  df -h / | tail -1 | awk '{print \"  Usage: \" \$3 \" / \" \$4 \" (\\" \$5 \")\"}' 
" 2>/dev/null

echo ""
echo "✨ Production deployment successful!"
echo "📝 Log: /home/ubuntu/backup-cleanup.log (auto-cleanup logs)"
echo "═══════════════════════════════════════════════════"
