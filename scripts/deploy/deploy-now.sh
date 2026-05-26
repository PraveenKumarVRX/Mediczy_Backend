#!/bin/bash
# Quick Deploy - Run this on production server
# You're already on ubuntu@ip-172-31-47-217 (13.234.17.52)

echo "╔════════════════════════════════════════╗"
echo "║   Deploying API Credentials Updates    ║"
echo "╚════════════════════════════════════════╝"
echo ""

# 1. Pull latest changes
echo "📥 Pulling latest code..."
git pull origin main

if [ $? -ne 0 ]; then
  echo "❌ Git pull failed!"
  exit 1
fi

echo "✅ Code updated"
echo ""

# 2. Restart backend
echo "🔄 Restarting backend server..."
pm2 restart mediczy-server

if [ $? -ne 0 ]; then
  echo "❌ PM2 restart failed!"
  exit 1
fi

echo "✅ Backend restarted"
echo ""

# 3. Check status
echo "📊 Checking PM2 status..."
pm2 status | grep mediczy-server

echo ""
echo "╔════════════════════════════════════════╗"
echo "║   ✅ Deployment Complete!              ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "🧪 Test the API:"
echo "curl -X POST http://localhost:8888/api/admin/api-credentials/generate \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"name\":\"Test\",\"integration_type\":\"smarthealth-rn\",\"organization_id\":1}'"
echo ""
echo "🌐 Or test from browser:"
echo "https://app.mediqzy.com/api/admin/api-credentials/generate"
