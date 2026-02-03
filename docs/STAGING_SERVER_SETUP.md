# 🚀 Staging Server Setup Guide

Complete guide for setting up a separate staging server for Mediqzy before going live with the mobile app.

**Created:** February 3, 2026

---

## 📋 Overview

| Environment    | Domain                | Purpose                              |
| -------------- | --------------------- | ------------------------------------ |
| **Production** | `app.mediqzy.com`     | Live users, real transactions        |
| **Staging**    | `staging.mediqzy.com` | Testing before production deployment |

---

## 🖥️ Server Requirements

### Minimum Specifications (Staging)

- **CPU:** 2 vCPUs
- **RAM:** 4GB
- **Storage:** 40GB SSD
- **OS:** Ubuntu 22.04 LTS

### Recommended Specifications

- **CPU:** 4 vCPUs
- **RAM:** 8GB
- **Storage:** 80GB SSD
- **OS:** Ubuntu 22.04 LTS

---

## 📦 Step 1: Server Preparation

### 1.1 Initial Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v  # Should show v20.x
npm -v

# Install PM2 globally
sudo npm install -g pm2
```

### 1.2 Install PostgreSQL

```bash
# Install PostgreSQL 16
sudo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-16

# Start PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### 1.3 Install Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify
redis-cli ping  # Should return PONG
```

---

## 🗄️ Step 2: Database Setup

### 2.1 Create Staging Database

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL shell:
CREATE USER mediqzy_staging WITH PASSWORD 'your_secure_staging_password';
CREATE DATABASE mediqzy_staging OWNER mediqzy_staging;
GRANT ALL PRIVILEGES ON DATABASE mediqzy_staging TO mediqzy_staging;

# Enable extensions
\c mediqzy_staging
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\q
```

### 2.2 Import Schema (Option A: Fresh Schema)

```bash
# From your local machine, export production schema (without data)
pg_dump -h localhost -U mediqzy -d mediqzy --schema-only > schema.sql

# Copy to staging server
scp schema.sql ubuntu@staging-server:/tmp/

# On staging server, import schema
sudo -u postgres psql mediqzy_staging < /tmp/schema.sql
```

### 2.3 Import Schema with Sample Data (Option B)

```bash
# Create a sanitized dump from production (remove sensitive data)
pg_dump -h localhost -U mediqzy -d mediqzy \
  --exclude-table-data='users' \
  --exclude-table-data='payments' \
  --exclude-table-data='wallet_transactions' \
  > staging_schema.sql

# Import on staging
sudo -u postgres psql mediqzy_staging < staging_schema.sql
```

---

## 📁 Step 3: Application Setup

### 3.1 Clone Repository

```bash
# Create app directory
sudo mkdir -p /home/ubuntu/Mediczy
sudo chown ubuntu:ubuntu /home/ubuntu/Mediczy

# Clone repository
cd /home/ubuntu
git clone git@github.com:MySmartHealth/Mediczy.git
cd Mediczy

# Switch to staging branch (recommended)
git checkout -b staging
# Or stay on main for testing production code
```

### 3.2 Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Build frontend
npm run build
```

---

## ⚙️ Step 4: Environment Configuration

### 4.1 Create Staging Environment File

Create `/home/ubuntu/Mediczy/server/.env.staging`:

```bash
# ===========================================
# MEDIQZY STAGING ENVIRONMENT
# ===========================================

NODE_ENV=staging
PORT=8000

# ===========================================
# DATABASE (Staging)
# ===========================================
DATABASE_URL=postgresql://mediqzy_staging:your_secure_staging_password@localhost:5432/mediqzy_staging
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mediqzy_staging
DB_USER=mediqzy_staging
DB_PASSWORD=your_secure_staging_password

# ===========================================
# REDIS (Staging)
# ===========================================
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# ===========================================
# JWT SECRETS (Use different from production!)
# ===========================================
JWT_SECRET=staging_jwt_secret_different_from_prod_abc123xyz
JWT_REFRESH_SECRET=staging_refresh_secret_different_from_prod_xyz789
JWT_EXPIRES_IN=30d

# ===========================================
# DOMAINS (Staging)
# ===========================================
FRONTEND_URL=https://staging.mediqzy.com
BACKEND_URL=https://staging.mediqzy.com
CORS_ORIGINS=https://staging.mediqzy.com,http://localhost:3000

# ===========================================
# LIVEKIT VIDEO (Staging)
# Can use same LiveKit server or separate staging instance
# ===========================================
LIVEKIT_HOST=video.mediqzy.com
LIVEKIT_URL=wss://video.mediqzy.com
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# ===========================================
# PAYMENT GATEWAY (Use TEST keys!)
# ===========================================
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_test_secret
RAZORPAY_WEBHOOK_SECRET=your_test_webhook_secret

# ===========================================
# EMAIL (Use staging/test credentials)
# ===========================================
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=staging@mediqzy.com
SMTP_PASS=staging_email_password
EMAIL_FROM=staging@mediqzy.com

