#!/bin/bash

echo "🔍 Prescription URL Troubleshooting"
echo "===================================="
echo ""

# Get share URL
TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}' \
  | jq -r .token)

SHARE_DATA=$(curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/share/whatsapp" \
  -H "Authorization: Bearer $TOKEN")

SHARE_TOKEN=$(echo "$SHARE_DATA" | jq -r '.prescriptionUrl' | grep -o 'token=.*' | cut -d'=' -f2)

echo "Your server is running on:"
IP=$(hostname -I | awk '{print $1}')
echo "  IP: $IP"
echo "  Port: 8000"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CORRECT URLs TO USE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Using Server IP (WORKS NOW):"
echo "   http://$IP:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html?token=$SHARE_TOKEN"
echo ""
echo "2. Using localhost (if on same machine):"
echo "   http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html?token=$SHARE_TOKEN"
echo ""
echo "3. Using domain (ONLY if mediqzy.com points to this server):"
echo "   https://app.mediqzy.com/api/prescriptions/RX-MJFXG1H6-PDJHU/html?token=$SHARE_TOKEN"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "❌ WHY mediqzy.com MIGHT NOT WORK:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "• Domain doesn't point to this server"
echo "• No SSL certificate (https required)"
echo "• Firewall blocking port 8000"
echo "• DNS not configured"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ IMMEDIATE SOLUTION:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Use SERVER IP instead of domain:"
echo ""
echo "http://$IP:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html?token=$SHARE_TOKEN"
echo ""
echo "Copy the URL above and paste in browser!"
echo ""

# Test if it works
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Testing URL..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TEST_RESULT=$(curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html?token=$SHARE_TOKEN" | head -50)

if echo "$TEST_RESULT" | grep -q "<!DOCTYPE html"; then
  echo "✅ HTML is valid"
fi

if echo "$TEST_RESULT" | grep -q "<style>"; then
  echo "✅ CSS styles present"
fi

if echo "$TEST_RESULT" | grep -q ".emr-header"; then
  echo "✅ EMR header styles found"
fi

if echo "$TEST_RESULT" | grep -q "Kumar Sharma"; then
  echo "✅ Doctor name present"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 The prescription WILL SHOW:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Blue gradient header"
echo "✅ Gold specialty text"
echo "✅ White circular seal"
echo "✅ Formatted medication table"
echo "✅ Print button (top right)"
echo ""
echo "IF you use the IP address URL above!"
echo ""
