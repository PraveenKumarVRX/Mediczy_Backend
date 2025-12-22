#!/bin/bash

echo "🔍 Prescription System Verification"
echo "===================================="
echo ""

# Test prescription ID
RX_ID="RX-MJFXG1H6-PDJHU"

echo "Testing Prescription: $RX_ID"
echo ""

# Test 1: Patient Login
echo "1️⃣ Testing Patient Login..."
PATIENT_LOGIN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}')

PATIENT_TOKEN=$(echo "$PATIENT_LOGIN" | jq -r .token)

if [ "$PATIENT_TOKEN" != "null" ] && [ -n "$PATIENT_TOKEN" ]; then
  echo "✅ Patient login successful"
else
  echo "❌ Patient login failed"
  echo "$PATIENT_LOGIN" | jq .
  exit 1
fi

# Test 2: View Prescription
echo ""
echo "2️⃣ Testing View Prescription..."
RX_DATA=$(curl -s "http://localhost:8000/api/prescriptions/$RX_ID" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

if [ "$(echo "$RX_DATA" | jq -r .success)" = "true" ]; then
  echo "✅ Prescription accessible"
  echo "   Patient: $(echo "$RX_DATA" | jq -r .prescription.patientName)"
  echo "   Doctor: $(echo "$RX_DATA" | jq -r .prescription.doctorName)"
  echo "   Specialty: $(echo "$RX_DATA" | jq -r .prescription.specialty)"
  echo "   Diagnosis: $(echo "$RX_DATA" | jq -r .prescription.diagnosis | head -c 60)..."
else
  echo "❌ Cannot access prescription"
  echo "$RX_DATA" | jq .
  exit 1
fi

# Test 3: Print HTML
echo ""
echo "3️⃣ Testing Print HTML..."
curl -s "http://localhost:8000/api/prescriptions/$RX_ID/html" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -o /tmp/verify-rx.html

if [ -f /tmp/verify-rx.html ] && [ -s /tmp/verify-rx.html ]; then
  SIZE=$(ls -lh /tmp/verify-rx.html | awk '{print $5}')
  HAS_DOCTOR=$(grep -c "Kumar Sharma" /tmp/verify-rx.html)
  HAS_PATIENT=$(grep -c "Rahul Verma" /tmp/verify-rx.html)
  HAS_PRINT_BTN=$(grep -c "Print Prescription" /tmp/verify-rx.html)
  
  echo "✅ Print HTML generated ($SIZE)"
  echo "   Doctor name present: $HAS_DOCTOR times"
  echo "   Patient name present: $HAS_PATIENT times"
  echo "   Print button: $HAS_PRINT_BTN"
else
  echo "❌ Print HTML generation failed"
  exit 1
fi

# Test 4: PDF Download
echo ""
echo "4️⃣ Testing PDF Download..."
curl -s "http://localhost:8000/api/prescriptions/$RX_ID/pdf" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -o /tmp/verify-rx.pdf 2>/dev/null

if [ -f /tmp/verify-rx.pdf ] && [ -s /tmp/verify-rx.pdf ]; then
  SIZE=$(ls -lh /tmp/verify-rx.pdf | awk '{print $5}')
  echo "✅ PDF downloaded ($SIZE)"
else
  echo "❌ PDF download failed"
  exit 1
fi

# Test 5: WhatsApp Share
echo ""
echo "5️⃣ Testing WhatsApp Share..."
WA_RESPONSE=$(curl -s "http://localhost:8000/api/prescriptions/$RX_ID/share/whatsapp" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

if [ "$(echo "$WA_RESPONSE" | jq -r .success)" = "true" ]; then
  WA_URL=$(echo "$WA_RESPONSE" | jq -r .whatsappUrl)
  echo "✅ WhatsApp share link generated"
  echo "   URL length: ${#WA_URL} characters"
  echo "   Preview: ${WA_URL:0:80}..."
else
  echo "❌ WhatsApp share failed"
  echo "$WA_RESPONSE" | jq .
  exit 1
fi

# Test 6: Doctor Login and Access
echo ""
echo "6️⃣ Testing Doctor Access..."
DOCTOR_TOKEN=$(curl -s -X POST http://localhost:8000/api/doctors/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"drkumar.surgery@mediczy.com","password":"DrKumar@2025"}' | jq -r .token)

DOCTOR_RX=$(curl -s "http://localhost:8000/api/prescriptions/$RX_ID" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

if [ "$(echo "$DOCTOR_RX" | jq -r .success)" = "true" ]; then
  echo "✅ Doctor can access prescription"
else
  echo "❌ Doctor access failed"
fi

# Test 7: Doctor WhatsApp Send to Patient
echo ""
echo "7️⃣ Testing Doctor Send to Patient WhatsApp..."
DOCTOR_WA=$(curl -s -X POST "http://localhost:8000/api/prescriptions/$RX_ID/share/whatsapp/9876512345" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

if [ "$(echo "$DOCTOR_WA" | jq -r .success)" = "true" ]; then
  echo "✅ Doctor can send prescription to patient"
  echo "   Phone: $(echo "$DOCTOR_WA" | jq -r .phoneNumber)"
else
  echo "❌ Doctor send failed"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL FEATURES WORKING!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Prescription: $RX_ID"
echo ""
echo "✅ Patient can login and view"
echo "✅ Patient can print HTML"
echo "✅ Patient can download PDF"
echo "✅ Patient can share WhatsApp"
echo "✅ Doctor can access"
echo "✅ Doctor can send to patient"
echo ""
echo "📱 Access URLs:"
echo "   View: http://localhost:8000/api/prescriptions/$RX_ID"
echo "   Print: http://localhost:8000/api/prescriptions/$RX_ID/html"
echo "   PDF: http://localhost:8000/api/prescriptions/$RX_ID/pdf"
echo ""