# ===========================================
# SMS (Use test/sandbox mode)
# ===========================================
SMS_API_KEY=test_sms_api_key
SMS_SENDER_ID=MEDQZY
SMS_TEST_MODE=true

# ===========================================
# FIREBASE (Staging project)
# ===========================================
FIREBASE_PROJECT_ID=mediqzy-staging
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@mediqzy-staging.iam.gserviceaccount.com

# ===========================================
# LOGGING
# ===========================================
LOG_LEVEL=debug
LOG_FORMAT=combined

# ===========================================
# FEATURE FLAGS (Staging)
# ===========================================
ENABLE_DEBUG_ENDPOINTS=true
ENABLE_TEST_ACCOUNTS=true
MOCK_PAYMENTS=false
```

### 4.2 Create PM2 Ecosystem File

Create `/home/ubuntu/Mediczy/ecosystem.staging.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "mediqzy-staging",
      script: "./server/index.js",
      cwd: "/home/ubuntu/Mediczy",
      instances: 1, // Single instance for staging
      exec_mode: "fork",
      env: {
        NODE_ENV: "staging",
        PORT: 8000,
      },
      env_file: "./server/.env.staging",
      watch: false,
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/staging-error.log",
      out_file: "./logs/staging-out.log",
      merge_logs: true,
    },
    {
      name: "mediqzy-staging-worker",
      script: "./server/worker.js",
      cwd: "/home/ubuntu/Mediczy",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "staging",
      },
      env_file: "./server/.env.staging",
      watch: false,
      max_memory_restart: "300M",
      error_file: "./logs/staging-worker-error.log",
      out_file: "./logs/staging-worker-out.log",
    },
  ],
};
```

---

## 🌐 Step 5: Nginx Configuration

### 5.1 Create Nginx Site Config

Create `/etc/nginx/sites-available/staging.mediqzy.com`:

```nginx
# Staging Server Configuration
server {
    listen 80;
    server_name staging.mediqzy.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.mediqzy.com;

    # SSL Configuration (will be added by certbot)
    ssl_certificate /etc/letsencrypt/live/staging.mediqzy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.mediqzy.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Staging Banner Header (helps identify staging requests)
    add_header X-Environment "staging" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Frontend (React build)
    root /home/ubuntu/Mediczy/client/dist;
    index index.html;

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Socket.io
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /uploads/ {
        alias /home/ubuntu/Mediczy/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Frontend routing (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8000/api/health;
    }
}
```

### 5.2 Enable Site and Get SSL

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/staging.mediqzy.com /etc/nginx/sites-enabled/

# Test nginx config
sudo nginx -t

# Get SSL certificate
sudo certbot --nginx -d staging.mediqzy.com

# Reload nginx
sudo systemctl reload nginx
```

---

## 🚀 Step 6: Start Application

### 6.1 Start PM2 Services

```bash
cd /home/ubuntu/Mediczy

# Create logs directory
mkdir -p logs

# Start staging services
pm2 start ecosystem.staging.config.js

# Save PM2 config
pm2 save

# Setup PM2 startup
pm2 startup
```

### 6.2 Verify Services

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs mediqzy-staging

# Test API
curl -s https://staging.mediqzy.com/api/health | jq '.'
```

---

## 📱 Step 7: Mobile App Configuration

### 7.1 Environment Configuration

Create environment configs for your React Native app:

```javascript
// config/environments.js
const environments = {
  development: {
    API_URL: "http://localhost:8000",
    WS_URL: "ws://localhost:8000",
    VIDEO_URL: "wss://video.mediqzy.com",
    ENV_NAME: "development",
  },
  staging: {
    API_URL: "https://staging.mediqzy.com",
    WS_URL: "wss://staging.mediqzy.com",
    VIDEO_URL: "wss://video.mediqzy.com",
    ENV_NAME: "staging",
  },
  production: {
    API_URL: "https://app.mediqzy.com",
    WS_URL: "wss://app.mediqzy.com",
    VIDEO_URL: "wss://video.mediqzy.com",
    ENV_NAME: "production",
  },
};

// Set current environment
const ENV = __DEV__ ? "development" : "staging"; // Change to 'production' for release

export default environments[ENV];
```

### 7.2 Using Environment in API Service

```javascript
// services/MediczyAPI.js
import config from "../config/environments";

const API_BASE_URL = config.API_URL;

class MediczyAPI {
  // ... existing code uses API_BASE_URL
}
```

---

## 🔄 Step 8: Deployment Workflow

### 8.1 Deploy to Staging Script

Create `/home/ubuntu/Mediczy/scripts/deploy-staging.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Deploying to Staging..."

cd /home/ubuntu/Mediczy

# Pull latest changes
echo "📥 Pulling latest code..."
git fetch origin
git checkout staging
git pull origin staging

# Install dependencies
echo "📦 Installing dependencies..."
cd server && npm ci
cd ../client && npm ci

# Build frontend
echo "🔨 Building frontend..."
npm run build

# Run database migrations
echo "🗄️ Running migrations..."
cd ../server
NODE_ENV=staging npx knex migrate:latest --env staging

# Restart services
echo "🔄 Restarting services..."
pm2 reload ecosystem.staging.config.js

# Health check
echo "✅ Health check..."
sleep 5
curl -sf https://staging.mediqzy.com/api/health || (echo "❌ Health check failed!" && exit 1)

echo "✅ Staging deployment complete!"
```

```bash
chmod +x /home/ubuntu/Mediczy/scripts/deploy-staging.sh
```

### 8.2 Promote Staging to Production

```bash
#!/bin/bash
# scripts/promote-to-production.sh

echo "⚠️  Promoting staging to production..."
echo "Make sure all staging tests have passed!"

read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 1
fi

# On staging server: tag the tested version
cd /home/ubuntu/Mediczy
VERSION=$(date +%Y%m%d-%H%M%S)
git tag -a "release-$VERSION" -m "Production release $VERSION"
git push origin "release-$VERSION"

echo "✅ Tagged release-$VERSION"
echo "Now deploy this tag on production server."
```

---

## 🧪 Step 9: Test Accounts

### 9.1 Create Test Accounts on Staging

```bash
cd /home/ubuntu/Mediczy/server

# Create test patient
NODE_ENV=staging node -e "
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.staging' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createTestPatient() {
  const hash = await bcrypt.hash('Test@123', 10);
  await pool.query(\`
    INSERT INTO users (email, password, first_name, last_name, phone, role, status)
    VALUES ('testpatient@mediqzy.com', '\${hash}', 'Test', 'Patient', '9999999991', 'patient', 'active')
    ON CONFLICT (email) DO NOTHING
  \`);
  console.log('Test patient created: testpatient@mediqzy.com / Test@123');
  pool.end();
}

createTestPatient();
"

# Create test doctor
NODE_ENV=staging node -e "
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.staging' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createTestDoctor() {
  const hash = await bcrypt.hash('Test@123', 10);
  await pool.query(\`
    INSERT INTO doctors (email, password, name, phone, specialization, consultation_fee, status)
    VALUES ('testdoctor@mediqzy.com', '\${hash}', 'Dr. Test Doctor', '9999999992', 'General Medicine', 100, 'active')
    ON CONFLICT (email) DO NOTHING
  \`);
  console.log('Test doctor created: testdoctor@mediqzy.com / Test@123');
  pool.end();
}

createTestDoctor();
"
```

---

## 📊 Step 10: Monitoring

### 10.1 Basic Monitoring Setup

```bash
# Install monitoring tools
sudo apt install -y htop iotop nethogs

# PM2 monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# View real-time logs
pm2 logs --lines 100
```

### 10.2 Health Check Endpoint

The `/api/health` endpoint should return:

```json
{
  "status": "ok",
  "environment": "staging",
  "version": "2.3.0",
  "timestamp": "2026-02-03T12:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "livekit": "connected"
  }
}
```

---

## ✅ Staging Checklist

### Server Setup

- [ ] Server provisioned with required specs
- [ ] Ubuntu 22.04 LTS installed
- [ ] Node.js 20.x installed
- [ ] PostgreSQL 16 installed and configured
- [ ] Redis installed and running
- [ ] PM2 installed globally

### Application

- [ ] Repository cloned
- [ ] Dependencies installed (server + client)
- [ ] Frontend built successfully
- [ ] `.env.staging` configured
- [ ] `ecosystem.staging.config.js` created
- [ ] PM2 services running

### Database

- [ ] Staging database created
- [ ] User permissions configured
- [ ] Schema imported
- [ ] Migrations run successfully
- [ ] Test accounts created

### Networking

- [ ] DNS configured for `staging.mediqzy.com`
- [ ] Nginx configured and running
- [ ] SSL certificate obtained
- [ ] Firewall configured (ports 80, 443)

### Mobile App

- [ ] Staging environment config added
- [ ] API_URL updated to staging
- [ ] Firebase staging project configured
- [ ] Test build deployed to TestFlight/Internal Testing

### Testing

- [ ] API health check passing
- [ ] User registration working
- [ ] Login working (email + OTP)
- [ ] Doctor listing working
- [ ] Appointment booking working
- [ ] Video consultation working
- [ ] Push notifications working
- [ ] Payments working (test mode)

---

## 🆘 Troubleshooting

### Common Issues

**PM2 not starting:**

```bash
pm2 logs mediqzy-staging --err --lines 50
```

**Database connection failed:**

```bash
# Test connection
PGPASSWORD=your_password psql -h localhost -U mediqzy_staging -d mediqzy_staging -c "SELECT 1"
```

**Nginx 502 Bad Gateway:**

```bash
# Check if Node.js is running
pm2 status
# Check nginx error log
sudo tail -f /var/log/nginx/error.log
```

**SSL certificate issues:**

```bash
sudo certbot renew --dry-run
```

---

## 📞 Support

- **Production Issues:** support@mediqzy.com
- **Staging Issues:** dev@mediqzy.com
- **Documentation:** https://docs.mediqzy.com
