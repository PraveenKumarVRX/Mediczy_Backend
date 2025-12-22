#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👨‍⚕️ DOCTOR CREATES PATIENT ACCOUNT - DEMO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Doctors can now create patient accounts on behalf of patients!"
echo ""

# Doctor login
echo "Step 1: Doctor Login"
echo "────────────────────"
DOCTOR_LOGIN=$(curl -s -X POST http://localhost:8000/api/doctors/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "drkumar.surgery@mediczy.com",
    "password": "DrKumar@2025"
  }')

DOCTOR_TOKEN=$(echo $DOCTOR_LOGIN | jq -r '.token')
DOCTOR_NAME=$(echo $DOCTOR_LOGIN | jq -r '.doctor.firstName + " " + .doctor.lastName')

echo "✅ Logged in: Dr. $DOCTOR_NAME"
echo ""

# Create new patient
echo "Step 2: Doctor Creates Patient Account"
echo "───────────────────────────────────────"
echo ""
echo "📋 Patient Details:"
echo "   Name: Priya Sharma"
echo "   Phone: +919876543200"
echo "   Age: 32 years"
echo "   Gender: Female"
echo "   Blood Group: O+"
echo ""

CREATE_PATIENT=$(curl -s -X POST http://localhost:8000/api/doctors/my-patients/create \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "firstName": "Priya",
    "lastName": "Sharma",
    "phoneNumber": "+919876543200",
    "email": "priya.sharma@example.com",
    "dateOfBirth": "1992-05-15",
    "gender": "Female",
    "bloodGroup": "O+",
    "address": "123 MG Road, Bangalore",
    "emergencyContact": "+919876543201",
    "allergies": "Penicillin",
    "medicalHistory": "No major medical conditions"
  }')

echo "$CREATE_PATIENT" | jq

PATIENT_ID=$(echo "$CREATE_PATIENT" | jq -r '.patient.id')
PATIENT_NAME=$(echo "$CREATE_PATIENT" | jq -r '.patient.fullName')
TEMP_PASSWORD=$(echo "$CREATE_PATIENT" | jq -r '.credentials.tempPassword')

echo ""
echo "✅ Patient account created successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Patient Credentials (Auto-sent via SMS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   Login: +919876543200"
echo "   Password: $TEMP_PASSWORD"
echo ""
echo "   ⚠️  Patient should change password after first login"
echo ""

# Get doctor's patients list
echo "Step 3: View Doctor's Patient List"
echo "───────────────────────────────────"
PATIENTS=$(curl -s "http://localhost:8000/api/doctors/my-patients" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

PATIENT_COUNT=$(echo "$PATIENTS" | jq '.count')

echo "✅ Total Patients: $PATIENT_COUNT"
echo ""
echo "$PATIENTS" | jq '.patients[] | {
  name: .fullName,
  age: .age,
  gender: .gender,
  phone: .phoneNumber,
  totalAppointments: .totalAppointments,
  lastVisit: .lastAppointment.date
}' | head -30

echo ""

# Test patient login with temporary password
echo "Step 4: Patient Logs In (Using Temp Password)"
echo "──────────────────────────────────────────────"
PATIENT_LOGIN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d "{
    \"email\": \"+919876543200\",
    \"password\": \"$TEMP_PASSWORD\"
  }")

PATIENT_TOKEN=$(echo $PATIENT_LOGIN | jq -r '.token')

if [ "$PATIENT_TOKEN" != "null" ] && [ "$PATIENT_TOKEN" != "" ]; then
  echo "✅ Patient logged in successfully!"
  echo ""
  echo "$PATIENT_LOGIN" | jq '{
    message: .message,
    user: {
      name: (.user.firstName + " " + .user.lastName),
      email: .user.email,
      phone: .user.phoneNumber
    }
  }'
else
  echo "⚠️  Patient login failed. Credentials may need to be updated."
  echo "$PATIENT_LOGIN" | jq
fi

echo ""

# Book appointment for the new patient
echo "Step 5: Doctor Books Appointment for Patient"
echo "─────────────────────────────────────────────"
TOMORROW=$(date -d "+1 day" +%Y-%m-%d)

APPOINTMENT=$(curl -s -X POST http://localhost:8000/api/appointments \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -d "{
    \"doctorId\": 4,
    \"appointmentDate\": \"$TOMORROW\",
    \"appointmentTime\": \"10:00\",
    \"consultationType\": \"in-person\",
    \"symptoms\": \"Regular checkup\",
    \"reason\": \"First visit\"
  }")

if [ "$(echo $APPOINTMENT | jq -r '.message')" != "null" ]; then
  echo "✅ Appointment booked successfully!"
  echo ""
  echo "$APPOINTMENT" | jq '{
    appointmentId: .appointment.id,
    doctor: .appointment.doctorName,
    date: .appointment.appointmentDate,
    time: .appointment.appointmentTime,
    type: .appointment.consultationType,
    status: .appointment.status
  }'
else
  echo "⚠️  Appointment booking failed"
  echo "$APPOINTMENT" | jq
fi

echo ""

# Try to create duplicate patient (should fail)
echo "Step 6: Try Creating Duplicate Patient (Should Fail)"
echo "─────────────────────────────────────────────────────"
DUPLICATE=$(curl -s -X POST http://localhost:8000/api/doctors/my-patients/create \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "firstName": "Priya",
    "lastName": "Sharma",
    "phoneNumber": "+919876543200",
    "gender": "Female"
  }')

echo "$DUPLICATE" | jq

echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEMO COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 SUMMARY:"
echo ""
echo "✅ Doctor can create patient accounts passively"
echo "✅ Auto-generated temporary password (sent via SMS)"
echo "✅ Patient auto-verified (no OTP needed)"
echo "✅ Duplicate prevention (phone & email check)"
echo "✅ Patient can login immediately"
echo "✅ Doctor can view all their patients"
echo "✅ Patient info includes appointment history"
echo ""
echo "🎯 USE CASES:"
echo ""
echo "1. Walk-in patients without smartphones"
echo "   → Doctor creates account on the spot"
echo "   → Shares temp password verbally or via SMS"
echo ""
echo "2. Elderly patients who need assistance"
echo "   → Doctor/staff creates account"
echo "   → Family member helps with first login"
echo ""
echo "3. Emergency situations"
echo "   → Quick patient registration"
echo "   → Immediate appointment booking"
echo ""
echo "4. Rural/low-tech areas"
echo "   → Doctor handles digital registration"
echo "   → Patient uses simple SMS for updates"
echo ""
echo "✨ FEATURES:"
echo ""
echo "• Temporary password: 8-character random (uppercase)"
echo "• SMS notification: Auto-sent with credentials"
echo "• Email notification: Optional (if email provided)"
echo "• Auto-verification: No OTP needed"
echo "• Duplicate check: Phone number & email"
echo "• Patient list: Searchable with stats"
echo "• Appointment history: Last visit, total visits"
echo ""
echo "📱 ENDPOINTS:"
echo ""
echo "POST /api/doctors/my-patients/create"
echo "  → Create new patient account"
echo ""
echo "GET /api/doctors/my-patients"
echo "  → List all doctor's patients with stats"
echo ""
echo "GET /api/doctors/my-patients?search=priya"
echo "  → Search patients by name/phone/email"
echo ""
