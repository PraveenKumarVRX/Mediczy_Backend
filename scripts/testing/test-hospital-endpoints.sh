#!/bin/bash
# Hospital Management System - Test All Endpoints
# Tests Beds, Labs, and Pharmacy features

# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8000/api/hospital/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hospital@mediczy.com","password":"Hospital123"}' | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to obtain hospital auth token"
  exit 1
fi

assert_success() {
  local label="$1"
  local json="$2"
  local success
  success=$(echo "$json" | jq -r '.success')
  if [ "$success" != "true" ]; then
    echo "❌ ${label} failed"
    echo "$json" | jq '.'
    exit 1
  fi
}

BED_IDS=()
WARNINGS=0

cleanup() {
  if [ ${#BED_IDS[@]} -eq 0 ]; then
    return
  fi

  echo ""
  echo "🧹 CLEANUP"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  for bed_id in "${BED_IDS[@]}"; do
    curl -s -X DELETE "http://localhost:8000/api/hospital/practice/beds/${bed_id}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" >/dev/null
  done
  echo "✅ Removed created beds"
}

trap cleanup EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "    HOSPITAL MANAGEMENT SYSTEM - COMPREHENSIVE TEST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ================================
# BEDS MANAGEMENT
# ================================
echo "📋 BEDS MANAGEMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BED_GEN="GEN-$RANDOM"
BED_PVT="PVT-$RANDOM"
TODAY=$(date +%F)
NOW_TIME=$(date +%H:%M)

echo "Creating beds..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/beds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"bedNumber\":\"${BED_GEN}\",\"ward\":\"General Ward\",\"bedType\":\"General\"}")
echo "$response" | jq '{success, bed: .data.bedNumber}'
assert_success "Create bed ${BED_GEN}" "$response"
bed_id=$(echo "$response" | jq -r '.data.id')
if [ -n "$bed_id" ] && [ "$bed_id" != "null" ]; then
  BED_IDS+=("$bed_id")
fi

response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/beds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"bedNumber\":\"${BED_PVT}\",\"ward\":\"Private Ward\",\"bedType\":\"Private\"}")
echo "$response" | jq '{success, bed: .data.bedNumber}'
assert_success "Create bed ${BED_PVT}" "$response"
bed_id=$(echo "$response" | jq -r '.data.id')
if [ -n "$bed_id" ] && [ "$bed_id" != "null" ]; then
  BED_IDS+=("$bed_id")
fi

echo ""
echo "Listing all beds:"
curl -s -X GET http://localhost:8000/api/hospital/practice/beds \
  -H "Authorization: Bearer $TOKEN" | jq '{success, total: .total, stats: .stats, beds: [.data[] | {bedNumber, ward, status}]}'

echo ""
echo ""

# ================================
# LABS MANAGEMENT
# ================================
echo "🧪 LABS MANAGEMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Creating lab orders..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/labs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"doctorId":1,"testType":"Complete Blood Count","testCategory":"Blood","priority":"urgent"}')
echo "$response" | jq '{success, order: .data.orderNumber, testType: .data.testType}'
assert_success "Create lab order CBC" "$response"

response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/labs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"doctorId":1,"testType":"X-Ray Chest","testCategory":"X-Ray","priority":"normal"}')
echo "$response" | jq '{success, order: .data.orderNumber, testType: .data.testType}'
assert_success "Create lab order X-Ray" "$response"

echo ""
echo "Listing all lab orders:"
curl -s -X GET http://localhost:8000/api/hospital/practice/labs \
  -H "Authorization: Bearer $TOKEN" | jq '{success, total: .total, stats: .stats, orders: [.data[] | {orderNumber, testType, status, priority}]}'

echo ""
echo ""

# ================================
# PHARMACY MANAGEMENT
# ================================
echo "💊 PHARMACY MANAGEMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Adding medicines to inventory..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"medicineName":"Paracetamol 500mg","genericName":"Acetaminophen","manufacturer":"MediPharma","quantity":1000,"unit":"tablets","unitPrice":2.5,"reorderLevel":100}')
echo "$response" | jq '{success, medicine: .data.medicineName, quantity: .data.quantity}'
assert_success "Create medicine Paracetamol" "$response"
PARACETAMOL_ID=$(echo "$response" | jq -r '.data.id')

response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"medicineName":"Amoxicillin 250mg","genericName":"Amoxicillin","manufacturer":"BetaLabs","quantity":500,"unit":"capsules","unitPrice":5.0,"reorderLevel":50}')
echo "$response" | jq '{success, medicine: .data.medicineName, quantity: .data.quantity}'
assert_success "Create medicine Amoxicillin" "$response"

response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"medicineName":"Ibuprofen 400mg","genericName":"Ibuprofen","manufacturer":"PainRelief Inc","quantity":800,"unit":"tablets","unitPrice":3.0,"reorderLevel":80}')
echo "$response" | jq '{success, medicine: .data.medicineName, quantity: .data.quantity}'
assert_success "Create medicine Ibuprofen" "$response"

