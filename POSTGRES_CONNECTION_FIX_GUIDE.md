# PostgreSQL Connection Pool Fix Guide

## Problem Overview

**Symptoms**:

- Database queries hanging indefinitely
- Commands like `psql` becoming unresponsive
- System appearing frozen or extremely slow
- "Too many connections" errors in logs

**Root Causes**:

1. **Connection Pool Exhaustion**: Too many active database connections
2. **Lock Contention**: Multiple queries waiting on locks
3. **Idle Connections**: Connections not being released back to pool
4. **Memory Pressure**: PostgreSQL consuming excessive memory

---

## Immediate Fix (Emergency Recovery)

### Step 1: Run Emergency Restart Script

```bash
cd /home/ubuntu/Mediczy
chmod +x emergency-restart.sh
sudo ./emergency-restart.sh
```

This script will:

- Stop all PM2 processes
- Force kill PostgreSQL
- Clean up lock files
- Restart PostgreSQL cleanly
- Restart only the main backend server

### Step 2: Verify System is Healthy

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection count (should be low)
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check server is responding
curl -s http://localhost:8888/api/doctors | head -5
```

---

## Long-term Fix (Prevent Recurrence)

### Step 1: Optimize PostgreSQL Configuration

```bash
chmod +x fix-postgres-connections.sh
sudo ./fix-postgres-connections.sh
```

This updates PostgreSQL settings:

- `max_connections = 200` (increased from default 100)
- `idle_in_transaction_session_timeout = 60000` (kills idle transactions after 1 min)
- `statement_timeout = 30000` (kills long queries after 30 seconds)
- Connection keepalive settings to detect dead connections

### Step 2: Code Changes (Already Applied)

**File**: `server/db/postgres.js`

Updated connection pool settings:

```javascript
max: 5,  // Reduced from 10 to prevent connection exhaustion
min: 1,  // Keep at least 1 connection warm
idleTimeoutMillis: 10000,  // Release idle connections after 10s
statement_timeout: 30000,  // Kill long queries
connectionTimeoutMillis: 5000,  // Timeout connection attempts
```

### Step 3: Restart Server with New Settings

```bash
pm2 restart mediczy-server
pm2 save
```

---

## Monitoring & Prevention

### Monitor Connections in Real-Time

```bash
# Watch connection count every 2 seconds
watch -n 2 'sudo -u postgres psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"'
```

Expected output:

```
 count |        state
-------+---------------------
     1 | active             # Currently running query
     2 | idle               # Waiting for next query
     1 |                    # Background processes
```

### Check for Locks and Blocking Queries

```bash
sudo -u postgres psql -c "
SELECT
    pid,
    usename,
    application_name,
    state,
    wait_event_type,
    wait_event,
    state_change
FROM pg_stat_activity
WHERE wait_event_type = 'Lock'
ORDER BY state_change;
"
```

### Kill Specific Blocking Query

If you find a blocking query:

```bash
sudo -u postgres psql -c "SELECT pg_terminate_backend(PID_HERE);"
```

### Automated Connection Cleanup

Add to crontab to run every 15 minutes:

```bash
# Edit crontab
crontab -e

# Add this line:
*/15 * * * * sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < NOW() - INTERVAL '10 minutes' AND pid <> pg_backend_pid();" > /dev/null 2>&1
```

---

## Architecture Improvements

### 1. Connection Pool Per Service

Instead of sharing one pool, each service should have its own:

**Current** (Single pool):

```
mediczy-server (fork mode, 1 instance) → 5 connections
```

**Better** (Multiple pools):

```
mediczy-server instance 1 → Pool (max: 3)
mediczy-server instance 2 → Pool (max: 3)
mediczy-worker → Pool (max: 2)
sib-fastapi → Pool (max: 2)
```

### 2. Read Replicas for Heavy Queries

For analytics and reporting queries, use PostgreSQL read replicas to offload the primary database.

### 3. Connection Pooler (PgBouncer)

Install PgBouncer as a lightweight connection pooler:

```bash
# Install PgBouncer
sudo apt-get install pgbouncer -y

# Configure /etc/pgbouncer/pgbouncer.ini
[databases]
mediczy_ai = host=127.0.0.1 port=5432 dbname=mediczy_ai

[pgbouncer]
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20

# Restart
sudo systemctl restart pgbouncer
```

Then update `server/.env`:

```env
POSTGRES_PORT=6432  # PgBouncer port instead of 5432
```

---

## Troubleshooting

### Issue: PostgreSQL Won't Start

```bash
# Check logs
sudo journalctl -u postgresql -n 100

# Common fixes:
sudo rm /var/lib/postgresql/*/main/postmaster.pid
sudo systemctl start postgresql
```

### Issue: "Too Many Connections" Error

```bash
# Temporarily increase max_connections
sudo -u postgres psql -c "ALTER SYSTEM SET max_connections = 300;"
sudo systemctl restart postgresql
```

### Issue: Slow Queries

```bash
# Enable slow query logging
sudo -u postgres psql -c "ALTER SYSTEM SET log_min_duration_statement = 1000;"  # Log queries > 1s
sudo systemctl reload postgresql

# View slow queries
sudo tail -f /var/log/postgresql/postgresql-*-main.log | grep "duration:"
```

---

## Performance Tuning

### PostgreSQL Memory Settings

Edit `/etc/postgresql/*/main/postgresql.conf`:

```ini
# For 8GB RAM system
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB

# For 4GB RAM system
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 8MB
maintenance_work_mem = 256MB
```

### Index Optimization

Check for missing indexes:

```sql
-- Find tables with sequential scans
SELECT schemaname, tablename, seq_scan, seq_tup_read
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_tup_read DESC
LIMIT 10;
```

---

## Quick Reference Commands

```bash
# Emergency restart
sudo ./emergency-restart.sh

# Fix connections
sudo ./fix-postgres-connections.sh

# Check connection count
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill all idle connections
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND pid <> pg_backend_pid();"

# Restart everything cleanly
pm2 stop all && sudo systemctl restart postgresql && sleep 5 && pm2 start ecosystem.config.js

# Monitor in real-time
watch -n 2 'sudo -u postgres psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"'
```

---

## Summary of Changes Made

1. ✅ **Created emergency restart script** - Quickly recover from critical states
2. ✅ **Created connection fix script** - Optimize PostgreSQL settings
3. ✅ **Reduced connection pool size** - From 10 to 5 max connections per instance
4. ✅ **Added aggressive timeouts** - 30s query timeout, 10s idle timeout
5. ✅ **Minimum pool connections** - Keep 1 connection warm instead of 0
6. ✅ **Added query_timeout** - Additional safeguard against hanging queries

**Before**: Server could create up to 10 connections and hold them for 30+ seconds idle
**After**: Server creates max 5 connections and releases them after 10 seconds idle

This should prevent connection exhaustion and lock contention issues!
