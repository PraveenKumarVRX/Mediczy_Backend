#!/bin/bash

echo "👤 Creating Patient Account and Linking Prescription"
echo "===================================================="

# Create patient user
echo -e "\n1️⃣ Creating patient: Rahul Verma..."

PATIENT_RESPONSE=$(curl -s -X POST http://localhost:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Rahul Verma",
    "email": "rahul.verma@gmail.com",
    "password": "RahulVerma@2025",
    "phone": "+91-9876512345",
    "role": "patient",
    "dateOfBirth": "1980-03-15",
    "gender": "male"
  }')

echo "$PATIENT_RESPONSE" | jq '{success, user: {id, name, email, role}}'

PATIENT_ID=$(echo "$PATIENT_RESPONSE" | jq -r '.user.id')

if [ "$PATIENT_ID" = "null" ] || [ -z "$PATIENT_ID" ]; then
  echo "❌ Patient creation failed. Checking if user exists..."
  
  # Try to login
  LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{
      "email": "rahul.verma@gmail.com",
      "password": "RahulVerma@2025"
    }')
  
  PATIENT_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id')
  
  if [ "$PATIENT_ID" != "null" ] && [ -n "$PATIENT_ID" ]; then
    echo "✅ Patient already exists with ID: $PATIENT_ID"
  else
    echo "❌ Could not create or find patient user"
    exit 1
  fi
else
  echo "✅ Patient created with ID: $PATIENT_ID"
fi

# Update prescription with patient ID
echo -e "\n2️⃣ Linking prescription to patient..."

PGPASSWORD="Mediczy2024Helper" psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai -c "
UPDATE prescriptions 
SET \"patientId\" = $PATIENT_ID 
WHERE \"prescriptionId\" = 'RX-MJFXG1H6-PDJHU';

SELECT id, \"prescriptionId\", \"patientName\", \"patientId\" 
FROM prescriptions 
WHERE \"prescriptionId\" = 'RX-MJFXG1H6-PDJHU';
"

echo -e "\n✅ Prescription linked to patient"

# Test patient login and prescription access
echo -e "\n3️⃣ Testing patient login..."

PATIENT_TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "rahul.verma@gmail.com",
    "password": "RahulVerma@2025"
  }' | jq -r .token)

if [ "$PATIENT_TOKEN" = "null" ] || [ -z "$PATIENT_TOKEN" ]; then
  echo "❌ Patient login failed"
  exit 1
fi

echo "✅ Patient logged in successfully"

# Get patient prescriptions
echo -e "\n4️⃣ Fetching patient's prescriptions..."

curl -s "http://localhost:8000/api/prescriptions/patient" \
  -H "Authorization: Bearer $PATIENT_TOKEN" | jq '{
    success,
    count,
    prescriptions: .prescriptions | map({
      prescriptionId,
      patientName,
      doctorName,
      diagnosis,
      status,
      createdAt
    })
  }'

# Test prescription access
echo -e "\n5️⃣ Accessing specific prescription..."

curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU" \
  -H "Authorization: Bearer $PATIENT_TOKEN" | jq '{
    success,
    prescription: {
      prescriptionId: .prescription.prescriptionId,
      patientName: .prescription.patientName,
      doctorName: .prescription.doctorName,
      diagnosis: .prescription.diagnosis,
      medications: .prescription.medications
    }
  }'

# Test print access
echo -e "\n6️⃣ Generating print view..."

curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -o /tmp/patient-prescription.html

if [ -f /tmp/patient-prescription.html ]; then
  SIZE=$(ls -lh /tmp/patient-prescription.html | awk '{print $5}')
  echo "✅ Print HTML generated: /tmp/patient-prescription.html ($SIZE)"
fi

# Test WhatsApp share
echo -e "\n7️⃣ Testing WhatsApp share..."

curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/share/whatsapp" \
  -H "Authorization: Bearer $PATIENT_TOKEN" | jq '{success, whatsappUrl: (.whatsappUrl | .[0:80])}'

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Patient Access Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Patient Credentials:"
echo "  Email: rahul.verma@gmail.com"
echo "  Password: RahulVerma@2025"
echo "  Patient ID: $PATIENT_ID"
echo ""
echo "Patient can now:"
echo "  ✅ View all their prescriptions"
echo "  ✅ Download prescription as PDF/HTML"
echo "  ✅ Print prescriptions"
echo "  ✅ Share on WhatsApp"
echo ""
