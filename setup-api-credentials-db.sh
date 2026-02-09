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

echo -e "${YELLOW}Step 1: Checking database connection...${NC}"
if psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c '\q' 2>/dev/null; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    echo "Please ensure PostgreSQL is running and credentials are correct"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Checking if api_credentials table exists...${NC}"
TABLE_EXISTS=$(psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='api_credentials');")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo -e "${GREEN}✓ Table already exists${NC}"
    echo ""
    echo "Table structure:"
    psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c '\d api_credentials'
else
    echo -e "${YELLOW}Table does not exist. Creating it now...${NC}"
    
    # Create the table
    psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -f /home/ubuntu/Mediczy/create-api-credentials-table.sql
    
    echo -e "${GREEN}✓ Table created successfully${NC}"
    echo ""
    echo "Table structure:"
    psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c '\d api_credentials'
fi

echo ""
echo -e "${YELLOW}Step 3: Verifying admin user exists...${NC}"
ADMIN_EXISTS=$(psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -tAc "SELECT EXISTS (SELECT 1 FROM users WHERE email='admin@mediczy.com' AND role IN ('admin', 'super_admin'));")

if [ "$ADMIN_EXISTS" = "t" ]; then
    echo -e "${GREEN}✓ Admin user exists${NC}"
    psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c "SELECT id, email, role, \"firstName\", \"lastName\" FROM users WHERE email='admin@mediczy.com';"
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
