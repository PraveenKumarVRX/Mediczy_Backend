# 🎥 Online Consultation Prescription System

## ✅ Implementation Complete

The prescription system has been extended to support **online/video consultations** with full EMR integration, PDF generation, and WhatsApp sharing.

---

## 🎯 Features

### ✅ Video Consultation Support
- **Appointment Types**: `video`, `audio`, `chat`, `in-person`
- **Consultation Tracking**: All prescriptions automatically linked to appointments
- **Consultation Type Labels**: PDFs show "Online Consultation" for remote consultations
- **Post-Consultation Workflow**: Doctor generates prescription after video call

### ✅ Prescription Generation
- **From Appointment**: Create prescription directly from consultation
- **Automatic Linking**: Prescription automatically linked to appointment
- **Appointment Completion**: Auto-marks appointment as "completed"
- **Doctor Credentials**: Full EMR details (name, qualifications, specialty, registration)

### ✅ PDF & Sharing
- **Professional PDF**: 120KB, 2-page EMR prescription
- **Consultation Type Display**: Shows "Online Consultation" or "Clinic Visit"
- **WhatsApp Sharing**: Includes consultation type in message
- **30-Day Access**: Share tokens valid for 30 days
- **Patient Access**: Available in patient EMR dashboard

---

## 📡 API Endpoints

### 1. Create Prescription from Appointment
**POST** `/api/prescriptions/from-appointment/:appointmentId`

Creates prescription after video/in-person consultation.

**Headers:**
```json
{
  "Authorization": "Bearer <DOCTOR_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "diagnosis": "Viral Fever with Myalgia",
  "chiefComplaints": ["Fever (102°F)", "Severe headache", "Body pain"],
  "vitals": {
    "temperature": "102°F",
    "bloodPressure": "120/80",
    "pulse": "88",
    "weight": "70kg"
  },
  "medications": [
    {
      "name": "Paracetamol",
      "dosage": "500mg",
      "frequency": "Three times daily",
      "duration": "5 days",
      "instructions": "Take after meals"
    }
  ],
  "labTests": [
    {
      "name": "Complete Blood Count (CBC)",
      "instructions": "Fasting not required"
    }
  ],
  "instructions": [
    "Take complete rest for 3-4 days",
    "Drink plenty of fluids"
  ],
  "followUpDate": "2025-12-28",
  "notes": "Patient consulted via video call"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Prescription created successfully for online consultation",
  "prescription": {
    "id": 6,
    "prescriptionId": "RX-MJFZZNY5-SYD16",
    "patientName": "Rahul Verma",
    "diagnosis": "Viral Fever with Myalgia",
    "medicationsCount": 2,
    "consultationType": "online",
    "status": "active",
    "createdAt": "2025-12-21T17:25:17.691Z",
    "pdfUrl": "https://mediqzy.com/api/prescriptions/RX-MJFZZNY5-SYD16/pdf",
    "shareUrl": "https://mediqzy.com/api/prescriptions/RX-MJFZZNY5-SYD16/share/whatsapp"
  }
}
```

### 2. Get Prescription by Appointment
**GET** `/api/prescriptions/appointment/:appointmentId`

Retrieves prescription for a specific appointment.

**Response:**
```json
{
  "success": true,
  "prescription": {
    "prescriptionId": "RX-MJFZZNY5-SYD16",
    "appointmentId": 32,
    "consultationType": "video",
    "diagnosis": "Viral Fever with Myalgia",
    "medications": [...],
    "createdAt": "2025-12-21T17:25:17.691Z"
  }
}
```

### 3. WhatsApp Share (with Consultation Type)
**GET** `/api/prescriptions/:id/share/whatsapp`

Generates WhatsApp share link with consultation type.

**Response:**
```json
{
  "success": true,
  "whatsappUrl": "https://wa.me/?text=...",
  "pdfUrl": "https://mediqzy.com/api/prescriptions/RX-MJFZZNY5-SYD16/pdf?token=...",
  "message": "🏥 *Prescription from Kumar Sharma*\n\nPatient: Rahul Verma\nDate: 21/12/2025\nConsultation Type: online\nPrescription ID: RX-MJFZZNY5-SYD16\n\n📥 Download: https://...",
  "consultationType": "online"
}
```

### 4. Send to Patient WhatsApp
**POST** `/api/prescriptions/:id/share/whatsapp/:phone`

