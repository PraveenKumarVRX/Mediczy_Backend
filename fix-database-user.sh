#!/bin/bash

echo "════════════════════════════════════════════════════════"
echo "🔧 FIXING DATABASE ISSUES"
echo "════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Target User: user@mediczy.com"
echo "Phone: 7373007737"
echo ""

# Step 1: Check database connection
echo "════════════════════════════════════════════════════════"
echo "STEP 1: Testing Database Connection"
echo "════════════════════════════════════════════════════════"
echo ""

# Use SSH tunnel if available
if lsof -i :5433 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ SSH tunnel is running on port 5433${NC}"
    DB_PORT=5433
else
    echo -e "${YELLOW}⚠️  SSH tunnel not detected${NC}"
    echo "Attempting direct connection to localhost:5433..."
    DB_PORT=5433
fi

# Test connection
CONN_TEST=$(psql -h localhost -p $DB_PORT -U mediczy_helper -d mediczy_ai -c "SELECT 1;" 2>&1)

if echo "$CONN_TEST" | grep -q "^[[:space:]]*1"; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
    DB_CONNECTED=1
elif echo "$CONN_TEST" | grep -q "could not connect"; then
    echo -e "${RED}❌ Cannot connect to database${NC}"
    echo "Error: $CONN_TEST" | head -1
    DB_CONNECTED=0
else
    echo -e "${YELLOW}⚠️  Connection test unclear${NC}"
    echo "Response: $CONN_TEST" | head -3
    DB_CONNECTED=0
fi

echo ""

# Step 2: Check if user exists
echo "════════════════════════════════════════════════════════"
echo "STEP 2: Checking User Existence"
echo "════════════════════════════════════════════════════════"
echo ""

if [ $DB_CONNECTED -eq 1 ]; then
    echo -e "${BLUE}Query: SELECT id, email, \"phoneNumber\", status FROM \"Users\" WHERE email='user@mediczy.com'${NC}"
    echo ""
    
    USER_EXISTS=$(psql -h localhost -p $DB_PORT -U mediczy_helper -d mediczy_ai -t -c \
      "SELECT COUNT(*) FROM \"Users\" WHERE email='user@mediczy.com';" 2>/dev/null | xargs)
    
    if [ "$USER_EXISTS" = "1" ]; then
        echo -e "${GREEN}✅ User exists in database${NC}"
        echo ""
        echo "User Details:"
        psql -h localhost -p $DB_PORT -U mediczy_helper -d mediczy_ai -c \
          "SELECT id, email, \"phoneNumber\", \"firstName\", \"lastName\", status, \"createdAt\" FROM \"Users\" WHERE email='user@mediczy.com';"
        
        # Check status
        USER_STATUS=$(psql -h localhost -p $DB_PORT -U mediczy_helper -d mediczy_ai -t -c \
          "SELECT status FROM \"Users\" WHERE email='user@mediczy.com';" 2>/dev/null | xargs)
        
        if [ "$USER_STATUS" = "active" ]; then
            echo ""
            echo -e "${GREEN}✅ User status is 'active'${NC}"
        else
            echo ""
            echo -e "${YELLOW}⚠️  User status is '$USER_STATUS' (need to set to 'active')${NC}"
            echo "Fixing user status..."
            
            psql -h localhost -p $DB_PORT -U mediczy_helper -d mediczy_ai -c \
              "UPDATE \"Users\" SET status='active', \"updatedAt\"=NOW() WHERE email='user@mediczy.com';" 2>/dev/null
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ User status updated to 'active'${NC}"
            else
                echo -e "${RED}❌ Failed to update user status${NC}"
            fi
        fi
    elif [ "$USER_EXISTS" = "0" ]; then
        echo -e "${YELLOW}⚠️  User does NOT exist in database${NC}"
        echo "Creating user@mediczy.com..."
        echo ""
        
        # Create the user
        psql -h localhost -p $DB_PORT -U mediczy_helper -d mediczy_ai << SQLEOF
INSERT INTO "Users" (
    email,
    "phoneNumber",
    "firstName",
    "lastName",
    password,
    status,
    "emailVerified",
    "phoneVerified",
    "profileComplete",
    "createdAt",
    "updatedAt"
) VALUES (
    'user@mediczy.com',
    '7373007737',
    'Test',
    'User',
    '\$2a\$10\$abcdefghijklmnopqrstuvwxyz',
    'active',
    true,
    false,
    false,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;
SQLEOF
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ User created successfully${NC}"
            echo ""
            
            # Verify creation
            psql -h localhost -p $DB_PORT -U mediczy_helper -d mediczy_ai -c \
              "SELECT id, email, \"phoneNumber\", status FROM \"Users\" WHERE email='user@mediczy.com';"
        else
            echo -e "${RED}❌ Failed to create user${NC}"
        fi
    else
        echo -e "${RED}❌ Query error${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Cannot verify user (database not connected)${NC}"
    echo "Manual SQL command:"
    echo ""
    echo "psql -h localhost -p 5433 -U mediczy_helper -d mediczy_ai << 'SQL'"
    echo "INSERT INTO \"Users\" ("
    echo "  email, \"phoneNumber\", \"firstName\", \"lastName\", status, \"createdAt\", \"updatedAt\""
    echo ") VALUES ("
    echo "  'user@mediczy.com',  '7373007737',  'Test',  'User',  'active',  NOW(),  NOW()"
    echo ");"
    echo "SQL"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "✨ Database fixes complete!"
echo "════════════════════════════════════════════════════════"
