# 📱 Prescription Sharing Guide - Dr. Kumar

## ✅ Available Features

### 1. 🖨️ **Print Prescription**
Print directly from browser with professional EMR format.

**How to use:**
1. Open prescription in browser
2. Click "Print" button or press `Ctrl+P`
3. Select printer or "Save as PDF"
4. Print/Save

**API Endpoint:**
```bash
GET /api/prescriptions/{prescriptionId}/html
```

**Example:**
```bash
# Open in browser
http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/html
```

---

### 2. 📲 **Share on WhatsApp**

#### Option A: General Share Link
Share prescription with anyone via WhatsApp

**API Endpoint:**
```bash
GET /api/prescriptions/{prescriptionId}/share/whatsapp
```

**Example:**
```bash
curl "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/share/whatsapp" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "whatsappUrl": "https://wa.me/?text=...",
  "prescriptionUrl": "https://mediczy.com/prescription/RX-MJFXG1H6-PDJHU"
}
```

#### Option B: Send to Patient Phone
Send prescription directly to patient's WhatsApp

**API Endpoint:**
```bash
POST /api/prescriptions/{prescriptionId}/share/whatsapp/{phoneNumber}
```

**Example:**
```bash
curl -X POST \
  "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/share/whatsapp/9876512345" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "whatsappUrl": "https://wa.me/919876512345?text=...",
  "prescriptionUrl": "https://mediczy.com/prescription/RX-MJFXG1H6-PDJHU",
  "pdfUrl": "https://mediczy.com/api/prescriptions/RX-MJFXG1H6-PDJHU/pdf",
  "phoneNumber": "+919876512345"
}
```

**WhatsApp Message Includes:**
- 🏥 Doctor name and credentials
- 📋 Prescription ID and date
- 📥 PDF download link
- 📱 Online view link
- ☎️ Clinic contact information

---

### 3. 📄 **Download PDF**
Get prescription as PDF file (or printable HTML)

**API Endpoint:**
```bash
GET /api/prescriptions/{prescriptionId}/pdf
```

**Example:**
```bash
curl "http://localhost:8000/api/prescriptions/RX-MJFXG1H6-PDJHU/pdf" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o prescription.pdf
```

---

## 🎯 Quick Usage Examples

### From Frontend Application

```javascript
// 1. Print Prescription
const printPrescription = (prescriptionId) => {
  const url = `/api/prescriptions/${prescriptionId}/html`;
  window.open(url, '_blank');
};

// 2. Share on WhatsApp (General)
const shareOnWhatsApp = async (prescriptionId) => {
  const response = await fetch(
    `/api/prescriptions/${prescriptionId}/share/whatsapp`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  const data = await response.json();
  window.open(data.whatsappUrl, '_blank');
};

// 3. Send to Patient WhatsApp
const sendToPatient = async (prescriptionId, phoneNumber) => {
  const response = await fetch(
    `/api/prescriptions/${prescriptionId}/share/whatsapp/${phoneNumber}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  const data = await response.json();
  window.open(data.whatsappUrl, '_blank');
};

// 4. Download PDF
const downloadPDF = (prescriptionId) => {
  const url = `/api/prescriptions/${prescriptionId}/pdf`;
  const link = document.createElement('a');
  link.href = url;
  link.download = `prescription-${prescriptionId}.pdf`;
  link.click();
};
```

---

## 📋 Sample Prescription

**Prescription ID:** RX-MJFXG1H6-PDJHU  
**Patient:** Rahul Verma, 45 years, Male  
**Doctor:** Dr. Kumar Sharma, MS (General Surgery), MBBS  
**Specialty:** General Surgery  
**Date:** 21/12/2025

### Medications:
1. Tab. Paracetamol 650mg - TDS for 5 days
2. Cap. Amoxicillin-Clavulanate 625mg - TDS for 7 days

### Instructions:
- Wound dressing daily
- Soft diet for 3 days
- Avoid heavy lifting for 2 weeks

---

## 🔐 Authentication Required

All endpoints require JWT token in Authorization header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get token via:
```bash
POST /api/doctors/login
{
  "email": "drkumar.surgery@mediczy.com",
  "password": "DrKumar@2025"
}
```

---

## ✨ Features Included in Prescription

- ✅ Professional EMR header with blue gradient
- ✅ Doctor name, qualifications, specialty, registration number
- ✅ Clinic logo, name, address, contact details
- ✅ Patient details (name, age, gender, phone)
- ✅ Vitals (BP, pulse, temperature, weight)
- ✅ Chief complaints and diagnosis
- ✅ Medication table with dosage, frequency, duration
- ✅ Lab tests (if prescribed)
- ✅ Instructions and advice
- ✅ Digital signature section
- ✅ Official clinic seal (circular design)
- ✅ EMR certification badge
- ✅ Legal validity disclaimer
- ✅ Prescription watermark

---

## 📞 Support

For any issues with prescription sharing:
- Check authentication token is valid
- Verify prescription ID exists
- Ensure patient phone number format: 10 digits (no +91)
- Browser print works even if PDF generation fails

---

**Happy Prescribing! 🎉**
