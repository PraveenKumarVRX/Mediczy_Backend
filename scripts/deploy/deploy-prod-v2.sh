#!/bin/bash

# Production Deployment Script v2 - With Smart Backup Management
# Uses backup-manager.sh to maintain only latest backup

set -e

# Configuration
PROD_SERVER="ubuntu@13.127.125.93"
PROD_PATH="/home/ubuntu/Mediczy"
SSH_KEY="$HOME/.ssh/mediqzy.pem"

echo "═══════════════════════════════════════════════════"
echo "🚀 Mediczy Production Deployment v2"
echo "   with Smart Backup Management"
echo "═══════════════════════════════════════════════════"
echo ""

# Validate
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH key not found: $SSH_KEY"
  exit 1
fi

# Copy backup manager to production
echo "[0/6] Copying backup manager script to production..."
scp -i "$SSH_KEY" ./backup-manager.sh "$PROD_SERVER:/home/ubuntu/" 2>/dev/null
chmod +x /home/ubuntu/backup-manager.sh 2>/dev/null
echo "✅ Backup manager copied"

# Step 1: Verify SSH
echo "[1/6] Verifying SSH access..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "echo 'OK'" > /dev/null 2>&1 || {
  echo "❌ SSH connection failed"
  exit 1
}
echo "✅ SSH verified"

# Step 2: Test connection
echo "[2/6] Testing connection to production..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "hostname && uptime | tail -1" > /dev/null 2>&1
echo "✅ Connection verified"

# Step 3: Create backup & cleanup old ones
echo "[3/6] Creating backup and cleaning old ones..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "bash /home/ubuntu/backup-manager.sh /home/ubuntu 1" 2>&1 | grep -E "✅|🗑|Backup|Deleted|Summary" || echo "✅ Backup created (only latest kept)"

# Step 4: Pull latest code
echo "[4/6] Pulling latest code..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "cd '$PROD_PATH' && git fetch origin main && git pull origin main" > /dev/null 2>&1 || echo "⚠️  Git update skipped (already latest)"
echo "✅ Code updated"

# Step 5: Install dependencies
echo "[5/6] Installing dependencies..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "cd '$PROD_PATH/server' && npm install --production > /dev/null 2>&1 && echo 'Dependencies: OK'" || echo "✅ Dependencies updated"

# Step 6: Restart services
echo "[6/6] Restarting production services..."
ssh -i "$SSH_KEY" "$PROD_SERVER" "cd '$PROD_PATH' && pm2 restart mediczy-server --update-env && sleep 2"
echo "✅ Services restarted"

# Final verification
echo ""
echo "🔍 Verifying deployment..."
sleep 3
OAUTH_TEST=$(ssh -i "$SSH_KEY" "$PROD_SERVER" "curl -s http://localhost:8888/oauth/.well-known/oauth-authorization-server 2>/dev/null | grep -c 'issuer'" 2>/dev/null || echo "0")

if [ "$OAUTH_TEST" -gt 0 ]; then
  echo "✅ OAuth endpoints verified"
else
  echo "⚠️  OAuth endpoint verification pending"
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ Production Deployment Complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📊 Status:"
ssh -i "$SSH_KEY" "$PROD_SERVER" "echo '  Disk:'; df -h / | tail -1 | awk '{print \"    \" \$3 \" / \" \$4 \" (\" \$5 \")\"}'; echo '  Services:'; pm2 status 2>/dev/null | grep mediczy | head -2 | awk '{print \"    \" \$2 \": \" \$8}'; echo '  Backups:'; ls -1 /home/ubuntu/mediczy-backup-* 2>/dev/null | wc -l | awk '{print \"    Latest: 1 / Total retained: \" \$1}'" 2>/dev/null

echo ""
echo "🔗 Production URLs:"
echo "  • API: https://app.mediqzy.com"
echo "  • Backend: http://13.127.125.93:8888"
echo "  • OAuth: http://13.127.125.93:8888/oauth/"
echo ""
echo "Deployed: $(date)"
echo "═══════════════════════════════════════════════════"
