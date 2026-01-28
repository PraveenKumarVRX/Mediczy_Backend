#!/bin/bash

echo "=================================================="
echo "🔍 Testing Wallet + Emergency Functions"
echo "=================================================="
echo ""

API_URL="http://localhost:8000/api"
USER_EMAIL="user@mediczy.com"
USER_PASSWORD="User123"

# Login
echo "1️⃣ User Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  echo "$LOGIN_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Login successful"
echo ""

# Test Wallet
echo "2️⃣ Testing Wallet..."
WALLET_RESPONSE=$(curl -s -X GET "$API_URL/wallet" \
  -H "Authorization: Bearer $TOKEN")

WALLET_SUCCESS=$(echo "$WALLET_RESPONSE" | jq -r '.success')

if [ "$WALLET_SUCCESS" = "true" ]; then
  BALANCE=$(echo "$WALLET_RESPONSE" | jq -r '.data.balance')
  echo "✅ Wallet API: WORKING"
  echo "   Balance: $BALANCE HC"
else
  echo "❌ Wallet API: FAILED"
  echo "$WALLET_RESPONSE" | jq '.'
fi
echo ""

# Test Emergency - Triage Doctors
echo "3️⃣ Testing Emergency (Triage Doctors)..."
DOCTORS_RESPONSE=$(curl -s -X GET "$API_URL/medical-ai/triage-doctors" \
  -H "Authorization: Bearer $TOKEN")

DOCTORS_SUCCESS=$(echo "$DOCTORS_RESPONSE" | jq -r '.success')

if [ "$DOCTORS_SUCCESS" = "true" ]; then
  DOCTOR_COUNT=$(echo "$DOCTORS_RESPONSE" | jq -r '.count')
  echo "✅ Emergency API: WORKING"
  echo "   Doctors online: $DOCTOR_COUNT"
else
  echo "❌ Emergency API: FAILED"
  echo "$DOCTORS_RESPONSE" | jq '.'
fi
echo ""

# Test Emergency - AI Consultation
echo "4️⃣ Testing Dr. iSHA AI..."
AI_RESPONSE=$(curl -s -X POST "$API_URL/medical-ai/consult" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "I have a headache"}')

AI_SUCCESS=$(echo "$AI_RESPONSE" | jq -r '.success')

if [ "$AI_SUCCESS" = "true" ]; then
  echo "✅ Dr. iSHA AI: WORKING"
else
  echo "❌ Dr. iSHA AI: FAILED"
  echo "$AI_RESPONSE" | jq '.'
fi
echo ""

# Summary
echo "=================================================="
echo "📊 SUMMARY"
echo "=================================================="
if [ "$WALLET_SUCCESS" = "true" ]; then
  echo "✅ Wallet: WORKING"
else
  echo "❌ Wallet: NOT WORKING"
fi

if [ "$DOCTORS_SUCCESS" = "true" ]; then
  echo "✅ Emergency: WORKING"
else
  echo "❌ Emergency: NOT WORKING"
fi

if [ "$AI_SUCCESS" = "true" ]; then
  echo "✅ Dr. iSHA: WORKING"
else
  echo "❌ Dr. iSHA: NOT WORKING"
fi
echo ""
echo "Token: ${TOKEN:0:50}..."
echo ""
echo "If both are working in backend but not in browser:"
echo "1. Open browser console (F12)"
echo "2. Check for errors"
echo "3. Check Network tab for failed requests"
echo "4. Verify localStorage has 'token' key"
echo "5. Try: localStorage.clear(); then re-login"
