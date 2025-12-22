#!/bin/bash

echo "🔍 Testing Dr. iSHA API Debug"
echo "=============================="

# Test 1: Check if we can reach the health endpoint
echo "1. Testing Dr. iSHA health endpoint..."
curl -s -k "https://192.168.1.72:9443/api/dr-isha/health" | head -200

echo -e "\n\n2. Testing with a sample token (if available)..."

# Try to get a token by logging in
echo "Attempting login to get a valid token..."
login_response=$(curl -s -k -X POST "https://192.168.1.72:9443/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@mediczy.com", "password": "test123"}')

echo "Login response: $login_response"

# Extract token if login was successful
token=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$token" ]; then
    echo "✅ Token obtained: ${token:0:50}..."
    
    echo -e "\n3. Testing Dr. iSHA consultation with valid token..."
    curl -s -k -X POST "https://192.168.1.72:9443/api/dr-isha/consult" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d '{"query": "hello dr isha", "language": "en"}' | head -500
else
    echo "❌ Could not obtain token. Login failed."
    echo "Trying without authentication..."
    
    echo -e "\n3. Testing Dr. iSHA consultation without token..."
    curl -s -k -X POST "https://192.168.1.72:9443/api/dr-isha/consult" \
      -H "Content-Type: application/json" \
      -d '{"query": "hello dr isha", "language": "en"}' | head -500
fi

echo -e "\n\n🏥 Dr. iSHA Debug Test Complete"