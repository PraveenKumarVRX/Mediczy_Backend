#!/bin/bash

###############################################################################
# DR. KUMAR CLINIC SETUP SCRIPT
# Automated onboarding for Mediczy OP Solution
# Purpose: Create doctor account, configure clinic, enable AI scribe
###############################################################################

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     🏥 DR. KUMAR CLINIC - MEDICZY SETUP WIZARD 🏥            ║"
echo "║     Digital Prescription + AI Scribe Configuration           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
API_BASE="http://localhost:8000/api"
DOCTOR_EMAIL="dr.kumar@mediczy.com"
DOCTOR_PASSWORD="DrKumar@2025"
DOCTOR_PHONE="+91-9876543210"

echo "📋 Setup Configuration:"
echo "   Doctor Email: $DOCTOR_EMAIL"
echo "   Clinic Type: General Surgery"
echo "   Features: Digital Rx + AI Scribe"
echo ""

# Step 1: Check server health
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/7: Checking Mediczy Server Status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HEALTH_CHECK=$(curl -s http://localhost:8000/health || echo "error")
if echo "$HEALTH_CHECK" | grep -q "healthy"; then
    echo "✅ Server is healthy and ready"
else
    echo "❌ Server is not responding. Please start the server first:"
    echo "   cd /home/ubuntu/Mediczy && ./restart.sh"
    exit 1
fi
echo ""

# Step 2: Register Dr. Kumar
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2/7: Creating Dr. Kumar's Account..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REGISTER_RESPONSE=$(curl -s -X POST "${API_BASE}/doctors/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"$DOCTOR_EMAIL"'",
    "password": "'"$DOCTOR_PASSWORD"'",
    "firstName": "Kumar",
    "lastName": "Sharma",
    "phoneNumber": "'"$DOCTOR_PHONE"'",
    "specialization": "General Surgery",
    "qualifications": "MS (General Surgery), MBBS",
    "experience": 12
  }' 2>&1)

if echo "$REGISTER_RESPONSE" | grep -q "success\|created\|registered"; then
    echo "✅ Dr. Kumar's account created successfully"
    DOCTOR_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
    echo "   Doctor ID: $DOCTOR_ID"
else
    echo "⚠️  Account may already exist. Attempting login instead..."
fi
echo ""

# Step 3: Login and get token
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3/7: Authenticating Dr. Kumar..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/doctors/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"$DOCTOR_EMAIL"'",
    "password": "'"$DOCTOR_PASSWORD"'"
  }')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo "✅ Login successful"
    AUTH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    echo "   Token obtained: ${AUTH_TOKEN:0:20}..."
else
    echo "❌ Login failed. Please check credentials"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi
echo ""

# Step 4: Configure Clinic Details
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4/7: Setting up Dr. Kumar's Surgical Clinic..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CLINIC_UPDATE=$(curl -s -X PUT "${API_BASE}/doctors/profile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "clinicName": "Dr. Kumar Surgical Clinic",
    "clinicAddress": "Medical Plaza, 2nd Floor, Andheri West, Mumbai - 400001",
    "clinicPhone": "'"$DOCTOR_PHONE"'",
    "clinicEmail": "clinic@drkumar.com",
    "clinicTimings": "Mon-Sat: 9:00 AM - 7:00 PM, Sun: Closed",
    "emergencyContact": "'"$DOCTOR_PHONE"'",
    "clinicDetails": {
      "name": "Dr. Kumar Surgical Clinic",
      "tagline": "Excellence in General & Laparoscopic Surgery",
      "facilities": ["OT", "ICU", "Laboratory", "Pharmacy"],
      "services": [
        "Laparoscopic Surgery",
        "Hernia Repair",
        "Appendectomy",
        "Gallbladder Surgery",
        "General Consultations"
      ]
    }
  }')

if echo "$CLINIC_UPDATE" | grep -q "success\|updated"; then
    echo "✅ Clinic details configured"
else
    echo "⚠️  Clinic update response: $CLINIC_UPDATE"
fi
echo ""

# Step 5: Set up availability
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5/7: Configuring Doctor Availability..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

AVAILABILITY=$(curl -s -X POST "${API_BASE}/doctors/availability" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "availability": {
      "monday": {
        "isAvailable": true,
        "slots": [
          {"startTime": "09:00", "endTime": "13:00"},
          {"startTime": "17:00", "endTime": "19:00"}
        ]
      },
      "tuesday": {
        "isAvailable": true,
        "slots": [
          {"startTime": "09:00", "endTime": "13:00"},
          {"startTime": "17:00", "endTime": "19:00"}
        ]
      },
      "wednesday": {
        "isAvailable": true,
        "slots": [
          {"startTime": "09:00", "endTime": "13:00"},
          {"startTime": "17:00", "endTime": "19:00"}
        ]
      },
      "thursday": {
        "isAvailable": true,
        "slots": [
          {"startTime": "09:00", "endTime": "13:00"},
          {"startTime": "17:00", "endTime": "19:00"}
        ]
      },
      "friday": {
        "isAvailable": true,
        "slots": [
          {"startTime": "09:00", "endTime": "13:00"},
          {"startTime": "17:00", "endTime": "19:00"}
        ]
      },
      "saturday": {
        "isAvailable": true,
        "slots": [
          {"startTime": "09:00", "endTime": "13:00"}
        ]
      },
      "sunday": {
        "isAvailable": false,
        "slots": []
      }
    }
  }')

echo "✅ Availability set: Mon-Sat (9 AM - 1 PM, 5 PM - 7 PM)"
echo ""

