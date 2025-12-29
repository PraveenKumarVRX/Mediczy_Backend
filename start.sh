#!/bin/bash

#############################################################################
# Mediczy Platform Startup Script
# 
# Starts all services including:
# - PostgreSQL
# - SIB FastAPI (port 8001)
# - Node.js Backend (port 8000)
# - Background Workers
#############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[START]${NC} $1"; }
ok() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

PROJECT_ROOT="/home/ubuntu/Mediczy"

echo ""
log "╔════════════════════════════════════════════════════╗"
log "║   MEDICZY PLATFORM STARTUP                         ║"
log "║   Starting all services with SIB included          ║"
log "╚════════════════════════════════════════════════════╝"
echo ""

# Load environment
if [ -f "$PROJECT_ROOT/.env" ]; then
    log "Loading environment from .env..."
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
    ok "Environment loaded"
fi

if command -v pm2 >/dev/null 2>&1; then
    log "Using PM2 for process management..."
    cd "$PROJECT_ROOT"
    
    if [ -f "ecosystem.config.js" ]; then
        log "Starting all services from ecosystem.config.js..."
        pm2 start ecosystem.config.js
        ok "All services started via PM2"
        echo ""
        pm2 list
    else
        warn "ecosystem.config.js not found"
        bash "$PROJECT_ROOT/startup-sib-unified.sh"
    fi
else
    log "PM2 not found, using manual startup..."
    bash "$PROJECT_ROOT/startup-sib-unified.sh"
fi

echo ""
log "╔════════════════════════════════════════════════════╗"
log "║   STARTUP COMPLETE                                ║"
log "╚════════════════════════════════════════════════════╝"
echo ""
log "Services Running:"
echo "  🧠 SIB FastAPI:    http://localhost:8001"
echo "  🌐 Node.js Backend: http://localhost:8000"
echo ""
