# 🚀 Mediqzy UAT Environment Deployment Guide

Complete guide for deploying the full Mediqzy application stack to UAT environment for User Acceptance Testing.

**UAT Server:** AWS t3.large (2 vCPU, 8GB RAM)  
**IP Address:** 16.112.137.160  
**Region:** ap-south-2 (Hyderabad)  
**Last Updated:** February 21, 2026

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Server Setup](#server-setup)
4. [Application Deployment](#application-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Service Management](#service-management)
7. [Testing & Verification](#testing--verification)
8. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

### UAT Stack Components

```
┌─────────────────────────────────────────────────────────┐
│                  UAT Environment (8GB RAM)               │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + Vite)                                 │
│  ├─ Patient Portal                                       │
│  ├─ Doctor Dashboard                                     │
│  └─ Admin Console                                        │
├─────────────────────────────────────────────────────────┤
│  Backend (Node.js + Express)                             │
│  ├─ REST API (Single instance - 512MB heap)             │
│  ├─ Socket.io (Real-time)                               │
│  └─ Mobile API endpoints                                │
├─────────────────────────────────────────────────────────┤
│  AI Services (Python FastAPI)                            │
│  ├─ SIB AI Scribe (Limited to 1.8GB)                    │
│  └─ ClinicalBERT models                                 │
├─────────────────────────────────────────────────────────┤
│  Databases                                               │
│  ├─ PostgreSQL 16 (256MB shared_buffers)                │
│  ├─ Redis (128MB max memory)                            │
│  └─ PgBouncer (Connection pooling)                      │
├─────────────────────────────────────────────────────────┤
│  Reverse Proxy                                           │
│  └─ Nginx (1 worker)                                    │
└─────────────────────────────────────────────────────────┘
```

### Memory Allocation (8GB Total)

| Service         | Production | UAT   | Notes                          |
| --------------- | ---------- | ----- | ------------------------------ |
| Backend Server  | 667MB      | 512MB | Single instance (not clustered)|
| AI Service      | 1.9GB      | 1.8GB | Memory limit enforced          |
| PostgreSQL      | Dynamic    | 512MB | Tuned for 8GB                  |
| Redis           | 18MB       | 128MB | Max memory limit               |
| Worker          | 98MB       | 0MB   | On-demand only                 |
| n8n             | 281MB      | 0MB   | Skipped for UAT                |
| Nginx           | 50MB       | 50MB  | 1 worker process               |
| System          | ~1GB       | ~1GB  | Ubuntu + base services         |
| **Total**       | ~5.3GB     | ~4GB  | 4GB available for testing      |

---

## ✅ Prerequisites

### On Your Local Machine

- SSH key for AWS instance access
- Git configured with repository access
- Database backup from production (optional)

### Required API Keys & Credentials

Prepare these before deployment:

```bash
# Authentication & Security
JWT_SECRET=<strong-random-string>
SESSION_SECRET=<strong-random-string>  
ENCRYPTION_KEY=<32-char-hex-string>

# Database
POSTGRES_PASSWORD=<secure-db-password>
REDIS_PASSWORD=<optional-redis-password>

# Third-party Services
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIza...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
SENDGRID_API_KEY=SG...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
FIREBASE_PROJECT_ID=mediqzy-uat
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...

# Optional
MONGODB_URI=mongodb://localhost:27017/mediqzy_uat
```

---

## 🔧 Server Setup

### Step 1: Connect to UAT Server

```bash
# SSH into the instance
ssh -i /path/to/your-key.pem ubuntu@16.112.137.160

# Update system
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install System Dependencies

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools
sudo apt install -y build-essential git curl wget

# Verify installations
node --version  # Should be v20.x
npm --version   # Should be v10.x
```

### Step 3: Install PostgreSQL 16

```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update

# Install PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-contrib-16

# Install PgBouncer
sudo apt install -y pgbouncer

# Start and enable PostgreSQL
sudo systemctl start postgresql@16-main
sudo systemctl enable postgresql@16-main
```

### Step 4: Install Redis

```bash
sudo apt install -y redis-server

# Configure Redis memory limit
sudo tee -a /etc/redis/redis.conf <<EOF
maxmemory 128mb
maxmemory-policy allkeys-lru
EOF

sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

### Step 5: Install Nginx

```bash
sudo apt install -y nginx

sudo systemctl start nginx
sudo systemctl enable nginx
```

### Step 6: Install Python & AI Dependencies

```bash
# Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install system dependencies for AI models
sudo apt install -y libpq-dev python3-dev
```

### Step 7: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Configure PM2 to start on system boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

---

## 📦 Application Deployment

### Step 8: Clone Repository

```bash
cd /home/ubuntu

# Clone the Mediqzy repository
git clone https://github.com/your-org/Mediczy.git
cd Mediczy

# Or if already cloned, pull latest
git fetch origin
git checkout main  # or your UAT branch
git pull origin main
```

### Step 9: Backend Setup

```bash
cd /home/ubuntu/Mediczy/server

# Install dependencies
npm install --production

# Install PM2 for clustering
npm install pm2 -g
```

### Step 10: Frontend Build

```bash
cd /home/ubuntu/Mediczy/client

# Install dependencies
npm install

# Build for production
npm run build

# Built files will be in /home/ubuntu/Mediczy/client/dist
```

### Step 11: AI Service Setup

```bash
cd /home/ubuntu/Mediczy/sib-ai

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Download AI models (if needed)
python download_models.py
```

---

## ⚙️ Environment Configuration

### Step 12: Create UAT Environment File

```bash
cd /home/ubuntu/Mediczy/server

# Create .env.uat file
cat > .env.uat <<'EOF'
# ========================================
# MEDIQZY UAT ENVIRONMENT CONFIGURATION
# ========================================

NODE_ENV=uat
PORT=8000

# Database Configuration
DB_HOST=localhost
DB_PORT=6432
DB_NAME=mediqzy_uat
DB_USER=mediqzy_uat
DB_PASSWORD=CHANGE_THIS_PASSWORD
DB_SSL=false
DB_MAX_CONNECTIONS=20

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=1

# JWT & Security
JWT_SECRET=CHANGE_THIS_TO_RANDOM_STRING
JWT_EXPIRY=30d
SESSION_SECRET=CHANGE_THIS_TO_RANDOM_STRING
ENCRYPTION_KEY=CHANGE_THIS_32_CHAR_HEX

# API URL
API_URL=http://16.112.137.160
FRONTEND_URL=http://16.112.137.160
CORS_ORIGIN=http://16.112.137.160

# LiveKit Video
LIVEKIT_API_KEY=YOUR_LIVEKIT_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_SECRET
LIVEKIT_WS_URL=wss://video.mediqzy.com

# AI Services
OPENAI_API_KEY=sk-proj-YOUR_KEY
GEMINI_API_KEY=AIzaYOUR_KEY
SIB_AI_URL=http://localhost:8001

# Payment Gateway (Test Mode)
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY
RAZORPAY_KEY_SECRET=YOUR_SECRET

# Twilio (SMS/Voice)
TWILIO_ACCOUNT_SID=AC_YOUR_SID
TWILIO_AUTH_TOKEN=YOUR_TOKEN
TWILIO_PHONE_NUMBER=+1234567890

# Email
SENDGRID_API_KEY=SG.YOUR_KEY
SENDGRID_FROM_EMAIL=noreply@mediqzy.com

# AWS S3
AWS_ACCESS_KEY_ID=AKIA_YOUR_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET
AWS_REGION=ap-south-2
AWS_S3_BUCKET=mediqzy-uat

# Firebase
FIREBASE_PROJECT_ID=mediqzy-uat
FIREBASE_CLIENT_EMAIL=firebase@mediqzy-uat.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"

# MongoDB (Optional - if using for RocketChat)
MONGODB_URI=mongodb://localhost:27017/mediqzy_uat

# Logging
LOG_LEVEL=debug
LOG_FILE_PATH=/home/ubuntu/Mediczy/logs/uat.log

# Health Coins
HC_TO_INR_RATE=1
HC_BONUS_PERCENT=0

# Feature Flags
ENABLE_HEALTH_COINS=true
ENABLE_VIDEO_CALLS=true
ENABLE_AI_SCRIBE=true
ENABLE_PRESCRIPTIONS=true
EOF

# Set proper permissions
chmod 600 .env.uat

echo "⚠️  IMPORTANT: Edit .env.uat and update all CHANGE_THIS values!"
```

### Step 13: Configure PostgreSQL Database

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE mediqzy_uat;
CREATE USER mediqzy_uat WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE mediqzy_uat TO mediqzy_uat;

# Grant schema permissions
\c mediqzy_uat
GRANT ALL ON SCHEMA public TO mediqzy_uat;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mediqzy_uat;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mediqzy_uat;

\q
```

### Step 14: Optimize PostgreSQL for 8GB RAM

```bash
sudo tee /etc/postgresql/16/main/conf.d/uat-tuning.conf <<EOF
# UAT PostgreSQL Configuration for 8GB RAM

# Memory Settings
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 8MB

# Checkpoint Settings
checkpoint_completion_target = 0.9
wal_buffers = 8MB

# Connection Settings
max_connections = 50
max_prepared_transactions = 50

# Query Planning
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging
log_statement = 'mod'
log_duration = on
log_min_duration_statement = 1000
EOF

sudo systemctl restart postgresql@16-main
```

### Step 15: Configure PgBouncer

```bash
sudo tee /etc/pgbouncer/pgbouncer.ini <<EOF
[databases]
mediqzy_uat = host=localhost port=5432 dbname=mediqzy_uat

[pgbouncer]
listen_port = 6432
listen_addr = localhost
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
EOF

# Create userlist
sudo tee /etc/pgbouncer/userlist.txt <<EOF
"mediqzy_uat" "md5$(echo -n 'your_secure_passwordmediqzy_uat' | md5sum | cut -d' ' -f1)"
EOF

sudo systemctl restart pgbouncer
sudo systemctl enable pgbouncer
```

### Step 16: Import Database Schema

```bash
cd /home/ubuntu/Mediczy/server

# If you have a production backup:
# psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 < backup.sql

# Or run migrations:
npm run migrate:uat

# Seed test data (optional)
npm run seed:uat
```

### Step 17: Configure Nginx Reverse Proxy

```bash
sudo tee /etc/nginx/sites-available/mediqzy-uat <<'EOF'
# Mediqzy UAT Nginx Configuration

upstream backend {
    server localhost:8000;
    keepalive 32;
}

upstream ai_service {
    server localhost:8001;
    keepalive 16;
}

server {
    listen 80;
    server_name 16.112.137.160;
    
    client_max_body_size 50M;
    
    # Frontend - Serve static React build
    location / {
        root /home/ubuntu/Mediczy/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Socket.io WebSocket
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
    
    # AI Service
    location /ai/ {
        proxy_pass http://ai_service/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://backend/api/health;
        access_log off;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/mediqzy-uat /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## 🚀 Service Management

### Step 18: Create PM2 Ecosystem Config for UAT

```bash
cd /home/ubuntu/Mediczy

cat > ecosystem.uat.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'mediqzy-uat-server',
      script: './server/src/index.js',
      instances: 1,  // Single instance for 8GB RAM
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'uat',
        PORT: 8000,
        NODE_OPTIONS: '--max-old-space-size=512'
      },
      env_file: './server/.env.uat',
      error_file: './logs/uat-server-error.log',
      out_file: './logs/uat-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      kill_timeout: 5000
    },
    {
      name: 'mediqzy-uat-ai',
      script: './sib-ai/.venv/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1',
      cwd: './sib-ai',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PYTHONPATH: '/home/ubuntu/Mediczy/sib-ai',
        ENVIRONMENT: 'uat'
      },
      error_file: './logs/uat-ai-error.log',
      out_file: './logs/uat-ai-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1800M',
      kill_timeout: 10000
    },
    {
      name: 'mediqzy-uat-worker',
      script: './server/src/workers/background-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'uat',
        WORKER_TYPE: 'background'
      },
      env_file: './server/.env.uat',
      error_file: './logs/uat-worker-error.log',
      out_file: './logs/uat-worker-out.log',
      autorestart: false,  // On-demand only
      watch: false,
      max_memory_restart: '300M'
    }
  ]
};
EOF
```

### Step 19: Create Management Scripts

```bash
cd /home/ubuntu/Mediczy

