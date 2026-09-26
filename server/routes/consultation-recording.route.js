import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authDoctor, authUser } from '../middleware/auth.middleware.js';
import ConsultationRecording from '../models/consultationRecording.model.intelligent.js';
import Appointment from '../models/appointment.model.intelligent.js';
import { Appointment as AppointmentModel } from '../models/index.js';   // includes need the REAL Sequelize model, not the *.intelligent.js wrapper
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import FormData from 'form-data';
import llmProvider from '../services/ai-brain/llm-provider.js';
import multer from 'multer';
import { uploadToMinio } from '../services/minio-upload.service.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Admin access to recordings is TENANT-scoped: a platform admin (admin / super_admin) may see every hospital's recordings
// (optionally narrowed with ?organizationId=), any other admin role only their own hospital's. The listing used to accept
// `organizationId` and then ignore it, and the by-id routes never compared the recording's hospital to the caller's.
const PLATFORM_ADMIN_ROLES = new Set(['admin', 'super_admin']);
const adminTenantScope = (req) => {
  if (PLATFORM_ADMIN_ROLES.has(req.user?.role)) {
    const asked = Number(req.query?.organizationId);
    return { ok: true, tenantId: Number.isInteger(asked) && asked > 0 ? asked : null };
  }
  const own = Number(req.user?.organization_id || req.user?.tenant_id || req.user?.hospital_id || req.user?.hospitalId);
  if (Number.isInteger(own) && own > 0) return { ok: true, tenantId: own };
  return { ok: false };
};
const NO_TENANT = { success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'This account is not attached to a hospital.' };

// Multer storage for browser-recorded blobs (written to temp dir then streamed to MinIO)
const BLOB_TMP_DIR = '/tmp/consultation-recordings';
try { fs.mkdirSync(BLOB_TMP_DIR, { recursive: true }); } catch {}
const blobUpload = multer({
  dest: BLOB_TMP_DIR,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

const LIVEKIT_RECORDINGS_DIR = process.env.LIVEKIT_RECORDINGS_DIR || '/mnt/recordings';
const RECORDINGS_BASE_URL = process.env.RECORDINGS_BASE_URL || '/api/recordings';

/**
 * @route   POST /api/consultation-recordings/consent
 * @desc    Create a short-lived, server-signed patient consent receipt
 * @access  Private (Patient)
 */
router.post('/consent', authUser, [
  body('appointmentId').isInt().withMessage('Valid appointment ID required'),
  body('roomId').isString().trim().notEmpty().withMessage('Room ID required'),
  body('requestId').isString().trim().notEmpty().withMessage('Consent request ID required'),
  body('granted').isBoolean().withMessage('Consent choice required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid consent request', errors: errors.array() });
    }

    if (req.userRole === 'doctor' || req.user?.role === 'doctor') {
      return res.status(403).json({ success: false, message: 'Only the patient can answer a recording request' });
    }

    const { appointmentId, roomId, requestId, granted } = req.body;
    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (Number(appointment.userId) !== Number(req.user?.id)) {
      return res.status(403).json({ success: false, message: 'This appointment does not belong to you' });
    }

    if (!granted) {
      return res.json({ success: true, granted: false });
    }
    if (!JWT_CONFIG.SECRET) {
      return res.status(500).json({ success: false, message: 'Server consent signing is unavailable' });
    }

    const grantedAt = new Date().toISOString();
    const consentToken = jwt.sign({
      purpose: 'consultation_recording_consent',
      patientId: Number(req.user.id),
      appointmentId: Number(appointmentId),
      roomId,
      requestId,
      granted: true,
      grantedAt
    }, JWT_CONFIG.SECRET, { expiresIn: '5m' });

    return res.json({ success: true, granted: true, grantedAt, consentToken });
  } catch (error) {
    console.error('Recording consent error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record patient consent' });
  }
});

/**
 * @route   POST /api/consultation-recordings/start
 * @desc    Start recording a consultation session
 * @access  Private (Doctor)
 */
