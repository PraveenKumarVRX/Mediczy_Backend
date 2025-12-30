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

# Restart MiroTalk video calling service
if pm2 describe mirotalk &>/dev/null; then
    echo "→ Restarting mirotalk..."
    pm2 restart mirotalk --update-env
fi

# Restart BullMQ workers if exists
if pm2 describe bullmq-workers &>/dev/null; then
    echo "→ Restarting bullmq-workers..."
    pm2 restart bullmq-workers --update-env
fi

# Restart SIB FastAPI if exists
if pm2 describe sib-fastapi &>/dev/null; then
    echo "→ Restarting sib-fastapi..."
    pm2 restart sib-fastapi --update-env
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

# Restart any other PM2 services dynamically
echo ""
echo "Checking for additional services..."
for service in $(pm2 jlist 2>/dev/null | jq -r '.[].name' 2>/dev/null); do
    case "$service" in
        mediczy-server|mirotalk|bullmq-workers|sib-fastapi|llm-orchestrator|prometheus|mediczy-backend|mediczy-frontend)
            # Already handled above
            ;;
        *)
            if pm2 describe "$service" &>/dev/null; then
                echo "→ Restarting $service..."
                pm2 restart "$service" --update-env || true
            fi
            ;;
    esac
done

echo ""
echo "✓ Restart complete!"
echo ""
echo "Current status:"
pm2 list
echo ""
echo "View logs:"
echo "  pm2 logs mediczy-server"
echo "  pm2 logs mirotalk"
echo "  pm2 monit"

# Wait for services to stabilize
sleep 3

# Quick health checks
echo ""
echo "Verifying health endpoints..."
if command -v curl >/dev/null 2>&1; then
    echo -n "→ Backend API /health: "
    curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health && echo " ✓" || echo " ✗"
    echo -n "→ Platform API /api/platform/health: "
    curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/platform/health && echo " ✓" || echo " ✗"
    echo -n "→ API v2 /api/v2/health: "
    curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v2/health && echo " ✓" || echo " ✗"
    echo -n "→ SIB API /health (8001): "
    curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:8001/health 2>/dev/null && echo " ✓" || echo " (not running)"
    echo -n "→ MiroTalk (3000): "
    curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3000/ 2>/dev/null && echo " ✓" || echo " (not running)"
else
    echo "curl not available; skip health checks"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                    ALL SERVICES RESTARTED                         ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
