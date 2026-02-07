#!/bin/bash
# Production Deployment Script
# Deploys latest changes to EC2 production server

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Production server details
PROD_SERVER="ubuntu@13.234.17.52"
PROD_PATH="/home/ubuntu/Mediczy"
SSH_KEY=".venv/bin/mediqzy.pem"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Mediczy Production Deployment       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Verify SSH key exists
echo -e "${YELLOW}🔑 Step 1/7: Verifying SSH access...${NC}"
if [ ! -f "$SSH_KEY" ]; then
  echo -e "${RED}❌ SSH key not found: $SSH_KEY${NC}"
  echo "Please ensure the SSH key is in place"
  exit 1
fi
echo -e "${GREEN}✅ SSH key found${NC}"
echo ""

# Step 2: Test SSH connection
echo -e "${YELLOW}📡 Step 2/7: Testing connection to production server...${NC}"
if ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$PROD_SERVER" "echo 'Connection successful'" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Connection to production server verified${NC}"
else
  echo -e "${RED}❌ Cannot connect to production server${NC}"
  echo "Server: $PROD_SERVER"
  exit 1
fi
echo ""

# Step 3: Backup current production code
echo -e "${YELLOW}💾 Step 3/7: Creating backup on production server...${NC}"
BACKUP_NAME="mediczy-backup-$(date +%Y%m%d_%H%M%S)"
ssh -i "$SSH_KEY" "$PROD_SERVER" << EOF
  if [ -d "$PROD_PATH" ]; then
    cd /home/ubuntu
    cp -r Mediczy "$BACKUP_NAME"
    echo "Backup created: $BACKUP_NAME"
  else
    echo "No existing installation found - fresh deployment"
  fi
EOF
echo -e "${GREEN}✅ Backup completed${NC}"
echo ""

# Step 4: Pull latest code
echo -e "${YELLOW}📥 Step 4/7: Pulling latest code from GitHub...${NC}"
ssh -i "$SSH_KEY" "$PROD_SERVER" << 'EOF'
  cd /home/ubuntu/Mediczy
  
  # Save any local changes
  if [ -n "$(git status --porcelain)" ]; then
    echo "Stashing local changes..."
    git stash
  fi
  
  # Pull latest code
  echo "Fetching latest changes..."
  git fetch origin
  git pull origin main
  
  echo "✅ Code updated successfully"
EOF
echo -e "${GREEN}✅ Latest code pulled${NC}"
echo ""

# Step 5: Install dependencies
echo -e "${YELLOW}📦 Step 5/7: Installing dependencies...${NC}"
ssh -i "$SSH_KEY" "$PROD_SERVER" << 'EOF'
  cd /home/ubuntu/Mediczy/server
  
  # Install Node.js dependencies
  echo "Installing Node.js packages..."
  npm install --production
  
  echo "✅ Dependencies installed"
EOF
echo -e "${GREEN}✅ Dependencies up to date${NC}"
echo ""

# Step 6: Run database migrations (if any)
echo -e "${YELLOW}🗄️  Step 6/7: Checking database migrations...${NC}"
ssh -i "$SSH_KEY" "$PROD_SERVER" << 'EOF'
  cd /home/ubuntu/Mediczy
  
  # Check if there are new migrations
  if [ -d "server/migrations" ]; then
    echo "Migration files found - please run manually if needed"
    ls -lh server/migrations/
  else
    echo "No migrations directory found"
  fi
EOF
echo -e "${GREEN}✅ Database check complete${NC}"
echo ""

# Step 7: Restart services
echo -e "${YELLOW}🔄 Step 7/7: Restarting production services...${NC}"
ssh -i "$SSH_KEY" "$PROD_SERVER" << 'EOF'
  cd /home/ubuntu/Mediczy
  
  # Make scripts executable
  chmod +x start.sh stop.sh restart.sh
  
  # Restart using the restart script
  echo "Restarting services with PM2..."
  ./restart.sh
EOF
echo -e "${GREEN}✅ Services restarted${NC}"
echo ""

# Step 8: Verify deployment
echo -e "${YELLOW}🔍 Verifying deployment...${NC}"
sleep 5
ssh -i "$SSH_KEY" "$PROD_SERVER" << 'EOF'
  cd /home/ubuntu/Mediczy
  
  # Check if PM2 processes are running
  if command -v pm2 &> /dev/null; then
    echo "PM2 process status:"
    pm2 list
    echo ""
    echo "Recent PM2 logs:"
    pm2 logs --lines 10 --nostream
  elif [ -f "server.pid" ]; then
    PID=$(cat server.pid)
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "✅ Server is running (PID: $PID)"
    else
      echo "⚠️  Server process not found"
    fi
  else
    echo "⚠️  Cannot determine server status"
  fi
EOF

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Deployment Completed Successfully!   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Summary:${NC}"
echo -e "  • Code: Latest from main branch"
echo -e "  • Dependencies: Updated"
echo -e "  • Services: Restarted with PM2"
echo -e "  • Backup: Created on production server"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo -e "  1. Verify API health: curl http://13.234.17.52:8888/v1/health"
echo -e "  2. Monitor logs: ssh -i $SSH_KEY $PROD_SERVER 'cd $PROD_PATH && pm2 logs'"
echo -e "  3. Check metrics: ssh -i $SSH_KEY $PROD_SERVER 'cd $PROD_PATH && pm2 monit'"
echo ""
echo -e "${YELLOW}🔙 Rollback (if needed):${NC}"
echo -e "  ssh -i $SSH_KEY $PROD_SERVER"
echo -e "  cd /home/ubuntu"
echo -e "  ./stop.sh"
echo -e "  rm -rf Mediczy"
echo -e "  mv $BACKUP_NAME Mediczy"
echo -e "  cd Mediczy && ./start.sh"
echo ""
