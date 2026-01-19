#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎥 AUTO-PRESCRIPTION AFTER CONSULTATION - DEMO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Testing automatic prescription draft creation when consultation ends"
echo ""

# Login
echo "👨‍⚕️ Step 1: Doctor Login"
echo "─────────────────────────"
DOCTOR_TOKEN=$(curl -s -X POST http://localhost:8000/api/doctors/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"drkumar.surgery@mediczy.com","password":"DrKumar@2025"}' \
  | jq -r '.token')
echo "✅ Doctor logged in"
echo ""

echo "👤 Step 2: Patient Login"
echo "─────────────────────────"
PATIENT_TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}' \
  | jq -r '.token')
echo "✅ Patient logged in"
echo ""

# Book appointment
echo "📅 Step 3: Book Video Consultation"
echo "───────────────────────────────────"
TOMORROW=$(date -d "+1 day" +%Y-%m-%d)
APPT=$(curl -s -X POST http://localhost:8000/api/appointments \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -d "{
    \"doctorId\": 4,
    \"appointmentDate\": \"$TOMORROW\",
    \"appointmentTime\": \"15:00\",
    \"consultationType\": \"video\",
    \"symptoms\": \"Persistent cough and cold\",
    \"reason\": \"Need online consultation\"
  }")

APPT_ID=$(echo "$APPT" | jq -r '.appointment.id')
echo "✅ Appointment booked: #$APPT_ID"
echo "   Type: Video Consultation"
echo "   Date: $TOMORROW at 15:00"
echo ""

# Simulate video call
echo "🎥 Step 4: Video Consultation (Simulated)"
echo "──────────────────────────────────────────"
echo "🔄 Doctor joins video room..."
echo "🔄 Patient joins video room..."
echo "💬 Consultation in progress (10 minutes)..."
sleep 1
echo "✅ Video call completed"
echo ""

# Method 1: Complete with auto-prescription
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 METHOD 1: Complete Consultation (Auto-Creates Draft)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

COMPLETE=$(curl -s -X POST "http://localhost:8000/api/appointments/$APPT_ID/complete-with-prescription" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "notes": "Patient consulted via video call",
    "duration": "10 minutes"
  }')

echo "$COMPLETE" | jq

DRAFT_RX_ID=$(echo "$COMPLETE" | jq -r '.prescription.prescriptionId')
DRAFT_STATUS=$(echo "$COMPLETE" | jq -r '.prescription.status')

echo ""
echo "✅ RESULT:"
echo "   • Appointment marked as completed"
echo "   • Prescription draft auto-created: $DRAFT_RX_ID"
echo "   • Status: $DRAFT_STATUS"
echo "   • Action needed: Doctor fills diagnosis & medications"
echo ""

# View draft prescription
echo "📋 Step 5: View Draft Prescription"
echo "───────────────────────────────────"
DRAFT_RX=$(curl -s "http://localhost:8000/api/prescriptions/$DRAFT_RX_ID" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

echo "$DRAFT_RX" | jq '{
  prescriptionId: .prescription.prescriptionId,
  status: .prescription.status,
  patientName: .prescription.patientName,
  patientAge: .prescription.patientAge,
  doctorName: .prescription.doctorName,
  consultationType: .prescription.clinicDetails.consultationType,
  diagnosis: .prescription.diagnosis,
  chiefComplaints: .prescription.chiefComplaints,
  medicationsCount: (.prescription.medications | length)
}'
echo ""

# Update prescription with actual details
echo "💊 Step 6: Doctor Completes Prescription"
echo "─────────────────────────────────────────"
UPDATE_RX=$(curl -s -X POST "http://localhost:8000/api/prescriptions/from-appointment/$APPT_ID" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "diagnosis": "Upper Respiratory Tract Infection (URTI)",
    "chiefComplaints": ["Persistent cough", "Running nose", "Mild fever"],
    "vitals": {
      "temperature": "99.5°F",
      "pulse": "82",
      "bloodPressure": "118/76"
    },
    "medications": [
      {
        "name": "Azithromycin",
        "dosage": "500mg",
        "frequency": "Once daily",
        "duration": "3 days",
        "instructions": "Take after meals"
      },
      {
        "name": "Cetirizine",
        "dosage": "10mg",
        "frequency": "Once daily at bedtime",
        "duration": "5 days",
        "instructions": "May cause drowsiness"
      },
      {
        "name": "Cough Syrup",
        "dosage": "10ml",
        "frequency": "Three times daily",
        "duration": "5 days",
        "instructions": "Shake well before use"
      }
    ],
    "instructions": [
      "Drink warm water and fluids",
      "Avoid cold foods and beverages",
      "Take steam inhalation twice daily",
      "Rest for 2-3 days",
      "Contact if fever persists beyond 3 days"
    ],
    "followUpDate": "2025-12-28"
  }')

