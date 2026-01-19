#!/bin/bash

# Get token
TOKEN=$(curl -s -X POST "http://localhost:8000/api/doctors/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"drkumar.surgery@mediczy.com","password":"DrKumar@2025"}' | jq -r '.token')

echo "Creating EMR Prescription..."

# Create prescription
curl -s -X POST "http://localhost:8000/api/prescriptions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "patientName": "Rahul Verma",
    "patientAge": 45,
    "patientGender": "Male",
    "patientPhone": "+91-9876512345",
    "chiefComplaints": "Post-operative pain management after laparoscopic cholecystectomy",
    "diagnosis": "Status post laparoscopic cholecystectomy, Day 3 post-op. Wound healing satisfactory.",
    "vitals": {
      "bloodPressure": "128/84",
      "pulse": "76",
      "temperature": "98.2",
      "weight": "78",
      "spo2": "98"
    },
    "medications": [
      {
        "name": "Tab. Paracetamol 650mg",
        "composition": "Paracetamol 650mg",
        "dosage": "650mg",
        "frequency": "TDS",
        "duration": "5 days",
        "instructions": "After meals"
      },
      {
        "name": "Cap. Amoxicillin-Clavulanate 625mg",
        "dosage": "625mg",
        "frequency": "TDS",
        "duration": "7 days",
        "instructions": "Complete course"
      }
    ],
    "instructions": [
      "Wound dressing daily",
      "Soft diet for 3 days",
      "Avoid heavy lifting for 2 weeks"
    ],
    "followUpDate": "2025-12-28",
    "status": "issued"
  }' | jq '.'

