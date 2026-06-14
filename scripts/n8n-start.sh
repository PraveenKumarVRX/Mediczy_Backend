#!/bin/bash
# n8n Startup Script with Port Cleanup
# Ensures port 5678 is free before starting

set -e

# Load n8n environment configuration from ~/.n8n/.env
if [ -f "$HOME/.n8n/.env" ]; then
    echo "[$(date)] Loading n8n configuration from $HOME/.n8n/.env"
    set -a  # Export all variables
    source "$HOME/.n8n/.env"
    set +a  # Unset it again
else
    echo "[$(date)] WARNING: n8n config file not found at $HOME/.n8n/.env"
fi

# Force DB_TYPE=sqlite regardless of any PM2-cached env vars.
# n8n's database.sqlite is at ~/.n8n/database.sqlite (pre-existing).
export DB_TYPE=sqlite
unset DB_POSTGRESDB_HOST DB_POSTGRESDB_PORT DB_POSTGRESDB_DATABASE DB_POSTGRESDB_USER DB_POSTGRESDB_PASSWORD DB_POSTGRESDB_SCHEMA DB_POSTGRESDB_SSL

# Trust proxy so rate limiter honors X-Forwarded-For behind Cloudflare/Nginx.
export N8N_TRUST_PROXY=true

# Public URLs for editor/telemetry so browser does not target localhost.
export N8N_HOST=n8n.mediqzy.com
export N8N_PROTOCOL=https
export N8N_EDITOR_BASE_URL=https://n8n.mediqzy.com
export WEBHOOK_URL=https://n8n.mediqzy.com/

N8N_PORT=5678
N8N_BIN="/usr/bin/n8n"

echo "[$(date)] n8n pre-start: Checking for stale processes on port $N8N_PORT..."

# Kill any process using the port
if sudo fuser -k $N8N_PORT/tcp 2>/dev/null; then
    echo "[$(date)] Killed stale process on port $N8N_PORT"
    sleep 2
fi

# Kill orphaned n8n processes
for PID in $(pgrep -f "n8n" 2>/dev/null || true); do
    # Check if this is our PM2 managed process
    PM2_PID_FILE="/home/ubuntu/.pm2/pids/n8n-*.pid"
    IS_PM2_MANAGED=false
    
    for PF in $PM2_PID_FILE; do
        if [ -f "$PF" ]; then
            PM2_PID=$(cat "$PF" 2>/dev/null || echo "")
            if [ "$PID" = "$PM2_PID" ]; then
                IS_PM2_MANAGED=true
                break
            fi
        fi
    done
    
    if [ "$IS_PM2_MANAGED" = false ] && [ "$PID" != "$$" ]; then
        echo "[$(date)] Killing orphaned n8n process: $PID"
        kill -9 $PID 2>/dev/null || true
    fi
done

# Brief pause to ensure port is released
sleep 2

echo "[$(date)] Starting n8n..."
exec $N8N_BIN start