echo ""
echo "Listing pharmacy inventory:"
curl -s -X GET http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" | jq '{success, total: .total, stats: .stats, medicines: [.data[] | {id, medicineName, quantity, unit}]}'

echo ""
echo "Creating prescription:"
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy/prescriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":2,\"doctorId\":1,\"medicineId\":${PARACETAMOL_ID},\"dosage\":\"500mg\",\"frequency\":\"Twice daily\",\"duration\":\"7 days\",\"quantity\":14}")
echo "$response" | jq '{success, dispensingNumber: .data.dispensingNumber, medicine: .data.medicine.medicineName, quantity: .data.quantity}'
assert_success "Create prescription dispensing record" "$response"

echo ""
echo ""

# ================================
# IMAGING ORDERS
# ================================
echo "🩻 IMAGING ORDERS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Creating imaging order..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/imaging-orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"tests":[{"name":"CT Head","code":"CT_HEAD"}],"priority":"routine","notes":"Headache","totalAmount":1500}')
echo "$response" | jq '{success, order: (.data.orderNumber // .data.order_number), status: .data.status}'
assert_success "Create imaging order" "$response"

echo ""
echo ""

# ================================
# PROCEDURE SCHEDULING
# ================================
echo "🗓️ PROCEDURE SCHEDULING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Scheduling procedure..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/procedures/schedule \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"procedureId\":\"PROC-TEST-1\",\"patientId\":2,\"scheduledDate\":\"${TODAY}\",\"scheduledTime\":\"${NOW_TIME}\",\"priority\":\"routine\",\"anesthesiaType\":\"local\",\"room\":\"OT-1\",\"notes\":\"Smoke test\",\"estimatedDuration\":45}")
echo "$response" | jq '{success, status: .data.status, scheduledDate: .data.scheduled_date}'
assert_success "Schedule procedure" "$response"

echo ""
echo ""

# ================================
# DISCHARGE SUMMARIES
# ================================
echo "📝 DISCHARGE SUMMARIES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Creating discharge summary draft..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/discharge-summaries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"admissionId":1,"diagnosis":["Fever"],"procedures":["Blood test"],"medications":["Paracetamol"],"followUp":"OPD in 7 days","status":"draft"}')
echo "$response" | jq '{success, status: .data.status}'
assert_success "Create discharge summary draft" "$response"

echo "Submitting discharge summary..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/discharge-summaries/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"admissionId":2,"diagnosis":["Headache"],"procedures":[],"medications":["Ibuprofen"],"followUp":"Review in 3 days"}')
echo "$response" | jq '{success, status: .data.status}'
assert_success "Submit discharge summary" "$response"

echo ""
echo ""

# ================================
# IP SHEETS
# ================================
echo "📄 IP SHEETS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Creating IP sheet..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/ip-sheets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"patientId\":2,\"sheetType\":\"nursing\",\"data\":{\"notes\":\"Vitals stable\",\"recordedBy\":\"Nurse\"},\"timestamp\":\"${TODAY}T${NOW_TIME}:00Z\"}")
echo "$response" | jq '{success, sheetType: .data.sheet_type}'
assert_success "Create IP sheet" "$response"

echo ""
echo ""

# ================================
# INSURANCE CLAIMS
# ================================
echo "🧾 INSURANCE CLAIMS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Submitting claim..."
response=$(curl -s -X POST http://localhost:8000/api/hospital/practice/insurance/claims \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"appointmentId":"APT-TEST-1","policyNumber":"POL-TEST-1","insuranceProvider":"Mediczy Insurance","claimAmount":2500}')
echo "$response" | jq '{success, claimNumber: .data.claimNumber, status: .data.status}'
claim_success=$(echo "$response" | jq -r '.success')
if [ "$claim_success" != "true" ]; then
  claim_error=$(echo "$response" | jq -r '.error // .message')
  if echo "$claim_error" | grep -qi "claim_number"; then
    echo "⚠️ Claim create skipped: missing claim_number column in insurance_claims"
    WARNINGS=1
  else
    assert_success "Create insurance claim" "$response"
  fi
fi

echo "Approving claim..."
if [ "$claim_success" = "true" ]; then
  CLAIM_ID=$(echo "$response" | jq -r '.data.id')
  if [ -z "$CLAIM_ID" ] || [ "$CLAIM_ID" = "null" ]; then
    echo "❌ Claim ID missing for update"
    exit 1
  fi

  response=$(curl -s -X PATCH "http://localhost:8000/api/hospital/practice/insurance/claims/${CLAIM_ID}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"approved","approvedAmount":2200}')
  echo "$response" | jq '{success, status: .data.status, approvedAmount: .data.approvedAmount}'
  assert_success "Update insurance claim" "$response"
else
  echo "Skipping claim update due to create failure"
fi

echo ""
if [ "$WARNINGS" -eq 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "    ✅ ALL TESTS COMPLETED SUCCESSFULLY"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "    ⚠️ TESTS COMPLETED WITH WARNINGS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
