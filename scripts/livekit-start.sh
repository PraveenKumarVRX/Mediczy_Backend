#!/bin/bash
# LiveKit Server Startup Script with Port Cleanup
# This script ensures ports 7880 and 7881 are free before starting LiveKit

set -e

LIVEKIT_BIN="/usr/local/bin/livekit-server"
CONFIG_FILE="/home/ubuntu/livekit-config.yaml"
PORTS="7880 7881"

echo "[$(date)] LiveKit pre-start: Checking for stale processes..."

# Kill any process using LiveKit ports (except our own)
for PORT in $PORTS; do
    if sudo fuser -k $PORT/tcp 2>/dev/null; then
        echo "[$(date)] Killed stale process on port $PORT"
        sleep 1
    fi
done

# Also kill any orphaned livekit-server processes not managed by PM2
CURRENT_PID=$$
for PID in $(pgrep -f "livekit-server" 2>/dev/null || true); do
    # Don't kill ourselves or our parent
    if [ "$PID" != "$CURRENT_PID" ] && [ "$PID" != "$PPID" ]; then
        echo "[$(date)] Killing orphaned livekit-server process: $PID"
        sudo kill -9 $PID 2>/dev/null || true
    fi
done

# Brief pause to ensure ports are released
sleep 2

echo "[$(date)] Starting LiveKit server..."
exec $LIVEKIT_BIN --config $CONFIG_FILE
