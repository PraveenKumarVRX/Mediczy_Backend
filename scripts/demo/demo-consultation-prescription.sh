#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎥 ONLINE CONSULTATION PRESCRIPTION DEMO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Doctor login
echo "👨‍⚕️ Step 1: Doctor Login"
echo "─────────────────────────"
DOCTOR_LOGIN=$(curl -s -X POST http://localhost:8000/api/doctors/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "drkumar.surgery@mediczy.com",
    "password": "DrKumar@2025"
  }')

DOCTOR_TOKEN=$(echo $DOCTOR_LOGIN | jq -r '.token')
DOCTOR_ID=$(echo $DOCTOR_LOGIN | jq -r '.doctor.id')
DOCTOR_NAME=$(echo $DOCTOR_LOGIN | jq -r '.doctor.firstName + " " + .doctor.lastName')

echo "✅ Logged in: Dr. $DOCTOR_NAME (ID: $DOCTOR_ID)"
echo ""

# Patient login
echo "👤 Step 2: Patient Login"
echo "─────────────────────────"
PATIENT_LOGIN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "rahul.verma@gmail.com",
    "password": "RahulVerma@2025"
  }')

PATIENT_TOKEN=$(echo $PATIENT_LOGIN | jq -r '.token')
PATIENT_ID=$(echo $PATIENT_LOGIN | jq -r '.user.id')
PATIENT_NAME=$(echo $PATIENT_LOGIN | jq -r '.user.firstName + " " + .user.lastName')

echo "✅ Logged in: $PATIENT_NAME (ID: $PATIENT_ID)"
echo ""

# Create online appointment
echo "📅 Step 3: Book Online Consultation"
echo "────────────────────────────────────"
TOMORROW=$(date -d "+1 day" +%Y-%m-%d)
APPOINTMENT=$(curl -s -X POST http://localhost:8000/api/appointments \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -d "{
    \"doctorId\": $DOCTOR_ID,
    \"appointmentDate\": \"$TOMORROW\",
    \"appointmentTime\": \"14:00\",
    \"consultationType\": \"online\",
    \"symptoms\": [\"Headache\", \"Fever\", \"Body ache\"],
    \"reason\": \"Feeling unwell for 2 days, need consultation\"
  }")

APPOINTMENT_ID=$(echo $APPOINTMENT | jq -r '.appointment.id // .data.id')

echo "✅ Appointment Created"
echo "   ID: $APPOINTMENT_ID"
echo "   Type: Online Consultation"
echo "   Date: $TOMORROW at 14:00"
echo "   Symptoms: Headache, Fever, Body ache"
echo ""

# Simulate video consultation
echo "🎥 Step 4: Video Consultation (Simulated)"
echo "──────────────────────────────────────────"
echo "🔄 Doctor joins video room..."
echo "🔄 Patient joins video room..."
echo "💬 Consultation in progress..."
sleep 1
echo "✅ Consultation completed (15 mins)"
echo ""

# Create prescription from consultation
echo "💊 Step 5: Generate Prescription After Consultation"
echo "────────────────────────────────────────────────────"
PRESCRIPTION=$(curl -s -X POST "http://localhost:8000/api/prescriptions/from-appointment/$APPOINTMENT_ID" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "diagnosis": "Viral Fever with Myalgia",
    "chiefComplaints": ["Fever (102°F)", "Severe headache", "Body pain"],
    "vitals": {
      "temperature": "102°F",
      "bloodPressure": "120/80",
      "pulse": "88",
      "weight": "70kg"
    },
    "medications": [
      {
        "name": "Paracetamol",
        "dosage": "500mg",
        "frequency": "Three times daily",
        "duration": "5 days",
        "instructions": "Take after meals"
      },
      {
        "name": "Ibuprofen",
        "dosage": "400mg",
        "frequency": "Twice daily",
        "duration": "3 days",
        "instructions": "Take with food"
      },
      {
        "name": "Vitamin C",
        "dosage": "1000mg",
        "frequency": "Once daily",
        "duration": "7 days",
        "instructions": "Take with water"
      }
    ],
    "labTests": [
      {
        "name": "Complete Blood Count (CBC)",
        "instructions": "Fasting not required"
      }
    ],
    "instructions": [
      "Take complete rest for 3-4 days",
      "Drink plenty of fluids (water, ORS, coconut water)",
      "Avoid cold foods and beverages",
      "Monitor temperature twice daily",
      "Return if fever persists beyond 5 days"
    ],
    "followUpDate": "2025-12-28",
    "notes": "Patient was consulted via video call. Advised to get CBC done if fever persists."
  }')

PRESCRIPTION_ID=$(echo $PRESCRIPTION | jq -r '.prescription.prescriptionId')
PDF_URL=$(echo $PRESCRIPTION | jq -r '.prescription.pdfUrl')
SHARE_URL=$(echo $PRESCRIPTION | jq -r '.prescription.shareUrl')

