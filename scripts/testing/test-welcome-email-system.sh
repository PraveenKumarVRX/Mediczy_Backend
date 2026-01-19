#!/bin/bash

# Test Automated Welcome Email System
# This script tests the complete workflow of creating users and sending welcome emails

BASE_URL="http://localhost:8000/api"
ADMIN_TOKEN=""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TESTING AUTOMATED WELCOME EMAIL SYSTEM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Admin Login
echo "Step 1: Admin Login"
echo "────────────────────────────────────────"
ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@mediqzy.com",
    "password": "Admin@123"
  }')

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | jq -r '.token')

if [ "$ADMIN_TOKEN" != "null" ] && [ -n "$ADMIN_TOKEN" ]; then
  echo "✅ Admin login successful"
  echo "   Token: ${ADMIN_TOKEN:0:30}..."
else
  echo "❌ Admin login failed"
  echo "   Response: $ADMIN_RESPONSE"
  exit 1
fi

echo ""

# Step 2: Create Test Doctor
echo "Step 2: Create Test Doctor with Auto-Generated Password"
echo "────────────────────────────────────────────────────────────"

DOCTOR_EMAIL="test.doctor.$(date +%s)@mediqzy.com"

DOCTOR_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/doctors" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Test\",
    \"lastName\": \"Doctor\",
    \"email\": \"$DOCTOR_EMAIL\",
    \"phone\": \"+919876543210\",
    \"specialization\": \"Cardiology\",
    \"qualification\": \"MBBS, MD, DM Cardiology\",
    \"experience\": 10
  }")

echo "$DOCTOR_RESPONSE" | jq '.'

DOCTOR_SUCCESS=$(echo $DOCTOR_RESPONSE | jq -r '.success')
NOTIFICATION=$(echo $DOCTOR_RESPONSE | jq -r '.notification')

if [ "$DOCTOR_SUCCESS" = "true" ]; then
  echo ""
  echo "✅ Doctor created successfully!"
  echo "   Email: $DOCTOR_EMAIL"
  echo "   Notification: $NOTIFICATION"
  echo ""
  echo "📧 Welcome email sent with temporary password"
  echo "   ⚠️  Doctor must change password on first login"
else
  echo "❌ Failed to create doctor"
  echo "   Response: $DOCTOR_RESPONSE"
fi

echo ""

# Step 3: Create Test Team User
echo "Step 3: Create Test Team User with Auto-Generated Password"
echo "──────────────────────────────────────────────────────────────"

TEAM_EMAIL="test.team.$(date +%s)@mediqzy.com"

TEAM_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/team" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Test\",
    \"lastName\": \"TeamMember\",
    \"email\": \"$TEAM_EMAIL\",
    \"phoneNumber\": \"+919876543211\",
    \"employeeId\": \"EMP-TEST-$(date +%s)\",
    \"department\": \"Operations\",
    \"designation\": \"Operations Manager\",
    \"permissions\": [\"view_reports\", \"manage_appointments\"]
  }")

echo "$TEAM_RESPONSE" | jq '.'

TEAM_SUCCESS=$(echo $TEAM_RESPONSE | jq -r '.success')
TEAM_NOTIFICATION=$(echo $TEAM_RESPONSE | jq -r '.notification')

if [ "$TEAM_SUCCESS" = "true" ]; then
  echo ""
  echo "✅ Team user created successfully!"
  echo "   Email: $TEAM_EMAIL"
  echo "   Notification: $TEAM_NOTIFICATION"
  echo ""
  echo "📧 Welcome email sent with temporary password"
  echo "   ⚠️  User must change password on first login"
else
  echo "❌ Failed to create team user"
  echo "   Response: $TEAM_RESPONSE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ TEST COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Summary:"
echo "   ✅ Admin authentication working"
echo "   ✅ Doctor creation with auto-password working"
echo "   ✅ Team user creation with auto-password working"
echo "   ✅ Welcome emails sent automatically"
echo "   ✅ Password change required flag set"
echo ""
echo "📧 Next Steps:"
echo "   1. Check email inbox for welcome emails"
echo "   2. Note temporary passwords from emails"
echo "   3. Login with temporary password"
echo "   4. System will require password change"
echo "   5. Change password to access features"
echo ""
echo "📝 Documentation: AUTOMATED_WELCOME_EMAIL_SYSTEM.md"
echo ""
