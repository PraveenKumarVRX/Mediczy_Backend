#!/bin/bash

# Safe Mediczy Server Restart Script
# This script safely restarts ONLY the Mediczy backend server
# WITHOUT killing VS Code or other node processes

echo "🔄 Restarting Mediczy Backend Server..."

# Kill ALL Mediczy server processes (both old and new)
while pgrep -f "node.*server/index.js" > /dev/null; do
  pkill -f "node.*server/index.js"
  sleep 1
done

# Double-check with lsof
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null
sleep 2

# Start server in background (nohup prevents it from dying when shell closes)
cd /home/ubuntu/Mediczy
nohup node server/index.js > mediczy-backend.log 2>&1 &

# Get the PID
SERVER_PID=$!
echo "✅ Server started with PID: $SERVER_PID"

# Wait for server to start and fully initialize
echo "⏳ Waiting for server to initialize (20 seconds)..."
for i in {1..20}; do
  sleep 1
  curl -s http://localhost:8000/api/health > /dev/null 2>&1 && break
  echo -n "."
done
echo ""

# Test the server
echo "🧪 Testing server..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:8000/api/health 2>/dev/null | tail -1)

if [ "$RESPONSE" = "200" ]; then
  echo "✅ Server is running and responding!"
elif [ "$RESPONSE" = "500" ]; then
  echo "⚠️ Server is running but /health returned 500"
  echo "📋 This may be normal - check the app status"
else
  echo "⚠️ Server responded with status: $RESPONSE"
  echo "📋 Check logs with: tail -50 mediczy-backend.log"
fi

echo ""
echo "📝 View logs: tail -f mediczy-backend.log"
echo "🛑 Stop server: pkill -f 'node.*server/index.js'"
