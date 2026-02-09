#!/bin/bash
# Database Setup Script for API Credentials
# Run this on the production server: ubuntu@13.234.17.52

set -e

echo "=== API Credentials Database Setup ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load database credentials from .env file
if [ -f .env ]; then
    echo -e "${YELLOW}Loading database credentials from .env...${NC}"
    export $(grep -E '^DB_PASSWORD=' .env | xargs)
    export $(grep -E '^DB_USER=' .env | xargs)
    export $(grep -E '^DB_NAME=' .env | xargs)
    export $(grep -E '^DB_HOST=' .env | xargs)
    export $(grep -E '^DB_PORT=' .env | xargs)
    
    # Set PostgreSQL password environment variable
    export PGPASSWORD="${DB_PASSWORD}"
    
    # Use values from .env or defaults
    DB_USER="${DB_USER:-mediczy_helper}"
    DB_NAME="${DB_NAME:-mediczy_ai}"
    DB_HOST="${DB_HOST:-127.0.0.1}"
    DB_PORT="${DB_PORT:-5433}"
else
    echo -e "${YELLOW}No .env file found, using defaults${NC}"
    DB_USER="mediczy_helper"
    DB_NAME="mediczy_ai"
    DB_HOST="127.0.0.1"
    DB_PORT="5433"
fi

echo -e "${YELLOW}Step 1: Checking database connection...${NC}"
if PGPASSWORD="${PGPASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c '\q' 2>/dev/null; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    echo "Please ensure PostgreSQL is running and credentials are correct"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Checking if api_credentials table exists...${NC}"
TABLE_EXISTS=$(PGPASSWORD="${PGPASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='api_credentials');")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo -e "${GREEN}✓ Table already exists${NC}"
    echo ""
    echo "Table structure:"
    PGPASSWORD="${PGPASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c '\d api_credentials'
else
    echo -e "${YELLOW}Table does not exist. Creating it now...${NC}"
    
    # Create the table
    PGPASSWORD="${PGPASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -f create-api-credentials-table.sql
    
    echo -e "${GREEN}✓ Table created successfully${NC}"
    echo ""
    echo "Table structure:"
    PGPASSWORD="${PGPASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c '\d api_credentials'
fi

echo ""
echo -e "${YELLOW}Step 3: Verifying admin user exists...${NC}"
ADMIN_EXISTS=$(PGPASSWORD="${PGPASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -tAc "SELECT EXISTS (SELECT 1 FROM users WHERE email='admin@mediczy.com' AND role IN ('admin', 'super_admin'));")

if [ "$ADMIN_EXISTS" = "t" ]; then
    echo -e "${GREEN}✓ Admin user exists${NC}"
    PGPASSWORD="${PGPASSWORD}" psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -c "SELECT id, email, role, \"firstName\", \"lastName\" FROM users WHERE email='admin@mediczy.com';"
else
    echo -e "${YELLOW}Admin user not found${NC}"
    echo "Please create an admin user first"
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Test the admin login:"
echo "   curl -X POST https://app.mediqzy.com/api/admin/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"admin@mediczy.com\",\"password\":\"SecureAdmin123\"}'"
echo ""
echo "2. Generate API credentials:"
echo "   curl -X POST https://app.mediqzy.com/api/admin/api-credentials/generate \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"name\":\"SmartHealth RN\",\"integration_type\":\"smarthealth-rn\",\"organization_id\":1}'"
