# Production Server Management Scripts

## Quick Reference

```bash
# Start the server
./start.sh

# Stop the server
./stop.sh

# Restart the server
./restart.sh
```

## Scripts Overview

### 🚀 start.sh
Starts the Mediczy API server in production mode.

**Features:**
- ✅ Checks for already running instances
- ✅ Auto-starts SSH tunnel to database if needed
- ✅ Runs server in background with nohup
- ✅ Creates PID file for process management
- ✅ Logs output to `logs/server.log`
- ✅ Logs errors to `logs/server-error.log`
- ✅ Shows recent log output on startup

**Usage:**
```bash
./start.sh
```

**Environment:**
- Sets `NODE_ENV=production`
- Uses configuration from `server/.env`

**Logs Location:**
- Standard output: `./logs/server.log`
- Error output: `./logs/server-error.log`

### 🛑 stop.sh
Gracefully stops the running server.

**Features:**
- ✅ Graceful shutdown with SIGTERM
- ✅ 10-second timeout before force kill
- ✅ Cleans up PID file
- ✅ Detects and offers to kill orphaned processes
- ✅ Optionally stops database SSH tunnel

**Usage:**
```bash
./stop.sh
```

**Shutdown Process:**
1. Sends SIGTERM for graceful shutdown
2. Waits up to 10 seconds
3. Force kills (SIGKILL) if still running
4. Removes PID file
5. Offers to stop SSH tunnel

### 🔄 restart.sh
Restarts the server (stop + start).

**Features:**
- ✅ Detects current server state
- ✅ Stops running instance gracefully
- ✅ Starts fresh instance
- ✅ Clear status reporting

**Usage:**
```bash
./restart.sh
```

## Common Operations

### Check Server Status
```bash
# Check if server is running
if [ -f server.pid ]; then
  PID=$(cat server.pid)
  if ps -p $PID > /dev/null; then
    echo "Server is running (PID: $PID)"
  else
    echo "Server is not running (stale PID file)"
  fi
else
  echo "Server is not running"
fi
```

### View Real-time Logs
```bash
# Standard logs
tail -f logs/server.log

# Error logs
tail -f logs/server-error.log

# Both logs
tail -f logs/server.log logs/server-error.log
```

### Monitor Server Process
```bash
# Check process details
PID=$(cat server.pid)
ps aux | grep $PID

# Monitor resource usage
top -p $PID

# Check listening ports
netstat -tulpn | grep $PID
```

### Database SSH Tunnel Management
```bash
# Check tunnel status
ps aux | grep "[s]sh.*5433"

# Manual tunnel start
./connect-ec2-db.sh

# Manual tunnel stop
pkill -f "ssh.*5433"
```

## Deployment Workflow

### Initial Deployment
```bash
# 1. Clone repository
# 2. Install dependencies
cd server && npm install

# 3. Configure environment
cp .env.example .env
nano .env  # Update with production values

# 4. Start SSH tunnel to database
./connect-ec2-db.sh

# 5. Start server
./start.sh
```

### Code Updates
```bash
# 1. Pull latest changes
git pull origin main

# 2. Update dependencies (if needed)
cd server && npm install

# 3. Restart server
cd ..
./restart.sh
```

### Health Checks
```bash
# Check API health endpoint
curl http://localhost:3000/v1/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   "timestamp": "2026-02-06T17:45:00.000Z"
# }
```

## Troubleshooting

### Server Won't Start

**Check logs:**
```bash
tail -50 logs/server-error.log
```

**Common issues:**
- Database connection failed → Check SSH tunnel is running
- Port already in use → Check for orphaned processes
- Permission denied → Check file permissions

### Server Won't Stop

**Force kill:**
```bash
# Find process
ps aux | grep node

# Kill by PID
kill -9 <PID>

# Clean up
rm -f server.pid
```

### Database Connection Issues

**Test database connection:**
```bash
./test-db-connection.sh
```

**Restart SSH tunnel:**
```bash
# Stop tunnel
pkill -f "ssh.*5433"

# Start tunnel
./connect-ec2-db.sh

# Wait 2 seconds
sleep 2

# Test connection
./test-db-connection.sh
```

### High Memory Usage

**Check process memory:**
```bash
PID=$(cat server.pid)
ps -p $PID -o %mem,rss,vsz
```

**Restart to clear memory:**
```bash
./restart.sh
```

## Production Best Practices

### 1. Use Process Manager (Recommended)
For production, consider using PM2 instead of these scripts:

```bash
# Install PM2
npm install -g pm2

# Start with PM2
cd server
pm2 start npm --name "mediczy-api" -- start

# Auto-restart on reboot
pm2 startup
pm2 save

# Monitor
pm2 monit
pm2 logs mediczy-api
```

### 2. Set Up Monitoring
- Configure log rotation
- Set up uptime monitoring
- Configure alerting for errors
- Monitor database connections

### 3. Enable HTTPS
- Use reverse proxy (nginx)
- Configure SSL certificates
- Redirect HTTP to HTTPS

### 4. Database Backups
- Schedule regular database backups
- Test restore procedures
- Store backups off-site

### 5. Environment Variables
- Never commit `.env` to git
- Use environment-specific configs
- Rotate secrets regularly

## File Locations

```
/workspaces/Mediczy/
├── start.sh              # Start script
├── stop.sh               # Stop script
├── restart.sh            # Restart script
├── server.pid            # Process ID (created at runtime)
├── logs/
│   ├── server.log        # Standard output
│   └── server-error.log  # Error output
└── server/
    ├── index.js          # Server entry point
    ├── .env              # Environment configuration
    └── package.json      # Dependencies
```

## Support

For issues or questions:
- Check logs: `tail -f logs/server.log`
- Check errors: `tail -f logs/server-error.log`
- Review documentation: `README.md`
- Contact: DevOps team

---

**Created:** February 6, 2026  
**Version:** 1.0.0  
**Environment:** Production
