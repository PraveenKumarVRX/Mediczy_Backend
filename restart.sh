#!/bin/bash
# Restart Mediczy Production Server
# Loads production environment and restarts PM2 processes

set -e

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                                                                   ║"
echo "║         MEDICZY SERVER RESTART                                    ║"
echo "║                                                                   ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Load environment variables (prefer root .env, then production/local fallbacks)
if [ -f ".env" ]; then
    echo "✓ Loading environment from project root (.env)..."
    set -a
    source .env
    set +a
elif [ -f ".env.production.local" ]; then
    echo "✓ Loading production environment (.env.production.local)..."
    set -a
    source .env.production.local
    set +a
elif [ -f "server/.env" ]; then
    echo "✓ Loading server environment (server/.env)..."
    set -a
    source server/.env
    set +a
else
    echo "⚠ Warning: No environment file found, using current environment"
fi

echo ""
echo "Restarting services..."
echo ""

# Restart main server
if pm2 describe mediczy-server &>/dev/null; then
    echo "→ Restarting mediczy-server..."
    pm2 restart mediczy-server --update-env
else
    echo "⚠ mediczy-server not found in PM2"
fi

# Restart BullMQ workers if exists
if pm2 describe bullmq-workers &>/dev/null; then
    echo "→ Restarting bullmq-workers..."
    pm2 restart bullmq-workers --update-env
fi

# Restart LLM orchestrator if exists
if pm2 describe llm-orchestrator &>/dev/null; then
    echo "→ Restarting llm-orchestrator..."
    pm2 restart llm-orchestrator --update-env
fi

# Restart Prometheus if exists
if pm2 describe prometheus &>/dev/null; then
    echo "→ Restarting prometheus..."
    pm2 restart prometheus --update-env || true
fi

# Restart backend if exists
if pm2 describe mediczy-backend &>/dev/null; then
    echo "→ Restarting mediczy-backend..."
    pm2 restart mediczy-backend --update-env
fi

# Restart frontend if exists
if pm2 describe mediczy-frontend &>/dev/null; then
    echo "→ Restarting mediczy-frontend..."
    pm2 restart mediczy-frontend --update-env
fi

echo ""
echo "✓ Restart complete!"
echo ""
echo "Current status:"
pm2 list | grep mediczy || pm2 list
echo ""
echo "View logs:"
echo "  pm2 logs mediczy-server"
echo "  pm2 monit"

# Quick health checks
echo ""
echo "Verifying health endpoints..."
if command -v curl >/dev/null 2>&1; then
    echo "→ API /health"
    curl -s http://localhost:8000/health | sed 's/{.*}/OK/g' || true
    echo "→ API /api/db/health"
    curl -s http://localhost:8000/api/db/health | sed 's/{.*}/OK/g' || true
else
    echo "curl not available; skip health checks"
fi
