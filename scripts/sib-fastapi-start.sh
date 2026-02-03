#!/bin/bash
# SIB FastAPI Startup Script with Port Cleanup
# This script ensures port 8001 is free before starting the FastAPI server

set -e

PORT=8001
APP_DIR="/home/ubuntu/Mediczy/ai-engine/doctor_bot"
VENV_UVICORN="$APP_DIR/venv/bin/uvicorn"

echo "[$(date)] SIB FastAPI pre-start: Checking for stale processes on port $PORT..."

# Kill any process using the port
if sudo fuser -k $PORT/tcp 2>/dev/null; then
    echo "[$(date)] Killed stale process on port $PORT"
    sleep 2
fi

# Kill any orphaned uvicorn/python processes running our app
for PID in $(pgrep -f "uvicorn.*app:app.*8001" 2>/dev/null || true); do
    # Check if this PID is the current PM2 process
    PM2_PID_FILE="/home/ubuntu/.pm2/pids/sib-fastapi-*.pid"
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
    
    if [ "$IS_PM2_MANAGED" = false ]; then
        echo "[$(date)] Killing orphaned uvicorn process: $PID"
        kill -9 $PID 2>/dev/null || true
    fi
done

# Brief pause to ensure port is released
sleep 2

echo "[$(date)] Starting SIB FastAPI server..."
cd "$APP_DIR"
exec $VENV_UVICORN app:app --host 0.0.0.0 --port $PORT
