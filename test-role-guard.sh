#!/bin/bash

# Test script to verify role-based login separation
echo "🔒 Testing Role-Based Login Separation"
echo "========================================"
echo ""

# Test 1: Doctor credentials should FAIL at user login endpoint
echo "Test 1: Doctor login at /api/users/login (should FAIL with 403)"
echo "----------------------------------------------------------------"
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@mediczy.com",
    "password": "Doctor123!@#"
  }' \
  -s | jq '.'
echo ""
echo ""

# Test 2: Doctor credentials should SUCCEED at doctor login endpoint
echo "Test 2: Doctor login at /api/doctors/login (should SUCCEED)"
echo "-----------------------------------------------------------"
curl -X POST http://localhost:8000/api/doctors/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@mediczy.com",
    "password": "Doctor123!@#"
  }' \
  -s | jq 'if .token then {success: true, email: .email, role: "doctor", token: "***REDACTED***"} else . end'
echo ""
echo ""

# Test 3: Regular user should SUCCEED at user login endpoint
echo "Test 3: User login at /api/users/login (should SUCCEED)"
echo "-------------------------------------------------------"
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@mediczy.com",
    "password": "User123!@#"
  }' \
  -s | jq 'if .token then {success: true, email: .email, role: "user", token: "***REDACTED***"} else . end'
echo ""
echo ""

# Test 4: Nurse credentials should FAIL at user login endpoint
echo "Test 4: Nurse login at /api/users/login (should FAIL with 403)"
echo "--------------------------------------------------------------"
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nurse@mediczy.com",
    "password": "Nurse123!@#"
  }' \
  -s | jq '.'
echo ""
echo ""

echo "✅ Test Complete!"
echo ""
echo "Expected Results:"
echo "  - Test 1: 403 error with hint to use /api/doctors/login"
echo "  - Test 2: Success with doctor token"
echo "  - Test 3: Success with user token"
echo "  - Test 4: 403 error with hint to use appropriate endpoint"
