import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authUser } from '../middleware/auth.middleware.js';
import MedicalReport from '../models/medical-report.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/reports');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.doc', '.docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * @route   POST /api/reports/upload
 * @desc    Upload a medical report file
 * @access  Private (Authenticated user)
 * @body    {
 *   file: File object (multipart/form-data),
 *   reportType: string (optional - xray, bloodtest, scan, prescription, etc),
 *   reportDate: string (optional - ISO date),
 *   notes: string (optional - additional notes)
 * }
 * @returns {
 *   success: boolean,
 *   reportId: string,
 *   fileName: string,
 *   fileUrl: string,
 *   reportType: string,
 *   uploadedAt: Date,
 *   message: string
 * }
 */
router.post('/upload', authUser, async (req, res) => {
  try {
    // Check if file was uploaded - support both 'file' and 'report' field names
    const uploadedFile = req.files?.file || req.files?.report;
    
    if (!req.files || !uploadedFile) {
      const availableFields = req.files ? Object.keys(req.files).join(', ') : 'none';
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a file to upload.',
        hint: 'Expected field name: "file" or "report"',
        receivedFields: availableFields
      });
    }

    const { reportType = 'general', reportDate, notes } = req.body;

    // Validate file type
    const fileExtension = path.extname(uploadedFile.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(uploadedFile.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file MIME type. Allowed: PDF, JPG, PNG, GIF, WebP, DOC, DOCX`
      });
    }

    // Validate file size
    if (uploadedFile.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: `File size exceeds maximum limit of 10MB. Your file is ${(uploadedFile.size / 1024 / 1024).toFixed(2)}MB`
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const sanitizedOriginalName = uploadedFile.name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\s+/g, '_');
    const fileName = `${timestamp}_${randomString}_${sanitizedOriginalName}`;
    const filePath = path.join(uploadDir, fileName);

    // Save file to disk
    await uploadedFile.mv(filePath);
    console.log(`📄 File uploaded successfully: ${fileName}`);

    // Create database record for the report
    let medicalReport = null;
    try {
      medicalReport = await MedicalReport.create({
        userId: req.user.id,
        fileName: uploadedFile.name,
        filePath: `/uploads/reports/${fileName}`,
        fileType: fileExtension.substring(1),
        fileSize: uploadedFile.size,
        mimeType: uploadedFile.mimetype,
        reportType: reportType,
        reportDate: reportDate ? new Date(reportDate) : new Date(),
        notes: notes || null,
        uploadedAt: new Date(),
        status: 'uploaded',
        analysisStatus: 'pending'
      });
    } catch (dbErr) {
      console.warn('⚠️ Database record creation failed, but file saved:', dbErr.message);
      // Continue without database record - file is still saved
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Report uploaded successfully',
      reportId: medicalReport?.id || timestamp,
      fileName: uploadedFile.name,
      fileUrl: `/uploads/reports/${fileName}`,
      reportType: reportType,
      uploadedAt: new Date(),
      fileSize: `${(uploadedFile.size / 1024).toFixed(2)} KB`
    });

  } catch (error) {
    console.error('File upload error:', error);
    
    // Clean up partially uploaded file if exists
    if (req.files?.file && error.code !== 'LIMIT_FILE_SIZE') {
      try {
        const tempPath = path.join(uploadDir, req.files.file.name);
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupErr) {
        console.warn('Cleanup error:', cleanupErr.message);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload report',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/reports
 * @desc    Get all reports for authenticated user
 * @access  Private
 * @query   {
 *   reportType: string (optional - filter by type),
 *   page: number (optional - default 1),
 *   limit: number (optional - default 10)
 * }
 */
router.get('/', authUser, async (req, res) => {
  try {
    const { reportType, page = 1, limit = 10 } = req.query;

    let whereClause = { userId: req.user.id };
    if (reportType) {
      whereClause.reportType = reportType;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await MedicalReport.findAndCountAll({
      where: whereClause,
      order: [['uploadedAt', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    res.json({
      success: true,
      reports: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Fetch reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/reports/:reportId
 * @desc    Get a specific report
 * @access  Private
 */
router.get('/:reportId', authUser, async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await MedicalReport.findOne({
      where: {
        id: reportId,
        userId: req.user.id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Fetch report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/reports/:reportId
 * @desc    Delete a report
 * @access  Private
 */
router.delete('/:reportId', authUser, async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await MedicalReport.findOne({
      where: {
        id: reportId,
        userId: req.user.id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '../../', report.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ File deleted: ${report.fileName}`);
    }

    // Delete database record
    await report.destroy();

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete report',
      error: error.message
    });
  }
});

export default router;
