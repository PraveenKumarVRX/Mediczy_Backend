#!/bin/bash

# WhatsApp Business API Test Script

echo "🚀 Starting WhatsApp Business API Tests"
echo "========================================"

# Check if server is running
echo "📡 Checking server health..."
SERVER_HEALTH=$(curl -s "http://localhost:8000/health")
if [ $? -eq 0 ]; then
    echo "✅ Server is running"
else
    echo "❌ Server is not running. Please start the server first."
    exit 1
fi

# Get admin JWT token
echo "🔐 Getting admin authentication token..."
ADMIN_TOKEN=$(curl -s -X POST "http://localhost:8000/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@mediczy.com", "password": "SecurePass123"}' | \
  grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$ADMIN_TOKEN" ]; then
    echo "❌ Failed to get authentication token"
    exit 1
fi

echo "✅ Authentication token obtained"

# Test Business Profile endpoint
echo ""
echo "📋 Testing Business Profile endpoint..."
curl -s -X GET "http://localhost:8000/api/whatsapp-business/business/profile" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" | jq .

# Test Phone Number Info endpoint
echo ""
echo "📱 Testing Phone Number Info endpoint..."
curl -s -X GET "http://localhost:8000/api/whatsapp-business/phone/info" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" | jq .

# Test Template Creation endpoint
echo ""
echo "📝 Testing Template Creation endpoint..."
curl -s -X POST "http://localhost:8000/api/whatsapp-business/templates/create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test_appointment_reminder",
    "category": "UTILITY",
    "language": "en_US",
    "components": [
      {
        "type": "HEADER",
        "format": "TEXT",
        "text": "Appointment Reminder"
      },
      {
        "type": "BODY",
        "text": "Hello {{1}}, your appointment is scheduled for {{2}}."
      },
      {
        "type": "FOOTER",
        "text": "Mediczy Healthcare"
      }
    ]
  }' | jq .

# Test Advanced Message Sending
echo ""
echo "💬 Testing Advanced Message Sending..."
curl -s -X POST "http://localhost:8000/api/whatsapp-business/messages/send" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "type": "text",
    "content": "Hello! This is a test message from Mediczy Healthcare."
  }' | jq .

# Test Healthcare Templates Creation
echo ""
echo "🏥 Testing Healthcare Templates Creation..."
curl -s -X POST "http://localhost:8000/api/whatsapp-business/templates/healthcare" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" | jq .

# Test Interactive Button Message
echo ""
echo "🔘 Testing Interactive Button Message..."
curl -s -X POST "http://localhost:8000/api/whatsapp-business/messages/interactive/buttons" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "bodyText": "Please confirm your appointment:",
    "buttons": [
      {"title": "Confirm"},
      {"title": "Reschedule"}
    ]
  }' | jq .

# Test QR Code Generation
echo ""
echo "🎯 Testing QR Code Generation..."
curl -s -X GET "http://localhost:8000/api/whatsapp-business/qr-code?prefilled_message=Hello%20Mediczy" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

echo ""
echo "🎉 WhatsApp Business API Tests Completed!"
echo "========================================"