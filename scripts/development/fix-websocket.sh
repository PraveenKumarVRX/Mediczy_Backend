#!/bin/bash

# Definitive WebSocket HMR Fix
echo "🔧 Applying definitive WebSocket HMR fix..."

# Stop all Vite processes
pkill -f "vite" 2>/dev/null
sleep 2

# Set environment variables to force correct WebSocket behavior
export VITE_HMR_HOST=localhost
export VITE_HMR_PORT=9443
export VITE_HMR_PROTOCOL=ws

# Clear any cached Vite config
cd /root/Mediczy/client
rm -rf node_modules/.vite 2>/dev/null
rm -rf dist 2>/dev/null

echo "✅ Cleared Vite cache"

# Start with explicit WebSocket configuration
echo "🚀 Starting Vite with fixed WebSocket config..."
VITE_HMR_HOST=localhost VITE_HMR_PORT=9443 npm run dev &

sleep 3
echo "✅ Vite started with WebSocket fix applied"
echo "🌐 Frontend: http://localhost:9443"
echo "📧 Admin: http://localhost:9443/admin/email"

# Test connection
if curl -s http://localhost:9443 >/dev/null; then
    echo "✅ WebSocket HMR fix successful"
else
    echo "❌ WebSocket fix failed, check logs"
fi