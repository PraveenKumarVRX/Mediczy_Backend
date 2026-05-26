#!/bin/bash
# Hospital Insurance Dashboard - API Test Script

BASE_URL="http://localhost:3001"
TOKEN="YOUR_AUTH_TOKEN_HERE"  # Replace with actual JWT token

echo "================================"
echo "Hospital Insurance Dashboard Tests"
echo "================================"
echo ""

# Function to make API request
api_test() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo "TEST: $description"
    echo "Request: $method $endpoint"
    
    if [ "$method" = "POST" ]; then
        curl -X POST "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            -s | jq '.'
    else
        curl -X GET "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -s | jq '.'
    fi
    
    echo ""
    echo "---"
    echo ""
}

# 1. Dashboard Tests
echo "=== 1. DASHBOARD TESTS ==="
api_test "GET" "/api/hospital/insurance/dashboard" "" "Get dashboard stats"

# 2. Claims Management Tests
echo "=== 2. CLAIMS MANAGEMENT TESTS ==="

# Create new claim
NEW_CLAIM_DATA='{
  "patientId": 1,
  "policyNumber": "POL123456",
  "insuranceProviderId": 1,
  "claimAmount": 50000.00,
  "claimType": "cashless",
  "hospitalizationDetails": {
    "admissionDate": "2026-01-25",
    "dischargeDate": "2026-01-28",
    "roomType": "Private",
    "treatingDoctor": "Dr. Smith"
  },
  "diagnosis": "Acute Appendicitis (ICD-10: K35.80)",
  "treatmentDetails": {
    "procedures": ["Appendectomy"],
    "medications": ["Antibiotics", "Pain management"]
  },
  "hospitalId": 1
}'
api_test "POST" "/api/hospital/insurance/claims/new" "$NEW_CLAIM_DATA" "Create new claim"

# Get drafts
api_test "GET" "/api/hospital/insurance/claims/drafts?page=1&limit=10" "" "Get draft claims"

# Get submitted claims
api_test "GET" "/api/hospital/insurance/claims/submitted?page=1&limit=10" "" "Get submitted claims"

# 3. Pre-Authorization Tests
echo "=== 3. PRE-AUTHORIZATION TESTS ==="

PREAUTH_DATA='{
  "patientId": 1,
  "policyNumber": "POL123456",
  "insuranceProviderId": 1,
  "admissionDetails": {
    "admissionDate": "2026-02-01",
    "admissionType": "Planned Surgery",
    "roomType": "Private"
  },
  "estimatedAmount": 75000.00,
  "diagnosis": "Gallbladder stones requiring cholecystectomy",
  "plannedProcedures": ["Laparoscopic Cholecystectomy"],
  "estimatedDuration": 3,
  "hospitalId": 1
}'
api_test "POST" "/api/hospital/insurance/pre-auth/new" "$PREAUTH_DATA" "Create pre-authorization request"

api_test "GET" "/api/hospital/insurance/pre-auth/pending" "" "Get pending pre-auths"

# 4. Patient Search Tests
echo "=== 4. PATIENT SEARCH TESTS ==="

SEARCH_DATA='{
  "searchTerm": "POL123456",
  "searchType": "policy"
}'
api_test "POST" "/api/hospital/insurance/patient/search" "$SEARCH_DATA" "Search by policy number"

# 5. Revenue Tests
echo "=== 5. REVENUE / FINANCIALS TESTS ==="

api_test "GET" "/api/hospital/insurance/revenue/receivables" "" "Get receivables"
api_test "GET" "/api/hospital/insurance/revenue/settlement-status?page=1&limit=10" "" "Get settlement status"

# 6. Reports Tests
echo "=== 6. REPORTS / ANALYTICS TESTS ==="

api_test "GET" "/api/hospital/insurance/reports/claims-aging" "" "Get claims aging report"
api_test "GET" "/api/hospital/insurance/reports/tat" "" "Get TAT report"
api_test "GET" "/api/hospital/insurance/reports/query-rejection-trends?months=6" "" "Get query/rejection trends"

echo ""
echo "================================"
echo "Tests completed"
echo "================================"
