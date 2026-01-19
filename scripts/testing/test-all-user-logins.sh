#!/bin/bash
# Test all login endpoints with database users and update passwords

API_URL="http://localhost:8000/api"
PASSWORD="SecurePass123"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                                                                   ║"
echo "║         TESTING ALL LOGIN ENDPOINTS WITH DB USERS                 ║"
echo "║                                                                   ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Generate bcrypt hash for SecurePass123
echo "Generating password hash..."
HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('SecurePass123', 10).then(hash => console.log(hash));")
echo "Hash generated: ${HASH:0:20}..."
echo ""

# Update passwords in database
echo "═══════════════════════════════════════════════════════════════════"
echo "  UPDATING PASSWORDS IN DATABASE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

mysql -u mediczy -pMediczy2024Secure mediczy << EOF 2>&1 | grep -v "Warning"
-- Update user passwords
UPDATE users SET password='$HASH' WHERE email='john@mediqzy.com';
UPDATE users SET password='$HASH' WHERE email='admin@mediqzy.com';

-- Update doctor passwords
UPDATE doctors SET password='$HASH' WHERE email='rajesh.doctor@mediqzy.com';
UPDATE doctors SET password='$HASH' WHERE email='meera.doctor@mediqzy.com';

-- Update nurse passwords
UPDATE nurses SET password='$HASH' WHERE email='priya.nurse@mediqzy.com';
UPDATE nurses SET password='$HASH' WHERE email='nurse@mediczy.com';

SELECT 'Passwords updated successfully' as Status;
EOF

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  TESTING LOGIN ENDPOINTS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test User/Patient Login
echo "1. Testing User/Patient Login (john@mediqzy.com)..."
RESPONSE=$(curl -s -X POST "$API_URL/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"john@mediqzy.com","password":"SecurePass123"}')
if echo "$RESPONSE" | grep -q "token"; then
  echo "   ✓ User login SUCCESS"
else
  echo "   ✗ User login FAILED: $(echo $RESPONSE | jq -r '.message' 2>/dev/null || echo $RESPONSE)"
fi
echo ""

# Test Admin Login
echo "2. Testing Admin Login (admin@mediqzy.com)..."
RESPONSE=$(curl -s -X POST "$API_URL/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mediqzy.com","password":"SecurePass123"}')
if echo "$RESPONSE" | grep -q "token"; then
  echo "   ✓ Admin login SUCCESS"
else
  echo "   ✗ Admin login FAILED: $(echo $RESPONSE | jq -r '.message' 2>/dev/null || echo $RESPONSE)"
fi
echo ""

# Test Doctor Login
echo "3. Testing Doctor Login (rajesh.doctor@mediqzy.com)..."
RESPONSE=$(curl -s -X POST "$API_URL/doctors/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"rajesh.doctor@mediqzy.com","password":"SecurePass123"}')
if echo "$RESPONSE" | grep -q "token"; then
  echo "   ✓ Doctor login SUCCESS"
else
  echo "   ✗ Doctor login FAILED: $(echo $RESPONSE | jq -r '.message' 2>/dev/null || echo $RESPONSE)"
fi
echo ""

# Test Nurse Login
echo "4. Testing Nurse Login (priya.nurse@mediqzy.com)..."
RESPONSE=$(curl -s -X POST "$API_URL/nurse/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"priya.nurse@mediqzy.com","password":"SecurePass123"}')
if echo "$RESPONSE" | grep -q "token"; then
  echo "   ✓ Nurse login SUCCESS"
else
  echo "   ✗ Nurse login FAILED: $(echo $RESPONSE | jq -r '.message' 2>/dev/null || echo $RESPONSE)"
fi
echo ""

# Test Team/Assistant Login
echo "5. Testing Assistant Login (rahul.assistant@mediqzy.com)..."
# First need to check if assistants table exists
mysql -u mediczy -pMediczy2024Secure mediczy -e "SELECT COUNT(*) as count FROM doctor_assistants WHERE email='rahul.assistant@mediqzy.com';" 2>&1 | grep -v "Warning" | tail -1 | grep -q "^0$" && \
  echo "   ⚠ No assistant found in database" || \
  (RESPONSE=$(curl -s -X POST "$API_URL/assistant/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"rahul.assistant@mediqzy.com","password":"SecurePass123"}')
  if echo "$RESPONSE" | grep -q "token"; then
    echo "   ✓ Assistant login SUCCESS"
  else
    echo "   ✗ Assistant login FAILED: $(echo $RESPONSE | jq -r '.message' 2>/dev/null || echo $RESPONSE)"
  fi)
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "  FRONTEND LOGIN PAGES CHECK"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

FRONTEND_URL="http://localhost:3000"

declare -A PAGES=(
  ["User/Patient Login"]="/login"
  ["Admin Login"]="/admin/login"
  ["Doctor Login"]="/doctor/login"
  ["Nurse Login"]="/nurse/login"
  ["Team Login"]="/team/login"
  ["Assistant Login"]="/assistant/login"
)

for name in "${!PAGES[@]}"; do
  path="${PAGES[$name]}"
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL$path")
  if [ "$http_code" = "200" ] || [ "$http_code" = "301" ]; then
    echo "✓ $name: $FRONTEND_URL$path (HTTP $http_code)"
  else
    echo "✗ $name: $FRONTEND_URL$path (HTTP $http_code)"
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "All passwords updated to: SecurePass123"
echo ""
echo "Test Accounts:"
echo "  User:      john@mediqzy.com / SecurePass123"
echo "  Admin:     admin@mediqzy.com / SecurePass123"
echo "  Doctor:    rajesh.doctor@mediqzy.com / SecurePass123"
echo "  Nurse:     priya.nurse@mediqzy.com / SecurePass123"
echo ""
echo "Frontend URLs:"
echo "  User:      http://localhost:3000/login"
echo "  Admin:     http://localhost:3000/admin/login"
echo "  Doctor:    http://localhost:3000/doctor/login"
echo "  Nurse:     http://localhost:3000/nurse/login"
echo ""
