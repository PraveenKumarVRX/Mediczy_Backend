#!/bin/bash

#############################################################################
# Mediczy Platform Shutdown Script
# 
# Stops all services including:
# - SIB FastAPI
# - Node.js Backend
# - Background Workers
# - PostgreSQL (optional)
#############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[STOP]${NC} $1"; }
ok() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

echo ""
log "╔════════════════════════════════════════════════════╗"
log "║   MEDICZY PLATFORM SHUTDOWN                        ║"
log "║   Stopping all services gracefully                 ║"
log "╚════════════════════════════════════════════════════╝"
echo ""

#############################################################################
# Stop PM2 Services
#############################################################################

if command -v pm2 >/dev/null 2>&1; then
    log "Checking PM2 services..."
    
    # Stop specific services
    if pm2 describe sib-fastapi &>/dev/null; then
        log "Stopping SIB FastAPI..."
        pm2 stop sib-fastapi
        ok "SIB FastAPI stopped"
    fi
    
    if pm2 describe mediczy-server &>/dev/null; then
        log "Stopping Node.js Backend..."
        pm2 stop mediczy-server
        ok "Node.js Backend stopped"
    fi
    
    if pm2 describe mediczy-worker &>/dev/null; then
        log "Stopping Background Worker..."
        pm2 stop mediczy-worker
        ok "Background Worker stopped"
    fi
    
    if pm2 describe bullmq-workers &>/dev/null; then
        log "Stopping BullMQ Workers..."
        pm2 stop bullmq-workers
        ok "BullMQ Workers stopped"
    fi
    
    if pm2 describe llm-orchestrator &>/dev/null; then
        log "Stopping LLM Orchestrator..."
        pm2 stop llm-orchestrator
        ok "LLM Orchestrator stopped"
    fi
    
    echo ""
    log "PM2 Status:"
    pm2 list | grep -E "stopped|offline" || echo "  (No stopped processes)"
    
else
    warn "PM2 not found, attempting manual service termination..."
    
    # Kill processes by port
    log "Stopping SIB FastAPI (port 8001)..."
    pkill -f "uvicorn.*8001" || warn "SIB FastAPI not running"
    
    log "Stopping Node.js Backend (port 8000)..."
    pkill -f "node.*8000" || warn "Node.js Backend not running"
    
    log "Stopping background workers..."
    pkill -f "worker-process" || warn "Workers not running"
fi

echo ""
log "Verifying services are stopped..."
echo ""

# Check ports
if netstat -tlnp 2>/dev/null | grep -q ":8001 "; then
    warn "SIB FastAPI still running on port 8001"
else
    ok "Port 8001 (SIB) is free"
fi

if netstat -tlnp 2>/dev/null | grep -q ":8000 "; then
    warn "Node.js still running on port 8000"
else
    ok "Port 8000 (Backend) is free"
fi

echo ""
log "Options:"
echo "  • Keep PostgreSQL running:  pm2 restart postgresql"
echo "  • Stop everything (PM2):    pm2 stop all"
echo "  • Delete all (PM2):         pm2 delete all"
echo ""
log "╔════════════════════════════════════════════════════╗"
log "║   SHUTDOWN COMPLETE                               ║"
log "╚════════════════════════════════════════════════════╝"
echo ""
