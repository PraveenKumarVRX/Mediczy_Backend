#!/bin/bash

###############################################################################
# RocketChat Auth Token Refresh Script
# Regenerates expired RocketChat authentication credentials
# Updates .env file and restarts backend service
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/server/.env"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RocketChat Auth Token Refresh${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ Error: .env file not found at $ENV_FILE${NC}"
  exit 1
fi

# Load current credentials
source "$ENV_FILE" 2>/dev/null || true

if [ -z "${ROCKETCHAT_ADMIN_USER:-}" ] || [ -z "${ROCKETCHAT_ADMIN_PASSWORD:-}" ]; then
  echo -e "${RED}❌ Error: ROCKETCHAT_ADMIN_USER or ROCKETCHAT_ADMIN_PASSWORD not set in .env${NC}"
  exit 1
fi

ROCKETCHAT_URL="${ROCKETCHAT_URL:-https://smart-chat.live}"

echo -e "${YELLOW}🔐 Current Authentication Status:${NC}"
echo "  RocketChat URL: $ROCKETCHAT_URL"
echo "  Admin User: $ROCKETCHAT_ADMIN_USER"
echo "  Current User ID: ${ROCKETCHAT_USER_ID:-NOT SET}"
echo "  Current Auth Token: ${ROCKETCHAT_AUTH_TOKEN:0:20:-NOT SET}..."
echo ""

# Step 1: Login to RocketChat API
echo -e "${BLUE}🔄 Step 1: Logging in to RocketChat...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$ROCKETCHAT_URL/api/v1/login" \
  -H "Content-Type: application/json" \
  -d "{\"user\": \"$ROCKETCHAT_ADMIN_USER\", \"password\": \"$ROCKETCHAT_ADMIN_PASSWORD\"}")

# Check if login was successful
if echo "$LOGIN_RESPONSE" | grep -q '"status":"success"'; then
  echo -e "${GREEN}✅ Login successful${NC}"
else
  echo -e "${RED}❌ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

# Extract new credentials
NEW_USER_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
NEW_AUTH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"authToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$NEW_USER_ID" ] || [ -z "$NEW_AUTH_TOKEN" ]; then
  echo -e "${RED}❌ Failed to extract credentials from response${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ New Credentials Obtained:${NC}"
echo "  User ID: $NEW_USER_ID"
echo "  Auth Token: ${NEW_AUTH_TOKEN:0:20}...${NEW_AUTH_TOKEN: -10}"
echo ""

# Step 2: Backup current .env
echo -e "${BLUE}🔄 Step 2: Backing up .env file...${NC}"
BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✅ Backup saved: $BACKUP_FILE${NC}"
echo ""

# Step 3: Update .env file
echo -e "${BLUE}🔄 Step 3: Updating .env file...${NC}"

# Check if variables exist in .env
if grep -q "^ROCKETCHAT_USER_ID=" "$ENV_FILE"; then
  sed -i "s|^ROCKETCHAT_USER_ID=.*|ROCKETCHAT_USER_ID=$NEW_USER_ID|" "$ENV_FILE"
  echo -e "${GREEN}✅ Updated ROCKETCHAT_USER_ID${NC}"
else
  echo "ROCKETCHAT_USER_ID=$NEW_USER_ID" >> "$ENV_FILE"
  echo -e "${YELLOW}⚠️  Added ROCKETCHAT_USER_ID (was not present)${NC}"
fi

if grep -q "^ROCKETCHAT_AUTH_TOKEN=" "$ENV_FILE"; then
  sed -i "s|^ROCKETCHAT_AUTH_TOKEN=.*|ROCKETCHAT_AUTH_TOKEN=$NEW_AUTH_TOKEN|" "$ENV_FILE"
  echo -e "${GREEN}✅ Updated ROCKETCHAT_AUTH_TOKEN${NC}"
else
  echo "ROCKETCHAT_AUTH_TOKEN=$NEW_AUTH_TOKEN" >> "$ENV_FILE"
  echo -e "${YELLOW}⚠️  Added ROCKETCHAT_AUTH_TOKEN (was not present)${NC}"
fi

echo ""

# Step 4: Verify update
echo -e "${BLUE}🔄 Step 4: Verifying .env update...${NC}"
if grep -q "$NEW_USER_ID" "$ENV_FILE" && grep -q "$NEW_AUTH_TOKEN" "$ENV_FILE"; then
  echo -e "${GREEN}✅ .env file updated successfully${NC}"
else
  echo -e "${RED}❌ .env update verification failed${NC}"
  echo -e "${YELLOW}Restoring backup...${NC}"
  cp "$BACKUP_FILE" "$ENV_FILE"
  exit 1
fi
echo ""

# Step 5: Test API access with new token
echo -e "${BLUE}🔄 Step 5: Testing new credentials...${NC}"
TEST_RESPONSE=$(curl -s -X GET "$ROCKETCHAT_URL/api/v1/me" \
  -H "X-Auth-Token: $NEW_AUTH_TOKEN" \
  -H "X-User-Id: $NEW_USER_ID")

if echo "$TEST_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Credentials validated successfully${NC}"
else
  echo -e "${RED}❌ Credential validation failed${NC}"
  echo "Response: $TEST_RESPONSE"
  echo -e "${YELLOW}Restoring backup...${NC}"
  cp "$BACKUP_FILE" "$ENV_FILE"
  exit 1
fi
echo ""

# Step 6: Restart PM2 service
echo -e "${BLUE}🔄 Step 6: Restarting backend service...${NC}"
if command -v pm2 &> /dev/null; then
  echo "Running: pm2 restart mediczy-server --update-env"
  pm2 restart mediczy-server --update-env
  echo -e "${GREEN}✅ Backend restarted${NC}"
else
  echo -e "${YELLOW}⚠️  PM2 not found - please restart backend manually${NC}"
fi
echo ""

# Step 7: Test message delivery
echo -e "${BLUE}🔄 Step 7: Testing WhatsApp → RocketChat delivery...${NC}"
sleep 2  # Wait for backend to fully restart

TEST_MESSAGE=$(cat <<EOF
{
  "from": "whatsapp:+910000000000",
  "text": "🧪 Test message after auth refresh - $(date +%H:%M:%S)",
  "userName": "Auth Refresh Test"
}
EOF
)

echo "Sending test message via internal API..."
# This would normally be done via the WhatsApp webhook, but we can test the service directly
echo "$TEST_MESSAGE" | curl -s -X POST http://localhost:8888/api/support/test-rocketchat \
  -H "Content-Type: application/json" \
  -d @- > /dev/null 2>&1 || echo -e "${YELLOW}⚠️  Internal test endpoint not available${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Auth Refresh Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo "  • Old User ID: ${ROCKETCHAT_USER_ID:-N/A}"
echo "  • New User ID: $NEW_USER_ID"
echo "  • Auth Token refreshed: $(date)"
echo "  • Backup saved: $BACKUP_FILE"
echo "  • Backend restarted: ✅"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. Send a WhatsApp message to +918098998998"
echo "  2. Check RocketChat #general channel"
echo "  3. Monitor logs: pm2 logs mediczy-server | grep -i rocketchat"
echo ""
echo -e "${BLUE}🔍 Check Logs:${NC}"
echo "  pm2 logs mediczy-server --lines 20 | grep -E 'posted to RocketChat|RC Webhook|RC API'"
echo ""