FINAL_RX_ID=$(echo "$UPDATE_RX" | jq -r '.prescription.prescriptionId')
echo "✅ Prescription updated and finalized"
echo ""

# Share prescription
echo "📱 Step 7: Share Prescription via WhatsApp"
echo "───────────────────────────────────────────"
SHARE=$(curl -s "http://localhost:8000/api/prescriptions/$FINAL_RX_ID/share/whatsapp" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

echo "✅ WhatsApp share link generated"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📨 WhatsApp Message Preview"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$SHARE" | jq -r '.message'
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test Method 2 with new appointment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 METHOD 2: Leave Video Room (Auto-Creates Draft)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create another appointment
APPT2=$(curl -s -X POST http://localhost:8000/api/appointments \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -d "{
    \"doctorId\": 4,
    \"appointmentDate\": \"$TOMORROW\",
    \"appointmentTime\": \"16:00\",
    \"consultationType\": \"video\",
    \"symptoms\": \"Headache\",
    \"reason\": \"Follow-up consultation\"
  }")

APPT_ID2=$(echo "$APPT2" | jq -r '.appointment.id')
echo "📅 New appointment booked: #$APPT_ID2"
echo ""

# Simulate leaving video room
echo "🚪 Doctor leaves video room with auto-prescription..."
LEAVE=$(curl -s -X POST "http://localhost:8000/api/video/room/room-$APPT_ID2/leave" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d "{
    \"appointmentId\": $APPT_ID2,
    \"duration\": \"8 minutes\"
  }")

echo "$LEAVE" | jq

DRAFT_RX_ID2=$(echo "$LEAVE" | jq -r '.prescription.prescriptionId')
CREATED=$(echo "$LEAVE" | jq -r '.prescriptionCreated')

echo ""
if [ "$CREATED" = "true" ]; then
  echo "✅ RESULT:"
  echo "   • Doctor left video room"
  echo "   • Prescription draft auto-created: $DRAFT_RX_ID2"
  echo "   • Appointment marked as completed"
  echo "   • Ready for doctor to add details"
else
  echo "ℹ️  No prescription created (may already exist or not video consultation)"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ AUTO-PRESCRIPTION DEMO COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 SUMMARY:"
echo ""
echo "🎯 METHOD 1: POST /api/appointments/:id/complete-with-prescription"
echo "   • Marks appointment as completed"
echo "   • Auto-creates prescription draft"
echo "   • Pre-fills patient & doctor details"
echo "   • Doctor adds diagnosis & medications"
echo ""
echo "🎯 METHOD 2: POST /api/video/room/:roomId/leave"
echo "   • Triggered when doctor leaves video call"
echo "   • Auto-creates prescription draft if video/audio/chat"
echo "   • Includes consultation duration in notes"
echo "   • Only for online consultations"
echo ""
echo "🎯 METHOD 3: POST /api/prescriptions/from-appointment/:id"
echo "   • Direct prescription creation from appointment"
echo "   • Full control over all fields"
echo "   • Can be used for draft or final prescription"
echo ""
echo "✨ BENEFITS:"
echo "   ✅ No extra steps - prescription ready after call"
echo "   ✅ All patient data pre-filled"
echo "   ✅ Doctor info auto-populated"
echo "   ✅ Consultation type tracked"
echo "   ✅ Appointment auto-completed"
echo "   ✅ Draft status - doctor can review before finalizing"
echo ""
echo "📱 NEXT STEP: Doctor reviews draft and updates with:"
echo "   • Actual diagnosis"
echo "   • Medications (name, dosage, frequency)"
echo "   • Lab tests (if needed)"
echo "   • Follow-up instructions"
echo ""
echo "Then shares final prescription via WhatsApp!"
echo ""
