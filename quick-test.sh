#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/user/login -H "Content-Type: application/json" -d '{"email":"user@mediczy.com","password":"User123"}' | jq -r '.token')

echo "1. Testing Doctor List:"
curl -s "http://localhost:8000/api/doctors?page=1&limit=10" -H "Authorization: Bearer $TOKEN" | jq '{success, count: (.doctors | length)}'

echo -e "\n2. Testing Appointment Booking:"
curl -s -X POST http://localhost:8000/api/appointments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"doctorId":1,"date":"2025-12-21","timeSlot":"10:00 AM","type":"consultation"}' | jq

echo -e "\n3. Testing Doctor Slots:"
curl -s "http://localhost:8000/api/doctors/1/slots?date=2025-12-21" -H "Authorization: Bearer $TOKEN" | jq

echo -e "\n4. Testing AI Doctor:"
curl -s -X POST http://localhost:8000/api/ai/chat -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"message":"I have a headache"}' | jq '.success'

echo -e "\n5. Testing Diet Plan:"
curl -s -X POST http://localhost:8000/api/diet/generate -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"age":30,"weight":70,"height":170,"goal":"weight_loss"}' | jq '.success'
