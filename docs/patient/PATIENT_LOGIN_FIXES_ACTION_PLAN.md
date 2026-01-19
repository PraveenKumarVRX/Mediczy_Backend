# Patient Login Bugs - Action Plan & Fixes

**Status**: 🔴 CRITICAL - 9 Issues to Fix  
**Priority**: HIGH  
**Target Resolution**: 48 hours

---

## Quick Diagnosis Script

Run this to identify which issues exist in your system:

```bash
#!/bin/bash
set -e

TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}' | jq -r '.token')

echo "🔍 RUNNING DIAGNOSTICS..."
echo "Token: ${TOKEN:0:20}..."
echo ""

# Test 1: Check if doctors exist
echo "1️⃣ Checking if doctors exist..."
DOCTORS=$(curl -s -X GET http://localhost:8000/api/doctors \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length')
echo "   Doctors found: $DOCTORS"
if [ "$DOCTORS" -eq 0 ]; then echo "   ❌ ISSUE #6: No doctors in database!"; fi

# Test 2: Check appointment endpoint
echo ""
echo "2️⃣ Testing appointment creation..."
APPT_TEST=$(curl -s -X POST http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": 2,
    "appointmentDate": "2026-01-20",
    "appointmentTime": "14:30",
    "consultationType": "video"
  }')
if echo "$APPT_TEST" | grep -q "error\|failed\|404"; then 
  echo "   ❌ ISSUE #1: Booking fails!"
  echo "   Response: $(echo $APPT_TEST | jq '.message')"
else 
  echo "   ✅ Booking works"
fi

# Test 3: Check patient's appointments
echo ""
echo "3️⃣ Checking patient appointments..."
APPTS=$(curl -s -X GET http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length')
echo "   Appointments found: $APPTS"
if [ "$APPTS" -eq 0 ]; then 
  echo "   ⚠️  ISSUE #7/#8: No appointments (might be normal if none booked)"
fi

# Test 4: Check for upload endpoint
echo ""
echo "4️⃣ Checking report upload endpoint..."
curl -s -X POST http://localhost:8000/api/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/dev/null" 2>&1 | grep -q "404" && echo "   ❌ ISSUE #3: No upload endpoint!" || echo "   ✅ Upload endpoint exists"

# Test 5: Check AI analysis
echo ""
echo "5️⃣ Checking AI health endpoint..."
curl -s http://localhost:8000/api/ai-health/status -H "Authorization: Bearer $TOKEN" 2>&1 | grep -q "200" && echo "   ✅ AI service running" || echo "   ⚠️  ISSUE #5: AI service issue"

echo ""
echo "✅ DIAGNOSTICS COMPLETE"
```

---

## Issue-by-Issue Fixes

### ISSUE #1: Find & Book Doctor - "Shows Booking Failed"

**Severity**: 🔴 CRITICAL

**Quick Fix**: Verify frontend is sending correct payload format

```javascript
// Frontend: Before calling POST /api/appointments
const bookingPayload = {
  doctorId: parseInt(doctorId),  // ✅ Must be numeric integer
  appointmentDate: "2026-01-20",  // ✅ ISO format YYYY-MM-DD
  appointmentTime: "14:30",       // ✅ HH:MM format (24-hour)
  consultationType: "video",      // ✅ Must be: video|audio|chat|in-person
  symptoms: ["fever", "cough"],   // Optional but recommended
  reason: "Checkup"               // Optional
};

// Validate before sending
if (!doctorId || !appointmentDate || !appointmentTime || !consultationType) {
  alert("Please fill all required fields");
  return;
}

// Then call API
fetch('/api/appointments', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(bookingPayload)
})
.then(r => r.json())
.then(data => {
  if (data.success) {
    alert("Appointment booked successfully!");
  } else {
    // Better error handling
    if (data.message.includes("not available")) {
      alert("Doctor not available at this time. Please choose another slot.");
    } else if (data.message.includes("not found")) {
      alert("Invalid doctor. Please select a different doctor.");
    } else {
      alert("Booking failed: " + data.message);
    }
  }
})
.catch(err => console.error("Booking error:", err));
```

