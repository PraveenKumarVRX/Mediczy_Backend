#!/bin/bash
# Chat Dashboard Test Script

echo "Testing Chat Dashboard API Endpoints..."

API_BASE_URL=${TEST_BASE_URL:-"http://localhost:8000/api"}
ADMIN_EMAIL=${ADMIN_EMAIL:-"admin@mediczy.local"}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-"Admin@1234"}

# Get admin token
echo "Getting admin token..."
TOKEN=$(curl -s -X POST "$API_BASE_URL/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | \
  jq -r '.token' 2>/dev/null)

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Got admin token: ${TOKEN:0:50}..."

# Test dashboard overview
echo ""
echo "Testing dashboard overview..."
curl -s "$API_BASE_URL/chat/dashboard/overview" \
  -H "Authorization: Bearer $TOKEN" | jq '.' || echo "❌ Overview failed"

# Test conversations endpoint
echo ""
echo "Testing conversations endpoint..."
curl -s "$API_BASE_URL/chat/dashboard/conversations" \
  -H "Authorization: Bearer $TOKEN" | jq '.' || echo "❌ Conversations failed"

# Test analytics endpoint
echo ""
echo "Testing analytics endpoint..."
curl -s "$API_BASE_URL/chat/dashboard/analytics?period=7d" \
  -H "Authorization: Bearer $TOKEN" | jq '.' || echo "❌ Analytics failed"

echo ""
echo "✅ Chat Dashboard API test completed!"