# Create start script
cat > uat-start.sh <<'EOF'
#!/bin/bash
set -e

echo "🚀 Starting Mediqzy UAT Environment..."

# Create logs directory
mkdir -p /home/ubuntu/Mediczy/logs

# Start services with PM2
pm2 start ecosystem.uat.config.js

# Save PM2 process list
pm2 save

echo "✅ UAT Environment Started!"
echo ""
echo "📊 Service Status:"
pm2 list

echo ""
echo "🌐 Access URLs:"
echo "   Frontend:  http://16.112.137.160"
echo "   Backend:   http://16.112.137.160/api"
echo "   Health:    http://16.112.137.160/health"
EOF

# Create stop script
cat > uat-stop.sh <<'EOF'
#!/bin/bash
set -e

echo "🛑 Stopping Mediqzy UAT Environment..."

pm2 stop ecosystem.uat.config.js
pm2 delete ecosystem.uat.config.js

echo "✅ UAT Environment Stopped!"
EOF

# Create restart script
cat > uat-restart.sh <<'EOF'
#!/bin/bash
set -e

echo "🔄 Restarting Mediqzy UAT Environment..."

pm2 restart ecosystem.uat.config.js

echo "✅ UAT Environment Restarted!"
pm2 list
EOF

# Create status script
cat > uat-status.sh <<'EOF'
#!/bin/bash