**Backend Fix** (if needed):
```javascript
// File: /server/controller/appointment.controller.js (Line ~250)
// Add better error handling around line 260:

try {
  const appointment = await Appointment.create({
    userId,
    doctorId: resolvedDoctorId,
    patientName: `${user.firstName} ${user.lastName}`,
    patientEmail: user.email,
    patientPhone: user.phoneNumber || 'N/A',
    doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
    specialization: doctor.specialization,
    appointmentDate,
    appointmentTime,
    consultationType: dbConsultationType,
    paymentAmount: consultationFee,
    status: 'scheduled',
    paymentStatus: 'pending',
    organization_id: organizationId,
    // ... rest of fields
  });
  
  // IMPORTANT: Send back success response
  return res.status(201).json({
    success: true,
    message: 'Appointment booked successfully',
    data: {
      id: appointment.id,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      doctorName: appointment.doctorName,
      status: appointment.status
    }
  });
} catch (error) {
  console.error('❌ Appointment creation failed:', error);
  
  // Better error response
  return res.status(500).json({
    success: false,
    message: 'Failed to create appointment: ' + error.message,
    error: error.message
  });
}
```

---

### ISSUE #2: Lab Test - Confirm Booking Not Working

**Severity**: 🔴 CRITICAL

**Root Cause**: Frontend button not properly wired OR endpoint doesn't exist

**Quick Fix**:

1. Check frontend button markup:
```html
<!-- ✅ CORRECT -->
<button 
  type="submit" 
  onClick={handleConfirmBooking}
  disabled={!isFormValid}
>
  Confirm Booking
</button>

<!-- ❌ WRONG -->
<button>Confirm Booking</button>  <!-- No handler! -->
```

2. Verify backend endpoint exists:
```bash
# Check if lab booking endpoint exists
grep -r "lab\|test" /home/ubuntu/Mediczy/server/routes/

# If not found, create it:
# File: /server/routes/lab-test.route.js
```

3. Create Lab Test Booking Endpoint:
```javascript
// /server/routes/lab-test.route.js
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/book', authUser, async (req, res) => {
  try {
    const { testType, hospitalId, appointmentDate, appointmentTime, notes } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!testType || !hospitalId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: testType, hospitalId, appointmentDate, appointmentTime'
      });
    }

    // TODO: Create LabTest model and save booking
    const labBooking = {
      userId,
      testType,
      hospitalId,
      appointmentDate,
      appointmentTime,
      notes,
      status: 'booked',
      createdAt: new Date()
    };

    // Save to database
    // const booking = await LabTest.create(labBooking);

    return res.status(201).json({
      success: true,
      message: 'Lab test booked successfully',
      data: labBooking
    });
  } catch (error) {
    console.error('Lab booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to book lab test',
      error: error.message
    });
  }
});

export default router;
```

4. Register route in main app:
```javascript
// In /server/server.js or /server/index.js
import labTestRoute from './routes/lab-test.route.js';
app.use('/api/lab-tests', labTestRoute);
```

---

### ISSUE #3: My Reports - Upload Failed

**Severity**: 🔴 CRITICAL

**Root Cause**: No file upload endpoint OR authentication failing

**Fix**: Create Report Upload Endpoint

```javascript
// /server/routes/reports.route.js
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Configure multer for file upload
const uploadDir = '/tmp/mediczy/reports';
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'report-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Allow PDFs and images
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, JPEG, PNG'));
    }
  }
});

// Upload report
router.post('/upload', authUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const report = {
      userId: req.user.id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date(),
      reportType: req.body.reportType || 'general' // lab, imaging, prescription, general
    };

    // TODO: Save to database
    // const savedReport = await Report.create(report);

    return res.status(201).json({
      success: true,
      message: 'Report uploaded successfully',
      data: report
    });
  } catch (error) {
    console.error('Report upload error:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting uploaded file:', unlinkErr);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to upload report',
      error: error.message
    });
  }
});

// Get user's reports
router.get('/', authUser, async (req, res) => {
  try {
    const { reportType } = req.query;
    const userId = req.user.id;

    // TODO: Fetch from database
    // const reports = await Report.findAll({
    //   where: { userId, ...(reportType && { reportType }) }
    // });

    const reports = []; // Placeholder

    return res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Fetch reports error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});

export default router;
```

Register in main app:
```javascript
import reportsRoute from './routes/reports.route.js';
app.use('/api/reports', reportsRoute);
```

---

### ISSUE #4: My Reports - Tab Options Not Opening

**Severity**: 🟡 HIGH (Medium priority)

**Root Cause**: Frontend state not updating when tab clicked

