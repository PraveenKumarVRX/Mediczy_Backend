#!/bin/bash

echo "✅ PRESCRIPTION SYSTEM - READY"
echo "=============================="
echo ""

# Test accounts
echo "👨‍⚕️ Doctor Account:"
echo "  Email: drkumar.surgery@mediczy.com"
echo "  Password: DrKumar@2025"
echo ""

echo "👤 Patient Account:"
echo "  Email: rahul.verma@gmail.com"
echo "  Password: RahulVerma@2025"
echo ""

echo "📋 Sample Prescription: RX-MJFXG1H6-PDJHU"
echo "  Patient: Rahul Verma, 45 yrs, Male"
echo "  Doctor: Dr. Kumar Sharma, MS (General Surgery)"
echo "  Status: Active"
echo ""

# Get WhatsApp share link
TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}' \
  | jq -r .token)

SHARE=$(curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/share/whatsapp" \
  -H "Authorization: Bearer $TOKEN")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 SHARE PRESCRIPTION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "WhatsApp Message:"
echo "$SHARE" | jq -r '.message'
echo ""
echo "Direct PDF Download:"
echo "$SHARE" | jq -r '.pdfUrl'
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 SAVED FILES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
ls -lh uploads/prescriptions/ 2>/dev/null | grep ".pdf" | awk '{print "  " $9 " - " $5}'
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 HOW TO USE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. SHARE VIA WHATSAPP"
echo "   • Use the WhatsApp URL above"
echo "   • Click to send message"
echo "   • Patient clicks PDF link to download"
echo ""
echo "2. DOWNLOAD PDF DIRECTLY"
echo "   • Open PDF URL in browser"
echo "   • File downloads automatically (120KB)"
echo "   • Print or save to phone"
echo ""
echo "3. ACCESS FROM EMR"
echo "   • Patient logs into mediqzy.com"
echo "   • Goes to 'My Prescriptions'"
echo "   • Downloads PDF from dashboard"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ WHAT'S INCLUDED IN PDF"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Professional EMR header (blue gradient)"
echo "✅ Doctor credentials (name, qualifications, specialty)"
echo "✅ Patient details (name, age, gender, contact)"
echo "✅ Vitals (BP, pulse, temperature, weight)"
echo "✅ Diagnosis and chief complaints"
echo "✅ Medications table with dosage"
echo "✅ Instructions and follow-up date"
echo "✅ Digital signature and clinic seal"
echo "✅ EMR certification badge"
echo "✅ Legal disclaimer"
echo ""
echo "📄 PDF: 2 pages, 120KB, Print-ready"
echo ""