echo "📊 Mediqzy UAT Status"
echo "===================="
echo ""

echo "🔹 PM2 Processes:"
pm2 list

echo ""
echo "🔹 Memory Usage:"
free -h

echo ""
echo "🔹 Disk Usage:"
df -h /

echo ""
echo "🔹 PostgreSQL:"
sudo systemctl status postgresql@16-main --no-pager | head -3

echo ""
echo "🔹 Redis:"
sudo systemctl status redis-server --no-pager | head -3

echo ""
echo "🔹 Nginx:"
sudo systemctl status nginx --no-pager | head -3

echo ""
echo "🔹 PgBouncer:"
sudo systemctl status pgbouncer --no-pager | head -3

echo ""
echo "🔹 Application Logs (last 20 lines):"
pm2 logs --lines 20 --nostream
EOF

# Create logs script
cat > uat-logs.sh <<'EOF'
#!/bin/bash

if [ -z "$1" ]; then
    echo "📋 Tailing all UAT logs..."
    pm2 logs
else
    echo "📋 Tailing $1 logs..."
    pm2 logs $1
fi
EOF

# Make scripts executable
chmod +x uat-start.sh uat-stop.sh uat-restart.sh uat-status.sh uat-logs.sh

echo "✅ Management scripts created!"
```

---

## ✅ Testing & Verification

### Step 20: Start UAT Environment

```bash
cd /home/ubuntu/Mediczy

