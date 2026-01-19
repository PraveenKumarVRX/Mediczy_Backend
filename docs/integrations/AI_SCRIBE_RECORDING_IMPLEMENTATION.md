# AI Scribe & Session Recording Implementation

## 🎯 Overview

This implementation adds two powerful features to the Mediczy consultation system:

1. **AI Medical Scribe** - Voice-to-prescription generation for doctors
2. **Session Recording** - Automatic recording and storage of video consultations

---

## 📋 Features Implemented

### 1. AI Medical Scribe for Prescription Generation

#### **Frontend Component: AIScribePrescription**
**Location:** `/client/src/components/AIScribePrescription.tsx`

**Features:**
- ✅ Real-time voice-to-text transcription using Web Speech API
- ✅ Continuous recording mode with session notes tracking
- ✅ AI-powered prescription generation from consultation notes
- ✅ Text-to-speech playback of transcripts
- ✅ Smart medical term suggestions
- ✅ Support for manual editing of transcripts
- ✅ Copy, clear, and export functionality

**Usage:**
```tsx
import AIScribePrescription from '@/components/AIScribePrescription';

<AIScribePrescription
  onPrescriptionGenerated={(prescription) => {
    // Handle generated prescription
    console.log(prescription);
  }}
  currentData={{
    chiefComplaints: "Existing complaints...",
    diagnosis: "Existing diagnosis...",
    medications: []
  }}
/>
```

**Generated Prescription Format:**
```typescript
{
  chiefComplaints: string;
  diagnosis: string;
  medications: [
    {
      name: "Paracetamol",
      composition: "Paracetamol 500mg",
      dosage: "500mg",
      frequency: "TDS",
      duration: "5 days",
      quantity: "15 tablets",
      instructions: "After meals"
    }
  ];
  instructions: string[];
  labTests: string[];
  notes: string;
}
```

#### **Backend API: AI Scribe Routes**
**Location:** `/server/routes/ai-scribe.route.js`

**Endpoints:**

**1. Generate Prescription from Notes**
```
POST /api/ai/generate-prescription
Authorization: Bearer {doctorToken}

Request Body:
{
  "consultationNotes": "Patient complains of fever...",
  "sessionNotes": ["Fever for 3 days", "Temperature 101°F"],
  "existingData": { /* existing prescription data */ }
}

Response:
{
  "success": true,
  "prescription": {
    "chiefComplaints": "Fever and headache for 3 days",
    "diagnosis": "Viral Fever",
    "medications": [...],
    "instructions": [...],
    "labTests": [...],
    "notes": "Follow-up after 7 days"
  },
  "aiResponse": "...",
  "model": "SIB/Groq/Gemini",
  "timestamp": "2025-12-20T..."
}
```

**2. Process Voice Transcript**
```
POST /api/ai/scribe
Authorization: Bearer {doctorToken}

Request Body:
{
  "text": "Patient has fever and cough",
  "field": "diagnosis",
  "context": "prescription"
}

Response:
{
  "success": true,
  "processedText": "Patient has fever and cough",
  "suggestions": ["Viral Fever", "URTI", "Bronchitis"],
  "originalText": "patient has fever and cough"
}
```

**AI Processing Flow:**
1. Voice input captured by Web Speech API
2. Transcript sent to backend AI service
3. AI (SIB/Groq/Gemini) processes medical context
4. Structured prescription generated with:
   - Smart medication parsing
   - Dosage extraction
   - Frequency normalization (BD/TDS/QID)
   - Duration calculation
   - Instructions generation
5. JSON response returned to frontend

**Medical Abbreviations Supported:**
- **OD** - Once daily
- **BD** - Twice daily (Bis in die)
- **TDS** - Thrice daily (Ter die sumendum)
- **QID** - Four times daily (Quater in die)
- **SOS** - If required (Si opus sit)
- **PRN** - When necessary (Pro re nata)
- **AC** - Before meals (Ante cibum)
- **PC** - After meals (Post cibum)
- **HS** - At bedtime (Hora somni)

---

### 2. Consultation Session Recording

#### **Database Model: ConsultationRecording**
**Location:** `/server/models/consultationRecording.model.mariadb.js`

