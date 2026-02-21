# 🚀 Mediqzy UAT - Complete Setup Walkthrough

**Step-by-step guide to clone and deploy the entire Mediqzy application for UAT testing.**

Server: **16.112.137.160** | RAM: **8GB** | Region: **ap-south-2 (Hyderabad)**

---

## 📖 Overview

This guide will help you:
1. ✅ Set up the server infrastructure
2. ✅ Clone the application code
3. ✅ Configure databases and services
4. ✅ Deploy web and mobile backends
5. ✅ Test the complete system

**Estimated time:** 1-2 hours

---

## 🎯 Step 1: Connect to Your Server

```bash
# Replace with your actual key file path
ssh -i /path/to/your-key.pem ubuntu@16.112.137.160
```

Once connected, you should see:
```
ubuntu@ip-xxx-xxx-xxx-xxx:~$
```

---

## 🔧 Step 2: Quick Setup (Install All Dependencies)

Run the automated setup script to install Node.js, PostgreSQL, Redis, Nginx, and other dependencies:

```bash
# Navigate to Mediczy directory
cd /home/ubuntu/Mediczy

# Run automated setup (THIS INSTALLS EVERYTHING)
sudo bash uat-quick-setup.sh
```

**What this does:**
- ✅ Installs Node.js 20.x
- ✅ Installs PostgreSQL 16 + PgBouncer
- ✅ Installs Redis (configured for 128MB)
- ✅ Installs Nginx
- ✅ Installs Python 3.11
- ✅ Installs PM2 (process manager)
- ✅ Configures firewall
- ✅ Optimizes PostgreSQL for 8GB RAM

**This takes about 10-15 minutes.** ☕

Once complete, you'll see:
```
✅ UAT Quick Setup Complete!
```

---

## 📥 Step 3: Get the Application Code

If you haven't cloned the repository yet:

```bash
# Go to home directory
cd /home/ubuntu

# Clone from GitHub (replace with your actual repo URL)
git clone https://github.com/your-org/Mediczy.git

# Enter the directory
cd Mediczy
```

If already cloned, just pull latest changes:

```bash
cd /home/ubuntu/Mediczy
git pull origin main
```

---

## 🗄️ Step 4: Setup PostgreSQL Database

### 4.1 Create Database and User

```bash
# Switch to postgres user and create database
sudo -u postgres psql << EOF
CREATE DATABASE mediqzy_uat;
CREATE USER mediqzy_uat WITH ENCRYPTED PASSWORD 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON DATABASE mediqzy_uat TO mediqzy_uat;
\c mediqzy_uat
GRANT ALL ON SCHEMA public TO mediqzy_uat;
ALTER DATABASE mediqzy_uat OWNER TO mediqzy_uat;
EOF
```

**✅ Replace `YourSecurePassword123!` with your own strong password!**

### 4.2 Test Database Connection

```bash
# Test the connection
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 5432 -c "SELECT 1;"

# You should see:
#  ?column? 
# ----------
#         1
```

### 4.3 Configure PgBouncer

```bash
# Create PgBouncer configuration
sudo tee /etc/pgbouncer/pgbouncer.ini > /dev/null << 'EOF'
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
server_lifetime = 3600
server_idle_timeout = 600
log_connections = 1
log_disconnections = 1
EOF

# Create userlist (replace password with yours)
# First generate md5 hash
PASSWORD_MD5=$(echo -n "YourSecurePassword123!mediqzy_uat" | md5sum | cut -d' ' -f1)
echo "\"mediqzy_uat\" \"md5$PASSWORD_MD5\"" | sudo tee /etc/pgbouncer/userlist.txt

# Restart PgBouncer
sudo systemctl restart pgbouncer
sudo systemctl enable pgbouncer
```

### 4.4 Test PgBouncer Connection

```bash
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 -c "SELECT 1;"
```

---

## ⚙️ Step 5: Configure Backend Environment

Create the backend configuration file:

