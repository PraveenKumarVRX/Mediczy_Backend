#!/bin/bash
echo "=== OAuth Configuration Test ==="
echo ""
echo "1. Checking environment variables:"
if [ -n "$GOOGLE_CLIENT_ID" ]; then
  echo "   ✅ GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
else
  echo "   ❌ GOOGLE_CLIENT_ID: Not set"
fi

if [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  echo "   ✅ GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:10}..."
else
  echo "   ❌ GOOGLE_CLIENT_SECRET: Not set"
fi

if [ -n "$GOOGLE_CALLBACK_URL" ]; then
  echo "   ✅ GOOGLE_CALLBACK_URL: $GOOGLE_CALLBACK_URL"
else
  echo "   ❌ GOOGLE_CALLBACK_URL: Not set"
fi

echo ""
echo "2. Testing OAuth status endpoint:"
curl -s http://localhost:8000/api/auth/oauth/status | jq

echo ""
echo "3. Expected callback URLs:"
echo "   Production: https://mediqzy.com/api/auth/google/callback"
echo "   Development: http://localhost:8000/api/auth/google/callback"
echo ""
echo "4. Make sure Google OAuth consent screen has these redirect URIs allowed!"
