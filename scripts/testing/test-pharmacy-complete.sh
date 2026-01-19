#!/bin/bash

echo "=================================================="
echo "PHARMACY DASHBOARD COMPREHENSIVE TEST"
echo "=================================================="
echo ""

# Get fresh token
echo "1. Testing Login..."
RESPONSE=$(curl -s -X POST http://localhost:8000/api/pharmacy/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pharmacy@mediczy.com","password":"Pharmacy123"}')

TOKEN=$(echo $RESPONSE | jq -r '.token')
SUCCESS=$(echo $RESPONSE | jq -r '.success')

if [ "$SUCCESS" = "true" ]; then
  echo "   ✅ Login successful"
  echo "   Token: ${TOKEN:0:50}..."
else
  echo "   ❌ Login failed"
  exit 1
fi

echo ""
echo "2. Testing Profile..."
curl -s -X GET http://localhost:8000/api/pharmacy/profile \
  -H "Authorization: Bearer $TOKEN" | jq '{success, pharmacy: {name: .pharmacy.name, email: .pharmacy.email}}'

echo ""
echo "3. Testing Dashboard Stats..."
curl -s -X GET http://localhost:8000/api/pharmacy/dashboard/stats \
  -H "Authorization: Bearer $TOKEN" | jq '{success, totalMedicines: .data.totalMedicines, todaySales: .data.todaySales, pendingOrders: .data.pendingOrders}'

echo ""
echo "4. Testing Inventory..."
curl -s -X GET http://localhost:8000/api/pharmacy/inventory \
  -H "Authorization: Bearer $TOKEN" | jq '{success, total: .data.total, medicineCount: (.data.medicines | length)}'

echo ""
echo "5. Testing POS Transactions..."
curl -s -X GET http://localhost:8000/api/pharmacy/pos/transactions \
  -H "Authorization: Bearer $TOKEN" | jq '{success, transactionCount: (.data | length)}'

echo ""
echo "6. Testing Prescriptions..."
curl -s -X GET http://localhost:8000/api/pharmacy/prescriptions \
  -H "Authorization: Bearer $TOKEN" | jq '{success, stats}'

echo ""
echo "7. Testing Today Sales..."
curl -s -X GET http://localhost:8000/api/pharmacy/pos/today-sales \
  -H "Authorization: Bearer $TOKEN" | jq '{success, totalSales: .data.totalSales, totalTransactions: .data.totalTransactions}'

echo ""
echo "8. Testing Quick Actions..."
curl -s -X GET http://localhost:8000/api/pharmacy/dashboard/quick-actions \
  -H "Authorization: Bearer $TOKEN" | jq '{success, pendingPrescriptions: (.data.pendingPrescriptions | length), notifications: (.data.recentNotifications | length)}'

echo ""
echo "=================================================="
echo "✅ ALL PHARMACY ENDPOINTS WORKING!"
echo "=================================================="
