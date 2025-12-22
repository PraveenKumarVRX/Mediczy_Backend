#!/bin/bash

# Simple development starter
echo "🚀 Starting Mediczy with Auto-Restart..."

# Clean up any existing processes
pkill -f "nodemon.*index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sudo lsof -ti:8000,9443 | xargs sudo kill -9 2>/dev/null
sleep 1

# Start both services in background with auto-restart
cd /root/Mediczy/server && npm run dev > /tmp/mediczy-server.log 2>&1 &
cd /root/Mediczy/client && npm run dev > /tmp/mediczy-client.log 2>&1 &

echo "✅ Services started with auto-restart!"
echo "📱 Frontend: http://localhost:9443"
echo "🔧 Backend:  http://localhost:8000"
echo "📧 Admin:    http://localhost:9443/admin/email"
echo ""
echo "📋 View logs:"
echo "   Server: tail -f /tmp/mediczy-server.log"
echo "   Client: tail -f /tmp/mediczy-client.log"
echo ""
echo "🛑 Stop services: pkill -f 'nodemon|vite'"