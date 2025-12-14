#!/bin/bash

# Frontend Startup Script with VS Code Crash Prevention
# This script optimizes the development environment to prevent VS Code crashes

echo "🚀 Starting Mediczy Frontend with optimized settings..."

# Set memory limits to prevent crashes
export NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=256"

# Set Vite-specific optimizations
export VITE_NODE_ENV=development
export VITE_HMR_OVERLAY=false

# Clear any stuck processes
echo "🧹 Cleaning up any stuck processes..."
pkill -f "vite" 2>/dev/null || true
pkill -f "esbuild" 2>/dev/null || true

# Wait a moment for cleanup
sleep 2

# Navigate to client directory
cd /root/Mediczy/client

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Clear npm cache to prevent corruption issues
echo "🗑️  Clearing npm cache..."
npm cache clean --force 2>/dev/null || true

# Start the development server with optimized settings
echo "✨ Starting Vite development server..."
echo "🌐 Frontend will be available at: http://192.168.1.72:9443"
echo "💡 If VS Code crashes on refresh, try:"
echo "   - Close browser dev tools before refreshing"
echo "   - Use Ctrl+Shift+R instead of F5"
echo "   - Close other browser tabs to reduce memory usage"
echo ""

# Start with limited concurrency to reduce memory pressure
npm run dev --silent