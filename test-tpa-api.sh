#!/bin/bash
# TPA Integration API Test Script

echo "🧪 Testing TPA Integration APIs..."
echo ""

BASE_URL="http://localhost:8000/api/tpa"

# You'll need a valid auth token - get it from login
# Replace YOUR_TOKEN with actual JWT token
TOKEN="YOUR_TOKEN"

echo "1. Testing: Get All TPA Providers"
echo "-----------------------------------"
curl -s -X GET "${BASE_URL}/providers" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.' 2>/dev/null || echo "⚠️ Need valid auth token"

echo ""
echo ""
echo "2. Testing: Execute Operation (Heritage - Get Claims)"
echo "--------------------------------------------------------"
curl -s -X POST "${BASE_URL}/execute" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "heritage",
    "operation": "getClaims",
    "data": {
      "policyNumber": "TEST123"
    }
  }' | jq '.' 2>/dev/null || echo "⚠️ Need valid auth token"

echo ""
echo ""
echo "3. Testing: Provider-specific Endpoint (Care Health)"
echo "--------------------------------------------------------"
curl -s -X POST "${BASE_URL}/care/hospitals" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "Maharashtra",
    "city": "Mumbai"
  }' | jq '.' 2>/dev/null || echo "⚠️ Need valid auth token"

echo ""
echo ""
echo "4. Testing: FGI TPA Enrollment"
echo "-------------------------------"
curl -s -X POST "${BASE_URL}/fgi/enrollment" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "policyNumber": "FGI123456",
    "memberId": "MEM789"
  }' | jq '.' 2>/dev/null || echo "⚠️ Need valid auth token"

echo ""
echo ""
echo "✅ TPA API Tests Complete!"
echo ""
echo "📝 Notes:"
echo "   - Replace YOUR_TOKEN with actual JWT from login"
echo "   - Configure TPA credentials in .env file"
echo "   - Check individual TPA service files for required parameters"
echo ""
echo "📁 Documentation: /home/ubuntu/Mediczy/TPA_INTEGRATION_COMPLETE.md"
echo "📊 Analysis: /home/ubuntu/Mediczy/API_Kits/Heritage_TPA/analysis/"
