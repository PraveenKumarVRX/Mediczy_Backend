#!/bin/bash

# Mediczy Development Startup Script with Debugging
# This script starts the development environment with debugging enabled

set -e

echo "🚀 Starting Mediczy Development Environment with Debugging"
echo "============================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env.development exists
if [ ! -f .env.development ]; then
    echo -e "${RED}❌ Error: .env.development not found${NC}"
    echo "Creating .env.development from template..."
    cp .env.example .env.development 2>/dev/null || true
fi

# Check if .env exists, if not copy from .env.development
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env not found, copying from .env.development${NC}"
    cp .env.development .env
fi

# Create logs directory if it doesn't exist
if [ ! -d logs ]; then
    echo -e "${BLUE}📁 Creating logs directory${NC}"
    mkdir -p logs
fi

# Clean old logs (optional)
read -p "Clean old logs? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🧹 Cleaning old logs${NC}"
    rm -f logs/*.log
fi

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null || echo "not installed")
echo -e "${BLUE}📦 Node.js version: ${NODE_VERSION}${NC}"

# Display debug configuration
echo ""
echo -e "${GREEN}Debug Configuration:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Source .env file to display config
export $(grep -v '^#' .env | xargs)

echo "  NODE_ENV: ${NODE_ENV:-not set}"
echo "  DEBUG: ${DEBUG:-not set}"
echo "  LOG_LEVEL: ${LOG_LEVEL:-info}"
echo "  ENABLE_CONSOLE_LOGGING: ${ENABLE_CONSOLE_LOGGING:-true}"
echo "  ENABLE_FILE_LOGGING: ${ENABLE_FILE_LOGGING:-true}"
echo "  LOG_RESPONSE_TIME: ${LOG_RESPONSE_TIME:-false}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ask user what to start
echo -e "${GREEN}What would you like to start?${NC}"
echo "  1) Full Stack (Frontend + Backend)"
echo "  2) Backend Only"
echo "  3) Frontend Only"
echo "  4) Backend with VS Code Debugger"
echo "  5) Full Stack with VS Code Debugger"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo -e "${GREEN}🚀 Starting Full Stack Development Environment${NC}"
        npm run dev
        ;;
    2)
        echo -e "${GREEN}🔧 Starting Backend Only${NC}"
        cd server && DEBUG=${DEBUG:-*} LOG_LEVEL=${LOG_LEVEL:-debug} npm run dev:watch
        ;;
    3)
        echo -e "${GREEN}🎨 Starting Frontend Only${NC}"
        cd client && npm run dev
        ;;
    4)
        echo -e "${GREEN}🐛 Starting Backend with VS Code Debugger${NC}"
        echo "Please use VS Code: Press F5 and select 'Debug Backend (Nodemon)'"
        echo "Or run manually:"
        echo "  cd server && node --inspect index.js"
        read -p "Press Enter to continue..."
        ;;
    5)
        echo -e "${GREEN}🐛 Starting Full Stack with VS Code Debugger${NC}"
        echo "Please use VS Code: Press F5 and select 'Full Stack Debug'"
        echo "This will start both frontend and backend in debug mode"
        read -p "Press Enter to continue..."
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Mediczy Development Environment${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📚 Quick Debugging Tips:${NC}"
echo "  • View logs: tail -f logs/*.log"
echo "  • Debug in VS Code: Press F5"
echo "  • Change log level: Set LOG_LEVEL in .env"
echo "  • Enable all debug output: Set DEBUG=* in .env"
echo ""
echo -e "${BLUE}📖 Documentation:${NC}"
echo "  • Quick Reference: docs/DEBUG_QUICK_REFERENCE.md"
echo "  • Full Guide: docs/DEBUGGING_GUIDE.md"
echo ""
echo -e "${GREEN}Happy Debugging! 🎉${NC}"
