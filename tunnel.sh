#!/bin/bash
# Manage SSH Tunnel to EC2 PostgreSQL
# Secure connection: localhost:5433 -> EC2 (13.234.17.52):5432

EC2_HOST="13.234.17.52"
EC2_USER="ubuntu"
SSH_KEY="/workspaces/Mediczy/.venv/bin/mediqzy.pem"
LOCAL_PORT=5433
REMOTE_PORT=5432

check_tunnel() {
    pgrep -f "ssh.*${LOCAL_PORT}:localhost:${REMOTE_PORT}" > /dev/null
    return $?
}

start_tunnel() {
    if check_tunnel; then
        echo "✅ SSH tunnel already running"
        return 0
    fi
    
    echo "🔐 Starting SSH tunnel: localhost:${LOCAL_PORT} -> ${EC2_HOST}:${REMOTE_PORT}"
    
    ssh -f -N -L ${LOCAL_PORT}:localhost:${REMOTE_PORT} \
        -i "$SSH_KEY" \
        -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3 \
        ${EC2_USER}@${EC2_HOST}
    
    if [ $? -eq 0 ]; then
        echo "✅ SSH tunnel started successfully"
        return 0
    else
        echo "❌ Failed to start SSH tunnel"
        return 1
    fi
}

stop_tunnel() {
    if ! check_tunnel; then
        echo "⚠️  SSH tunnel is not running"
        return 0
    fi
    
    echo "🛑 Stopping SSH tunnel..."
    pkill -f "ssh.*${LOCAL_PORT}:localhost:${REMOTE_PORT}"
    
    if [ $? -eq 0 ]; then
        echo "✅ SSH tunnel stopped"
        return 0
    else
        echo "❌ Failed to stop SSH tunnel"
        return 1
    fi
}

status_tunnel() {
    if check_tunnel; then
        PID=$(pgrep -f "ssh.*${LOCAL_PORT}:localhost:${REMOTE_PORT}")
        echo "✅ SSH tunnel is running (PID: $PID)"
        echo "   localhost:${LOCAL_PORT} -> ${EC2_HOST}:${REMOTE_PORT}"
        return 0
    else
        echo "❌ SSH tunnel is not running"
        return 1
    fi
}

restart_tunnel() {
    echo "🔄 Restarting SSH tunnel..."
    stop_tunnel
    sleep 1
    start_tunnel
}

case "${1:-start}" in
    start)
        start_tunnel
        ;;
    stop)
        stop_tunnel
        ;;
    status)
        status_tunnel
        ;;
    restart)
        restart_tunnel
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        echo ""
        echo "Commands:"
        echo "  start   - Start SSH tunnel (default)"
        echo "  stop    - Stop SSH tunnel"
        echo "  status  - Check tunnel status"
        echo "  restart - Restart SSH tunnel"
        exit 1
        ;;
esac

exit $?