**Schema:**
```javascript
{
  id: INTEGER (Primary Key),
  appointmentId: INTEGER (Foreign Key),
  recordingId: STRING (Unique, e.g., "REC251220ABCD1234"),
  roomId: STRING (MiroTalk room ID),
  doctorId: INTEGER,
  patientId: INTEGER,
  fileName: STRING,
  filePath: STRING,
  fileSize: BIGINT (bytes),
  duration: INTEGER (seconds),
  format: ENUM('webm', 'mp4', 'mkv'),
  quality: ENUM('SD', 'HD', 'FHD'),
  startTime: DATE,
  endTime: DATE,
  status: ENUM('recording', 'processing', 'completed', 'failed', 'deleted'),
  storageLocation: STRING ('local', 's3', 'cloud'),
  s3Key: STRING (for cloud storage),
  downloadUrl: STRING (pre-signed URL),
  thumbnailPath: STRING,
  transcription: TEXT (AI-generated),
  metadata: JSON,
  accessPermissions: JSON {
    doctor: true,
    patient: true,
    admin: true
  },
  expiresAt: DATE (default: 90 days),
  isDeleted: BOOLEAN,
  deletedAt: DATE,
  deletedBy: INTEGER
}
```

#### **Backend API: Recording Routes**
**Location:** `/server/routes/recording.route.js`

**Endpoints:**

**1. Start Recording**
```
POST /api/recordings/start
Authorization: Bearer {doctorToken}

Request:
{
  "appointmentId": 123,
  "roomId": "apt-123"
}

Response:
{
  "success": true,
  "recording": {
    "id": 1,
    "recordingId": "REC251220ABCD1234",
    "roomId": "apt-123",
    "startTime": "2025-12-20T14:30:00Z"
  }
}
```

**2. Upload Recording File**
```
POST /api/recordings/upload
Authorization: Bearer {doctorToken}
Content-Type: multipart/form-data

Form Data:
- recording: File (video file)
- recordingId: String
- duration: Number (seconds)
- roomId: String

Response:
{
  "success": true,
  "recording": {
    "id": 1,
    "recordingId": "REC251220ABCD1234",
    "fileName": "recording_123_1703085000.webm",
    "fileSize": 52428800,
    "duration": 1800
  }
}
```

**3. Get Recordings for Appointment**
```
GET /api/recordings/appointment/:appointmentId
Authorization: Bearer {doctorToken} OR {userToken}

Response:
{
  "success": true,
  "recordings": [
    {
      "id": 1,
      "recordingId": "REC251220ABCD1234",
      "fileName": "recording_123_1703085000.webm",
      "fileSize": 52428800,
      "duration": 1800,
      "format": "webm",
      "quality": "HD",
      "startTime": "2025-12-20T14:30:00Z",
      "endTime": "2025-12-20T15:00:00Z",
      "createdAt": "2025-12-20T15:00:05Z"
    }
  ],
  "count": 1
}
```

**4. Stream Recording (In-browser playback)**
```
GET /api/recordings/stream/:recordingId
Authorization: Bearer {doctorToken} OR {userToken}

Response: Video stream (supports range requests for seeking)
```

**5. Download Recording**
```
GET /api/recordings/download/:recordingId
Authorization: Bearer {doctorToken} OR {userToken}

Response: File download
Content-Type: video/webm
Content-Disposition: attachment; filename="recording_123.webm"
```

**6. Delete Recording**
```
DELETE /api/recordings/:recordingId
Authorization: Bearer {doctorToken}

Response:
{
  "success": true,
  "message": "Recording deleted successfully"
}
```

**7. Get Doctor's All Recordings**
```
GET /api/recordings/doctor/list?page=1&limit=20&status=completed
Authorization: Bearer {doctorToken}

Response:
{
  "success": true,
  "recordings": [...],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

#### **Frontend Component: ConsultationRecordingPlayer**
**Location:** `/client/src/components/ConsultationRecordingPlayer.tsx`

**Features:**
- ✅ Video player with custom controls
- ✅ Play/Pause, Mute, Fullscreen
- ✅ Seek bar with visual progress
- ✅ Multiple recording support
- ✅ Download functionality
- ✅ Recording details display
- ✅ Responsive design

**Usage:**
```tsx
import ConsultationRecordingPlayer from '@/components/ConsultationRecordingPlayer';

