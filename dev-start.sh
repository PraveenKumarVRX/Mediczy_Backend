#!/bin/bash

# Development startup script for Mediczy
# This script starts both server and client with auto-restart capabilities

echo "🚀 Starting Mediczy Development Environment..."
echo "================================================"

# Function to kill processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    pkill -f "nodemon.*index.js" 2>/dev/null
    pkill -f "vite" 2>/dev/null
    sudo lsof -ti:8000 | xargs sudo kill -9 2>/dev/null
    sudo lsof -ti:9443 | xargs sudo kill -9 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set up trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
pkill -f "nodemon.*index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sudo lsof -ti:8000 | xargs sudo kill -9 2>/dev/null
sudo lsof -ti:9443 | xargs sudo kill -9 2>/dev/null
sleep 2

# Start server with nodemon (auto-restart on file changes)
echo "🔧 Starting Backend Server with Auto-Restart..."
cd /root/Mediczy/server
npm run dev &
SERVER_PID=$!
echo "   Backend running on port 8000 (PID: $SERVER_PID)"
sleep 3

# Start client with vite dev server (auto-reload on file changes)
echo "🎨 Starting Frontend Client with Hot Reload..."
cd /root/Mediczy/client

# Try with normal config first
echo "   Attempting to start with optimized HMR..."
npm run dev:watch &
CLIENT_PID=$!
echo "   Frontend running on port 9443 (PID: $CLIENT_PID)"

# Give it time to start and check if HMR is working
sleep 5
if ! curl -s http://localhost:9443 > /dev/null 2>&1; then
    echo "   ⚠️ Client not responding, trying fallback config..."
    kill $CLIENT_PID 2>/dev/null
    sleep 2
    
    # Use fallback config without WebSocket HMR
    cp vite.config.fallback.ts vite.config.ts
    npm run dev:watch &
    CLIENT_PID=$!
    echo "   Frontend restarted with fallback config (PID: $CLIENT_PID)"
    sleep 2
fi

echo ""
echo "✅ Development Environment Ready!"
echo "================================================"
echo "📱 Frontend: http://localhost:9443"
echo "🔧 Backend:  http://localhost:8000"
echo "📧 Admin:    http://localhost:9443/admin/email"
echo ""
echo "💡 Both services will auto-restart on file changes"
echo "🛑 Press Ctrl+C to stop all services"
echo "================================================"

# Wait for both processes to finish
wait $SERVER_PID $CLIENT_PID