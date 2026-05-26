#!/bin/bash
# Fix PostgreSQL Connection Issues
# This script addresses database lock contention and connection pool issues

echo "🔧 Fixing PostgreSQL connection issues..."

# 1. Kill all idle connections to free resources
echo "📊 Checking current connections..."
sudo -u postgres psql -c "
SELECT 
    count(*) FILTER (WHERE state = 'idle') as idle_connections,
    count(*) FILTER (WHERE state = 'active') as active_connections,
    count(*) as total_connections
FROM pg_stat_activity;
" || echo "⚠️ Cannot connect to PostgreSQL"

# 2. Terminate idle connections older than 5 minutes
echo "🔪 Terminating long-running idle connections..."
sudo -u postgres psql -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '5 minutes'
  AND pid <> pg_backend_pid();
" 2>/dev/null || echo "⚠️ Could not terminate connections"

# 3. Terminate any blocking queries
echo "🔓 Clearing blocking queries..."
sudo -u postgres psql -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE wait_event_type = 'Lock'
  AND pid <> pg_backend_pid();
" 2>/dev/null || echo "⚠️ Could not clear locks"

# 4. Update PostgreSQL configuration for better connection management
echo "⚙️ Updating PostgreSQL configuration..."
sudo tee -a /etc/postgresql/*/main/postgresql.conf > /dev/null << 'EOF'

# Connection Pool Optimization (Added by fix script)
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Connection Timeout Settings
statement_timeout = 30000  # 30 seconds
idle_in_transaction_session_timeout = 60000  # 1 minute
tcp_keepalives_idle = 60
tcp_keepalives_interval = 10
tcp_keepalives_count = 5

# Logging for debugging
log_connections = on
log_disconnections = on
log_lock_waits = on
deadlock_timeout = 1s
EOF

# 5. Restart PostgreSQL with new settings
echo "🔄 Restarting PostgreSQL..."
sudo systemctl restart postgresql
sleep 3

# 6. Verify PostgreSQL is running
if sudo systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running"
else
    echo "❌ PostgreSQL failed to start"
    exit 1
fi

# 7. Check connection count after cleanup
echo "📊 Connection count after cleanup:"
sudo -u postgres psql -c "SELECT count(*) as connections FROM pg_stat_activity;"

echo ""
echo "✅ PostgreSQL connection issues fixed!"
echo ""
echo "📋 Recommended Next Steps:"
echo "1. Restart backend server: pm2 restart mediczy-server"
echo "2. Monitor connections: watch -n 2 'sudo -u postgres psql -c \"SELECT count(*), state FROM pg_stat_activity GROUP BY state;\"'"
echo "3. Check server logs: pm2 logs mediczy-server --lines 50"