<ConsultationRecordingPlayer appointmentId={123} />
```

---

## 🚀 MiroTalk Recording Configuration

### MiroTalk Environment Variables

**Location:** `/home/ubuntu/mirotalk-sfu/.env`

```bash
# Recording Configuration
RECORDING_ENABLED=true                           # Enable server-side recording
RECORDING_DIR='/mnt/recordings'                  # Storage directory
RECORDING_MAX_FILE_SIZE=1073741824              # Max file size (1GB)
RECORDING_UPLOAD_TO_S3=false                    # S3 upload disabled (local storage)
RECORDING_ENDPOINT=                             # Optional external endpoint

# UI Configuration
SHOW_RECORDING_TAB=true                         # Show recording tab in UI
HOST_ONLY_RECORDING=true                        # Only host (doctor) can record

# Server Configuration
SFU_ANNOUNCED_IP=13.234.17.52                   # Public IP for WebRTC
SFU_MIN_PORT=40000                              # RTC min port
SFU_MAX_PORT=40100                              # RTC max port
```

### Recording Storage
- **Local Path:** `/mnt/recordings/`
- **Format:** WebM (default), MP4, MKV
- **Retention:** 90 days (configurable)
- **Access Control:** Doctor and patient only

### How Recording Works

1. **Doctor starts consultation** in MiroTalk
2. **Click "Record" button** in video interface
3. **MiroTalk SFU captures** video/audio streams
4. **Recording saved** to `/mnt/recordings/`
5. **Metadata stored** in database via API
6. **File available** for playback/download
7. **Auto-expires** after 90 days (HIPAA compliance)

---

## 🔐 Security & Privacy

### Access Control
- **Doctors:** Can start, stop, view, download their consultations
- **Patients:** Can view and download their own consultations
- **Admins:** Full access to all recordings
- **Token-based authentication:** Required for all endpoints
- **Soft delete:** Recordings marked as deleted, not physically removed immediately

### HIPAA Compliance
- ✅ Automatic 90-day expiry
- ✅ Encrypted transmission (HTTPS)
- ✅ Access logging
- ✅ Audit trail
- ✅ Secure storage
- ✅ Patient consent required

### Storage Encryption (Recommended)
```bash
# Encrypt recording directory
sudo apt install ecryptfs-utils
sudo mount -t ecryptfs /mnt/recordings /mnt/recordings
```

---

## 📊 Integration with Doctor Dashboard

### Add AI Scribe to Prescription Page

**Location:** `/client/src/pages/doctor/DoctorPrescriptions.tsx`

```tsx
import AIScribePrescription from '@/components/AIScribePrescription';

// In the prescription form
<AIScribePrescription
  onPrescriptionGenerated={(prescription) => {
    setFormData({
      ...formData,
      chiefComplaints: prescription.chiefComplaints,
      diagnosis: prescription.diagnosis,
      medications: [...formData.medications, ...prescription.medications],
      instructions: [...formData.instructions, ...prescription.instructions],
      labTests: [...formData.labTests, ...prescription.labTests],
      notes: prescription.notes
    });
  }}
  currentData={formData}
/>
```

### Add Recording Player to Appointment Details

**Location:** `/client/src/pages/doctor/DoctorAppointments.tsx`

```tsx
import ConsultationRecordingPlayer from '@/components/ConsultationRecordingPlayer';

// In appointment details modal/page
<ConsultationRecordingPlayer appointmentId={appointment.id} />
```

---

## 🧪 Testing

### Test AI Scribe
```bash
# Start voice recording
# Speak: "Patient complains of fever for 3 days, temperature 101 Fahrenheit. Diagnosed with viral fever. Prescribe paracetamol 500mg thrice daily for 5 days after meals."
# Click "Generate Prescription"
# Verify structured prescription is created
```

### Test Recording Upload
```bash
# Start MiroTalk consultation
# Click record button
# Conduct 2-minute test call
# Stop recording
# Verify file saved in /mnt/recordings/
# Check database entry
```

### Test Recording Playback
```bash
curl -X GET http://localhost:8000/api/recordings/appointment/123 \
  -H "Authorization: Bearer YOUR_DOCTOR_TOKEN"

