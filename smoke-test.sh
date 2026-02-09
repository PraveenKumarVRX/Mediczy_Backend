#!/bin/bash
# Comprehensive Smoke Test for API Credentials System

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  API CREDENTIALS MANAGEMENT - SANITY & SMOKE TEST        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

export PGPASSWORD='Mediczy2024Helper'
DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_USER="mediczy_helper"
DB_NAME="mediczy_ai"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 1: Database Structure Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${YELLOW}Checking api_credentials table...${NC}"
CRED_TABLE=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='api_credentials';")
if [ "$CRED_TABLE" = "1" ]; then
    echo -e "${GREEN}✓ api_credentials table exists${NC}"
   
CRED_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM api_credentials;")
    echo -e "${GREEN}✓ Records in api_credentials: $CRED_COUNT${NC}"
else
    echo -e "${RED}✗ api_credentials table NOT found${NC}"
fi

echo -e "${YELLOW}Checking api_credential_audit_log table...${NC}"
AUDIT_TABLE=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='api_credential_audit_log';")
if [ "$AUDIT_TABLE" = "1" ]; then
    echo -e "${GREEN}✓ api_credential_audit_log table exists${NC}"
    
    AUDIT_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT COUNT(*) FROM api_credential_audit_log;")
    echo -e "${GREEN}✓ Audit log entries: $AUDIT_COUNT${NC}"
else
    echo -e "${RED}✗ api_credential_audit_log table NOT found${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 2: Credential Data Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${YELLOW}Latest credential:${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    name,
    client_id,
    integration_type,
    status,
    is_active,
    created_at,
    expires_at
FROM api_credentials 
ORDER BY created_at DESC 
LIMIT 1;
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 3: Audit Log Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${YELLOW}Recent audit entries:${NC}"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    credential_id,
    action,
    performed_by,
    ip_address,
    performed_at
FROM api_credential_audit_log 
ORDER BY performed_at DESC 
LIMIT 5;
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 4: API Endpoint Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${YELLOW}Testing admin login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST https://app.mediqzy.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mediczy.com","password":"SecureAdmin123"}')

if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ Admin login successful${NC}"
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    echo -e "${YELLOW}Testing GET /api/admin/api-credentials...${NC}"
    GET_RESPONSE=$(curl -s -X GET https://app.mediqzy.com/api/admin/api-credentials \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$GET_RESPONSE" | grep -q "success.*true"; then
        echo -e "${GREEN}✓ GET endpoint working${NC}"
        CRED_COUNT=$(echo "$GET_RESPONSE" | grep -o '"id":[0-9]*' | wc -l)
        echo -e "${BLUE}  Found $CRED_COUNT credential(s)${NC}"
    else
        echo -e "${RED}✗ GET endpoint failed${NC}"
    fi
else
    echo -e "${RED}✗ Admin login failed${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 5: Server Health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${YELLOW}PM2 server status:${NC}"
pm2 describe mediczy-server | grep -E "(status|uptime|restarts|memory|cpu)" || pm2 list | grep mediczy-server

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  SMOKE TEST COMPLETE                                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