Sends prescription directly to patient's WhatsApp number.

**Example:**
```bash
POST /api/prescriptions/RX-MJFZZNY5-SYD16/share/whatsapp/9876543210
```

---

## 🔄 Workflow

### Video Consultation Workflow

```
1. Patient Books Appointment
   └─> POST /api/appointments
       {
         "doctorId": 4,
         "appointmentDate": "2025-12-23",
         "appointmentTime": "14:00",
         "consultationType": "video",
         "symptoms": "Headache and fever",
         "reason": "Need consultation"
       }

2. Video Consultation Happens
   └─> Patient and Doctor join video room
   └─> Doctor examines patient remotely
   └─> Doctor makes diagnosis

3. Doctor Creates Prescription
   └─> POST /api/prescriptions/from-appointment/:appointmentId
       {
         "diagnosis": "Viral Fever",
         "medications": [...],
         "vitals": {...}
       }

4. System Actions (Automatic)
   └─> Links prescription to appointment
   └─> Marks appointment as "completed"
   └─> Generates prescription ID
   └─> Saves consultation type

5. Share with Patient
   └─> GET /api/prescriptions/:id/share/whatsapp
   └─> Patient receives WhatsApp message with PDF link
   └─> Patient can download PDF (no login required)

6. Patient EMR Access
   └─> Patient logs into mediqzy.com
   └─> Views "My Prescriptions"
   └─> Downloads/prints prescription
```

---

## 📋 Sample Data

### Test Accounts

**Doctor:**
- Email: `drkumar.surgery@mediczy.com`
- Password: `DrKumar@2025`
- Specialty: General Surgery

**Patient:**
- Email: `rahul.verma@gmail.com`
- Password: `RahulVerma@2025`

### Sample Prescription

- **ID**: RX-MJFZZNY5-SYD16
- **Type**: Online Consultation (Video)
- **Patient**: Rahul Verma, 45 yrs, Male
- **Diagnosis**: Viral Fever with Myalgia
- **Medications**: Paracetamol, Ibuprofen
- **Status**: Active
- **PDF**: 120KB, 2 pages

---

## 💻 Testing

### Quick Test Script

```bash
#!/bin/bash

# 1. Doctor login
DOCTOR_TOKEN=$(curl -s -X POST http://localhost:8000/api/doctors/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"drkumar.surgery@mediczy.com","password":"DrKumar@2025"}' \
  | jq -r '.token')

# 2. Patient login
PATIENT_TOKEN=$(curl -s -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul.verma@gmail.com","password":"RahulVerma@2025"}' \
  | jq -r '.token')

# 3. Book video appointment
APPT=$(curl -s -X POST http://localhost:8000/api/appointments \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -d '{
    "doctorId": 4,
    "appointmentDate": "2025-12-23",
    "appointmentTime": "14:00",
    "consultationType": "video",
    "symptoms": "Fever and headache",
    "reason": "Need consultation"
  }')

APPT_ID=$(echo "$APPT" | jq -r '.appointment.id')

# 4. Create prescription from appointment
RX=$(curl -s -X POST "http://localhost:8000/api/prescriptions/from-appointment/$APPT_ID" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -d '{
    "diagnosis": "Viral Fever",
    "medications": [
      {
        "name": "Paracetamol",
        "dosage": "500mg",
        "frequency": "Three times daily",
        "duration": "5 days"
      }
    ],
    "followUpDate": "2025-12-28"
  }')

RX_ID=$(echo "$RX" | jq -r '.prescription.prescriptionId')

# 5. Share via WhatsApp
SHARE=$(curl -s "http://localhost:8000/api/prescriptions/$RX_ID/share/whatsapp" \
  -H "Authorization: Bearer $DOCTOR_TOKEN")

echo "$SHARE" | jq
```

---

## 📦 What's Included in PDF

### EMR Header
- ✅ Professional blue gradient design
- ✅ Doctor credentials (name, qualifications, specialty)
- ✅ Registration number
- ✅ Clinic/Hospital details

### Consultation Badge
- ✅ **"Online Consultation"** label for video/audio/chat
- ✅ **"Clinic Visit"** label for in-person

### Patient Information
- ✅ Name, Age, Gender, Contact
- ✅ Vitals (BP, Pulse, Temperature, Weight)
- ✅ Chief Complaints

