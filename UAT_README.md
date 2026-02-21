# 🏥 Mediqzy UAT Environment - Setup Summary

Complete UAT (User Acceptance Testing) environment for Mediqzy healthcare platform.

---

## 📊 Environment Details

| Property | Value |
|----------|-------|
| **Server** | AWS EC2 t3.large |
| **IP Address** | 16.112.137.160 |
| **Region** | ap-south-2 (Hyderabad) |
| **RAM** | 8GB |
| **vCPUs** | 2 |
| **OS** | Ubuntu 22.04 LTS |
| **Purpose** | User Acceptance Testing |

---

## 🚀 Quick Start (For New UAT Server)

### Option 1: Automated Setup (Recommended)

```bash
# 1. SSH into server
ssh -i your-key.pem ubuntu@16.112.137.160

# 2. Download and run quick setup script
cd /home/ubuntu/Mediczy
sudo bash uat-quick-setup.sh

# This installs:
# ✓ Node.js 20.x
# ✓ PostgreSQL 16 + PgBouncer
# ✓ Redis
# ✓ Nginx
# ✓ Python 3.11
# ✓ PM2

# 3. Follow the NEXT_STEPS.txt file created by the script
cat /home/ubuntu/NEXT_STEPS.txt
```

### Option 2: Manual Setup

Follow the comprehensive guide: **[UAT_DEPLOYMENT_GUIDE.md](UAT_DEPLOYMENT_GUIDE.md)**

---

## 📱 What's Deployed

### Web Application
- **Frontend:** React + Vite (Patient Portal, Doctor Dashboard, Admin Console)
- **Backend:** Node.js + Express REST API
- **Real-time:** Socket.io WebSocket server
- **Mobile API:** REST endpoints optimized for mobile apps

### Services
- **PostgreSQL 16:** Primary database
- **Redis:** Cache and session storage
- **PgBouncer:** Connection pooling
- **Nginx:** Reverse proxy and static file serving
- **AI Service:** Python FastAPI with ClinicalBERT models

---

## 🌐 Access URLs

| Service | URL | Status |
|---------|-----|--------|
| **Web App** | http://16.112.137.160 | 🟢 Public |
| **API** | http://16.112.137.160/api | 🟢 Public |
| **Mobile API** | http://16.112.137.160/api/mobile | 🟢 Public |
| **Health Check** | http://16.112.137.160/health | 🟢 Public |
| **Video Server** | wss://video.mediqzy.com | 🟢 Shared (Production) |

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[UAT_DEPLOYMENT_GUIDE.md](UAT_DEPLOYMENT_GUIDE.md)** | Complete step-by-step deployment instructions |
| **[UAT_DEPLOYMENT_CHECKLIST.md](UAT_DEPLOYMENT_CHECKLIST.md)** | Verification checklist for deployment |
| **[docs/api/MOBILE_API_VIDEO_CONSULTATION.md](docs/api/MOBILE_API_VIDEO_CONSULTATION.md)** | Mobile API documentation (includes UAT endpoints) |

---

## 🛠️ Management Scripts

Located in `/home/ubuntu/Mediczy/`:

| Script | Command | Purpose |
|--------|---------|---------|
| **Start** | `./uat-start.sh` | Start all UAT services |
| **Stop** | `./uat-stop.sh` | Stop all UAT services |
| **Restart** | `./uat-restart.sh` | Restart all UAT services |
| **Status** | `./uat-status.sh` | Check status of all services |
| **Logs** | `./uat-logs.sh [service]` | View service logs |

---

## 🔐 Configuration Files

### Backend Environment
- **File:** `/home/ubuntu/Mediczy/server/.env.uat`
- **Contains:** Database credentials, API keys, JWT secrets
- **Security:** `chmod 600` (read/write owner only)

### Frontend Environment
- **File:** `/home/ubuntu/Mediczy/client/.env.uat`
- **Contains:** Public API URLs, feature flags, public keys

### PM2 Process Config
- **File:** `/home/ubuntu/Mediczy/ecosystem.uat.config.js`
- **Manages:** Backend server, AI service, background worker

---

## 💾 Memory Optimization (8GB RAM)

| Service | Production | UAT | Optimization |
|---------|-----------|-----|--------------|
| Backend | 667MB (2 instances) | 512MB (1 instance) | Single instance + heap limit |
| AI Service | 1.9GB | 1.8GB | Memory restart limit |
| PostgreSQL | Dynamic | 512MB | `shared_buffers=256MB` |
| Redis | 18MB | 128MB | `maxmemory=128mb` |
| Worker | 98MB | 0MB | On-demand only |
| n8n | 281MB | Disabled | Not needed for UAT |

**Total:** ~4GB baseline, leaving 4GB for testing workload

---

## ✅ Testing Workflow

### Sequential Testing (Recommended for 8GB)

```
Test Feature A → Clear Cache → Test Feature B → Restart → Test Feature C
```

This approach prevents memory buildup during intensive testing.

### Test Accounts