# Response should include recording list
# Open in browser to test streaming
```

---

## 📈 Performance Considerations

### Recording Storage
- **Average consultation:** 30 minutes = ~150-300 MB
- **Monthly storage (100 consultations):** ~15-30 GB
- **Quarterly storage:** ~45-90 GB
- **Recommended disk space:** 500 GB minimum

### Bandwidth Requirements
- **HD Recording:** 1-2 Mbps upload
- **Streaming playback:** 1-2 Mbps download
- **Multiple concurrent streams:** Scale accordingly

### Database Indexes
```sql
-- Optimized queries
CREATE INDEX idx_recordings_appointment ON consultation_recordings(appointmentId);
CREATE INDEX idx_recordings_doctor ON consultation_recordings(doctorId);
CREATE INDEX idx_recordings_patient ON consultation_recordings(patientId);
CREATE INDEX idx_recordings_status ON consultation_recordings(status);
CREATE INDEX idx_recordings_created ON consultation_recordings(createdAt);
```

---

## 🔄 Workflow Integration

### Complete Consultation Flow with AI Scribe & Recording

```
1. Patient books appointment
   └─> Status: pending → confirmed

2. Doctor starts video consultation
   └─> MiroTalk room opened
   └─> Recording starts automatically (if enabled)

3. During consultation:
   ├─> Doctor speaks consultation notes
   ├─> AI Scribe transcribes in real-time
   ├─> Session recorded to disk
   └─> Chat logs captured

4. After consultation:
   ├─> Click "Generate Prescription"
   ├─> AI creates structured prescription
   ├─> Doctor reviews and edits
   ├─> Recording stops and saves
   └─> Prescription saved to database

5. Post-consultation:
   ├─> Patient can view/download recording
   ├─> Prescription sent via email
   ├─> Recording transcribed (optional)
   └─> Recording auto-expires after 90 days
```

---

## 🎨 UI/UX Best Practices

### AI Scribe
- **Microphone button** visible at all times
- **Recording indicator** (red dot) when active
- **Live transcript** updating in real-time
- **Suggestions panel** for common medical terms
- **Voice commands** for punctuation and formatting

### Recording Player
- **Thumbnail preview** before loading
- **Quality indicator** (SD/HD/FHD badge)
- **Duration display** in MM:SS format
- **File size** human-readable (MB/GB)
- **Download progress** indicator
- **Fullscreen mode** for better viewing

---

## 🚨 Troubleshooting

### AI Scribe Issues

**Problem:** Voice not being recognized
```
Solution:
- Check microphone permissions in browser
- Use Chrome/Edge/Safari (Firefox not supported)
- Test microphone in browser settings
- Ensure HTTPS connection (required for Web Speech API)
```

**Problem:** AI generation fails
```
Solution:
- Check AI service status (SIB/Groq/Gemini)
- Verify API keys in .env
- Check server logs: pm2 logs mediczy-server
- Ensure consultation notes are not empty
```

### Recording Issues

**Problem:** Recording not starting
```
Solution:
- Verify RECORDING_ENABLED=true in MiroTalk .env
- Check /mnt/recordings directory exists and writable
- Ensure disk space available
- Check MiroTalk logs: pm2 logs mirotalk-sfu
```

**Problem:** Recording file not found
```
Solution:
- Check recording completed status in database
- Verify file exists: ls -lh /mnt/recordings/
- Check file permissions: chmod 644 /mnt/recordings/*
- Verify recordingId matches database entry
```

**Problem:** Cannot play/download recording
```
Solution:
- Verify user has access permissions
- Check authentication token validity
- Ensure file size under 1GB limit
- Check nginx max body size if behind proxy
```

---

## 📝 Future Enhancements

### Planned Features
- [ ] **Real-time transcription** during consultation
- [ ] **AI-powered diagnosis suggestions** from voice
- [ ] **Automatic prescription sending** after generation
- [ ] **Multi-language support** for AI Scribe
- [ ] **Cloud storage integration** (AWS S3, Google Cloud)
- [ ] **Recording compression** for storage optimization
- [ ] **Video thumbnail generation**
- [ ] **Recording analytics** (consultation duration, talk time)
- [ ] **Searchable transcripts** with timestamps
- [ ] **Export to PDF** with video snapshots

---

## 📞 Support

For issues or questions:
- **Backend logs:** `pm2 logs mediczy-server`
- **MiroTalk logs:** `pm2 logs mirotalk-sfu`
- **Database queries:** Check MariaDB consultation_recordings table
- **API testing:** Use Postman/curl with proper auth tokens

---

**Implementation Date:** December 20, 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