router.post('/start', authDoctor, [
  body('appointmentId').isInt().withMessage('Valid appointment ID required'),
  body('roomId').notEmpty().withMessage('Room ID required'),
  body('patientId').isInt().withMessage('Valid patient ID required'),
  body('consent.granted').custom(value => value === true).withMessage('Patient consent is required'),
  body('consent.requestId').isString().trim().notEmpty().withMessage('Consent request ID required'),
  body('consent.grantedAt').isISO8601().withMessage('Consent timestamp required'),
  body('consent.token').isString().notEmpty().withMessage('Signed patient consent receipt required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Valid patient consent and consultation details are required',
        errors: errors.array()
      });
    }

    const { appointmentId, roomId, patientId, consent } = req.body;
    const doctorId = req.doctor.id;

    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (Number(appointment.doctorId) !== Number(doctorId)) {
      return res.status(403).json({ success: false, message: 'This appointment is not assigned to you' });
    }
    if (Number(appointment.userId) !== Number(patientId)) {
      return res.status(400).json({ success: false, message: 'Patient does not match this appointment' });
    }

    let consentReceipt;
    try {
      consentReceipt = jwt.verify(consent.token, JWT_CONFIG.SECRET);
    } catch {
      return res.status(403).json({ success: false, message: 'Patient consent receipt is invalid or expired' });
    }
    const consentMatches = consentReceipt.purpose === 'consultation_recording_consent'
      && consentReceipt.granted === true
      && Number(consentReceipt.patientId) === Number(patientId)
      && Number(consentReceipt.appointmentId) === Number(appointmentId)
      && consentReceipt.roomId === roomId
      && consentReceipt.requestId === consent.requestId;
    if (!consentMatches) {
      return res.status(403).json({ success: false, message: 'Patient consent receipt does not match this consultation' });
    }

    // Check if recording already exists
    const existing = await ConsultationRecording.findOne({
      where: { appointmentId, status: 'recording' }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Recording already in progress for this consultation'
      });
    }

    // Create recording entry
    const recording = await ConsultationRecording.create({
      appointmentId,
      doctorId,
      patientId,
      roomId,
      status: 'recording',
      startedAt: new Date(),
      metadata: {
        patientConsent: {
          granted: true,
          requestId: consent.requestId,
          grantedAt: consentReceipt.grantedAt,
          participantIdentity: consent.participantIdentity || null,
          method: 'livekit_data_channel'
        }
      }
    });

    res.json({
      success: true,
      message: 'Recording started successfully',
      recording: {
        id: recording.id,
        appointmentId: recording.appointmentId,
        roomId: recording.roomId,
        status: recording.status,
        startedAt: recording.startedAt
      }
    });
  } catch (error) {
    console.error('Start recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start recording',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation-recordings/stop/:recordingId
 * @desc    Stop recording and process the file
 * @access  Private (Doctor)
 */
router.post('/stop/:recordingId', authDoctor, [
  param('recordingId').isInt().withMessage('Valid recording ID required')
], async (req, res) => {
  try {
    const { recordingId } = req.params;
    const recording = await ConsultationRecording.findByPk(recordingId);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    if (recording.doctorId !== req.doctor.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Update recording
    recording.status = 'processing';
    recording.endedAt = new Date();
    
    // Calculate duration
    if (recording.startedAt) {
      const duration = Math.floor((recording.endedAt - recording.startedAt) / 1000);
      recording.duration = duration;
    }

    await recording.save();

    // Skip server-side file processing when the browser will upload the blob itself
    if (req.query.browserUpload !== 'true') {
      processRecordingFile(recording).catch(err => {
        console.error('Error processing recording:', err);
      });
    }

    res.json({
      success: true,
      message: 'Recording stopped successfully',
      recording: {
        id: recording.id,
        status: recording.status,
        duration: recording.duration,
        endedAt: recording.endedAt
      }
    });
  } catch (error) {
    console.error('Stop recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop recording',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation-recordings/:id/upload-blob
 * @desc    Receive browser-recorded WebM blob → upload to MinIO → AI transcription
 * @access  Private (Doctor)
 */
router.post('/:id/upload-blob', authDoctor, blobUpload.single('recording'), async (req, res) => {
  try {
    const { id } = req.params;
    const recording = await ConsultationRecording.findByPk(id);

    if (!recording) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }
    if (recording.doctorId !== req.doctor.id) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No recording file uploaded' });
    }

    const localPath = req.file.path;
    const originalName = req.file.originalname || `consultation-${recording.roomId}-${Date.now()}.webm`;
    const mimeType = req.file.mimetype || 'audio/webm';
    const duration = req.body.duration ? parseInt(req.body.duration) : recording.duration;

    // Upload to MinIO (streams from disk — no full-RAM load)
    const { url: minioUrl, key: s3Key } = await uploadToMinio({
      filePath: localPath,
      originalName,
      mimeType,
      keyPrefix: `consultation-recordings/${recording.doctorId}`,
    });

    // Update DB with MinIO location and set status to processing
    recording.recordingUrl = minioUrl;
    recording.recordingFileName = path.basename(s3Key);
    recording.recordingPath = s3Key;
    recording.fileSize = req.file.size;
    recording.format = (path.extname(originalName).slice(1) || 'webm').replace('audio/', '');
    if (duration) recording.duration = duration;
    recording.status = 'processing';
    recording.metadata = {
      ...(recording.metadata || {}),
      browserRecorded: true,
      uploadedAt: new Date().toISOString(),
    };
    await recording.save();

    // Respond immediately — transcription runs asynchronously
    res.json({
      success: true,
      message: 'Uploaded to MinIO — AI transcription started',
      recording: { id: recording.id, status: 'processing', recordingUrl: minioUrl },
    });

    // Async: transcribe from local file, then clean up
    processUploadedRecording(recording, localPath).catch(err =>
      console.error('processUploadedRecording error:', err)
    );
  } catch (error) {
    console.error('upload-blob error:', error);
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    if (error.code === 'MALWARE_DETECTED') {
      return res.status(400).json({ success: false, code: 'MALWARE_DETECTED', message: 'File rejected: malware detected' });
    }
    res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
  }
});

/**
 * Transcribe a browser-recorded file that has already been uploaded to MinIO.
 * Runs async after the HTTP response is sent; deletes the local temp file when done.
 */
async function processUploadedRecording(recording, localFilePath) {
  try {
    console.log(`🎙️ Transcribing browser recording: ${recording.id}`);
    const transcriptionResult = await transcribeRecording(localFilePath);

    if (!transcriptionResult.success || !transcriptionResult.text?.trim()) {
      throw new Error(transcriptionResult.error || 'Transcription returned no text');
    }

    recording.transcription = transcriptionResult.text;

    console.log(`🤖 Generating AI summary for recording: ${recording.id}`);
    const analysisResult = await analyzeConsultationTranscript(transcriptionResult.text);
    if (analysisResult.success) {
      recording.aiSummary = analysisResult.summary;
      recording.aiPrescription = analysisResult.prescription;
    }
    recording.metadata = {
      ...(recording.metadata || {}),
      transcriptionProvider: transcriptionResult.provider,
      analysisModel: analysisResult.model || null,
      analysisError: analysisResult.success ? null : analysisResult.error,
      processingTime: Date.now() - new Date(recording.endedAt || Date.now()).getTime(),
    };

    recording.status = 'completed';
    await recording.save();
    console.log(`✅ Browser recording processed: ${recording.id}`);
  } catch (error) {
    console.error(`❌ processUploadedRecording error for ${recording.id}:`, error);
    recording.status = 'failed';
    recording.metadata = { ...(recording.metadata || {}), error: error.message };
    await recording.save();
  } finally {
    try { fs.unlinkSync(localFilePath); } catch {}
  }
}

/**
 * Process recording file - find, store metadata, generate transcription
 */
async function processRecordingFile(recording) {
  try {
    // Find recording file in LiveKit recordings directory
    const recordingsDir = LIVEKIT_RECORDINGS_DIR;
    
    if (!fs.existsSync(recordingsDir)) {
      throw new Error('Recordings directory not found');
    }

    // Look for recent files matching the room ID
    const files = fs.readdirSync(recordingsDir);
    const roomFiles = files.filter(f => f.includes(recording.roomId));

    if (roomFiles.length === 0) {
      throw new Error('Recording file not found');
    }

    // Get the most recent file
    const sortedFiles = roomFiles.sort((a, b) => {
      const statA = fs.statSync(path.join(recordingsDir, a));
      const statB = fs.statSync(path.join(recordingsDir, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

    const recordingFile = sortedFiles[0];
    const recordingPath = path.join(recordingsDir, recordingFile);
    const stats = fs.statSync(recordingPath);

    // Update recording with file info
    recording.recordingFileName = recordingFile;
    recording.recordingPath = recordingPath;
    recording.recordingUrl = `${RECORDINGS_BASE_URL}/${recordingFile}`;
    recording.fileSize = stats.size;
    recording.format = path.extname(recordingFile).slice(1);
    await recording.save();

    // Generate transcription using Whisper API
    console.log('🎙️ Starting AI transcription for recording:', recordingFile);
    const transcriptionResult = await transcribeRecording(recordingPath);
    
    if (transcriptionResult.success) {
      recording.transcription = transcriptionResult.text;
      
      // Generate AI summary and prescription from transcription
      console.log('🤖 Generating AI consultation summary...');
      const analysisResult = await analyzeConsultationTranscript(transcriptionResult.text);
      
      if (analysisResult.success) {
        recording.aiSummary = analysisResult.summary;
        recording.aiPrescription = analysisResult.prescription;
        recording.metadata = {
          ...recording.metadata,
          transcriptionProvider: transcriptionResult.provider,
          analysisModel: analysisResult.model,
          processingTime: Date.now() - recording.endedAt.getTime()
        };
      }
    }

    recording.status = 'completed';
    await recording.save();

    console.log(`✅ Recording processed successfully: ${recordingFile}`);
  } catch (error) {
    console.error('❌ Recording processing error:', error);
    recording.status = 'failed';
    recording.metadata = { ...recording.metadata, error: error.message };
    await recording.save();
  }
}

/**
 * Transcribe audio/video using Whisper API
 * Priority: Groq Whisper (faster) -> OpenAI Whisper
 */
async function transcribeRecording(filePath) {
  try {
    const fileSize = fs.statSync(filePath).size;
    const fileSizeMB = fileSize / (1024 * 1024);
    
    console.log(`📊 File size: ${fileSizeMB.toFixed(2)} MB`);
    
    // Check file size limit (25MB for most APIs)
    if (fileSizeMB > 25) {
      console.warn('⚠️ File too large for direct transcription, needs chunking');
      return {
        success: false,
        error: 'File too large for transcription (>25MB). Audio extraction needed.'
      };
    }

    const fileStream = fs.createReadStream(filePath);
    const result = await llmProvider.transcribe(fileStream, { language: null, responseFormat: 'verbose_json' });
    return result;
  } catch (error) {
    console.error('Transcription error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analyze consultation transcript using AI to extract medical information
 */
async function analyzeConsultationTranscript(transcriptText) {
  try {
    const systemPrompt = `You are a medical AI assistant analyzing a doctor-patient consultation transcript.
Extract the following information in a structured format:

1. Chief Complaints: Main symptoms/concerns presented by the patient
2. Medical History: Relevant past medical conditions mentioned
3. Diagnosis: Doctor's assessment and diagnosis
4. Prescribed Medications: List with dosage, frequency, and duration
5. Lab Tests Ordered: Any investigations recommended
6. Follow-up Instructions: Next steps and when to return
7. Red Flags: Any warning signs to watch for

Provide the response in JSON format with these exact keys:
{
  "chiefComplaints": [],
  "medicalHistory": [],
  "diagnosis": "",
  "medications": [{"name": "", "dosage": "", "frequency": "", "duration": "", "instructions": ""}],
  "labTests": [],
  "followUpInstructions": "",
  "followUpDate": null,
  "redFlags": [],
  "summary": "Brief 2-3 sentence summary of the consultation"
}`;

    const userPrompt = `Analyze this medical consultation transcript:\n\n${transcriptText}\n\nProvide structured medical information extraction.`;

    const result = await llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 2000,
      responseFormat: { type: 'json_object' }
    });

    const analysisResult = JSON.parse(result.content);
    return {
      success: true,
      summary: analysisResult.summary || 'Consultation analyzed successfully.',
      prescription: analysisResult,
      model: result.model
    };
  } catch (error) {
    console.error('Transcript analysis error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * @route   GET /api/consultation-recordings/appointment/:appointmentId
 * @desc    Get recordings for an appointment
 * @access  Private (Doctor)
 */
router.get('/appointment/:appointmentId', authDoctor, [
  param('appointmentId').isInt().withMessage('Valid appointment ID required')
], async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (Number(appointment.doctorId) !== Number(req.doctor.id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const recordings = await ConsultationRecording.findAll({
      where: { appointmentId, doctorId: req.doctor.id },
      order: [['createdAt', 'DESC']]
    });

    // Log access for each recording viewed
    for (const recording of recordings) {
      await recording.logAccess(
        req.doctor.id,
        'doctor',
        req.doctor.firstName + ' ' + req.doctor.lastName,
        'view',
        req.ip || req.connection?.remoteAddress
      );
    }

    res.json({
      success: true,
      recordings
    });
  } catch (error) {
    console.error('Get recordings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recordings',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation-recordings/doctor
 * @desc    Get all recordings for a doctor
 * @access  Private (Doctor)
 */
router.get('/doctor', authDoctor, [
  query('status').optional().isIn(['recording', 'processing', 'completed', 'failed']),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const doctorId = req.doctor.id;
    const { status, limit = 50 } = req.query;

    const where = { doctorId };
    if (status) {
      where.status = status;
    }

    const recordings = await ConsultationRecording.findAll({
      where,
      include: [
        {
          model: AppointmentModel,
          as: 'appointment',
          attributes: ['id', 'patientName', 'appointmentDate', 'appointmentTime']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      count: recordings.length,
      recordings
    });
  } catch (error) {
    console.error('Get doctor recordings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recordings',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/consultation-recordings/:id
 * @desc    Get a specific recording
 * @access  Private (Doctor)
 */
router.get('/:id', authDoctor, [
  param('id').isInt().withMessage('Valid recording ID required')
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const recording = await ConsultationRecording.findByPk(id, {
      include: [
        {
          model: AppointmentModel,
          as: 'appointment',
          attributes: ['id', 'patientName', 'appointmentDate', 'appointmentTime', 'symptoms', 'notes']
        }
      ]
    });

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    if (recording.doctorId !== req.doctor.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Log access for audit trail
    await recording.logAccess(
      req.doctor.id,
      'doctor',
      req.doctor.firstName + ' ' + req.doctor.lastName,
      'view',
      req.ip || req.connection?.remoteAddress
    );

    res.json({
      success: true,
      recording
    });
  } catch (error) {
    console.error('Get recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recording',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/consultation-recordings/:id
 * @desc    Delete a recording
 * @access  Private (Doctor)
 */
router.delete('/:id', authDoctor, [
  param('id').isInt().withMessage('Valid recording ID required')
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const recording = await ConsultationRecording.findByPk(id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    if (recording.doctorId !== req.doctor.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Log deletion action for audit trail
    await recording.logAccess(
      req.doctor.id,
      'doctor',
      req.doctor.firstName + ' ' + req.doctor.lastName,
      'delete',
      req.ip || req.connection?.remoteAddress
    );

    // Delete physical file if exists
    if (recording.recordingPath && fs.existsSync(recording.recordingPath)) {
      fs.unlinkSync(recording.recordingPath);
    }

    await recording.destroy();

    res.json({
      success: true,
      message: 'Recording deleted successfully'
    });
  } catch (error) {
    console.error('Delete recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete recording',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/consultation-recordings/:id/transcribe
 * @desc    Generate AI transcription and summary
 * @access  Private (Doctor)
 */
router.post('/:id/transcribe', authDoctor, [
  param('id').isInt().withMessage('Valid recording ID required')
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const recording = await ConsultationRecording.findByPk(id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    if (recording.doctorId !== req.doctor.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!recording.recordingPath || !fs.existsSync(recording.recordingPath)) {
      return res.status(404).json({
        success: false,
        message: 'Recording file not found'
      });
    }

    // Check if already transcribed
    if (recording.transcription && recording.transcription.length > 0) {
      return res.json({
        success: true,
        message: 'Recording already transcribed',
        recording: {
          id: recording.id,
          transcription: recording.transcription,
          aiSummary: recording.aiSummary,
          aiPrescription: recording.aiPrescription
        }
      });
    }

    // Generate transcription
    console.log('🎙️ Starting manual transcription for recording:', recording.id);
    const transcriptionResult = await transcribeRecording(recording.recordingPath);
    
    if (!transcriptionResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Transcription failed',
        error: transcriptionResult.error
      });
    }

    recording.transcription = transcriptionResult.text;
    
    // Generate AI analysis
    console.log('🤖 Generating AI consultation analysis...');
    const analysisResult = await analyzeConsultationTranscript(transcriptionResult.text);
    
    if (analysisResult.success) {
      recording.aiSummary = analysisResult.summary;
      recording.aiPrescription = analysisResult.prescription;
    }

    await recording.save();

    res.json({
      success: true,
      message: 'Transcription completed successfully',
      recording: {
        id: recording.id,
        transcription: recording.transcription,
        aiSummary: recording.aiSummary,
        aiPrescription: recording.aiPrescription,
        provider: transcriptionResult.provider
      }
    });
  } catch (error) {
    console.error('Transcribe recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transcribe recording',
      error: error.message
    });
  }
});

// ==================== ADMIN/CLINIC ADMIN ROUTES ====================

/**
 * @route   GET /api/consultation-recordings/admin/all
 * @desc    Get all recordings for clinic/hospital admin
 * @access  Private (Admin/Clinic Admin)
 */
router.get('/admin/all', authUser, [
  query('organizationId').optional().isInt(),
  query('doctorId').optional().isInt(),
  query('status').optional().isIn(['recording', 'processing', 'completed', 'failed']),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 500 })
], async (req, res) => {
  try {
    // Verify user is admin or clinic_admin
    const allowedRoles = ['admin', 'super_admin', 'clinic_admin', 'hospital_admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access only'
      });
    }

    const { doctorId, status, fromDate, toDate, limit = 100 } = req.query;
    const scope = adminTenantScope(req);
    if (!scope.ok) return res.status(403).json(NO_TENANT);

    const where = {};
    
    // Filter by doctor if specified
    if (doctorId) {
      where.doctorId = doctorId;
    }

    // Filter by status
    if (status) {
      where.status = status;
    }

    // Filter by date range
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt['>='] = new Date(fromDate);
      if (toDate) where.createdAt['<='] = new Date(toDate);
    }

    const recordings = await ConsultationRecording.findAll({
      where,
      include: [
        {
          model: AppointmentModel,
          as: 'appointment',
          attributes: ['id', 'patientName', 'appointmentDate', 'appointmentTime', 'organization_id'],
          // scoped: only recordings whose appointment belongs to the (requested / own) hospital
          ...(scope.tenantId ? { where: { organization_id: scope.tenantId }, required: true } : {})
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    // Log admin access for each recording viewed
    for (const recording of recordings) {
      await recording.logAccess(
        req.user.id,
        req.user.role,
        req.user.firstName + ' ' + req.user.lastName || 'Admin',
        'admin_view',
        req.ip || req.connection?.remoteAddress
      );
    }

    res.json({
      success: true,
      count: recordings.length,
      recordings
    });
  } catch (error) {
    console.error('Admin get recordings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recordings'
    });
  }
});

/**
 * @route   GET /api/consultation-recordings/admin/:id
 * @desc    Get specific recording (admin access)
 * @access  Private (Admin/Clinic Admin)
 */
router.get('/admin/:id', authUser, [
  param('id').isInt().withMessage('Valid recording ID required')
], async (req, res) => {
  try {
    // Verify user is admin or clinic_admin
    const allowedRoles = ['admin', 'super_admin', 'clinic_admin', 'hospital_admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access only'
      });
    }

    const { id } = req.params;
    const scope = adminTenantScope(req);
    if (!scope.ok) return res.status(403).json(NO_TENANT);

    const recording = await ConsultationRecording.findByPk(id, {
      include: [
        {
          model: AppointmentModel,
          as: 'appointment',
          attributes: ['id', 'patientName', 'appointmentDate', 'appointmentTime', 'symptoms', 'notes', 'organization_id']
        }
      ]
    });

    // A recording outside the caller's hospital is reported as not found (no existence leak).
    if (!recording || (scope.tenantId && Number(recording.appointment?.organization_id) !== scope.tenantId)) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    // Log admin access
    await recording.logAccess(
      req.user.id,
      req.user.role,
      req.user.firstName + ' ' + req.user.lastName || 'Admin',
      'admin_view',
      req.ip || req.connection?.remoteAddress
    );

    res.json({
      success: true,
      recording
    });
  } catch (error) {
    console.error('Admin get recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recording'
    });
  }
});

/**
 * @route   GET /api/consultation-recordings/admin/:id/access-log
 * @desc    Get access audit log for a specific recording
 * @access  Private (Admin/Clinic Admin)
 */
router.get('/admin/:id/access-log', authUser, [
  param('id').isInt().withMessage('Valid recording ID required')
], async (req, res) => {
  try {
    // Verify user is admin or clinic_admin
    const allowedRoles = ['admin', 'super_admin', 'clinic_admin', 'hospital_admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access only'
      });
    }

    const { id } = req.params;
    const scope = adminTenantScope(req);
    if (!scope.ok) return res.status(403).json(NO_TENANT);

    const recording = await ConsultationRecording.findByPk(id, {
      attributes: ['id', 'appointmentId', 'doctorId', 'patientId', 'accessLog', 'createdAt'],
      include: [{ model: AppointmentModel, as: 'appointment', attributes: ['id', 'organization_id'] }]
    });

    if (!recording || (scope.tenantId && Number(recording.appointment?.organization_id) !== scope.tenantId)) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    res.json({
      success: true,
      recordingId: recording.id,
      appointmentId: recording.appointmentId,
      accessLog: recording.accessLog || [],
      totalAccesses: (recording.accessLog || []).length
    });
  } catch (error) {
    console.error('Get access log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch access log'
    });
  }
});

export default router;