Create test users for each role:
- **Admin:** `uat.admin@mediqzy.com`
- **Doctor:** `uat.doctor@mediqzy.com`
- **Patient:** `uat.patient@mediqzy.com`

---

## 📊 Monitoring

### Health Checks

```bash
# Backend API
curl http://16.112.137.160/api/health

# AI Service
curl http://16.112.137.160/ai/health

# Database
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 -c "SELECT 1;"
```

### System Resources

```bash
# Memory usage
free -h

# Disk usage
df -h /

# Service status
./uat-status.sh

# Real-time monitoring
pm2 monit
```

---

## 🐛 Common Issues & Solutions

### Services Not Starting
```bash
pm2 logs --lines 50
./uat-restart.sh
```

### Out of Memory
```bash
pm2 restart mediqzy-uat-ai  # Restart AI service (largest)
sudo sync && sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
```

### Database Connection Issues
```bash
sudo systemctl status postgresql@16-main
sudo systemctl status pgbouncer
sudo systemctl restart pgbouncer
```

### Nginx 502 Error
```bash
curl http://localhost:8000/api/health  # Check if backend is running
sudo tail -f /var/log/nginx/error.log
sudo systemctl restart nginx
```

---

## 📋 Deployment Checklist

Before going live with UAT:

- [ ] All services installed and configured
- [ ] Database setup complete with schema imported
- [ ] Environment variables configured (`.env.uat`)
- [ ] Frontend built and deployed
- [ ] All services started and healthy
- [ ] External access verified
- [ ] Test accounts created
- [ ] Team notified with access details
- [ ] Documentation shared
- [ ] Monitoring enabled

**Use [UAT_DEPLOYMENT_CHECKLIST.md](UAT_DEPLOYMENT_CHECKLIST.md) for detailed verification.**

---

## 🔄 Update Procedure

To deploy code updates:

```bash
cd /home/ubuntu/Mediczy

# Pull latest code
git pull origin main

# Update backend
cd server
npm install
cd ..

# Rebuild frontend
cd client
npm install
npm run build
cd ..

# Restart services
./uat-restart.sh

# Verify
./uat-status.sh
```

---

## 🗃️ Backup & Recovery

### Create Backup
```bash
# Database backup
pg_dump -U mediqzy_uat -h localhost -p 6432 mediqzy_uat > \
  /home/ubuntu/backups/uat-$(date +%Y%m%d-%H%M%S).sql

# Application code backup
tar -czf /home/ubuntu/backups/mediczy-$(date +%Y%m%d).tar.gz \
  /home/ubuntu/Mediczy
```

### Restore Backup
```bash
# Restore database
psql -U mediqzy_uat -h localhost -p 6432 mediqzy_uat < \
  /home/ubuntu/backups/uat-20260221-120000.sql
```

---

## 🎯 Next Steps (Optional Enhancements)

1. **Setup Domain:** Point `uat.mediqzy.com` → `16.112.137.160`
2. **Enable SSL:** Install Let's Encrypt certificate → HTTPS
3. **CloudWatch:** Setup AWS monitoring and alerts
4. **Backups:** Automate daily database backups
5. **CI/CD:** Setup automated deployment pipeline
6. **Load Testing:** Simulate concurrent user load

---

## 📞 Support & Contacts

### For Deployment Issues
- Check logs: `./uat-logs.sh`
- Review guide: `UAT_DEPLOYMENT_GUIDE.md`
- System status: `./uat-status.sh`

### For Application Issues
- Backend logs: `pm2 logs mediqzy-uat-server`
- AI service logs: `pm2 logs mediqzy-uat-ai`
- Nginx logs: `sudo tail -f /var/log/nginx/error.log`

### Emergency Recovery
```bash
# Full restart
./uat-stop.sh
sudo systemctl restart postgresql@16-main redis-server nginx
./uat-start.sh
```

---

## 📈 Performance Benchmarks

Expected performance on t3.large (8GB RAM):

| Metric | Target | Notes |
|--------|--------|-------|
| **Concurrent Users** | 20-30 | Sequential testing recommended |
| **API Response Time** | < 500ms | For standard endpoints |
| **Page Load Time** | < 2s | First contentful paint |
| **Memory Usage** | < 6.5GB | Leaving 1.5GB headroom |
| **CPU Usage** | < 70% | Average under normal load |

---

## 🎉 UAT Environment Status

```
┌─────────────────────────────────────────┐
│     MEDIQZY UAT ENVIRONMENT READY       │
├─────────────────────────────────────────┤
│  🌐 Web:    http://16.112.137.160       │
│  📱 API:    http://16.112.137.160/api   │
│  🎥 Video:  wss://video.mediqzy.com     │
│  💾 RAM:    8GB                         │
│  🔧 Status: http://16.112.137.160/health│
└─────────────────────────────────────────┘
```

**Ready for User Acceptance Testing!** 🚀

---

_Last Updated: February 21, 2026_  
_Maintained by: DevOps Team_
