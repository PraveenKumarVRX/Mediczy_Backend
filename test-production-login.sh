#!/bin/bash

# Production Login Diagnostic Script
# Tests login endpoint and common issues

PRODUCTION_URL="${1:-https://mediqzy.com}"
EMAIL="${2:-user@test.com}"
PASSWORD="${3:-password123}"

echo "🔍 Production Login Diagnostic"
echo "================================"
echo "URL: $PRODUCTION_URL"
echo "Email: $EMAIL"
echo ""

# Test 1: CORS preflight
echo "1. Testing CORS preflight..."
CORS_RESPONSE=$(curl -s -i -X OPTIONS "$PRODUCTION_URL/api/users/login" \
  -H "Origin: https://mediqzy.com" \
  -H "Access-Control-Request-Method: POST" 2>&1)

if echo "$CORS_RESPONSE" | grep -q "200"; then
  echo "   ✅ CORS preflight: OK"
else
  echo "   ❌ CORS preflight: FAILED"
  echo "$CORS_RESPONSE" | head -10
fi
echo ""

# Test 2: Endpoint accessibility
echo "2. Testing endpoint accessibility..."
HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null "$PRODUCTION_URL/api/users/login" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}')

echo "   HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "401" ]; then
  echo "   ✅ Endpoint responds with 401 (expected for invalid credentials)"
elif [ "$HTTP_CODE" = "500" ]; then
  echo "   ❌ Server error (500)"
elif [ "$HTTP_CODE" = "503" ]; then
  echo "   ❌ Service unavailable (503)"
else
  echo "   ⚠️  Unexpected status: $HTTP_CODE"
fi
echo ""

# Test 3: Actual login attempt
echo "3. Testing login with provided credentials..."
LOGIN_RESPONSE=$(curl -s -X POST "$PRODUCTION_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

echo "Response:"
echo "$LOGIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESPONSE"
echo ""

# Test 4: Doctor login endpoint
echo "4. Testing doctor login endpoint (for reference)..."
DOCTOR_RESPONSE=$(curl -s -w "HTTP: %{http_code}\n" -X POST "$PRODUCTION_URL/api/doctors/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@test.com","password":"test"}' | tail -1)
echo "   $DOCTOR_RESPONSE"
echo ""

# Test 5: Check response headers
echo "5. Checking response headers..."
HEADERS=$(curl -s -i -X POST "$PRODUCTION_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' 2>&1 | head -20)
echo "$HEADERS" | grep -E "Content-Type|Access-Control|X-"
echo ""

# Test 6: Rate limiting check
echo "6. Checking rate limiting..."
for i in {1..5}; do
  RATE_CHECK=$(curl -s -i -X POST "$PRODUCTION_URL/api/users/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test"}' 2>&1 | grep -i "rate-limit\|429")
  if [ ! -z "$RATE_CHECK" ]; then
    echo "   ⚠️  Rate limit detected on attempt $i"
    break
  fi
done
echo "   ✅ Rate limiting: Normal"
echo ""

echo "================================"
echo "📝 Recommendations:"
echo "  1. Verify credentials are correct"
echo "  2. Check if user account exists in production database"
echo "  3. If 500 errors appear, check server logs"
echo "  4. If 403 appears, user may have different role (doctor/admin)"
echo "  5. If rate-limited, wait 15 minutes before retrying"
