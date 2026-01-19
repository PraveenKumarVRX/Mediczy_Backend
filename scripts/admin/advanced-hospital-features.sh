#!/bin/bash
# Advanced Hospital Management Features - Demonstration
# Shows PATCH operations, updates, and advanced filtering

TOKEN=$(curl -s -X POST http://localhost:8000/api/hospital/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hospital@mediczy.com","password":"Hospital123"}' | jq -r '.token')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   ADVANCED HOSPITAL FEATURES DEMONSTRATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ================================
# ADVANCED BEDS MANAGEMENT
# ================================
echo "🛏️  ADVANCED BEDS FEATURES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "1. Assigning a patient to bed (ICU-01 → Patient 2):"
curl -s -X PATCH http://localhost:8000/api/hospital/practice/beds/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId": 2}' | jq '{success, message, bed: {bedNumber: .data.bedNumber, status: .data.status, patientId: .data.patientId}}'

echo ""
echo "2. Checking bed assignment updated status:"
curl -s -X GET http://localhost:8000/api/hospital/practice/beds \
  -H "Authorization: Bearer $TOKEN" | jq '{success, beds: [.data[] | select(.patientId != null) | {bedNumber, status, patientId}]}'

echo ""
echo "3. Releasing bed (removing patient):"
curl -s -X PATCH http://localhost:8000/api/hospital/practice/beds/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId": null}' | jq '{success, message, bed: {bedNumber: .data.bedNumber, status: .data.status, releasedAt: .data.releasedAt}}'

echo ""
echo ""

# ================================
# ADVANCED LABS MANAGEMENT
# ================================
echo "🧪 ADVANCED LABS FEATURES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LAB_ID=$(curl -s -X GET http://localhost:8000/api/hospital/practice/labs \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

echo "1. Updating lab order with sample collection and marking in-progress:"
curl -s -X PATCH http://localhost:8000/api/hospital/practice/labs/$LAB_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "sample_collected", "sampleCollectedAt": "'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'" }' | jq '{success, message, order: {orderNumber: .data.orderNumber, status: .data.status, sampleCollectedAt: .data.sampleCollectedAt}}'

echo ""
echo "2. Updating lab results:"
curl -s -X PATCH http://localhost:8000/api/hospital/practice/labs/$LAB_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed", "results": "WBC: 7.5, RBC: 4.8, Hb: 14.2, Platelets: 250"}' | jq '{success, message, order: {orderNumber: .data.orderNumber, status: .data.status, results: .data.results}}'

echo ""
echo "3. Filtering by status (completed orders only):"
curl -s -X GET "http://localhost:8000/api/hospital/practice/labs?status=completed" \
  -H "Authorization: Bearer $TOKEN" | jq '{success, total: .total, completedOrders: [.data[] | {orderNumber, status, results}]}'

echo ""
echo ""

# ================================
# ADVANCED PHARMACY FEATURES
# ================================
echo "💊 ADVANCED PHARMACY FEATURES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "1. Updating medicine price and reorder level:"
curl -s -X PATCH http://localhost:8000/api/hospital/practice/pharmacy/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"unitPrice": 2.75, "reorderLevel": 150, "quantity": 950}' | jq '{success, message, medicine: {medicineName: .data.medicineName, quantity: .data.quantity, unitPrice: .data.unitPrice}}'

echo ""
echo "2. Checking low stock medicines:"
curl -s -X GET "http://localhost:8000/api/hospital/practice/pharmacy?lowStock=true" \
  -H "Authorization: Bearer $TOKEN" | jq '{success, stats: .stats, lowStockMedicines: [.data[] | {medicineName, quantity, reorderLevel}]}'

echo ""
PRESCR_ID=$(curl -s -X GET http://localhost:8000/api/hospital/practice/pharmacy/prescriptions \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

echo "3. Dispensing a prescription (automatic inventory update):"
curl -s -X PATCH http://localhost:8000/api/hospital/practice/pharmacy/prescriptions/$PRESCR_ID/dispense \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dispensedBy": 1}' | jq '{success, message, prescription: {dispensingNumber: .data.dispensingNumber, dispensed: .data.dispensed, dispensedAt: .data.dispensedAt}, remainingStock: .remainingStock}'

echo ""
echo "4. Verifying inventory was updated (Paracetamol should be reduced):"
curl -s -X GET "http://localhost:8000/api/hospital/practice/pharmacy?search=Paracetamol" \
  -H "Authorization: Bearer $TOKEN" | jq '{success, medicines: [.data[] | {medicineName, quantity, unitPrice}]}'

echo ""
echo ""

# ================================
# SUMMARY
# ================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ADVANCED FEATURES DEMONSTRATION COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Features Demonstrated:"
echo "  • Bed assignment/release with patient tracking"
echo "  • Lab order lifecycle (sample → collection → completion)"
echo "  • Lab results recording and filtering"
echo "  • Inventory price and reorder level management"
echo "  • Low stock alerts and filtering"
echo "  • Prescription dispensing with automatic inventory updates"
echo "  • Real-time stock level verification"
echo ""
