import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { authDoctor, authUser } from '../middleware/auth.middleware.js';
import ConsultationRecording from '../models/consultationRecording.model.intelligent.js';
import Appointment from '../models/appointment.model.intelligent.js';
import { Op } from 'sequelize';
import { uploadToMinio } from '../services/minio-upload.service.js';

const router = express.Router();

// Configure multer for recording uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = '/tmp/recordings';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `recording_${Date.now()}_${Math.random().toString(36).substring(2, 10)}.webm`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/webm', 'video/mp4', 'video/x-matroska'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only WebM, MP4, and MKV are allowed.'));
    }
  }
});

/**
 * @route   POST /api/recordings/start
 * @desc    Start a new consultation recording
 * @access  Private (Doctor)
 */
router.post('/start', authDoctor, async (req, res) => {
  try {
    const { appointmentId, roomId } = req.body;

    if (!appointmentId || !roomId) {
      return res.status(400).json({
        success: false,
        message: 'appointmentId and roomId are required'
      });
    }

    // Verify appointment exists and doctor has access
    const appointment = await Appointment.findOne({
      where: {
        id: appointmentId,
        doctorId: req.doctor.id
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or unauthorized'
      });
    }

    // Check if recording already exists for this appointment
    const existingRecording = await ConsultationRecording.findOne({
      where: {
        appointmentId,
        status: { [Op.in]: ['recording', 'processing', 'completed'] }
      }
    });

    if (existingRecording) {
      return res.status(400).json({
        success: false,
        message: 'Recording already exists for this appointment',
        recording: existingRecording
      });
    }

    // Create recording record
    const recording = await ConsultationRecording.create({
      appointmentId,
      roomId,
      doctorId: req.doctor.id,
      patientId: appointment.userId,
      fileName: `recording_${appointmentId}_${Date.now()}.webm`,
      filePath: '', // Will be updated when file is uploaded
      startTime: new Date(),
      status: 'recording',
      metadata: {
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        consultationType: appointment.consultationType,
        startedBy: req.doctor.id
      }
    });

    res.json({
      success: true,
      message: 'Recording started',
      recording: {
        id: recording.id,
        recordingId: recording.recordingId,
        roomId: recording.roomId,
        startTime: recording.startTime
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
 * @route   POST /api/recordings/upload
 * @desc    Upload completed recording file
 * @access  Private (Doctor)
 */
router.post('/upload', authDoctor, upload.single('recording'), async (req, res) => {
  try {
    const { recordingId, duration, roomId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No recording file uploaded'
      });
    }

    // Find recording record
    const recording = await ConsultationRecording.findOne({
      where: {
        recordingId: recordingId || roomId,
        doctorId: req.doctor.id
      }
    });

    if (!recording) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Recording record not found'
      });
    }

    // Upload to MinIO with AV scan (streams from disk — handles large files)
    const { url: minioUrl, key: s3Key } = await uploadToMinio({
      filePath: req.file.path,
      originalName: req.file.filename,
      mimeType: req.file.mimetype || 'video/webm',
      keyPrefix: `recordings/${recording.doctorId}`,
    });

    // Delete local temp file after successful MinIO upload
    await fs.unlink(req.file.path).catch(() => {});

    // Update recording with MinIO file info
    await recording.update({
      fileName: req.file.filename,
      filePath: s3Key,
      fileUrl: minioUrl,
      fileSize: req.file.size,
      duration: duration ? parseInt(duration) : null,
      endTime: new Date(),
      status: 'completed',
      format: path.extname(req.file.filename).slice(1)
    });

    res.json({
      success: true,
      message: 'Recording uploaded successfully',
      recording: {
        id: recording.id,
        recordingId: recording.recordingId,
        fileName: recording.fileName,
        fileSize: recording.fileSize,
        duration: recording.duration
      }
    });

  } catch (error) {
    console.error('Upload recording error:', error);
    
    // Clean up file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    if (error.code === 'MALWARE_DETECTED') {
      const detail = error.avResult?.detail || '';
      const threat = detail.replace(/^.*:\s*/, '').replace(/\s*FOUND\s*$/, '').trim() || 'Unknown threat';
      return res.status(400).json({
        success: false,
        code: 'MALWARE_DETECTED',
        message: 'File rejected: malware detected in uploaded file',
        threat
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload recording',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/recordings/appointment/:appointmentId
 * @desc    Get recordings for an appointment
 * @access  Private (Doctor/Patient)
 */
router.get('/appointment/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user?.id || req.doctor?.id;
    const userType = req.user ? 'patient' : 'doctor';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Verify access to appointment
    const appointment = await Appointment.findOne({
      where: {
        id: appointmentId,
        [Op.or]: [
          { userId: userType === 'patient' ? userId : undefined },
          { doctorId: userType === 'doctor' ? userId : undefined }
        ]
      }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or unauthorized'
      });
    }

    // Get recordings
    const recordings = await ConsultationRecording.findAll({
      where: {
        appointmentId,
        isDeleted: false,
        status: 'completed'
      },
      attributes: [
        'id',
        'recordingId',
        'fileName',
        'fileSize',
        'duration',
        'format',
        'quality',
        'startTime',
        'endTime',
        'thumbnailPath',
        'createdAt'
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      recordings,
      count: recordings.length
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
 * @route   GET /api/recordings/download/:recordingId
 * @desc    Download a consultation recording
 * @access  Private (Doctor/Patient)
 */
router.get('/download/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    const userId = req.user?.id || req.doctor?.id;
    const userType = req.user ? 'patient' : 'doctor';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find recording
    const recording = await ConsultationRecording.findOne({
      where: {
        recordingId,
        isDeleted: false,
        status: 'completed'
      }
    });

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    // Verify access permissions
    const hasAccess = userType === 'doctor' 
      ? recording.doctorId === userId 
      : recording.patientId === userId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this recording'
      });
    }

    // Log download for audit trail
    const userName = userType === 'doctor' 
      ? (req.doctor.firstName + ' ' + req.doctor.lastName)
      : (req.user.firstName + ' ' + req.user.lastName || 'Patient');
    
    await recording.logAccess(
      userId,
      userType,
      userName,
      'download',
      req.ip || req.connection?.remoteAddress
    );

    // Check if file is on MinIO (URL starts with http)
    if (recording.fileUrl && recording.fileUrl.startsWith('http')) {
      return res.redirect(recording.fileUrl);
    }

    // Legacy: Check if file exists on local disk
    try {
      await fs.access(recording.filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Recording file not found on server'
      });
    }

    // Set headers for download
    res.setHeader('Content-Type', `video/${recording.format}`);
    res.setHeader('Content-Disposition', `attachment; filename="${recording.fileName}"`);
    res.setHeader('Content-Length', recording.fileSize);

    // Stream file
    const fileStream = (await import('fs')).createReadStream(recording.filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download recording',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/recordings/stream/:recordingId
 * @desc    Stream a consultation recording (for in-browser playback)
 * @access  Private (Doctor/Patient)
 */
router.get('/stream/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    const userId = req.user?.id || req.doctor?.id;
    const userType = req.user ? 'patient' : 'doctor';

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find recording
    const recording = await ConsultationRecording.findOne({
      where: {
        recordingId,
        isDeleted: false,
        status: 'completed'
      }
    });

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    // Verify access
    const hasAccess = userType === 'doctor' 
      ? recording.doctorId === userId 
      : recording.patientId === userId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // If file is on MinIO, redirect for streaming
    if (recording.fileUrl && recording.fileUrl.startsWith('http')) {
      return res.redirect(recording.fileUrl);
    }

    // Legacy: local disk streaming
    // Get file stats
    const stat = await fs.stat(recording.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      const file = (await import('fs')).createReadStream(recording.filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': `video/${recording.format}`,
      });

      file.pipe(res);
    } else {
      // Send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': `video/${recording.format}`,
      });

      const file = (await import('fs')).createReadStream(recording.filePath);
      file.pipe(res);
    }

  } catch (error) {
    console.error('Stream recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stream recording',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/recordings/:recordingId
 * @desc    Delete a consultation recording
 * @access  Private (Doctor/Admin)
 */
router.delete('/:recordingId', authDoctor, async (req, res) => {
  try {
    const { recordingId } = req.params;

    const recording = await ConsultationRecording.findOne({
      where: {
        recordingId,
        doctorId: req.doctor.id
      }
    });

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    // Soft delete
    await recording.update({
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.doctor.id
    });

    // Optionally delete physical file
    // await fs.unlink(recording.filePath).catch(console.error);

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
 * @route   GET /api/recordings/doctor/list
 * @desc    Get all recordings for a doctor
 * @access  Private (Doctor)
 */
router.get('/doctor/list', authDoctor, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;

    const where = {
      doctorId: req.doctor.id,
      isDeleted: false
    };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const offset = (page - 1) * limit;

    const { count, rows: recordings } = await ConsultationRecording.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'recordingId',
        'appointmentId',
        'fileName',
        'fileSize',
        'duration',
        'format',
        'startTime',
        'endTime',
        'status',
        'createdAt'
      ]
    });

    res.json({
      success: true,
      recordings,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
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

export default router;
