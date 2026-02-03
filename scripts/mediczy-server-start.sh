#!/bin/bash
# Mediczy Server Startup Script with Port Cleanup
# This script ensures port 8000 is free before starting the Node.js server

set -e

PORT=8000
SERVER_DIR="/home/ubuntu/Mediczy/server"

echo "[$(date)] Mediczy server pre-start: Checking for stale processes on port $PORT..."

# Kill any process using the port (careful not to kill ourselves)
if sudo fuser -k $PORT/tcp 2>/dev/null; then
    echo "[$(date)] Killed stale process on port $PORT"
    sleep 2
fi

# Kill any orphaned node processes running index.js that aren't managed by PM2
for PID in $(pgrep -f "node.*index.js" 2>/dev/null || true); do
    # Check if this PID is managed by PM2 by looking at the PM2 pid files
    IS_PM2_MANAGED=false
    for PM2_PID_FILE in /home/ubuntu/.pm2/pids/mediczy-server-*.pid; do
        if [ -f "$PM2_PID_FILE" ]; then
            PM2_PID=$(cat "$PM2_PID_FILE" 2>/dev/null || echo "")
            if [ "$PID" = "$PM2_PID" ]; then
                IS_PM2_MANAGED=true
                break
            fi
        fi
    done
    
    if [ "$IS_PM2_MANAGED" = false ]; then
        echo "[$(date)] Killing orphaned node process: $PID"
        kill -9 $PID 2>/dev/null || true
    fi
done

# Brief pause to ensure port is released
sleep 1

echo "[$(date)] Starting Mediczy server..."
cd "$SERVER_DIR"
exec node index.js
