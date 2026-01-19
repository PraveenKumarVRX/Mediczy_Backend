# PM2 Setup for Mediczy with SIB

## ✅ Status
- PM2 installed: ✅ Yes (v6.0.14)
- SIB in PM2: ⬜ Not started yet (config ready)

## 🚀 Quick Start

### Start All Services with PM2
```bash
cd /home/ubuntu/Mediczy
pm2 start ecosystem.config.js
```

This will start:
- ✅ **mediczy-server** (Node.js, port 8000)
- ✅ **sib-fastapi** (Python FastAPI, port 8001)
- ✅ **mediczy-worker** (Background jobs)

### View Running Services
```bash
pm2 list
pm2 monit      # Real-time monitoring
pm2 logs       # View all logs
```

### Control Services
```bash
# Restart all
pm2 restart all

# Stop all
pm2 stop all

# Delete all
pm2 delete all

# Specific service
pm2 restart sib-fastapi
pm2 logs sib-fastapi
```

### Persistent Startup
```bash
# Make PM2 start on system reboot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

## 📋 Services Configuration

### mediczy-server (Node.js)
- **Port:** 8000
- **Instances:** max (auto-scaling)
- **Mode:** cluster
- **Memory limit:** 1GB
- **Status:** Auto-restart on crash

### sib-fastapi (Python)
- **Port:** 8001
- **Instances:** 1
- **Mode:** fork
- **Interpreter:** `/home/ubuntu/Mediczy/ai-engine/doctor_bot/venv/bin/python3`
- **Args:** `-m uvicorn app:app --host 0.0.0.0 --port 8001 --reload`
- **Memory limit:** 2GB
- **Status:** Auto-restart on crash

### mediczy-worker (Background Jobs)
- **Instances:** 1
- **Mode:** fork
- **Memory limit:** 500MB
- **Status:** Auto-restart on crash

## 📊 Monitoring

### Check Service Status
```bash
pm2 status
pm2 describe sib-fastapi
```

### View Logs
```bash
# All logs
pm2 logs

# Specific service
pm2 logs sib-fastapi
pm2 logs mediczy-server --lines 100

# Real-time
pm2 monit
```

### Performance
```bash
pm2 show sib-fastapi
pm2 show mediczy-server
```

## 🔄 Update & Redeploy

After code changes:
```bash
# Pull latest
git pull origin main

# Restart all services
pm2 restart all

# Or specific service
pm2 restart sib-fastapi
```

## 🛠️ Troubleshooting

### SIB Not Starting
```bash
# Check logs
pm2 logs sib-fastapi

# Verify Python environment
/home/ubuntu/Mediczy/ai-engine/doctor_bot/venv/bin/python3 --version

# Check port 8001 is free
netstat -tlnp | grep 8001
```

### Node.js Server Issues
```bash
# Check logs
pm2 logs mediczy-server

# Check port 8000
netstat -tlnp | grep 8000
```

### All Services Down
```bash
# Delete all PM2 processes
pm2 delete all

# Restart
pm2 start ecosystem.config.js

# Verify
pm2 list
```

## 📝 Logs Location

- **Node.js:** `/home/ubuntu/Mediczy/server/logs/server-*.log`
- **SIB:** `/home/ubuntu/Mediczy/ai-engine/doctor_bot/logs/sib-*.log`
- **Worker:** `/home/ubuntu/Mediczy/server/logs/worker-*.log`

## ✨ Benefits of PM2

✅ **Process Management**
- Auto-restart on crash
- Memory limit enforcement
- Clustered execution

✅ **Monitoring**
- Real-time logs
- Resource usage tracking
- Performance metrics

✅ **Deployment**
- Zero-downtime restarts
- Ecosystem configuration
- Deployment history

✅ **Reliability**
- Auto-start on system boot
- Graceful shutdown
- Health checking

## 🎯 Next Steps

1. **Start services:**
   ```bash
   pm2 start ecosystem.config.js
   ```

2. **Verify running:**
   ```bash
   pm2 list
   curl http://localhost:8001/health
   curl http://localhost:8000/health
   ```

3. **Setup auto-startup:**
   ```bash
   pm2 startup
   pm2 save
   ```

4. **Monitor:**
   ```bash
   pm2 monit
   ```

---

**Configuration file:** `/home/ubuntu/Mediczy/ecosystem.config.js`
