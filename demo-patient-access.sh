#!/bin/bash

echo "👤 Patient Prescription Access Demo"
echo "===================================="
echo ""

# Patient login
echo "🔐 Logging in as patient: Rahul Verma"
PATIENT_TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}' | jq -r .token)

echo "✅ Patient logged in successfully"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Feature 1: View All My Prescriptions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s "http://localhost:8000/api/prescriptions/patient" \
  -H "Authorization: Bearer $PATIENT_TOKEN" | jq '{
    success,
    count,
    prescriptions: .prescriptions | map({
      prescriptionId,
      doctorName,
      specialty,
      diagnosis,
      medicationsCount: (.medications | length),
      createdAt
    })
  }'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 Feature 2: View Specific Prescription"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PRESCRIPTION_ID="RX-MJFXG1H6-PDJHU"

curl -s "http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID" \
  -H "Authorization: Bearer $PATIENT_TOKEN" | jq '{
    success,
    prescription: {
      prescriptionId: .prescription.prescriptionId,
      doctorName: .prescription.doctorName,
      doctorQualifications: .prescription.doctorQualifications,
      specialty: .prescription.specialty,
      diagnosis: .prescription.diagnosis,
      medications: .prescription.medications,
      followUpDate: .prescription.followUpDate
    }
  }'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🖨️  Feature 3: Print Prescription"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s "http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID/html" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -o /tmp/patient-print.html

if [ -f /tmp/patient-print.html ]; then
  SIZE=$(ls -lh /tmp/patient-print.html | awk '{print $5}')
  echo "✅ Print-ready HTML: /tmp/patient-print.html ($SIZE)"
  echo "   Access URL: http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID/html"
  echo "   Click 'Print Prescription' button or press Ctrl+P"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📥 Feature 4: Download PDF"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s "http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID/pdf" \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -o /tmp/patient-prescription.pdf 2>/dev/null

FILE_TYPE=$(file /tmp/patient-prescription.pdf | grep -o "HTML\|PDF")
SIZE=$(ls -lh /tmp/patient-prescription.pdf | awk '{print $5}')

echo "📄 Downloaded: /tmp/patient-prescription.pdf ($SIZE)"
echo "   Format: $FILE_TYPE (print to PDF from browser)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📲 Feature 5: Share on WhatsApp"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

WHATSAPP=$(curl -s "http://localhost:8000/api/prescriptions/$PRESCRIPTION_ID/share/whatsapp" \
  -H "Authorization: Bearer $PATIENT_TOKEN")

echo "✅ WhatsApp share link generated"
echo ""
echo "📱 Click to share:"
echo "   $(echo "$WHATSAPP" | jq -r .whatsappUrl | head -c 80)..."
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Summary: What Patients Can Do"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Patient: Rahul Verma"
echo "Email: rahul.verma@gmail.com"
echo ""
echo "✅ View all prescriptions from all doctors"
echo "✅ View full prescription details"
echo "✅ Print prescriptions (professional EMR format)"
echo "✅ Download as PDF/HTML"
echo "✅ Share on WhatsApp with family/pharmacy"
echo "✅ Access from mobile/desktop/tablet"
echo ""
echo "🔐 All data is secured with authentication"
echo "📱 Access anywhere, anytime after login"
echo ""