```bash
cd /home/ubuntu/Mediczy/server

# Create .env.uat file
cat > .env.uat << 'EOF'
# ========================================
# MEDIQZY UAT ENVIRONMENT
# ========================================

NODE_ENV=uat
PORT=8000

# Database (via PgBouncer)
DB_HOST=localhost
DB_PORT=6432
DB_NAME=mediqzy_uat
DB_USER=mediqzy_uat
DB_PASSWORD=YourSecurePassword123!
DB_SSL=false
DB_MAX_CONNECTIONS=20

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=1

# URLs
API_URL=http://16.112.137.160
FRONTEND_URL=http://16.112.137.160
CORS_ORIGIN=http://16.112.137.160

# Security (CHANGE THESE!)
JWT_SECRET=change-this-to-random-32-char-string
SESSION_SECRET=change-this-to-random-32-char-string
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef

# LiveKit Video (Use production video server)
LIVEKIT_API_KEY=YOUR_LIVEKIT_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_SECRET
LIVEKIT_WS_URL=wss://video.mediqzy.com

# AI Services (Optional - can skip for basic UAT)
OPENAI_API_KEY=sk-proj-YOUR_KEY
GEMINI_API_KEY=AIza_YOUR_KEY
SIB_AI_URL=http://localhost:8001

# Payment (Test Mode)
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY
RAZORPAY_KEY_SECRET=YOUR_SECRET

# Twilio (Optional)
TWILIO_ACCOUNT_SID=AC_YOUR_SID
TWILIO_AUTH_TOKEN=YOUR_TOKEN
TWILIO_PHONE_NUMBER=+1234567890

# SendGrid Email (Optional)
SENDGRID_API_KEY=SG.YOUR_KEY
SENDGRID_FROM_EMAIL=noreply@mediqzy.com

# AWS S3 (Optional)
AWS_ACCESS_KEY_ID=AKIA_YOUR_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET
AWS_REGION=ap-south-2
AWS_S3_BUCKET=mediqzy-uat

# Firebase (Optional)
FIREBASE_PROJECT_ID=mediqzy-uat
FIREBASE_CLIENT_EMAIL=firebase@mediqzy-uat.iam.gserviceaccount.com

# Features
ENABLE_HEALTH_COINS=true
ENABLE_VIDEO_CALLS=true
ENABLE_AI_SCRIBE=false
ENABLE_PRESCRIPTIONS=true

# Logging
LOG_LEVEL=debug
LOG_FILE_PATH=/home/ubuntu/Mediczy/logs/uat.log
EOF

# Secure the file
chmod 600 .env.uat
```

**🔴 CRITICAL: Edit the file and replace:**
1. `DB_PASSWORD` - Your actual PostgreSQL password
2. `JWT_SECRET` - Generate a random 32-char string
3. `SESSION_SECRET` - Generate another random 32-char string
4. `ENCRYPTION_KEY` - 32 hex characters (0-9, a-f)
5. All API keys (LIVEKIT, RAZORPAY, etc.)

```bash
# Edit the file
nano .env.uat

# Press Ctrl+X, then Y, then Enter to save
```

---

## 🎨 Step 6: Configure Frontend Environment

```bash
cd /home/ubuntu/Mediczy/client

cat > .env.uat << 'EOF'
# UAT Environment Configuration
VITE_APP_ENV=uat
VITE_API_URL=http://16.112.137.160
VITE_WS_URL=ws://16.112.137.160
VITE_VIDEO_URL=wss://video.mediqzy.com

# Feature Flags
VITE_ENABLE_VIDEO_CALLS=true
VITE_ENABLE_HEALTH_COINS=true
VITE_ENABLE_AI_SCRIBE=false
VITE_ENABLE_PRESCRIPTIONS=true

# Third-party (Test Mode)
VITE_RAZORPAY_KEY=rzp_test_YOUR_KEY
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_KEY
VITE_FIREBASE_PROJECT_ID=mediqzy-uat

# App Info
VITE_APP_NAME=Mediqzy UAT
VITE_APP_VERSION=2.5.0-uat
EOF
```

---

## 📦 Step 7: Install Dependencies

### 7.1 Backend Dependencies

```bash
cd /home/ubuntu/Mediczy/server
npm install --production

# This takes 2-3 minutes
```

