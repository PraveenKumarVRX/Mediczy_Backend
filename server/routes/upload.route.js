import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authUser } from '../middleware/auth.middleware.js';
import MedicalReport from '../models/medical-report.model.js';
import {Report} from '../models/index.js';
import {getCorporateReportClient,corporateStoredFileUrl} from '../services/corporate-report-storage-client.js';
import { uploadEncryptedReport } from '../services/minio-upload.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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

    // Compress + encrypt + upload to MinIO
    const result = await uploadEncryptedReport({
      buffer: uploadedFile.data,
      originalName: uploadedFile.name,
      mimeType: uploadedFile.mimetype,
      keyPrefix: `uploads/reports/${req.user.id}`,
      ...(process.env.PACS_ARCHIVE_MINIO_ENDPOINT?{bucket:process.env.MEDICAL_REPORTS_MINIO_BUCKET||process.env.PACS_ARCHIVE_MINIO_BUCKET,client:getCorporateReportClient(),buildUrl:corporateStoredFileUrl}:{}),
    });
    console.log(`📄 File uploaded (encrypted) to MinIO: ${result.key} [${result.compressionMethod}, ${result.originalSize}→${result.size} bytes]`);

    // Persist into the same report collection used by list/download/ownership checks.
    const normalizedType=['lab','imaging','prescription','general'].includes(reportType)?reportType:/xray|radiology|scan/i.test(reportType)?'imaging':/blood|test/i.test(reportType)?'lab':'general';
    const medicalReport=await Report.create({
      userId:req.user.id,organization_id:req.user.organization_id||null,fileName:uploadedFile.name,
      filePath:result.key,fileUrl:result.url,fileSize:uploadedFile.size,mimeType:uploadedFile.mimetype,
      reportType:normalizedType,reportDate:reportDate?new Date(reportDate):new Date(),description:notes||null,
      uploadedAt:new Date(),status:'active',analysisStatus:'pending',
      metadata:{source:'legacy_report_upload',originalReportType:reportType,encryption:result.encryption,compressionMethod:result.compressionMethod,storedMimeType:result.storedMimeType,bucket:result.bucket,storageBackend:process.env.PACS_ARCHIVE_MINIO_ENDPOINT?'corporate_minio':undefined}
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Report uploaded successfully',
      reportId:medicalReport.id,
      downloadUrl:`/api/reports/download/${medicalReport.id}`,
      fileName: uploadedFile.name,
      fileUrl: result.url,
      reportType: reportType,
      uploadedAt: new Date(),
      fileSize: `${(uploadedFile.size / 1024).toFixed(2)} KB`,
      compression: {
        method: result.compressionMethod,
        originalSize: result.originalSize,
        storedSize: result.size,
        savings: `${(((result.originalSize - result.size) / result.originalSize) * 100).toFixed(1)}%`
      }
    });

  } catch (error) {
    console.error('File upload error:', error);

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

    if(error.code==='AV_SCAN_UNAVAILABLE')return res.status(503).json({success:false,code:error.code,message:error.message});
    res.status(error.$metadata?503:500).json({
      success: false,
      message: error.$metadata?'Report storage is temporarily unavailable. Please retry.':'Failed to upload report',
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