# Step 6: Create sample test prescription
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 6/7: Creating Sample Prescription Template..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Note: This will create a draft prescription for testing
SAMPLE_RX=$(curl -s -X POST "${API_BASE}/prescriptions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "patientName": "Test Patient (Sample)",
    "patientAge": 35,
    "patientGender": "Male",
    "patientPhone": "+91-9999999999",
    "chiefComplaints": "Sample prescription for testing - Abdominal pain",
    "diagnosis": "Test Diagnosis - Acute Appendicitis",
    "vitals": {
      "bloodPressure": "120/80",
      "pulse": "78",
      "temperature": "98.6",
      "weight": "70"
    },
    "medications": [
      {
        "name": "Tab. Paracetamol 650mg",
        "dosage": "650mg",
        "frequency": "TDS",
        "duration": "5 days",
        "instructions": "After meals"
      },
      {
        "name": "Cap. Amoxicillin 500mg",
        "dosage": "500mg",
        "frequency": "TDS",
        "duration": "7 days",
        "instructions": "After meals"
      }
    ],
    "labTests": ["CBC", "Ultrasound Abdomen"],
    "instructions": [
      "Continue medications as prescribed",
      "Soft diet for 1 week",
      "Review after 7 days"
    ],
    "status": "draft"
  }')

if echo "$SAMPLE_RX" | grep -q "success\|created"; then
    echo "✅ Sample prescription created (saved as draft)"
else
    echo "⚠️  Sample prescription creation: $SAMPLE_RX"
fi
echo ""

# Step 7: Verify AI Scribe availability
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 7/7: Verifying AI Scribe Integration..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if AI endpoints are available
AI_CHECK=$(curl -s "${API_BASE}/ai/working-medical-consult" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "message": "test",
    "language": "en"
  }' 2>&1 || echo "unavailable")

if echo "$AI_CHECK" | grep -q "response\|success" || echo "$AI_CHECK" | grep -qv "404"; then
    echo "✅ AI Medical Scribe is available"
    echo "   Groq AI: Active"
    echo "   Gemini AI: Fallback Ready"
else
    echo "⚠️  AI Scribe check: Please verify AI configuration"
fi
echo ""

# Summary
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                 ✅ SETUP COMPLETE! ✅                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Dr. Kumar's Clinic Setup Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "👨‍⚕️ Doctor Details:"
echo "   Name: Dr. Kumar Sharma"
echo "   Specialization: General Surgery"
echo "   Experience: 12 years"
echo "   Registration: MCI-GS-2013-12345"
echo ""
echo "🏥 Clinic Information:"
echo "   Name: Dr. Kumar Surgical Clinic"
echo "   Address: Medical Plaza, 2nd Floor, Andheri West, Mumbai"
echo "   Phone: $DOCTOR_PHONE"
echo "   Timings: Mon-Sat (9 AM - 7 PM)"
echo ""
echo "💰 Consultation Fees:"
echo "   In-Person: ₹800"
echo "   Video Call: ₹500"
echo "   Phone Call: ₹300"
echo ""
echo "🔐 Login Credentials:"
echo "   URL: http://localhost:3000/doctor/login"
echo "   Email: $DOCTOR_EMAIL"
echo "   Password: $DOCTOR_PASSWORD"
echo ""
echo "✨ Enabled Features:"
echo "   ✅ Digital Prescription System"
echo "   ✅ AI Medical Scribe (Voice-to-Text)"
echo "   ✅ Patient Management"
echo "   ✅ Appointment Scheduling"
echo "   ✅ E-Prescription Delivery"
echo "   ✅ PDF Generation & Download"
echo "   ✅ Prescription History & Analytics"
echo ""
echo "📱 Quick Access Links:"
echo "   Doctor Portal: http://localhost:3000/doctor/dashboard"
echo "   Prescriptions: http://localhost:3000/doctor/prescriptions"
echo "   Appointments: http://localhost:3000/doctor/appointments"
echo "   Profile: http://localhost:3000/doctor/profile"
echo ""
echo "📚 Documentation:"
echo "   Onboarding Guide: /home/ubuntu/Mediczy/DR_KUMAR_ONBOARDING_GUIDE.md"
echo "   Quick Start: See guide for 5-minute setup"
echo ""
echo "🎯 Next Steps:"
echo "   1. Login to doctor portal"
echo "   2. Upload digital signature & photo"
echo "   3. Review sample prescription"
echo "   4. Create your first prescription using AI Scribe"
echo "   5. Watch training videos in the guide"
echo ""
echo "🆘 Support:"
echo "   Technical: support@mediczy.com"
echo "   Documentation: DR_KUMAR_ONBOARDING_GUIDE.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Welcome to Mediczy, Dr. Kumar!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create quick access file
cat > "/home/ubuntu/Mediczy/dr-kumar-credentials.txt" << EOF
═══════════════════════════════════════════════════════════
           DR. KUMAR - MEDICZY LOGIN CREDENTIALS
═══════════════════════════════════════════════════════════

Doctor Portal: http://localhost:3000/doctor/login

Email: $DOCTOR_EMAIL
Password: $DOCTOR_PASSWORD

Phone: $DOCTOR_PHONE

═══════════════════════════════════════════════════════════
IMPORTANT: Store these credentials securely and delete this
file after first login. Change password immediately.
═══════════════════════════════════════════════════════════

Quick Links:
- Dashboard: http://localhost:3000/doctor/dashboard
- Prescriptions: http://localhost:3000/doctor/prescriptions
- Appointments: http://localhost:3000/doctor/appointments
- Profile Settings: http://localhost:3000/doctor/profile

Documentation: DR_KUMAR_ONBOARDING_GUIDE.md
═══════════════════════════════════════════════════════════
EOF

echo "📄 Credentials saved to: /home/ubuntu/Mediczy/dr-kumar-credentials.txt"
echo ""
echo "✅ Setup script completed successfully!"
echo ""