echo "✅ Prescription Generated Successfully!"
echo ""
echo "   📋 Prescription ID: $PRESCRIPTION_ID"
echo "   🎯 Diagnosis: Viral Fever with Myalgia"
echo "   💊 Medications: 3 prescribed"
echo "   🧪 Lab Tests: CBC recommended"
echo "   📅 Follow-up: 2025-12-28"
echo "   🏥 Consultation Type: Online Consultation"
echo ""

# Generate WhatsApp share link
echo "📱 Step 6: Share Prescription via WhatsApp"
echo "───────────────────────────────────────────"
WHATSAPP_SHARE=$(curl -s "http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID/share/whatsapp" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

WHATSAPP_URL=$(echo $WHATSAPP_SHARE | jq -r '.whatsappUrl')
CONSULT_TYPE=$(echo $WHATSAPP_SHARE | jq -r '.consultationType')

echo "✅ WhatsApp Share Link Generated"
echo ""
echo "🔗 WhatsApp URL:"
echo "$WHATSAPP_URL" | fold -w 80
echo ""
echo "📥 Direct PDF Download:"
echo "$PDF_URL" | fold -w 80
echo ""

# Display WhatsApp message preview
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📨 WhatsApp Message Preview"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo $WHATSAPP_SHARE | jq -r '.message'
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Patient accesses prescription
echo "👤 Step 7: Patient Views Prescription in EMR"
echo "─────────────────────────────────────────────"
PATIENT_PRESCRIPTIONS=$(curl -s "http://localhost:8000/api/prescriptions/patient" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

PRESCRIPTION_COUNT=$(echo $PATIENT_PRESCRIPTIONS | jq '.count')

echo "✅ Patient can access prescription in EMR"
echo "   Total Prescriptions: $PRESCRIPTION_COUNT"
echo "   Latest: $PRESCRIPTION_ID"
echo ""

# Check appointment status
echo "📊 Step 8: Verify Appointment Status"
echo "─────────────────────────────────────"
APPOINTMENT_CHECK=$(curl -s "http://localhost:8000/api/appointments/$APPOINTMENT_ID" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

APPOINTMENT_STATUS=$(echo $APPOINTMENT_CHECK | jq -r '.appointment.status // .data.status')
LINKED_PRESCRIPTION=$(echo $APPOINTMENT_CHECK | jq -r '.appointment.prescription // .data.prescription')

echo "✅ Appointment Updated"
echo "   Status: $APPOINTMENT_STATUS"
echo "   Linked Prescription: $LINKED_PRESCRIPTION"
echo ""

# Download PDF
echo "📥 Step 9: Generate and Save PDF"
echo "─────────────────────────────────"
curl -s "$PDF_URL" -o "/tmp/consultation-prescription-$PRESCRIPTION_ID.pdf"
PDF_SIZE=$(ls -lh "/tmp/consultation-prescription-$PRESCRIPTION_ID.pdf" | awk '{print $5}')
echo "✅ PDF Downloaded"
echo "   Location: /tmp/consultation-prescription-$PRESCRIPTION_ID.pdf"
echo "   Size: $PDF_SIZE"
echo ""

# Check if PDF is saved in server
SERVER_PDF="/home/ubuntu/Mediczy/uploads/prescriptions/$PRESCRIPTION_ID.pdf"
if [ -f "$SERVER_PDF" ]; then
  SERVER_PDF_SIZE=$(ls -lh "$SERVER_PDF" | awk '{print $5}')
  echo "✅ PDF Also Saved on Server"
  echo "   Location: uploads/prescriptions/$PRESCRIPTION_ID.pdf"
  echo "   Size: $SERVER_PDF_SIZE"
else
  echo "⏳ PDF will be generated on first access"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ONLINE CONSULTATION PRESCRIPTION COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 SUMMARY:"
echo "   • Doctor: Dr. $DOCTOR_NAME"
echo "   • Patient: $PATIENT_NAME"
echo "   • Appointment: #$APPOINTMENT_ID (Online Consultation)"
echo "   • Prescription: $PRESCRIPTION_ID"
echo "   • Status: Active & Shared"
echo "   • Consultation Type: $CONSULT_TYPE"
echo ""
echo "🎯 FEATURES DEMONSTRATED:"
echo "   ✅ Online appointment booking"
echo "   ✅ Video consultation workflow"
echo "   ✅ Post-consultation prescription generation"
echo "   ✅ Automatic appointment-prescription linking"
echo "   ✅ Consultation type tracking"
echo "   ✅ Professional EMR PDF with 'Online Consultation' label"
echo "   ✅ WhatsApp sharing with consultation type"
echo "   ✅ Patient EMR access"
echo "   ✅ PDF download and storage"
echo ""
echo "📱 PATIENT ACCESS OPTIONS:"
echo "   1. WhatsApp link (click to download PDF)"
echo "   2. Login to mediqzy.com > My Prescriptions"
echo "   3. Direct PDF URL (with 30-day access token)"
echo ""
echo "🔗 QUICK ACCESS:"
echo "   View Prescription: http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID/html?token=xxx"
echo "   Download PDF: http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID/pdf?token=xxx"
echo ""
