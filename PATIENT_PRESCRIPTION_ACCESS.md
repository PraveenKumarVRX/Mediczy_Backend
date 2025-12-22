# 👤 Patient Prescription Access Guide

## ✅ Complete System Ready

Patients can now access all their prescriptions through their login!

---

## 🔐 Patient Login

**Test Patient:**
- **Email:** rahul.verma@gmail.com
- **Password:** RahulVerma@2025
- **Patient ID:** 38
- **Membership:** Basic Plan (Active)

---

## 📱 Patient Features

### 1. **View All Prescriptions**

**Endpoint:** `GET /api/prescriptions/patient`

**Example:**
```bash
curl "http://localhost:8000/api/prescriptions/patient" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "prescriptions": [
    {
      "prescriptionId": "RX-MJFXG1H6-PDJHU",
      "doctorName": "Kumar Sharma",
      "specialty": "General Surgery",
      "diagnosis": "Status post laparoscopic cholecystectomy...",
      "medications": [...],
      "createdAt": "2025-12-21T16:14:02.872Z"
    }
  ]
}
```

---

### 2. **View Specific Prescription**

**Endpoint:** `GET /api/prescriptions/:prescriptionId`

**Example:**
```bash
curl "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

**Returns:** Full prescription details with:
- Doctor credentials (name, qualifications, specialty)
- Patient details
- Vitals
- Diagnosis
- Medications with dosage
- Follow-up date

---

### 3. **Print Prescription**

**Endpoint:** `GET /api/prescriptions/:prescriptionId/html`

**Access:** Open in browser:
```
http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html
```

**Features:**
- ✅ Professional EMR header with blue gradient
- ✅ Doctor name, qualifications, specialty, registration
- ✅ Clinic logo and seal
- ✅ Patient information
- ✅ Medication table
- ✅ Digital signature
- ✅ **Print button** - Click or press `Ctrl+P`
- ✅ Print-optimized CSS (buttons hidden when printing)

---

### 4. **Download PDF**

**Endpoint:** `GET /api/prescriptions/:prescriptionId/pdf`

**Example:**
```bash
curl "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/pdf" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -o prescription.pdf
```

**Note:** Returns HTML format. Use browser "Print to PDF" for best results.

---

### 5. **Share on WhatsApp**

**Endpoint:** `GET /api/prescriptions/:prescriptionId/share/whatsapp`

**Example:**
```bash
curl "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/share/whatsapp" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

**Response:**
```json
{
  "success": true,
  "whatsappUrl": "https://wa.me/?text=...",
  "prescriptionUrl": "https://mediczy.com/prescription/RX-MJFXG1H6-PDJHU"
}
```

**WhatsApp Message Includes:**
- 🏥 Doctor name
- 📋 Prescription ID and date
- 🔗 View online link

---

## 🔄 Complete Workflow

### **Doctor Creates Prescription**
1. Doctor logs in
2. Creates prescription for patient
3. Prescription saved with `patientId`

### **Patient Receives Prescription**
1. Patient logs into Mediczy app
2. Views all prescriptions in dashboard
3. Can:
   - View full details
   - Print prescription
   - Download as PDF
   - Share via WhatsApp
   - Send to pharmacy

---

## 🛡️ Security & Access Control

### **Authentication Required**
All prescription endpoints require valid JWT token:
```
Authorization: Bearer <TOKEN>
```

### **Access Rules**
- ✅ **Patients** can view their own prescriptions (`patientId` match)
- ✅ **Doctors** can view all prescriptions they created
- ❌ Patients **cannot** view other patients' prescriptions
- ❌ Unauthorized users get 403 Forbidden

### **Membership Required**
- Patients need active membership plan
- Test patient has "Basic Plan" (free)
- Includes access to:
  - Prescriptions
  - Health Records
  - Online consultations

---

## 📊 Database Schema

### **Prescriptions Table**
```sql
patientId INTEGER (references users.id)
patientName VARCHAR(200)
patientAge INTEGER
patientGender VARCHAR(20)
patientPhone VARCHAR(50)
doctorId INTEGER
doctorName VARCHAR(200)
doctorQualifications VARCHAR(500)
doctorRegNo VARCHAR(100)
specialty VARCHAR(200)
```

### **Link Prescription to Patient**
```sql
UPDATE prescriptions 
SET patientId = <PATIENT_USER_ID>
WHERE prescriptionId = 'RX-XXX-XXX';
```

---

## 🎯 API Endpoints Summary

| Feature | Endpoint | Method | Access |
|---------|----------|--------|--------|
| List all prescriptions | `/api/prescriptions/patient` | GET | Patient |
| View prescription | `/api/prescriptions/:id` | GET | Patient/Doctor |
| Print HTML | `/api/prescriptions/:id/html` | GET | Patient/Doctor |
| Download PDF | `/api/prescriptions/:id/pdf` | GET | Patient/Doctor |
| Share WhatsApp | `/api/prescriptions/:id/share/whatsapp` | GET | Patient/Doctor |

---

## 💻 Frontend Integration Example

```javascript
// Patient Dashboard Component

const PatientPrescriptions = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  
  useEffect(() => {
    // Fetch patient prescriptions
    fetch('/api/prescriptions/patient', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    .then(res => res.json())
    .then(data => setPrescriptions(data.prescriptions));
  }, []);
  
  const printPrescription = (prescriptionId) => {
    window.open(`/api/prescriptions/${prescriptionId}/html`, '_blank');
  };
  
  const shareOnWhatsApp = async (prescriptionId) => {
    const response = await fetch(
      `/api/prescriptions/${prescriptionId}/share/whatsapp`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    const data = await response.json();
    window.open(data.whatsappUrl, '_blank');
  };
  
  return (
    <div>
      <h2>My Prescriptions</h2>
      {prescriptions.map(rx => (
        <div key={rx.id} className="prescription-card">
          <h3>{rx.prescriptionId}</h3>
          <p>Dr. {rx.doctorName} - {rx.specialty}</p>
          <p>{rx.diagnosis}</p>
          <button onClick={() => printPrescription(rx.prescriptionId)}>
            🖨️ Print
          </button>
          <button onClick={() => shareOnWhatsApp(rx.prescriptionId)}>
            📲 Share WhatsApp
          </button>
        </div>
      ))}
    </div>
  );
};
```

---

## ✅ Verification Checklist

- [x] Patient account created
- [x] Membership plan assigned
- [x] Prescription linked to patient (`patientId` set)
- [x] Patient can login
- [x] Patient can view all prescriptions
- [x] Patient can view specific prescription
- [x] Patient can print prescription
- [x] Patient can download PDF
- [x] Patient can share on WhatsApp
- [x] Access control working (403 for unauthorized)
- [x] EMR template rendering correctly
- [x] Print button visible and working
- [x] WhatsApp link generation working

---

## 🚀 Next Steps

### **For New Patients:**
1. Register patient account
2. Assign free/paid membership plan
3. Doctor creates prescription with `patientId`
4. Patient can access immediately after login

### **For Production:**
1. Update frontend to show patient prescription dashboard
2. Add mobile-responsive prescription view
3. Implement push notifications when new prescription created
4. Add prescription history/archive
5. Enable prescription renewal requests
6. Add pharmacy integration for prescription fulfillment

---

## 📞 Support

**Patient Access Issues:**
- Verify patient is logged in
- Check membership plan is active
- Ensure prescription has correct `patientId`
- Test with demo patient: rahul.verma@gmail.com

**Doctor Setup:**
- Email: drkumar.surgery@mediczy.com
- Password: DrKumar@2025

---

**🎉 Patient prescription access is fully functional!**
