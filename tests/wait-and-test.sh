#!/bin/bash

###############################################################################
# Wait for Rate Limit and Run Tests
# Waits for admin login rate limit to clear before running tests
###############################################################################

echo "🔒 Checking admin login rate limit status..."
echo ""

# Try to login
RESPONSE=$(curl -s -X POST https://mediqzy.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mediqzy.com","password":"SecurePass123"}')

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "Too many failed login attempts"; then
    MINUTES=$(echo "$RESPONSE" | grep -oP '\d+ minutes?' | grep -oP '\d+')
    echo ""
    echo "⚠️  Rate limit active! Too many failed login attempts."
    echo "⏰  Need to wait $MINUTES minutes before testing."
    echo ""
    echo "Options:"
    echo "  1. Wait $MINUTES minutes and run: npm test"
    echo "  2. Clear rate limit in database (if you have access)"
    echo "  3. Test other features: npm run test:all-logins"
    exit 1
elif echo "$RESPONSE" | grep -q "Invalid credentials"; then
    echo ""
    echo "❌ Invalid credentials!"
    echo "Please update .env with correct admin credentials."
    exit 1
elif echo "$RESPONSE" | grep -q "token"; then
    echo ""
    echo "✅ Admin login working! Running tests..."
    echo ""
    npm test
else
    echo ""
    echo "⚠️  Unexpected response. Check backend server."
    exit 1
fi
