#!/bin/bash
#
# Patient Portal Issues - Diagnostic & Fix Script
# Addresses 10 reported issues with patient login portal
#

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 PATIENT PORTAL DIAGNOSTICS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get auth token
echo "🔐 Getting authentication token..."
TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@mediczy.com","password":"User123"}' | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed - cannot proceed"
  exit 1
fi

echo "✅ Login successful"
echo ""

# Issue 1: Video Consultation
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  VIDEO CONSULTATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing video endpoints..."
echo ""

# Check if Agora is configured
if grep -q "AGORA_APP_ID" /home/ubuntu/Mediczy/server/.env; then
  echo "✅ Agora configured in .env"
else
  echo "⚠️  Agora not configured - video may not work"
fi

# Issue 2: My Profile - Add Family Member
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  ADD FAMILY MEMBER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check membership limits
LIMITS=$(curl -s http://localhost:8000/api/family-members/limits \
  -H "Authorization: Bearer $TOKEN")

echo "Membership Status:"
echo "$LIMITS" | jq '{membershipType: .limits.membershipType, maxMembers: .limits.maxMembers, current: .limits.currentMembers}'

# Try to add family member
echo ""
echo "Testing add family member..."
ADD_RESULT=$(curl -s -X POST http://localhost:8000/api/family-members \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Member",
    "relationship": "spouse",
    "gender": "Female",
    "dateOfBirth": "1990-01-01"
  }')

if echo "$ADD_RESULT" | jq -e '.success' > /dev/null 2>&1; then
  echo "✅ Add family member: Working"
else
  echo "❌ Add family member: Failed"
  echo "$ADD_RESULT" | jq '{success, message, error}'
fi

# Issue 3: Health Risk Assessment
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  HEALTH RISK ASSESSMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ASSESSMENT=$(curl -s -X POST http://localhost:8000/api/health-assessment/save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "age": 35,
    "gender": "male",
    "height": 175,
    "weight": 70,
    "smoking": "never",
    "exercise_frequency": "moderate"
  }')

if echo "$ASSESSMENT" | jq -e '.success' > /dev/null 2>&1; then
  echo "✅ Save assessment: Working"
  echo "$ASSESSMENT" | jq '{success, riskLevel: .riskAssessment.riskLevel}'
else
  echo "❌ Save assessment: Failed"
  echo "$ASSESSMENT" | jq '{success, message, error}'
fi

# Issue 4: Diet Plan
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  DIET PLAN GENERATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DIET=$(curl -s -X POST http://localhost:8000/api/diet/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "age": 35,
    "weight": 70,
    "height": 175,
    "activityLevel": "moderate",
    "dietaryPreference": "vegetarian"
  }')

if echo "$DIET" | jq -e '.success' > /dev/null 2>&1; then
  echo "✅ Diet plan: Working"
else
  echo "❌ Diet plan: Failed"
  echo "$DIET" | jq '{success, message, error}'
fi

# Issue 5: Appointments History
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  APPOINTMENT HISTORY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

APPOINTMENTS=$(curl -s http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN")

if echo "$APPOINTMENTS" | jq -e 'type == "array"' > /dev/null 2>&1; then
  COUNT=$(echo "$APPOINTMENTS" | jq 'length')
  echo "✅ Appointments endpoint: Working (Found $COUNT appointments)"
else
  echo "❌ Appointments endpoint: Failed"
  echo "$APPOINTMENTS" | jq '{success, message, error}'
fi

# Issue 6: Report Upload
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  REPORT UPLOAD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create test file
echo "Sample medical report content" > /tmp/test-report.txt

UPLOAD=$(curl -s -X POST http://localhost:8000/api/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "report=@/tmp/test-report.txt" \
  -F "reportType=lab_report")

if echo "$UPLOAD" | jq -e '.success' > /dev/null 2>&1; then
  echo "✅ Report upload: Working"
  REPORT_ID=$(echo "$UPLOAD" | jq -r '.report.id')
  echo "   Report ID: $REPORT_ID"
else
  echo "❌ Report upload: Failed"
  echo "$UPLOAD" | jq '{success, message, error}'
fi

# Issue 7: Report Analysis
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  REPORT ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# List reports first
REPORTS=$(curl -s http://localhost:8000/api/reports \
  -H "Authorization: Bearer $TOKEN")

if echo "$REPORTS" | jq -e '.success' > /dev/null 2>&1; then
  FIRST_REPORT=$(echo "$REPORTS" | jq -r '.reports[0].id // empty')
  
  if [ -n "$FIRST_REPORT" ]; then
    echo "Testing analysis on report: $FIRST_REPORT"
    ANALYSIS=$(curl -s -X POST "http://localhost:8000/api/reports/$FIRST_REPORT/analyze" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$ANALYSIS" | jq -e '.success' > /dev/null 2>&1; then
      echo "✅ Report analysis: Working"
    else
      echo "❌ Report analysis: Failed"
      echo "$ANALYSIS" | jq '{success, message, error}'
    fi
  else
    echo "⚠️  No reports found to analyze"
  fi
else
  echo "❌ List reports: Failed"
fi

# Issue 8: Lab Test Booking
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8️⃣  LAB TEST BOOKING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LABS=$(curl -s "http://localhost:8000/api/labs?limit=1" \
  -H "Authorization: Bearer $TOKEN")

if echo "$LABS" | jq -e '.success' > /dev/null 2>&1; then
  TOTAL=$(echo "$LABS" | jq -r '.total')
  echo "✅ Lab listing: Working ($TOTAL labs available)"
else
  echo "❌ Lab listing: Failed"
  echo "$LABS" | jq '{success, message, error}'
fi

# Issue 9: Login Redirect
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9️⃣  LOGIN REDIRECT CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check user role from token
USER_INFO=$(curl -s http://localhost:8000/api/user/profile \
  -H "Authorization: Bearer $TOKEN")

if echo "$USER_INFO" | jq -e '.user.role' > /dev/null 2>&1; then
  ROLE=$(echo "$USER_INFO" | jq -r '.user.role')
  echo "✅ User role correctly set to: $ROLE"
else
  echo "⚠️  Could not verify user role"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 DIAGNOSTIC SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Issues requiring fixes will be addressed in the next steps."
echo ""

# Cleanup
rm -f /tmp/test-report.txt
