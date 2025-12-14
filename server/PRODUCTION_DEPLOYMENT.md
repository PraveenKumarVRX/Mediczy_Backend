# Mediczy Production Deployment Guide

## Prerequisites

- Node.js 18.x or higher
- PM2 installed globally: `npm install -g pm2`
- MariaDB 10.5+
- MongoDB 5.0+
- Redis 6.0+
- Nginx (for reverse proxy)
- SSL certificate (Let's Encrypt recommended)

## Initial Setup

### 1. Clone and Install Dependencies

```bash
cd /root/Mediczy/server
npm install --production
```

### 2. Configure Environment

```bash
# Copy example and edit with your values
cp .env.production.example .env

# Generate secure secrets
openssl rand -base64 48  # Use for JWT_SECRET
openssl rand -base64 48  # Use for ENCRYPTION_KEY

# Edit .env with your production values
nano .env
```

**Critical Environment Variables:**
- `JWT_SECRET` - At least 32 characters
- `ENCRYPTION_KEY` - At least 32 characters
- `DB_PASSWORD` - Strong database password
- `MONGO_URI` - MongoDB connection string
- `CORS_ORIGIN` - Your production domain(s)
- `NODE_ENV=production`

### 3. Database Setup

```bash
# MariaDB setup
mysql -u root -p

CREATE DATABASE mediczy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mediczy_user'@'localhost' IDENTIFIED BY 'your-strong-password';
GRANT ALL PRIVILEGES ON mediczy.* TO 'mediczy_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Run migrations/sync (if using Sequelize sync)
NODE_ENV=production node -e "require('./db/mariadb.js').connectToDb()"

# Apply indexes for performance
mysql -u mediczy_user -p mediczy < docs/indexes.sql
```

### 4. Create Required Directories

```bash
mkdir -p logs uploads/doctors uploads/chat uploads/temp data
chmod 755 logs uploads data
```

## PM2 Deployment

### Start with Ecosystem File

```bash
# Production mode with all CPU cores
pm2 start ecosystem.config.cjs --env production

# Or specify number of instances
PM2_INSTANCES=4 pm2 start ecosystem.config.cjs --env production

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
pm2 startup systemd -u root --hp /root
# Run the command it outputs
```

### PM2 Management Commands

```bash
# View status
pm2 status
pm2 list

# View logs
pm2 logs mediczy-api
pm2 logs mediczy-api --lines 100

# Monitor resources
pm2 monit

# Restart
pm2 restart mediczy-api

# Reload (zero-downtime)
pm2 reload mediczy-api

# Stop
pm2 stop mediczy-api

# Delete
pm2 delete mediczy-api
```

### PM2 Plus Monitoring (Optional)

```bash
# Link to PM2 Plus for advanced monitoring
pm2 link <secret_key> <public_key>
```

## Nginx Configuration

### Install and Configure Nginx

```bash
# Install nginx
apt update && apt install nginx -y

# Copy configuration
cp nginx/mediczy.conf /etc/nginx/sites-available/mediczy
ln -s /etc/nginx/sites-available/mediczy /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# If test passes, reload
systemctl reload nginx
systemctl enable nginx
```

### SSL Setup with Let's Encrypt

```bash
# Install certbot
apt install certbot python3-certbot-nginx -y

# Obtain certificate
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
certbot renew --dry-run

# Auto-renewal is configured via cron/systemd timer
```

## Database Backup Setup

### Create Backup Scripts

```bash
# Create backup directory
mkdir -p /root/mediczy-backups/mariadb
mkdir -p /root/mediczy-backups/mongodb

# Make scripts executable
chmod +x /root/mediczy-backups/*.sh
```

### MariaDB Backup Script

```bash
cat > /root/mediczy-backups/backup-mariadb.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/root/mediczy-backups/mariadb"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="mediczy"
DB_USER="mediczy_user"
DB_PASS="your-password"

mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  --single-transaction --routines --triggers --events \
  | gzip > "$BACKUP_DIR/mediczy_$DATE.sql.gz"

find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
echo "Backup completed: mediczy_$DATE.sql.gz"
EOF

chmod +x /root/mediczy-backups/backup-mariadb.sh
```

### MongoDB Backup Script

```bash
cat > /root/mediczy-backups/backup-mongodb.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/root/mediczy-backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

mongodump --uri="mongodb://localhost:27017/mediczy" \
  --out="$BACKUP_DIR/mongo_$DATE" --gzip

find "$BACKUP_DIR" -name "mongo_*" -mtime +7 -exec rm -rf {} \;
echo "Backup completed: mongo_$DATE"
EOF

chmod +x /root/mediczy-backups/backup-mongodb.sh
```

### Schedule Backups with Cron

```bash
# Edit crontab
crontab -e

# Add these lines:
0 2 * * * /root/mediczy-backups/backup-mariadb.sh >> /var/log/mediczy-backup.log 2>&1
0 3 * * * /root/mediczy-backups/backup-mongodb.sh >> /var/log/mediczy-backup.log 2>&1
```

## Monitoring & Health Checks

### Health Endpoints

- **Liveness**: `GET /health/live` - Server is running
- **Readiness**: `GET /health/ready` - Server can handle requests
- **Detailed**: `GET /health` - Full health check with database status
- **Metrics**: `GET /metrics` - Prometheus metrics

### Monitor with PM2

```bash
# Real-time monitoring
pm2 monit

# Web dashboard
pm2 web
```

### Log Management

```bash
# Rotate logs with logrotate
cat > /etc/logrotate.d/mediczy << 'EOF'
/root/Mediczy/server/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

## Performance Tuning

### PM2 Cluster Mode

The ecosystem config automatically uses cluster mode in production:
- Scales to all available CPU cores
- Zero-downtime reloads
- Automatic restart on crashes

### Node.js Performance

```bash
# Increase Node.js memory limit if needed
node --max-old-space-size=2048 index.js
```

### Database Connection Pooling

Already configured in `db/mariadb.js`:
- Production: 20 max connections, 5 min
- Development: 5 max connections, 0 min

## Security Checklist

- [x] Remove demo/test credentials
- [x] Strong JWT_SECRET and ENCRYPTION_KEY (32+ chars)
- [x] CORS restricted to production domains
- [x] HTTPS only (HTTP redirects to HTTPS)
- [x] Security headers (helmet + nginx)
- [x] Rate limiting (application + nginx)
- [x] Environment validation on startup
- [x] Error messages sanitized in production
- [x] Database backups automated
- [x] Non-root user for Node process
- [x] Logs rotation configured
- [x] Graceful shutdown handlers

## Deployment Checklist

### Pre-Deployment

- [ ] Test all environment variables
- [ ] Run database migrations/indexes
- [ ] Verify SSL certificate is valid
- [ ] Test nginx configuration: `nginx -t`
- [ ] Backup current production data
- [ ] Review recent code changes

### Deployment

```bash
# 1. Pull latest code
cd /root/Mediczy/server
git pull origin main

# 2. Install/update dependencies
npm install --production

# 3. Reload PM2 (zero-downtime)
pm2 reload ecosystem.config.cjs --env production

# 4. Verify health
curl https://yourdomain.com/health
```

### Post-Deployment

- [ ] Check PM2 status: `pm2 status`
- [ ] Monitor logs: `pm2 logs mediczy-api`
- [ ] Test critical endpoints (login, signup)
- [ ] Verify database connections
- [ ] Check error logs for issues
- [ ] Monitor resource usage

## Rollback Procedure

```bash
# 1. Switch to previous version
cd /root/Mediczy/server
git checkout <previous-commit>

# 2. Reinstall dependencies
npm install --production

# 3. Reload PM2
pm2 reload ecosystem.config.cjs --env production

# 4. Verify
curl https://yourdomain.com/health
```

## Troubleshooting

### Server Won't Start

```bash
# Check PM2 logs
pm2 logs mediczy-api --err

# Check environment validation
node -e "require('./config/env-validator.js').validateEnvironment()"

# Verify database connectivity
mysql -u mediczy_user -p mediczy -e "SELECT 1"
mongo mediczy --eval "db.stats()"
```

### High Memory Usage

```bash
# Check PM2 memory
pm2 status

# Restart if needed
pm2 restart mediczy-api

# Reduce instances if necessary
pm2 scale mediczy-api 2
```

### Database Connection Errors

```bash
# Check MariaDB
systemctl status mariadb
mysql -u mediczy_user -p -e "SHOW PROCESSLIST"

# Check MongoDB
systemctl status mongod
mongo --eval "db.serverStatus().connections"
```

## Maintenance

### Weekly Tasks

- Review error logs
- Check disk space: `df -h`
- Monitor database sizes
- Review backup logs

### Monthly Tasks

- Update Node.js dependencies: `npm audit`
- Review SSL certificate expiry
- Analyze performance metrics
- Database optimization: `OPTIMIZE TABLE`

## Support & Documentation

- Health Dashboard: `https://yourdomain.com/health`
- PM2 Web UI: `http://localhost:9615` (if enabled)
- Logs: `/root/Mediczy/server/logs/`
- Database Backups: `/root/mediczy-backups/`
