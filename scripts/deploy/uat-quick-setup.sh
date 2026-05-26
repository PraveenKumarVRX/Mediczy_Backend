#!/bin/bash
set -e

# ============================================
# Mediqzy UAT Quick Setup Script
# ============================================
# This script automates the initial UAT server setup
# Run on fresh Ubuntu t3.large instance
# Usage: sudo bash uat-quick-setup.sh
# ============================================

echo "🚀 Starting Mediqzy UAT Quick Setup..."
echo "======================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "❌ Please run as root (use sudo)"
   exit 1
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Update system
echo ""
echo "${GREEN}[1/10]${NC} Updating system packages..."
apt update && apt upgrade -y

# Step 2: Install Node.js 20
echo ""
echo "${GREEN}[2/10]${NC} Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential git curl wget

# Verify Node.js installation
NODE_VERSION=$(node --version)
echo "✅ Node.js installed: $NODE_VERSION"

# Step 3: Install PostgreSQL 16
echo ""
echo "${GREEN}[3/10]${NC} Installing PostgreSQL 16..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update
apt install -y postgresql-16 postgresql-contrib-16 pgbouncer

systemctl start postgresql@16-main
systemctl enable postgresql@16-main

echo "✅ PostgreSQL 16 installed and started"

# Step 4: Install Redis
echo ""
echo "${GREEN}[4/10]${NC} Installing Redis..."
apt install -y redis-server

# Configure Redis for UAT
cat >> /etc/redis/redis.conf <<EOF

# UAT Configuration
maxmemory 128mb
maxmemory-policy allkeys-lru
EOF

systemctl restart redis-server
systemctl enable redis-server

echo "✅ Redis installed and configured"

# Step 5: Install Nginx
echo ""
echo "${GREEN}[5/10]${NC} Installing Nginx..."
apt install -y nginx

systemctl start nginx
systemctl enable nginx

echo "✅ Nginx installed and started"

# Step 6: Install Python 3.11
echo ""
echo "${GREEN}[6/10]${NC} Installing Python 3.11..."
apt install -y python3.11 python3.11-venv python3-pip libpq-dev python3-dev

echo "✅ Python 3.11 installed"

# Step 7: Install PM2
echo ""
echo "${GREEN}[7/10]${NC} Installing PM2..."
npm install -g pm2

echo "✅ PM2 installed"

# Step 8: Configure firewall
echo ""
echo "${GREEN}[8/10]${NC} Configuring firewall..."
apt install -y ufw

ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS (for future SSL)

echo "✅ Firewall configured"

# Step 9: Optimize PostgreSQL for 8GB RAM
echo ""
echo "${GREEN}[9/10]${NC} Optimizing PostgreSQL for 8GB RAM..."
cat > /etc/postgresql/16/main/conf.d/uat-tuning.conf <<EOF
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

systemctl restart postgresql@16-main

echo "✅ PostgreSQL optimized"

# Step 10: Create directory structure
echo ""
echo "${GREEN}[10/10]${NC} Creating directory structure..."
mkdir -p /home/ubuntu/Mediczy/logs
mkdir -p /home/ubuntu/backups

chown -R ubuntu:ubuntu /home/ubuntu/Mediczy
chown -R ubuntu:ubuntu /home/ubuntu/backups

echo "✅ Directory structure created"

# Final summary
echo ""
echo "======================================="
echo "${GREEN}✅ UAT Quick Setup Complete!${NC}"
echo "======================================="
echo ""
echo "📋 Installed Components:"
echo "   ✓ Node.js $(node --version)"
echo "   ✓ npm $(npm --version)"
echo "   ✓ PostgreSQL 16"
echo "   ✓ Redis"
echo "   ✓ Nginx"
echo "   ✓ Python 3.11"
echo "   ✓ PM2"
echo ""
echo "🔐 Next Steps:"
echo "   1. Switch to ubuntu user: su - ubuntu"
echo "   2. Clone repository: git clone https://github.com/your-org/Mediczy.git"
echo "   3. Follow UAT_DEPLOYMENT_GUIDE.md for application setup"
echo ""
echo "📖 Documentation: /home/ubuntu/Mediczy/UAT_DEPLOYMENT_GUIDE.md"
echo ""

# Create a reminder file
cat > /home/ubuntu/NEXT_STEPS.txt <<EOF
===========================================
MEDIQZY UAT - NEXT STEPS
===========================================

System setup is complete! Now configure the application:

1. CLONE REPOSITORY
   cd /home/ubuntu
   git clone https://github.com/your-org/Mediczy.git
   cd Mediczy

2. SETUP DATABASE
   Follow steps 13-16 in UAT_DEPLOYMENT_GUIDE.md
   - Create database user
   - Configure PostgreSQL
   - Setup PgBouncer

3. CONFIGURE ENVIRONMENT
   cd /home/ubuntu/Mediczy/server
   Edit .env.uat with your API keys and secrets

4. BUILD FRONTEND
   cd /home/ubuntu/Mediczy/client
   npm install
   npm run build

5. START SERVICES
   cd /home/ubuntu/Mediczy
   ./uat-start.sh

6. VERIFY DEPLOYMENT
   Open browser: http://16.112.137.160

📖 Full guide: /home/ubuntu/Mediczy/UAT_DEPLOYMENT_GUIDE.md

===========================================
EOF

chown ubuntu:ubuntu /home/ubuntu/NEXT_STEPS.txt

echo "${YELLOW}📄 Created reminder: /home/ubuntu/NEXT_STEPS.txt${NC}"
echo ""