# Start all services
./uat-start.sh

# Wait 30 seconds for services to initialize
sleep 30

# Check status
./uat-status.sh
```

### Step 21: Verify Services

```bash
# Test backend health
curl http://localhost:8000/api/health

# Expected response: {"status":"ok","timestamp":"..."}

# Test frontend
curl -I http://localhost/

# Expected: HTTP/1.1 200 OK

# Test AI service
curl http://localhost:8001/health

# Expected: {"status":"healthy"}
```

### Step 22: Test from External Network

From your local machine:

```bash
# Test frontend
curl -I http://16.112.137.160/

# Test API health
curl http://16.112.137.160/api/health

# Test in browser
open http://16.112.137.160
```

### Step 23: Create Test User

```bash
# Using the API
curl -X POST http://16.112.137.160/api/mobile/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "UAT",
    "last_name": "Tester",
    "email": "uat.tester@mediqzy.com",
    "password": "Test@12345",
    "phone": "+919876543210",
    "dateOfBirth": "1990-01-01",
    "gender": "Male"
  }'
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Services Not Starting

```bash
# Check PM2 logs
pm2 logs mediqzy-uat-server --lines 100

# Check system resources
free -h
df -h

# Restart services
pm2 restart all
```

#### 2. Database Connection Errors

```bash
# Check PostgreSQL status
sudo systemctl status postgresql@16-main

# Check PgBouncer status
sudo systemctl status pgbouncer

# Test database connection
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 -c "SELECT 1;"

# Check logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log
```

