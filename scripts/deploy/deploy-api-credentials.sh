#!/bin/bash
# Quick Deploy API Credentials Updates
# Deploys route fixes and frontend UI to production

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Production server
PROD_SERVER="ubuntu@13.127.125.93"
PROD_PATH="/home/ubuntu/Mediczy"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  API Credentials Deployment            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}📦 Changes to deploy:${NC}"
echo "  ✓ Fixed API routes (server/api/admin/api-credentials.routes.js)"
echo "  ✓ Frontend UI (ApiCredentialsManagement.tsx)"
echo "  ✓ Service layer updates"
echo "  ✓ Admin navigation"
echo ""

# Step 1: SSH and pull latest changes
echo -e "${YELLOW}🚀 Step 1/3: Pulling latest code on production...${NC}"
ssh -o StrictHostKeyChecking=no "$PROD_SERVER" << 'ENDSSH'
cd /home/ubuntu/Mediczy
echo "Current directory: $(pwd)"
echo "Current branch: $(git branch --show-current)"
git fetch origin
git pull origin main
echo "✓ Code updated"
ENDSSH

# Step 2: Restart backend
echo ""
echo -e "${YELLOW}🔄 Step 2/3: Restarting backend server...${NC}"
ssh -o StrictHostKeyChecking=no "$PROD_SERVER" << 'ENDSSH'
cd /home/ubuntu/Mediczy
pm2 restart mediczy-server
echo "✓ Backend restarted"
ENDSSH

# Step 3: Verify deployment
echo ""
echo -e "${YELLOW}✅ Step 3/3: Verifying deployment...${NC}"
sleep 3
ssh -o StrictHostKeyChecking=no "$PROD_SERVER" << 'ENDSSH'
pm2 status | grep mediczy-server
echo ""
echo "Testing API endpoint..."
curl -s http://localhost:8888/api/admin/health | head -5
ENDSSH

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment Complete! ✓             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "  1. Test API: curl -X POST https://app.mediqzy.com/api/admin/api-credentials/generate"
echo "  2. Build frontend: cd client && npm run build"
echo "  3. Access UI: https://app.mediqzy.com/admin/api-credentials"
echo ""
echo -e "${YELLOW}💡 Note:${NC} Frontend build is NOT automatic. Run 'npm run build' in client folder."