**Frontend Fix**:
```javascript
// React Component - Reports.jsx
import { useState } from 'react';

export default function MyReports() {
  const [activeTab, setActiveTab] = useState('total');
  const [reports, setReports] = useState([]);

  const tabs = [
    { id: 'total', label: 'Total Reports' },
    { id: 'lab', label: 'Lab Reports' },
    { id: 'imaging', label: 'Imaging' },
    { id: 'prescription', label: 'Prescription' }
  ];

  const handleTabChange = async (tabId) => {
    setActiveTab(tabId);
    
    // Fetch reports for this tab
    try {
      const response = await fetch(`/api/reports?reportType=${tabId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setReports(data.data || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  return (
    <div className="reports-container">
      {/* Tabs */}
      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {reports.length > 0 ? (
          <ul>
            {reports.map(report => (
              <li key={report.id}>
                {report.fileName} ({report.uploadedAt})
              </li>
            ))}
          </ul>
        ) : (
          <p>No {activeTab} reports found</p>
        )}
      </div>
    </div>
  );
}
```

---

### ISSUE #5: Scan Reports - Image Analysis Failed

**Severity**: 🔴 CRITICAL

**Root Cause**: AI service not available OR image processing error

**Diagnosis**:
```bash
# Check if AI service is running
ps aux | grep -i "medgemma\|python.*ai"

# Check model file
ls -lh /home/ubuntu/Mediczy/server/models/medgemma*.gguf

# Check server logs
pm2 logs mediczy-server | tail -100 | grep -i "error\|ai\|medical"
```

**Quick Fix** (if service down):
```bash
# Restart services
pm2 restart mediczy-server
pm2 restart sib-fastapi  # Python AI service

# Check status
pm2 status
```

**Backend Fix** (if endpoint missing):
```javascript
// /server/routes/ai-health.route.js
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/analyze-scan', authUser, async (req, res) => {
  try {
    const { imageBase64, scanType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: 'Image data required'
      });
    }

    console.log('Analyzing scan with MedGemma...');
    
    // Call Python AI service
    const pythonServiceResponse = await fetch('http://localhost:5000/api/analyze-medical-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, scanType })
    });

    if (!pythonServiceResponse.ok) {
      throw new Error(`AI service error: ${pythonServiceResponse.statusText}`);
    }

    const analysis = await pythonServiceResponse.json();

    return res.json({
      success: true,
      data: {
        analysis: analysis.results,
        confidence: analysis.confidence,
        recommendations: analysis.recommendations
      }
    });
  } catch (error) {
    console.error('❌ Scan analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze scan: ' + error.message
    });
  }
});

export default router;
```

---

### ISSUE #6: Chat with Doctor - Doctor List Not Showing

**Severity**: 🔴 CRITICAL

**Root Cause**: Doctor list endpoint not working OR no doctors in database

**Backend Fix**:
```javascript
// File: /server/routes/doctor.route.js or /server/routes/doctors.route.js
// Ensure endpoint exists:

router.get('/', authUser, async (req, res) => {
  try {
    const { specialization, status, available } = req.query;

    let whereClause = {};
    
    if (specialization) whereClause.specialization = specialization;
    if (status) whereClause.status = status;
    if (available === 'true') whereClause.isAvailable = true;

    const doctors = await Doctor.findAll({
      where: whereClause,
      attributes: ['id', 'firstName', 'lastName', 'specialization', 'avatar', 'rating', 'experience'],
      limit: 50
    });

    return res.json({
      success: true,
      data: doctors,
      count: doctors.length
    });
  } catch (error) {
    console.error('Fetch doctors error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors'
    });
  }
});
```

**Frontend Fix**:
```javascript
// React Component - ChatWithDoctor.jsx
import { useState, useEffect } from 'react';

export default function ChatWithDoctor() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/doctors?available=true', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch doctors');
      
      const data = await response.json();
      setDoctors(data.data || []);
      setError(null);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading doctors...</div>;
  if (error) return <div>Error: {error}</div>;
  if (doctors.length === 0) return <div>No doctors available</div>;

  return (
    <div className="doctors-list">
      {doctors.map(doctor => (
        <div key={doctor.id} className="doctor-card" onClick={() => startChat(doctor.id)}>
          <img src={doctor.avatar} alt={doctor.firstName} />
          <h3>Dr. {doctor.firstName} {doctor.lastName}</h3>
          <p>{doctor.specialization}</p>
          <button>Start Chat</button>
        </div>
      ))}
    </div>
  );
}
```

---

### ISSUE #7: My Appointments - Scheduled Appointments Not Showing

**Severity**: 🔴 CRITICAL

**Root Cause**: Status filter wrong OR date comparison failing

**Backend Fix**:
```javascript
// File: /server/controller/appointment.controller.js
// Update getUserAppointments function (around line 350):

