#!/bin/bash
# Emergency System Recovery Script
# Use this when the system is severely overloaded

echo "🚨 EMERGENCY SYSTEM RECOVERY"
echo "=============================="

# 1. Stop all PM2 processes to reduce load
echo "⏸️  Stopping all PM2 processes..."
pm2 stop all 2>/dev/null || echo "PM2 already stopped"

# 2. Force kill PostgreSQL
echo "🔪 Force killing PostgreSQL..."
sudo pkill -9 postgres 2>/dev/null
sleep 2

# 3. Clean PostgreSQL locks and temporary files
echo "🧹 Cleaning PostgreSQL locks..."
sudo rm -f /var/run/postgresql/.s.PGSQL.* 2>/dev/null
sudo rm -f /var/lib/postgresql/*/main/postmaster.pid 2>/dev/null

# 4. Start PostgreSQL fresh
echo "🔄 Starting PostgreSQL..."
sudo systemctl start postgresql
sleep 5

# 5. Verify PostgreSQL started
if sudo systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running"
    
    # Show connection count
    echo "📊 Current connections:"
    sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null || echo "Unable to query"
else
    echo "❌ PostgreSQL failed to start!"
    echo "Check logs: sudo journalctl -u postgresql -n 50"
    exit 1
fi

# 6. Restart only the main backend server (not all services)
echo "🔄 Restarting backend server..."
pm2 restart mediczy-server 2>/dev/null || pm2 start ecosystem.config.js --only mediczy-server

sleep 5

# 7. Check server status
echo "📊 Server status:"
pm2 list 2>/dev/null | head -20

echo ""
echo "✅ Emergency recovery complete!"
echo ""
echo "If issues persist:"
echo "1. Check system resources: free -h && df -h"
echo "2. Check PostgreSQL logs: sudo tail -50 /var/log/postgresql/postgresql-*-main.log"
echo "3. Monitor connections: sudo -u postgres psql -c \"SELECT * FROM pg_stat_activity;\""