#### 3. Out of Memory (OOM)

```bash
# Check current memory usage
free -h
pm2 list

# Restart AI service (largest consumer)
pm2 restart mediqzy-uat-ai

# Clear system cache if needed
sudo sync && sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
```

#### 4. Nginx 502 Bad Gateway

```bash
# Check backend is running
curl http://localhost:8000/api/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

#### 5. Frontend Not Loading

```bash
# Check if build exists
ls -la /home/ubuntu/Mediczy/client/dist

# Rebuild frontend
cd /home/ubuntu/Mediczy/client
npm run build

# Check Nginx serving the files
curl -I http://localhost/

# Restart Nginx
sudo systemctl restart nginx
```

### Monitoring Commands

```bash
# Real-time memory usage
watch -n 1 free -h

# Real-time PM2 monitoring
pm2 monit

# Check all service logs
pm2 logs --lines 50

# Database queries
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432

# Redis monitoring
redis-cli MONITOR
```

### Performance Optimization

```bash
# If running low on memory:

# 1. Disable worker (run on-demand only)
pm2 stop mediqzy-uat-worker

# 2. Clear Redis cache
redis-cli FLUSHDB

# 3. Restart PostgreSQL to clear cache
sudo systemctl restart postgresql@16-main

# 4. Reduce AI service memory if needed
# Edit ecosystem.uat.config.js and lower max_memory_restart
```

---

## 📝 Maintenance

### Regular Tasks

```bash
# Weekly: Restart services to clear memory
./uat-restart.sh

# Daily: Check disk space
df -h /

# Daily: Review logs for errors
pm2 logs --lines 100 --err

# Weekly: Update dependencies
cd /home/ubuntu/Mediczy
git pull origin main
cd server && npm install
cd ../client && npm install && npm run build
./uat-restart.sh
```

### Backup UAT Database

```bash
# Create backup
pg_dump -U mediqzy_uat -h localhost -p 6432 mediqzy_uat > /home/ubuntu/backups/uat-$(date +%Y%m%d).sql

# Restore from backup
psql -U mediqzy_uat -h localhost -p 6432 mediqzy_uat < /home/ubuntu/backups/uat-20260221.sql
```

---

## 🎯 Next Steps

1. **Configure Domain (Optional)**
   - Point `uat.mediqzy.com` to `16.112.137.160`
   - Setup SSL with Let's Encrypt

2. **Setup Monitoring**
   - Install CloudWatch agent
   - Configure alerts for high memory/CPU
   - Setup uptime monitoring

3. **Load Test Data**
   - Import sample doctors
   - Create test appointments
   - Upload test documents

4. **Team Access**
   - Share UAT URL with QA team
   - Create test accounts for different roles
   - Distribute test credentials

---

## 📞 Support

For issues or questions:

- **DevOps**: Check PM2 logs and service status
- **Backend**: Review `/home/ubuntu/Mediczy/logs/` files
- **Database**: Check PostgreSQL logs in `/var/log/postgresql/`
- **Emergency**: Restart entire stack with `./uat-restart.sh`

---

**Deployment Checklist:**

- [ ] Server setup complete
- [ ] All dependencies installed
- [ ] Database created and configured
- [ ] Environment variables configured
- [ ] Frontend built successfully
- [ ] PM2 processes running
- [ ] Nginx configured and running
- [ ] External access verified
- [ ] Test user created
- [ ] Mobile API tested
- [ ] Documentation shared with team

**UAT Environment Ready! 🎉**