### 7.2 Frontend Dependencies

```bash
cd /home/ubuntu/Mediczy/client
npm install

# This takes 3-5 minutes
```

### 7.3 AI Service Dependencies (Optional)

```bash
cd /home/ubuntu/Mediczy/sib-ai

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# This takes 5-10 minutes depending on AI models
deactivate
```

---

## 🗃️ Step 8: Import Database Schema

```bash
cd /home/ubuntu/Mediczy/server

# Option 1: If you have migrations
npm run migrate:uat

# Option 2: If you have a SQL dump
# psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 < path/to/backup.sql

# Option 3: If starting fresh, create tables manually
# node scripts/create-tables.js
```

---

## 🏗️ Step 9: Build Frontend

```bash
cd /home/ubuntu/Mediczy/client

# Build for production
npm run build

# Verify build
ls -la dist/

# You should see index.html and assets/
```

---

## 🌐 Step 10: Configure Nginx

```bash
sudo tee /etc/nginx/sites-available/mediqzy-uat > /dev/null << 'EOF'
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
    
    # Frontend
    location / {
        root /home/ubuntu/Mediczy/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
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
    
    # WebSocket
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
    
    # AI Service
    location /ai/ {
        proxy_pass http://ai_service/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
    
    # Health Check
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

# Should show: syntax is ok, test is successful

# Restart Nginx
sudo systemctl restart nginx
```

---

## 🚀 Step 11: Create PM2 Configuration

```bash
cd /home/ubuntu/Mediczy

cat > ecosystem.uat.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'mediqzy-uat-server',
      script: './server/src/index.js',
      instances: 1,
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
      autorestart: true,
      watch: false,
      max_memory_restart: '1800M'
    }
  ]
};
EOF
```

---

## 🎬 Step 12: Start the Application

```bash
cd /home/ubuntu/Mediczy

# Create logs directory
mkdir -p logs

# Start services with PM2
pm2 start ecosystem.uat.config.js

# Save PM2 process list
pm2 save

# Configure PM2 to start on system boot
pm2 startup systemd
# Copy and run the command it shows

# Check status
pm2 list

# You should see:
# ┌─────┬────────────────────────┬─────────┬─────────┐
# │ id  │ name                   │ status  │ restart │
# ├─────┼────────────────────────┼─────────┼─────────┤
# │ 0   │ mediqzy-uat-server     │ online  │ 0       │
# │ 1   │ mediqzy-uat-ai         │ online  │ 0       │
# └─────┴────────────────────────┴─────────┴─────────┘
```

---

## ✅ Step 13: Test Your UAT Environment

### 13.1 Internal Tests (on server)

```bash
# Test backend health
curl http://localhost:8000/api/health

# Expected: {"status":"ok","timestamp":"..."}

# Test frontend
curl -I http://localhost/

# Expected: HTTP/1.1 200 OK

# Test AI service (if enabled)
curl http://localhost:8001/health

# Expected: {"status":"healthy"}
```

### 13.2 External Tests (from your computer)

Open your browser and visit:

1. **Frontend:** http://16.112.137.160
2. **API Health:** http://16.112.137.160/api/health
3. **Video (direct):** Open developer tools and check WebSocket connections

### 13.3 Create Test User

```bash
# From the server
curl -X POST http://localhost:8000/api/mobile/auth/signup \
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

### 13.4 Login with Test User

Visit http://16.112.137.160 and login with:
- **Email:** uat.tester@mediqzy.com
- **Password:** Test@12345

---

## 📊 Step 14: Monitor Your Application

### View Logs

```bash
# All logs
pm2 logs

# Specific service
pm2 logs mediqzy-uat-server
pm2 logs mediqzy-uat-ai

# Last 50 lines
pm2 logs --lines 50
```

### Check Status

```bash
# Process status
pm2 list

# Detailed monitoring
pm2 monit

# System resources
free -h     # Memory
df -h /     # Disk
top         # CPU
```

### Restart Services

```bash
# Restart all
pm2 restart all

