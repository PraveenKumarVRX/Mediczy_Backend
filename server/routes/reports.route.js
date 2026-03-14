/**
 * Patient Medical Reports Routes
 * Handles report uploads, retrieval, and organization
 * Database-integrated version
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { fileURLToPath } from 'url';
import { Report } from '../models/index.js';
import { validationResult } from 'express-validator';
import { body } from 'express-validator';
import n8nService from '../services/n8n.service.js';
import { uploadEncryptedReport, downloadDecryptedReport } from '../services/minio-upload.service.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure multer for file upload — memory storage (file goes to MinIO)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Allow PDFs and images
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/webp',
      'image/gif',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  }
});

/**
 * POST /api/reports
 * Upload a new medical report
 */
router.post('/', authUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        error: 'File is required'
      });
    }

    const { reportType = 'general', description = '', testName = '', labName = '', reportDate = '' } = req.body;
    const userId = req.user.id;
    const organizationId = req.user.organization_id;

    // Validate report type
    const validTypes = ['lab', 'imaging', 'prescription', 'general'];
    if (!validTypes.includes(reportType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid report type: ${reportType}. Allowed: ${validTypes.join(', ')}`
      });
    }

    // Compress + encrypt + upload to MinIO
    const result = await uploadEncryptedReport({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      keyPrefix: `uploads/reports/${userId}`,
    });

    const savedReport = await Report.create({
      userId,
      organization_id: organizationId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      filePath: result.key,
      fileUrl: result.url,
      reportType,
      description: description || null,
      testName: testName || null,
      labName: labName || null,
      reportDate: reportDate || null,
      status: 'active',
      uploadedAt: new Date(),
      analysisStatus: 'pending',
      metadata: {
        encryption: result.encryption,
        compressionMethod: result.compressionMethod,
        storedMimeType: result.storedMimeType,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        encryptedSize: result.size,
        bucket: result.bucket,
      }
    });

    console.log('✅ Report uploaded and saved to database:', {
      id: savedReport.id,
      userId,
      fileName: req.file.originalname,
      size: req.file.size,
      type: reportType
    });

    // Notify via n8n (best-effort)
    try {
      await n8nService.healthReportReady({
        reportId: savedReport.id,
        patientId: userId,
        patientName: req.user?.name || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
        patientEmail: req.user?.email,
        patientPhone: req.user?.phoneNumber || req.user?.phone,
        reportUrl: savedReport.fileUrl,
        tests: {
          reportType,
          testName,
          labName
        },
        source: 'reports'
      });
    } catch (n8nError) {
      console.error('Failed to trigger n8n report workflow:', n8nError);
    }

    return res.status(201).json({
      success: true,
      message: 'Report uploaded successfully',
      data: savedReport
    });
  } catch (error) {
    console.error('❌ Report upload error:', error);

    // Return specific message for malware detection
    if (error.code === 'MALWARE_DETECTED') {
      return res.status(400).json({
        success: false,
        message: 'File rejected: malware detected in uploaded file'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to upload report',
      error: error.message
    });
  }
});

/**
 * GET /api/reports
 * List all reports for the authenticated user
 * Query params: type (lab|imaging|prescription|general), status (active|archived), skip, limit
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const organizationId = req.user.organization_id;
    const { type, status = 'active', skip = 0, limit = 20 } = req.query;

    // Build where clause
    const where = {
      userId,
      status: status || 'active'
    };

    // Add optional filters
    if (type && ['lab', 'imaging', 'prescription', 'general'].includes(type)) {
      where.reportType = type;
    }

    // Get reports from database
    const reports = await Report.findAll({
      where,
      order: [['uploadedAt', 'DESC']],
      offset: parseInt(skip),
      limit: parseInt(limit)
    });

    // Get total count
    const total = await Report.count({ where });

    return res.status(200).json({
      success: true,
      message: 'Reports retrieved successfully',
      data: reports,
      pagination: {
        total,
        skip: parseInt(skip),
        limit: parseInt(limit),
        hasMore: parseInt(skip) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('❌ Get reports error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve reports',
      error: error.message
    });
  }
});

/**
 * GET /api/reports/:id
 * Get a specific report by ID
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const report = await Report.findOne({
      where: {
        id,
        userId
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Report retrieved successfully',
      data: report
    });
  } catch (error) {
    console.error('❌ Get report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve report',
      error: error.message
    });
  }
});

/**
 * DELETE /api/reports/:id
 * Delete a report (archive or hard delete)
 */
router.delete('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { hardDelete = false } = req.query;

    const report = await Report.findOne({
      where: {
        id,
        userId
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    if (hardDelete === 'true') {
      // Hard delete - remove file and database record
      try {
        if (report.filePath && fs.existsSync(report.filePath)) {
          await fsPromises.unlink(report.filePath);
        }
      } catch (err) {
        console.error('Error deleting file:', err);
      }

      await report.destroy();
    } else {
      // Soft delete - archive the report
      await report.update({
        status: 'deleted',
        archivedAt: new Date()
      });
    }

    console.log('✅ Report deleted successfully:', { id, userId, hardDelete });

    return res.status(200).json({
      success: true,
      message: `Report ${hardDelete === 'true' ? 'permanently deleted' : 'archived'} successfully`
    });
  } catch (error) {
    console.error('❌ Delete report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete report',
      error: error.message
    });
  }
});

/**
 * GET /api/reports/download/:id
 * Download a report file — decrypts encrypted reports on the fly
 */
router.get('/download/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const report = await Report.findOne({
      where: { id, userId }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    const meta = report.metadata || {};

    // Encrypted report — decrypt and stream
    if (meta.encryption && meta.encryption.iv) {
      const { buffer, mimeType } = await downloadDecryptedReport({
        key: report.filePath,
        bucket: meta.bucket,
        iv: meta.encryption.iv,
        authTag: meta.encryption.authTag,
        compressionMethod: meta.compressionMethod,
        mimeType: meta.storedMimeType || report.mimeType,
      });

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${report.fileName}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    }

    // Unencrypted MinIO URL — redirect
    if (report.fileUrl && report.fileUrl.startsWith('http')) {
      return res.redirect(report.fileUrl);
    }

    // Legacy: serve from disk
    const uploadDir = path.join(__dirname, '../../uploads/reports');
    const filePath = path.join(uploadDir, path.basename(report.filePath));
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(uploadDir);

    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.download(resolvedPath, report.fileName);
  } catch (error) {
    console.error('❌ Download error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download report',
      error: error.message
    });
  }
});

export default router;
