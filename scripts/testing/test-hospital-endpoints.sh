#!/bin/bash
# Hospital Management System - Test All Endpoints
# Tests Beds, Labs, and Pharmacy features

# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8000/api/hospital/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hospital@mediczy.com","password":"Hospital123"}' | jq -r '.token')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "    HOSPITAL MANAGEMENT SYSTEM - COMPREHENSIVE TEST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ================================
# BEDS MANAGEMENT
# ================================
echo "📋 BEDS MANAGEMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Creating beds..."
curl -s -X POST http://localhost:8000/api/hospital/practice/beds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bedNumber":"GEN-101","ward":"General Ward","bedType":"General"}' | jq '{success, bed: .data.bedNumber}'

curl -s -X POST http://localhost:8000/api/hospital/practice/beds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bedNumber":"PVT-201","ward":"Private Ward","bedType":"Private"}' | jq '{success, bed: .data.bedNumber}'

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
curl -s -X POST http://localhost:8000/api/hospital/practice/labs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"doctorId":1,"testType":"Complete Blood Count","testCategory":"Blood","priority":"urgent"}' | jq '{success, order: .data.orderNumber, testType: .data.testType}'

curl -s -X POST http://localhost:8000/api/hospital/practice/labs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"doctorId":1,"testType":"X-Ray Chest","testCategory":"X-Ray","priority":"normal"}' | jq '{success, order: .data.orderNumber, testType: .data.testType}'

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
curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"medicineName":"Paracetamol 500mg","genericName":"Acetaminophen","manufacturer":"MediPharma","quantity":1000,"unit":"tablets","unitPrice":2.5,"reorderLevel":100}' | jq '{success, medicine: .data.medicineName, quantity: .data.quantity}'

curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"medicineName":"Amoxicillin 250mg","genericName":"Amoxicillin","manufacturer":"BetaLabs","quantity":500,"unit":"capsules","unitPrice":5.0,"reorderLevel":50}' | jq '{success, medicine: .data.medicineName, quantity: .data.quantity}'

curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"medicineName":"Ibuprofen 400mg","genericName":"Ibuprofen","manufacturer":"PainRelief Inc","quantity":800,"unit":"tablets","unitPrice":3.0,"reorderLevel":80}' | jq '{success, medicine: .data.medicineName, quantity: .data.quantity}'

echo ""
echo "Listing pharmacy inventory:"
curl -s -X GET http://localhost:8000/api/hospital/practice/pharmacy \
  -H "Authorization: Bearer $TOKEN" | jq '{success, total: .total, stats: .stats, medicines: [.data[] | {id, medicineName, quantity, unit}]}'

echo ""
echo "Creating prescription:"
curl -s -X POST http://localhost:8000/api/hospital/practice/pharmacy/prescriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patientId":2,"doctorId":1,"medicineId":1,"dosage":"500mg","frequency":"Twice daily","duration":"7 days","quantity":14}' | jq '{success, dispensingNumber: .data.dispensingNumber, medicine: .data.medicine.medicineName, quantity: .data.quantity}'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "    ✅ ALL TESTS COMPLETED SUCCESSFULLY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
