#!/bin/bash
#
# Aggressive Frontend Build Script
# Kills TypeScript servers temporarily to free ~4GB of memory
#

set -e

echo "=================================================="
echo "Aggressive Frontend Build - Killing TS Servers"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check current memory
echo "📊 Current memory status:"
free -h
echo ""

# Find and kill TypeScript servers
echo "🔪 Finding TypeScript server processes..."
TS_PIDS=$(ps aux | grep 'tsserver.js' | grep -v grep | awk '{print $2}' | tr '\n' ' ')

if [ -n "$TS_PIDS" ]; then
    echo "Found TypeScript servers: $TS_PIDS"
    echo "⏸️  Stopping TypeScript servers to free ~3-4GB memory..."
    kill $TS_PIDS 2>/dev/null || true
    sleep 2
    echo "✅ TypeScript servers stopped"
else
    echo "No TypeScript servers found running"
fi

# Also stop PM2
echo ""
echo "⏸️  Stopping PM2 processes..."
pm2 stop all >/dev/null 2>&1

echo ""
echo "📊 Memory after cleanup:"
free -h
echo ""

# Wait for memory to be released
sleep 3

# Build frontend with very conservative memory settings
echo "🏗️  Building frontend with 1GB memory limit..."
cd /workspaces/Mediczy/client

if NODE_OPTIONS='--max-old-space-size=1024' npm run build:prod; then
    echo ""
    echo -e "${GREEN}✅ Frontend build successful!${NC}"
    BUILD_SUCCESS=true
else
    echo ""
    echo -e "${YELLOW}⚠️  Build with 1GB failed, trying with 1.5GB...${NC}"
    if NODE_OPTIONS='--max-old-space-size=1536' npm run build:prod; then
        echo ""
        echo -e "${GREEN}✅ Frontend build successful!${NC}"
        BUILD_SUCCESS=true
    else
        echo ""
        echo -e "${RED}❌ Frontend build failed!${NC}"
        BUILD_SUCCESS=false
    fi
fi

# Return to root
cd /workspaces/Mediczy

# Restart PM2
echo ""
echo "🔄 Restarting PM2 processes..."
pm2 start ecosystem.config.js >/dev/null 2>&1

# Wait for services
sleep 5

# PM2 status
echo ""
echo "📊 PM2 Process Status:"
pm2 list

echo ""
echo "📊 Final memory status:"
free -h

echo ""
echo "ℹ️  Note: TypeScript servers will restart automatically when you interact with VS Code"

echo ""
if [ "$BUILD_SUCCESS" = true ]; then
    echo -e "${GREEN}=================================================="
    echo "✅ Build completed successfully!"
    echo "==================================================${NC}"
    echo ""
    echo "📦 Build output: /workspaces/Mediczy/client/dist"
    ls -lh /workspaces/Mediczy/client/dist 2>/dev/null | head -10 || echo "Checking dist directory..."
    echo ""
    exit 0
else
    echo -e "${RED}=================================================="
    echo "❌ Build failed - Try reducing dependencies or upgrading machine"
    echo "==================================================${NC}"
    echo ""
    exit 1
fi