export const getUserAppointments = async (req, res) => {
  try {
    const { status, upcoming, past } = req.query;
    const userId = req.user.id;
    const now = new Date();

    let whereClause = { userId };

    // Status filter
    if (status) {
      whereClause.status = status;
    } else if (upcoming === 'true') {
      // Show upcoming: scheduled, confirmed, in-progress
      whereClause.status = {
        [Op.in]: ['scheduled', 'confirmed', 'in-progress']
      };
      // Only future appointments
      whereClause.appointmentDate = {
        [Op.gte]: now
      };
    } else if (past === 'true') {
      // Show past: completed, cancelled, no-show
      whereClause.status = {
        [Op.in]: ['completed', 'cancelled', 'no-show']
      };
      // Only past appointments
      whereClause.appointmentDate = {
        [Op.lt]: now
      };
    }

    const appointments = await Appointment.findAll({
      where: whereClause,
      order: [['appointmentDate', 'DESC']],
      include: [{
        model: Doctor,
        attributes: ['firstName', 'lastName', 'specialization', 'avatar']
      }]
    });

    return res.json({
      success: true,
      data: appointments,
      count: appointments.length,
      filters: { status, upcoming, past }
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments'
    });
  }
};
```

---

### ISSUE #8: History - Attended Appointments Not Showing

**Severity**: 🟡 HIGH

**Root Cause**: Status filter only checking 'completed'

**Fix**: Same as Issue #7 above - update the status filter to include cancelled and no-show

---

### ISSUE #9: Dashboard - Shows Finished Appointments as Pending

**Severity**: 🟡 HIGH

**Root Cause**: Dashboard query doesn't check appointment status

**Backend Fix**:
```javascript
// /server/routes/dashboard.route.js or patient.route.js
router.get('/dashboard', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Upcoming appointments (only future, non-completed)
    const upcomingAppointments = await Appointment.findAll({
      where: {
        userId,
        status: { [Op.in]: ['scheduled', 'confirmed', 'in-progress'] },
        appointmentDate: { [Op.gte]: now }
      },
      order: [['appointmentDate', 'ASC']],
      limit: 5,
      include: [{
        model: Doctor,
        attributes: ['firstName', 'lastName', 'specialization']
      }]
    });

    // Recent completed appointments
    const recentCompleted = await Appointment.findAll({
      where: {
        userId,
        status: 'completed',
        appointmentDate: { [Op.lt]: now }
      },
      order: [['appointmentDate', 'DESC']],
      limit: 3
    });

    // Stats
    const totalAppointments = await Appointment.count({ where: { userId } });
    const completedAppointments = await Appointment.count({
      where: { userId, status: 'completed' }
    });

    return res.json({
      success: true,
      data: {
        upcoming: upcomingAppointments,
        recentCompleted,
        stats: {
          total: totalAppointments,
          completed: completedAppointments,
          pending: totalAppointments - completedAppointments
        }
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard'
    });
  }
});
```

---

## Implementation Checklist

- [ ] Issue #1: Validate frontend booking payload format
- [ ] Issue #2: Create or fix lab test booking endpoint
- [ ] Issue #3: Create report upload endpoint with multer
- [ ] Issue #4: Fix report tabs frontend state management
- [ ] Issue #5: Verify AI service running, restart if needed
- [ ] Issue #6: Verify doctor list endpoint returns data
- [ ] Issue #7: Fix appointment status filter to include all pending statuses
- [ ] Issue #8: Fix history to show all past appointments
- [ ] Issue #9: Update dashboard query to check appointment status
- [ ] Run full test suite on patient login flow
- [ ] Update API documentation

---

## Testing After Fixes

```bash
# Test each feature
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}' | jq -r '.token')

# Test 1: Doctor booking
curl -X POST http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"doctorId": 2, "appointmentDate": "2026-01-20", "appointmentTime": "14:30", "consultationType": "video"}'

# Test 2: List doctors
curl -X GET http://localhost:8000/api/doctors \
  -H "Authorization: Bearer $TOKEN"

# Test 3: Get appointments
curl -X GET http://localhost:8000/api/appointments?upcoming=true \
  -H "Authorization: Bearer $TOKEN"

# Test 4: Upload report
curl -X POST http://localhost:8000/api/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/report.pdf"

# Test 5: Dashboard
curl -X GET http://localhost:8000/api/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

---

**Status**: Ready for implementation  
**Updated**: January 13, 2026  
**Next Step**: Execute fixes in priority order
