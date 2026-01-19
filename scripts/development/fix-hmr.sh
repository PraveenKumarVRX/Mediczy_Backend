#!/bin/bash

# Quick restart script for WebSocket/HMR issues
echo "🔄 Quick Restart - Fixing WebSocket HMR Issues..."

# Kill existing processes
pkill -f "nodemon.*index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sudo lsof -ti:8000,9443 | xargs sudo kill -9 2>/dev/null

echo "✅ Stopped all services"
sleep 2

# Restart with optimized settings
echo "🚀 Restarting with HMR fixes..."

# Start server
cd /root/Mediczy/server
npm run dev > /tmp/mediczy-server.log 2>&1 &
echo "📡 Server started"

# Start client with localhost HMR
cd /root/Mediczy/client
export VITE_HMR_HOST=localhost
npm run dev > /tmp/mediczy-client.log 2>&1 &
echo "🖥️ Client started with localhost HMR"

sleep 3
echo ""
echo "✅ Services restarted!"
echo "🌐 Frontend: http://localhost:9443"
echo "📧 Admin: http://localhost:9443/admin/email"
echo ""
echo "📋 Check status:"
echo "   curl -s http://localhost:9443 >/dev/null && echo 'Frontend: OK'"
echo "   curl -s http://localhost:8000/api/email/configs -H 'Authorization: Bearer dev-admin-token' >/dev/null && echo 'Backend: OK'"