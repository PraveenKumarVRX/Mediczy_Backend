#!/bin/bash

# Production Server Management Script for mayden.in
# Provides commands to manage the production deployment

show_usage() {
    echo "Mediczy Production Management Script"
    echo "Usage: $0 {start|stop|restart|status|logs|deploy|backup}"
    echo ""
    echo "Commands:"
    echo "  start    - Start backend server"
    echo "  stop     - Stop backend server"
    echo "  restart  - Restart backend server"
    echo "  status   - Show server status"
    echo "  logs     - Show backend logs"
    echo "  deploy   - Full deployment (build + deploy)"
    echo "  backup   - Create backup of current deployment"
    exit 1
}

PROJECT_ROOT="/root/Mediczy"
WEB_ROOT="/var/www/mayden"
LOG_FILE="/var/log/mediczy-backend.log"

start_server() {
    echo "🚀 Starting Mediczy backend server..."
    cd "$PROJECT_ROOT/server"
    
    # Check if already running
    if pgrep -f "node.*index.js" > /dev/null; then
        echo "⚠️  Server is already running"
        return 0
    fi
    
    # Start server
    nohup node index.js > "$LOG_FILE" 2>&1 &
    sleep 2
    
    if pgrep -f "node.*index.js" > /dev/null; then
        echo "✅ Server started successfully"
        echo "📊 PID: $(pgrep -f 'node.*index.js')"
    else
        echo "❌ Failed to start server"
        exit 1
    fi
}

stop_server() {
    echo "🛑 Stopping Mediczy backend server..."
    
    if ! pgrep -f "node.*index.js" > /dev/null; then
        echo "⚠️  Server is not running"
        return 0
    fi
    
    pkill -f "node.*index.js"
    sleep 2
    
    if ! pgrep -f "node.*index.js" > /dev/null; then
        echo "✅ Server stopped successfully"
    else
        echo "❌ Failed to stop server gracefully, using force kill..."
        pkill -9 -f "node.*index.js"
        echo "✅ Server force stopped"
    fi
}

restart_server() {
    echo "🔄 Restarting Mediczy backend server..."
    stop_server
    start_server
}

show_status() {
    echo "📊 Mediczy Production Status"
    echo "=========================="
    
    # Backend status
    if pgrep -f "node.*index.js" > /dev/null; then
        PID=$(pgrep -f "node.*index.js")
        echo "🟢 Backend: RUNNING (PID: $PID)"
    else
        echo "🔴 Backend: STOPPED"
    fi
    
    # Nginx status
    if systemctl is-active --quiet nginx; then
        echo "🟢 Nginx: RUNNING"
    else
        echo "🔴 Nginx: STOPPED"
    fi
    
    # SSL certificate status
    if [ -f "/etc/nginx/ssl/mayden.in.crt" ]; then
        echo "🟢 SSL: INSTALLED"
        
        # Check certificate expiry
        EXPIRY=$(openssl x509 -in "/etc/nginx/ssl/mayden.in.crt" -noout -enddate 2>/dev/null | cut -d= -f2)
        if [ -n "$EXPIRY" ]; then
            echo "📅 SSL Expires: $EXPIRY"
        fi
    else
        echo "🟡 SSL: NOT INSTALLED"
    fi
    
    # Disk space
    echo "💾 Disk Usage:"
    df -h / | tail -n 1 | awk '{print "   Root: "$3" used / "$2" total ("$5" used)"}'
    
    # Memory usage
    echo "🧠 Memory Usage:"
    free -h | grep "Mem:" | awk '{print "   RAM: "$3" used / "$2" total"}'
}

show_logs() {
    echo "📜 Mediczy Backend Logs (last 50 lines)"
    echo "======================================="
    
    if [ -f "$LOG_FILE" ]; then
        tail -50 "$LOG_FILE"
        echo ""
        echo "📋 To follow live logs: tail -f $LOG_FILE"
    else
        echo "⚠️  Log file not found: $LOG_FILE"
    fi
}

deploy() {
    echo "🚀 Running full deployment..."
    
    if [ -x "$PROJECT_ROOT/deploy-production.sh" ]; then
        "$PROJECT_ROOT/deploy-production.sh"
    else
        echo "❌ Deploy script not found or not executable"
        exit 1
    fi
}

backup() {
    BACKUP_DIR="/var/backups/mediczy"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    
    echo "📦 Creating backup..."
    
    sudo mkdir -p "$BACKUP_DIR"
    
    # Backup web files
    sudo tar -czf "$BACKUP_DIR/web-$TIMESTAMP.tar.gz" -C "/var/www" "mayden" 2>/dev/null || true
    
    # Backup configuration
    sudo tar -czf "$BACKUP_DIR/config-$TIMESTAMP.tar.gz" "/etc/nginx/sites-available/mayden" "/root/Mediczy/.env" 2>/dev/null || true
    
    echo "✅ Backup completed:"
    echo "   Web files: $BACKUP_DIR/web-$TIMESTAMP.tar.gz"
    echo "   Config: $BACKUP_DIR/config-$TIMESTAMP.tar.gz"
    
    # Show backup directory contents
    echo ""
    echo "📂 Available backups:"
    ls -la "$BACKUP_DIR/" 2>/dev/null || echo "   No previous backups found"
}

# Main script logic
case "${1:-}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    deploy)
        deploy
        ;;
    backup)
        backup
        ;;
    *)
        show_usage
        ;;
esac