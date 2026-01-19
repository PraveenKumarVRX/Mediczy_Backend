#!/bin/bash

echo "🔑 How to Access Prescription with Token"
echo "========================================"
echo ""

# Step 1: Login
echo "STEP 1: Login to get token"
echo "----------------------------"
echo ""
echo "Patient Login:"
echo "curl -X POST http://localhost:8000/api/users/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"rahul.verma@gmail.com\",\"password\":\"RahulVerma@2025\"}'"
echo ""

PATIENT_LOGIN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}')

TOKEN=$(echo "$PATIENT_LOGIN" | jq -r .token)

echo "Response:"
echo "$PATIENT_LOGIN" | jq '{message, user: {id, email}, token: (.token[0:50] + "...")}'
echo ""

# Step 2: Use token
echo "STEP 2: Use token to access prescription"
echo "-----------------------------------------"
echo ""
echo "View Prescription:"
echo "curl 'http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU' \\"
echo "  -H 'Authorization: Bearer <YOUR_TOKEN>'"
echo ""

PRESCRIPTION=$(curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU" \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$PRESCRIPTION" | jq '{success, prescription: {prescriptionId, patientName, doctorName}}'
echo ""

# Step 3: Print/Download
echo "STEP 3: Print or Download"
echo "--------------------------"
echo ""
echo "Print HTML:"
echo "curl 'http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html' \\"
echo "  -H 'Authorization: Bearer <YOUR_TOKEN>' \\"
echo "  -o prescription.html"
echo ""

curl -s "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html" \
  -H "Authorization: Bearer $TOKEN" \
  -o /tmp/rx-sample.html

if [ -f /tmp/rx-sample.html ] && [ -s /tmp/rx-sample.html ]; then
  SIZE=$(ls -lh /tmp/rx-sample.html | awk '{print $5}')
  echo "✅ Downloaded: /tmp/rx-sample.html ($SIZE)"
else
  echo "❌ Download failed"
fi

echo ""

# Step 4: Common errors
echo "STEP 4: Common Errors & Solutions"
echo "----------------------------------"
echo ""
echo "❌ Error: 'unauthorized token'"
echo "   Solution: Token might be expired. Login again to get fresh token."
echo "   Tokens expire after a few hours."
echo ""
echo "❌ Error: 'Authorization header missing'"
echo "   Solution: Include header: -H 'Authorization: Bearer <TOKEN>'"
echo ""
echo "❌ Error: 'Access denied'"
echo "   Solution: Make sure you're the patient who owns this prescription"
echo "   or the doctor who created it."
echo ""

# JavaScript example
echo "STEP 5: Frontend/JavaScript Example"
echo "------------------------------------"
echo ""
cat << 'EOF'
// 1. Login
const loginResponse = await fetch('http://localhost:8000/api/users/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'rahul.verma@gmail.com',
    password: 'RahulVerma@2025'
  })
});
const { token } = await loginResponse.json();

// 2. View prescription
const prescriptionResponse = await fetch(
  'http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU',
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
const data = await prescriptionResponse.json();
console.log(data);

// 3. Print prescription (open in new window)
window.open(
  `http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html?token=${token}`,
  '_blank'
);
EOF

echo ""
echo ""

# Test current access
echo "CURRENT STATUS"
echo "--------------"
echo ""
echo "✅ Patient: rahul.verma@gmail.com"
echo "✅ Password: RahulVerma@2025"
echo "✅ Token valid for: ~6 hours"
echo "✅ Current token works: $([ "$(echo "$PRESCRIPTION" | jq -r .success)" = "true" ] && echo "YES" || echo "NO")"
echo ""
echo "Your current token (valid for next 6 hours):"
echo "$TOKEN"
echo ""
