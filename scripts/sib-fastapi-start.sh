#!/bin/bash
# SIB FastAPI Startup Script with Port Cleanup
# This script ensures port 8001 is free before starting the FastAPI server

set -e

PORT=8001
APP_DIR="/home/ubuntu/Mediczy/ai-engine/doctor_bot"
VENV_UVICORN="$APP_DIR/venv/bin/uvicorn"

# Wait for port to be available (with timeout)
MAX_WAIT=30
WAIT_COUNT=0

echo "[$(date)] SIB FastAPI pre-start: Waiting for port $PORT to be free..."

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    # Check if port is in use
    if ! lsof -i:$PORT -t >/dev/null 2>&1; then
        echo "[$(date)] Port $PORT is free"
        break
    fi
    
    # Only try to kill on first attempt
    if [ $WAIT_COUNT -eq 0 ]; then
        echo "[$(date)] Port $PORT is in use, attempting cleanup..."
        # Kill any process using the port (except our own)
        CURRENT_PID=$$
        for PID in $(lsof -i:$PORT -t 2>/dev/null || true); do
            if [ "$PID" != "$CURRENT_PID" ]; then
                echo "[$(date)] Killing process $PID using port $PORT"
                kill -9 $PID 2>/dev/null || true
            fi
        done
    fi
    
    WAIT_COUNT=$((WAIT_COUNT + 1))
    sleep 1
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    echo "[$(date)] ERROR: Port $PORT still in use after ${MAX_WAIT}s timeout"
    exit 1
fi

# Extra pause to ensure port is fully released
sleep 2

echo "[$(date)] Starting SIB FastAPI server..."
cd "$APP_DIR"
exec $VENV_UVICORN app:app --host 0.0.0.0 --port $PORT
