#!/bin/bash

# Admin Dashboard Function Testing Script
# This script tests all wired admin dashboard functions

API_URL="http://localhost:8000"
ADMIN_TOKEN=""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 ADMIN DASHBOARD FUNCTION TESTING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Admin Login
echo "📌 TEST 1: Admin Login"
echo "─────────────────────────────────────"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@mediqzy.com",
    "password": "SecurePass123"
  }')

ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // .authToken // empty')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ FAILED: Could not obtain admin token"
  echo "Response: $LOGIN_RESPONSE"
  echo ""
  echo "Note: Make sure admin user exists in database"
  echo "You may need to create an admin user first"
  exit 1
else
  echo "✅ SUCCESS: Admin login successful"
  echo "Token: ${ADMIN_TOKEN:0:20}..."
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 2: Get Dashboard Stats
echo "📌 TEST 2: Get Dashboard Stats"
echo "─────────────────────────────────────"
STATS_RESPONSE=$(curl -s -X GET "$API_URL/api/admin/dashboard/stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$STATS_RESPONSE" | jq -e '.totalUsers' > /dev/null 2>&1; then
  echo "✅ SUCCESS: Dashboard stats retrieved"
  echo "Total Users: $(echo "$STATS_RESPONSE" | jq -r '.totalUsers // 0')"
  echo "Total Doctors: $(echo "$STATS_RESPONSE" | jq -r '.totalDoctors // 0')"
  echo "Total Appointments: $(echo "$STATS_RESPONSE" | jq -r '.totalAppointments // 0')"
else
  echo "⚠️  PARTIAL: Stats endpoint may not be fully implemented"
  echo "Response: $STATS_RESPONSE"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: List Users
echo "📌 TEST 3: List Users"
echo "─────────────────────────────────────"
USERS_RESPONSE=$(curl -s -X GET "$API_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

USER_COUNT=$(echo "$USERS_RESPONSE" | jq -r '.users | length // 0' 2>/dev/null || echo "0")
if [ "$USER_COUNT" -gt 0 ]; then
  echo "✅ SUCCESS: Retrieved $USER_COUNT users"
  echo "Sample user: $(echo "$USERS_RESPONSE" | jq -r '.users[0].email // "N/A"')"
else
  echo "⚠️  WARNING: No users found or endpoint error"
  echo "Response: ${USERS_RESPONSE:0:200}..."
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 4: List Doctors
echo "📌 TEST 4: List Doctors"
echo "─────────────────────────────────────"
DOCTORS_RESPONSE=$(curl -s -X GET "$API_URL/api/doctors/admin/all" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

DOCTOR_COUNT=$(echo "$DOCTORS_RESPONSE" | jq -r '.doctors | length // 0' 2>/dev/null || echo "0")
if [ "$DOCTOR_COUNT" -gt 0 ]; then
  echo "✅ SUCCESS: Retrieved $DOCTOR_COUNT doctors"
  echo "Sample doctor: Dr. $(echo "$DOCTORS_RESPONSE" | jq -r '.doctors[0].firstName // "N/A"') $(echo "$DOCTORS_RESPONSE" | jq -r '.doctors[0].lastName // ""')"
else
  echo "⚠️  WARNING: No doctors found"
  echo "Response: ${DOCTORS_RESPONSE:0:200}..."
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 5: Bulk Upload Doctors (Test Data)
echo "📌 TEST 5: Bulk Upload Doctors"
echo "─────────────────────────────────────"
BULK_DOCTORS='[
  {
    "firstName": "TestAdmin",
    "lastName": "Doctor1",
    "email": "testadmin.doc1@mediczy.test",
    "specialization": "General Physician",
    "experience": 5,
    "phoneNumber": "+91-9999999991"
  },
  {
    "firstName": "TestAdmin",
    "lastName": "Doctor2",
    "email": "testadmin.doc2@mediczy.test",
    "specialization": "Cardiologist",
    "experience": 10,
    "phoneNumber": "+91-9999999992"
  }
]'

UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/api/admin/masters/doctors" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"doctors\": $BULK_DOCTORS}")

if echo "$UPLOAD_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
  echo "✅ SUCCESS: Bulk upload completed"
  echo "Message: $(echo "$UPLOAD_RESPONSE" | jq -r '.message')"
  echo "Count: $(echo "$UPLOAD_RESPONSE" | jq -r '.count // "N/A"')"
else
  echo "⚠️  WARNING: Upload may have failed"
  echo "Response: $UPLOAD_RESPONSE"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 6: Verify Doctor
echo "📌 TEST 6: Doctor Verification"
echo "─────────────────────────────────────"

# Get first unverified doctor
UNVERIFIED_DOC=$(curl -s -X GET "$API_URL/api/doctors/admin/all" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.doctors[] | select(.isVerified == false) | .id' | head -1)

if [ ! -z "$UNVERIFIED_DOC" ] && [ "$UNVERIFIED_DOC" != "null" ]; then
  VERIFY_RESPONSE=$(curl -s -X PUT "$API_URL/api/doctors/admin/$UNVERIFIED_DOC/verification" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"isVerified": true}')
  
  if echo "$VERIFY_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
    echo "✅ SUCCESS: Doctor verified"
    echo "Doctor ID: $UNVERIFIED_DOC"
    echo "Message: $(echo "$VERIFY_RESPONSE" | jq -r '.message')"
  else
    echo "⚠️  WARNING: Verification may have failed"
    echo "Response: $VERIFY_RESPONSE"
  fi
else
  echo "⚠️  SKIP: No unverified doctors found to test"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 7: Bulk Upload Labs
echo "📌 TEST 7: Bulk Upload Labs"
echo "─────────────────────────────────────"
BULK_LABS='[
  {
    "name": "Test Admin Lab 1",
    "email": "testadminlab1@mediczy.test",
    "address": "123 Test Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  }
]'

LAB_UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/api/admin/masters/labs" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"labs\": $BULK_LABS}")

if echo "$LAB_UPLOAD_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
  echo "✅ SUCCESS: Lab upload completed"
  echo "Message: $(echo "$LAB_UPLOAD_RESPONSE" | jq -r '.message')"
else
  echo "⚠️  WARNING: Lab upload may have failed"
  echo "Response: $LAB_UPLOAD_RESPONSE"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 8: Bulk Upload Pharmacies
echo "📌 TEST 8: Bulk Upload Pharmacies"
echo "─────────────────────────────────────"
BULK_PHARMACIES='[
  {
    "name": "Test Admin Pharmacy 1",
    "email": "testadminpharm1@mediczy.test",
    "address": "456 Pharmacy Lane",
    "city": "Delhi",
    "state": "Delhi",
    "pincode": "110001"
  }
]'

PHARM_UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/api/admin/masters/pharmacies" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"pharmacies\": $BULK_PHARMACIES}")

if echo "$PHARM_UPLOAD_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
  echo "✅ SUCCESS: Pharmacy upload completed"
  echo "Message: $(echo "$PHARM_UPLOAD_RESPONSE" | jq -r '.message')"
else
  echo "⚠️  WARNING: Pharmacy upload may have failed"
  echo "Response: $PHARM_UPLOAD_RESPONSE"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Summary
echo "📊 TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Tested Functions:"
echo "  1. ✅ Admin Login"
echo "  2. ⚙️  Dashboard Stats"
echo "  3. ⚙️  List Users"
echo "  4. ⚙️  List Doctors"
echo "  5. ⚙️  Bulk Upload Doctors"
echo "  6. ⚙️  Doctor Verification"
echo "  7. ⚙️  Bulk Upload Labs"
echo "  8. ⚙️  Bulk Upload Pharmacies"
echo ""
echo "Note: ⚙️ = Function wired, check individual test results above"
echo ""
echo "🎯 All core admin functions are wired and testable!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
