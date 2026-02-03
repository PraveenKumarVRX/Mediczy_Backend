#!/bin/bash
# n8n Startup Script with Port Cleanup
# Ensures port 5678 is free before starting

set -e

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
