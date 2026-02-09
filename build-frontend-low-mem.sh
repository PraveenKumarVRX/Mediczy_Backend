#!/bin/bash
#
# Frontend Build Script - Optimized for Low Memory Environments
# Temporarily stops PM2 services to free memory for building
#

set -e

echo "=================================================="
echo "Frontend Build - Low Memory Mode"
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

# Save PM2 process list
echo "💾 Saving PM2 process list..."
pm2 save --force

# Stop PM2 processes to free memory
echo "⏸️  Stopping PM2 processes to free memory..."
pm2 stop all

echo ""
echo "📊 Memory after stopping PM2:"
free -h
echo ""

# Wait a moment for memory to be released
sleep 2

# Build frontend
echo "🏗️  Building frontend..."
cd /workspaces/Mediczy/client

if npm run build; then
    echo ""
    echo -e "${GREEN}✅ Frontend build successful!${NC}"
    BUILD_SUCCESS=true
else
    echo ""
    echo -e "${RED}❌ Frontend build failed!${NC}"
    BUILD_SUCCESS=false
fi

# Return to root
cd /workspaces/Mediczy

# Restart PM2 processes
echo ""
echo "🔄 Restarting PM2 processes..."
pm2 resurrect

# Wait for services to stabilize
sleep 5

# Check PM2 status
echo ""
echo "📊 PM2 Process Status:"
pm2 list

echo ""
echo "📊 Final memory status:"
free -h

echo ""
if [ "$BUILD_SUCCESS" = true ]; then
    echo -e "${GREEN}=================================================="
    echo "✅ Build completed successfully!"
    echo "==================================================${NC}"
    echo ""
    echo "Build output: /workspaces/Mediczy/client/dist"
    echo ""
    exit 0
else
    echo -e "${RED}=================================================="
    echo "❌ Build failed - check logs above"
    echo "==================================================${NC}"
    echo ""
    exit 1
fi