# Restart specific service
pm2 restart mediqzy-uat-server

# Stop all
pm2 stop all

# Start all
pm2 start ecosystem.uat.config.js
```

---

## 🔧 Troubleshooting

### Problem: Services Won't Start

```bash
# Check logs
pm2 logs --lines 100

# Check environment variables
cat server/.env.uat | grep -v PASSWORD

# Verify database connection
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 -c "SELECT 1;"
```

### Problem: 502 Bad Gateway

```bash
# Check if backend is running
curl http://localhost:8000/api/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

### Problem: Out of Memory

```bash
# Check memory usage
free -h

# Restart AI service (largest consumer)
pm2 restart mediqzy-uat-ai

# Clear system cache
sudo sync && sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
```

### Problem: Database Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql@16-main

# Check PgBouncer is running
sudo systemctl status pgbouncer

# Restart PgBouncer
sudo systemctl restart pgbouncer
```

---

## 📝 Quick Reference Commands

```bash
# Navigate to app
cd /home/ubuntu/Mediczy

# Start services
pm2 start ecosystem.uat.config.js

# Stop services
pm2 stop all

# Restart services
pm2 restart all

# View logs
pm2 logs

# Check status
pm2 list

# Monitor resources
pm2 monit

# Check health
curl http://localhost:8000/api/health

# Restart Nginx
sudo systemctl restart nginx

# Restart PostgreSQL
sudo systemctl restart postgresql@16-main

# Restart Redis
sudo systemctl restart redis-server
```

---

## 🎯 Next Steps After Setup

### 1. Create More Test Users

```bash
# Admin user
curl -X POST http://localhost:8000/api/users/create-admin \
  -H "Content-Type: application/json" \
  -d '{...}'

# Doctor user
curl -X POST http://localhost:8000/api/doctors/register \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### 2. Import Sample Data

```bash
# Import doctors
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 < sample-data/doctors.sql

# Import test appointments
psql -U mediqzy_uat -d mediqzy_uat -h localhost -p 6432 < sample-data/appointments.sql
```

### 3. Setup Domain (Optional)

If you have a domain like `uat.mediqzy.com`:

```bash
# Update Nginx config
sudo nano /etc/nginx/sites-available/mediqzy-uat
# Change: server_name uat.mediqzy.com;

# Install SSL certificate
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d uat.mediqzy.com

# Restart Nginx
sudo systemctl restart nginx
```

### 4. Configure Automated Backups

```bash
# Create backup script
cat > /home/ubuntu/backup-uat.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d-%H%M%S)
pg_dump -U mediqzy_uat -h localhost -p 6432 mediqzy_uat > "$BACKUP_DIR/uat-$DATE.sql"
find "$BACKUP_DIR" -name "uat-*.sql" -mtime +7 -delete
EOF

chmod +x /home/ubuntu/backup-uat.sh

# Add to cron (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/ubuntu/backup-uat.sh") | crontab -
```

---

## 🎉 Success!

Your UAT environment is now ready!

**Access URLs:**
- **Web App:** http://16.112.137.160
- **API:** http://16.112.137.160/api
- **Health Check:** http://16.112.137.160/health

**Test Credentials:**
- **Email:** uat.tester@mediqzy.com
- **Password:** Test@12345

**For Mobile App Testing:**
Update your mobile app's API URL to: `http://16.112.137.160`

---

## 📚 Additional Resources

- **Complete Guide:** [UAT_DEPLOYMENT_GUIDE.md](UAT_DEPLOYMENT_GUIDE.md)
- **Checklist:** [UAT_DEPLOYMENT_CHECKLIST.md](UAT_DEPLOYMENT_CHECKLIST.md)
- **Mobile API Docs:** [docs/api/MOBILE_API_VIDEO_CONSULTATION.md](docs/api/MOBILE_API_VIDEO_CONSULTATION.md)

---

**Need Help?**

If you get stuck:
1. Check logs: `pm2 logs --lines 100`
2. Check service status: `pm2 list`
3. Check system resources: `free -h && df -h`
4. Review the troubleshooting section above

---

_Last Updated: February 21, 2026_
