#!/bin/bash

echo "📋 How to View Styled Prescription"
echo "=================================="
echo ""

# Get fresh share link
TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}' \
  | jq -r .token)

SHARE_DATA=$(curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/share/whatsapp" \
  -H "Authorization: Bearer $TOKEN")

SHARE_URL=$(echo "$SHARE_DATA" | jq -r .prescriptionUrl)

echo "✅ Shareable URL (valid for 30 days):"
echo "$SHARE_URL"
echo ""

# Convert to localhost for testing
LOCAL_URL="${SHARE_URL/mediqzy.com/localhost:8000}"

echo "🌐 For testing on server, use:"
echo "$LOCAL_URL"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 How to View:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Option 1: Direct Browser Access"
echo "  • Copy the URL above"
echo "  • Paste in browser (Chrome/Firefox/Safari)"
echo "  • Will show fully styled EMR prescription"
echo ""
echo "Option 2: WhatsApp Share"
echo "  • Click WhatsApp link"
echo "  • Send to patient"
echo "  • They click to view in browser"
echo ""
echo "Option 3: QR Code (if available)"
echo "  • Generate QR from URL"
echo "  • Patient scans with phone"
echo "  • Opens directly in mobile browser"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ What You'll See in Browser:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Blue gradient header with doctor credentials"
echo "✅ Professional EMR layout"
echo "✅ Circular clinic seal with gold border"
echo "✅ Medications table with proper formatting"
echo "✅ Digital signature section"
echo "✅ Print button (top right)"
echo "✅ EMR certification badge"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 Styled Elements Include:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "• Blue gradient header (#2563eb to #1e40af)"
echo "• Gold doctor specialty text (#fbbf24)"
echo "• White circular clinic seal (130px diameter)"
echo "• Green 'CERTIFIED EMR' badge"
echo "• Professional medication table"
echo "• Prescription watermark background"
echo "• Print-optimized CSS (hides print button when printing)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🖨️ To Print:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Open URL in browser"
echo "2. Click 'Print Prescription' button (top right)"
echo "   OR press Ctrl+P (Cmd+P on Mac)"
echo "3. Select printer or 'Save as PDF'"
echo "4. Print/Save"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️ Note:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "The text you saw is RAW HTML viewed in terminal."
echo "CSS styling only appears when opened in a WEB BROWSER."
echo ""
echo "Terminal shows: Plain text content"
echo "Browser shows:  Fully styled EMR prescription"
echo ""
