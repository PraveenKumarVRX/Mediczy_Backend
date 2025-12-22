#!/bin/bash

echo "🏥 Testing Mediczy Doctor Registration Fix"
echo "=========================================="

# Test Data
EMAIL="testdoc$(date +%s)@example.com"
PHONE="+9198765432$(date +%s | tail -c 3)"

echo "Testing doctor registration with:"
echo "Email: $EMAIL"
echo "Phone: $PHONE"
echo ""

# Test registration
echo "1. Testing Doctor Registration..."
response=$(curl -s -X POST http://localhost:8000/api/doctors/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"Doctor123\",
    \"firstName\": \"Test\",
    \"lastName\": \"Doctor\",
    \"phoneNumber\": \"$PHONE\",
    \"specialization\": \"Cardiologist\",
    \"experience\": 5,
    \"qualifications\": [\"MBBS\", \"MD Cardiology\"]
  }")

echo "Response: $response"
echo ""

# Check if registration was successful
if echo "$response" | grep -q "Doctor registered successfully"; then
  echo "✅ Doctor Registration: SUCCESS"
  
  # Extract token
  token=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo "Token: $token"
  echo ""
  
  echo "2. Testing Doctor Login..."
  login_response=$(curl -s -X POST http://localhost:8000/api/doctors/login \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$EMAIL\",
      \"password\": \"Doctor123\"
    }")
  
  echo "Login Response: $login_response"
  
  if echo "$login_response" | grep -q "Login successful"; then
    echo "✅ Doctor Login: SUCCESS"
  else
    echo "❌ Doctor Login: FAILED"
  fi
  
else
  echo "❌ Doctor Registration: FAILED"
  echo "Error: $response"
fi

echo ""
echo "3. Testing All Specializations..."

specializations=("Cardiologist" "Neurologist" "Pediatrician" "Dermatologist" "Orthopedist" "Psychiatrist" "General Practitioner" "Other")

for spec in "${specializations[@]}"; do
  test_email="test_${spec,,}_$(date +%s)@example.com"
  test_phone="+9198765$(printf '%05d' $((RANDOM%99999)))"
  
  spec_response=$(curl -s -X POST http://localhost:8000/api/doctors/register \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$test_email\",
      \"password\": \"Doctor123\",
      \"firstName\": \"Test\",
      \"lastName\": \"${spec}Doctor\",
      \"phoneNumber\": \"$test_phone\",
      \"specialization\": \"$spec\",
      \"experience\": 2,
      \"qualifications\": [\"MBBS\"]
    }" 2>/dev/null)
  
  if echo "$spec_response" | grep -q "Doctor registered successfully"; then
    echo "  ✅ $spec: SUCCESS"
  else
    echo "  ❌ $spec: FAILED"
  fi
done

echo ""
echo "========================================="
echo "🎉 Doctor Registration Tests Complete!"
echo "========================================="