### Prescription Details
- ✅ Diagnosis
- ✅ Medications table (dosage, frequency, duration)
- ✅ Lab tests recommended
- ✅ Instructions
- ✅ Follow-up date

### Clinic Branding
- ✅ Circular clinic seal (130px)
- ✅ Digital signature section
- ✅ EMR certification badge
- ✅ Legal disclaimer

---

## 🔐 Security

### Access Control
- **Doctor**: Can create prescriptions for their appointments only
- **Patient**: Can view their own prescriptions
- **Share Tokens**: 30-day validity, patient-specific
- **No Login Required**: For share links (token-based authentication)

### Data Privacy
- Prescriptions linked to appointments (audit trail)
- Patient data encrypted in transit
- PDF files stored securely in `uploads/prescriptions/`

---

## 📊 Database Schema

### Prescriptions Table

```sql
appointmentId INTEGER            -- Links to appointment
consultationType ENUM            -- video, audio, chat, in-person
patientId INTEGER                -- Links to user
doctorId INTEGER                 -- Links to doctor
diagnosis TEXT                   -- Primary diagnosis
medications JSONB                -- Array of medication objects
vitals JSONB                     -- Temperature, BP, pulse, weight
followUpDate DATE                -- Next appointment date
clinicDetails JSONB              -- Includes consultationType
status VARCHAR                   -- draft, active, expired
createdAt TIMESTAMP              -- Prescription date
```

### Appointments Table

```sql
id INTEGER PRIMARY KEY
userId INTEGER                   -- Patient
doctorId INTEGER                 -- Doctor
consultationType ENUM            -- video, audio, chat, in-person
appointmentDate DATE
appointmentTime TIME
status ENUM                      -- scheduled, completed, cancelled
prescription VARCHAR             -- Links to prescription ID
```

---

## ✨ Benefits

### For Doctors
- ✅ Generate prescriptions after video consultations
- ✅ Same professional EMR template for all consultation types
- ✅ Automatic appointment-prescription linking
- ✅ Share directly to patient WhatsApp

### For Patients
- ✅ Receive prescription immediately after consultation
- ✅ Download PDF without login (via WhatsApp)
- ✅ Access all prescriptions in EMR dashboard
- ✅ Print-ready professional format

### For Clinic
- ✅ Complete audit trail (appointment → prescription)
- ✅ Consultation type tracking
- ✅ Digital record keeping
- ✅ Regulatory compliance (EMR standards)

---

## 🚀 Deployment

### Server Status
- **Server**: Running (PM2 restart #72)
- **Endpoints**: All active
- **PDF Generation**: html-pdf-node (120KB PDFs)
- **Storage**: uploads/prescriptions/

### Files Modified
1. `server/routes/prescription.route.js`
   - Added `/from-appointment/:appointmentId` endpoint
   - Updated WhatsApp messages to include consultation type
   - Fixed User model references

2. `server/models/postgres/prescription.model.postgres.js`
   - Already had appointmentId field
   - clinicDetails JSONB stores consultationType

3. `demo-consultation-prescription.sh`
   - Complete workflow demonstration script

---

## 📝 Next Steps

### Optional Enhancements
1. **Auto-share**: Send WhatsApp automatically after prescription generation
2. **Email**: Send prescription PDF via email as well
3. **Consultation Notes**: Add scribe/transcription notes to prescription
4. **Video Recording**: Link consultation recording to prescription
5. **Follow-up Booking**: Auto-create follow-up appointment from prescription

---

## 🎉 Success Metrics

- ✅ Video consultation prescriptions: Working
- ✅ PDF generation: 120KB professional EMR format
- ✅ WhatsApp sharing: Includes consultation type
- ✅ Patient access: Available in EMR dashboard
- ✅ Automatic linking: Appointment → Prescription
- ✅ File storage: uploads/prescriptions/ directory
- ✅ 30-day share tokens: No login required

---

## 📞 Support

For issues or questions:
- Check server logs: `pm2 logs mediczy-server`
- Test endpoints: Run `demo-consultation-prescription.sh`
- Verify PDFs: Check `uploads/prescriptions/` directory

---

**🎯 Ready for Production!**

The online consultation prescription system is fully functional and integrated with the existing EMR platform. Doctors can now generate professional prescriptions after video consultations, and patients receive them instantly via WhatsApp or their EMR dashboard.
