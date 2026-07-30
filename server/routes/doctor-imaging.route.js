/**
 * Doctor Medical Imaging Routes
 * Handles upload and retrieval of CT, MRI, USG, Echo, Cathlab, X-Ray images/videos
 *
 * POST   /api/doctors/imaging/upload          — upload imaging file
 * GET    /api/doctors/imaging                 — list imaging (filters: studyType, patientId, patientName, from, to)
 * GET    /api/doctors/imaging/file/:id        — serve file
 * DELETE /api/doctors/imaging/:id             — delete record + file
 */
import express from 'express';
import multer  from 'multer';
import path    from 'path';
import { authUser as authDoctor } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';
import { s3Storage, s3PresignedUrl, s3Client, BUCKET } from '../utils/s3-storage.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

const ALLOWED_MIME = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'image/tiff', 'image/dicom',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
  'application/pdf',
  'application/octet-stream', // raw DICOM
];
const ALLOWED_EXT = ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.dcm',
                     '.mp4','.webm','.ogv','.mov','.avi','.pdf'];

const upload = multer({
  storage: s3Storage('imaging', {
    resolveTenant: (req) =>
      req.user?.hospitalId
      || req.user?.hospital_id
      || req.user?.tenantId
      || req.user?.tenant_id
      || req.user?.doctorId
      || req.user?.id,
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB (DICOM / video)
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME.includes(file.mimetype) || ALLOWED_EXT.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error('Unsupported file type'));
  },
});

const router = express.Router();

// ── POST /upload ─────────────────────────────────────────────────────────────
router.post('/upload', authDoctor, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const doctorId = req.user?.doctorId || req.user?.id;
    if (!doctorId) return res.status(401).json({ success: false, message: 'Doctor not authenticated' });

    const {
      patientId   = null,
      patientName = 'Unknown Patient',
      studyType   = 'Other',
      studyDate   = new Date().toISOString().slice(0, 10),
      title       = '',
      notes       = '',
    } = req.body;

    const validTypes = ['CT','MRI','USG','Echo','Cathlab','X-Ray','Other'];
    const type = validTypes.includes(studyType) ? studyType : 'Other';

    const { rows } = await pool.query(
      `INSERT INTO patient_imaging
         (doctor_id, patient_id, patient_name, study_type, study_date, title, notes,
          file_name, original_name, file_path, file_size, mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, created_at`,
      [
        doctorId,
        patientId || null,
        patientName,
        type,
        studyDate,
        title || req.file.originalname,
        notes,
        req.file.key,           // S3 object key stored as file_name
        req.file.originalname,
        req.file.key,           // S3 key stored in file_path column
        req.file.size,
        req.file.mimetype,
      ]
    );

    res.json({
      success:  true,
      id:       rows[0].id,
      fileUrl:  `/api/doctors/imaging/file/${rows[0].id}`,
      fileName: req.file.originalname,
      message:  'Imaging study uploaded successfully',
    });
  } catch (err) {
    console.error('imaging upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET / (list) ──────────────────────────────────────────────────────────────
router.get('/', authDoctor, async (req, res) => {
  try {
    const doctorId = req.user?.doctorId || req.user?.id;
    if (!doctorId) return res.status(401).json({ success: false, message: 'Doctor not authenticated' });

    const { studyType, patientId, patientName, from, to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['doctor_id = $1'];
    const params     = [doctorId];
    let   idx        = 2;

    if (studyType && studyType !== 'All') { conditions.push(`study_type = $${idx++}`); params.push(studyType); }
    if (patientId)   { conditions.push(`patient_id = $${idx++}`);                       params.push(patientId); }
    if (patientName) { conditions.push(`patient_name ILIKE $${idx++}`);                 params.push(`%${patientName}%`); }
    if (from)        { conditions.push(`study_date >= $${idx++}`);                       params.push(from); }
    if (to)          { conditions.push(`study_date <= $${idx++}`);                       params.push(to); }

    const where = conditions.join(' AND ');

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT id, patient_id, patient_name, study_type, study_date, title, notes,
                file_name, original_name, file_size, mime_type, created_at
         FROM patient_imaging WHERE ${where}
         ORDER BY study_date DESC, created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM patient_imaging WHERE ${where}`, params),
    ]);

    const studies = rows.map(r => ({
      ...r,
      fileUrl:  `/api/doctors/imaging/file/${r.id}`,
      isVideo:  r.mime_type?.startsWith('video/'),
      isImage:  r.mime_type?.startsWith('image/'),
      isPdf:    r.mime_type === 'application/pdf',
    }));

    res.json({ success: true, studies, total: parseInt(countRows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('imaging list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /file/:id (serve file) ───────────────────────────────────────────────
router.get('/file/:id', authDoctor, async (req, res) => {
  try {
    const doctorId = req.user?.doctorId || req.user?.id;
    const { rows } = await pool.query(
      'SELECT * FROM patient_imaging WHERE id = $1 AND doctor_id = $2',
      [req.params.id, doctorId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const study = rows[0];
    const { logImagingPhiAccess } = await import('../services/imaging/imaging-phi-access-log.service.js');
    await logImagingPhiAccess({
      actorId: doctorId,
      actorRole: req.user?.role || 'doctor',
      actorEmail: req.user?.email || null,
      resourceType: 'doctor_imaging_file',
      resourceId: String(study.id),
      path: req.path,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
    const url = await s3PresignedUrl(study.file_path, 3600);
    res.redirect(302, url);
  } catch (err) {
    console.error('imaging serve error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', authDoctor, async (req, res) => {
  try {
    const doctorId = req.user?.doctorId || req.user?.id;
    const { rows } = await pool.query(
      'DELETE FROM patient_imaging WHERE id = $1 AND doctor_id = $2 RETURNING file_path',
      [req.params.id, doctorId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const s3Key = rows[0].file_path;
    if (s3Key) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key })).catch(() => {});
    }

    res.json({ success: true, message: 'Imaging study deleted' });
  } catch (err) {
    console.error('imaging delete error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
