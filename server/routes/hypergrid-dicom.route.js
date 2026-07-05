/**
 * HyperGrid DICOMweb API
 *
 * Implements a subset of DICOMweb:
 *   STOW-RS  (store)   POST  /api/hypergrid/dicom/studies
 *   WADO-RS  (retrieve) GET  /api/hypergrid/dicom/studies/:studyUID
 *                        GET  /api/hypergrid/dicom/studies/:studyUID/series
 *                        GET  /api/hypergrid/dicom/studies/:studyUID/series/:seriesUID/instances
 *   QIDO-RS  (query)   GET   /api/hypergrid/dicom/studies
 *                        GET  /api/hypergrid/dicom/series
 *                        GET  /api/hypergrid/dicom/instances
 *
 *   Worklist            GET  /api/hypergrid/dicom/worklist
 *   Report              POST /api/hypergrid/dicom/studies/:studyUID/report
 */

import express      from 'express';
import multer       from 'multer';
import jwt          from 'jsonwebtoken';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authLab } from '../middleware/authLab.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { connectPostgres }       from '../db/postgres.js';
import { publishEvent }          from '../services/hypergrid-event-bus.service.js';
import { s3Storage, s3PresignedUrl } from '../utils/s3-storage.js';

const router = express.Router();
const upload = multer({ storage: s3Storage('dicom'), limits: { fileSize: 512 * 1024 * 1024 } }); // 512 MB

const authDicomAccess = (req, res, next) => {
  authLab(req, res, () => {
    req.user = {
      ...(req.user || {}),
      ...(req.lab || {}),
      id: req.lab?.id,
      tenantId: req.lab?.id,
      role: 'lab',
    };
    req.userRole = 'lab';
    next();
  });
};

const authAnyDicom = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
      if (decoded?.role === 'lab') {
        return authDicomAccess(req, res, next);
      }
    } catch {
      // Fall through to regular authUser handling.
    }
  }
  return authUser(req, res, next);
};

// ── STOW-RS: Store studies ────────────────────────────────────────────────────
router.post('/studies', authAnyDicom, upload.array('files'), async (req, res) => {
  try {
    const {
      studyInstanceUID, patientId, patientName, modality,
      studyDate, studyDescription, accessionNumber,
    } = req.body;

    const uid     = studyInstanceUID || `2.25.${Date.now()}`;
    const pool    = await connectPostgres();
    const tenantId = req.user.tenantId || req.user.id;

    const studyRes = await pool.query(
      `INSERT INTO hg_dicom_studies
         (study_instance_uid, patient_id, patient_name, modality,
          study_date, study_description, accession_number, tenant_id, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (study_instance_uid, tenant_id)
       DO UPDATE SET modality=$4, study_description=$6, updated_at=NOW()
       RETURNING *`,
      [uid, patientId || null, patientName || null, modality || null,
       studyDate || null, studyDescription || null, accessionNumber || null,
       tenantId, req.user.id]
    );

    const instances = [];
    for (const file of (req.files || [])) {
      const sopUID = `2.25.${Date.now()}.${Math.random().toString().slice(2, 8)}`;
      await pool.query(
        `INSERT INTO hg_dicom_instances
           (sop_instance_uid, study_instance_uid, file_path, file_size,
            content_type, tenant_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
        [sopUID, uid, file.key, file.size, file.mimetype, tenantId]
      );
      instances.push({ sopInstanceUID: sopUID, s3Key: file.key });
    }

    await publishEvent({
      type:      'ImagingStudyStored',
      source:    'dicom',
      tenantId,
      patientId: patientId || null,
      payload:   { studyInstanceUID: uid, modality, instanceCount: instances.length },
    });

    res.status(200).json({
      success:          true,
      studyInstanceUID: uid,
      study:            studyRes.rows[0],
      instances,
    });
  } catch (err) {
    console.error('[DICOM] Store error:', err);
    res.status(500).json({ success: false, message: 'Failed to store DICOM study' });
  }
});

// ── QIDO-RS: Query studies ────────────────────────────────────────────────────
router.get('/studies', authAnyDicom, async (req, res) => {
  try {
    const { patientId, modality, studyDate, limit = 20, page = 1 } = req.query;
    const tenantId = req.user.tenantId || req.user.id;
    const offset   = (parseInt(page) - 1) * parseInt(limit);
    const pool     = await connectPostgres();
    const r = await pool.query(
      `SELECT s.*, COUNT(i.id) AS instance_count
       FROM hg_dicom_studies s
       LEFT JOIN hg_dicom_instances i ON i.study_id = s.id
       WHERE s.tenant_id = $1
         AND ($2::text IS NULL OR s.patient_id::text = $2)
         AND ($3::text IS NULL OR s.modalities::text ILIKE '%' || $3 || '%')
         AND ($4::text IS NULL OR s.study_date::text = $4)
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT $5 OFFSET $6`,
      [tenantId, patientId || null, modality || null, studyDate || null,
       parseInt(limit), offset]
    );
    res.json({ success: true, studies: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to query studies' });
  }
});

// ── WADO-RS: Retrieve study metadata ─────────────────────────────────────────
router.get('/studies/:studyUID', authAnyDicom, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const tenantId = req.user.tenantId || req.user.id;
    const r = await pool.query(
      `SELECT * FROM hg_dicom_studies
       WHERE study_uid = $1 AND tenant_id = $2`,
      [req.params.studyUID, tenantId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Study not found' });
    const instances = await pool.query(
      `SELECT i.* FROM hg_dicom_instances i
       WHERE i.study_id = $1`,
      [r.rows[0].id]
    );
    res.json({ success: true, study: r.rows[0], instances: instances.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve study' });
  }
});

// ── Retrieve instance file ────────────────────────────────────────────────────
router.get('/studies/:studyUID/instances/:sopUID/file', authAnyDicom, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT i.* FROM hg_dicom_instances i
       JOIN hg_dicom_studies s ON s.study_instance_uid = i.study_instance_uid
       WHERE i.sop_instance_uid = $1 AND s.tenant_id = $2`,
      [req.params.sopUID, req.user.tenantId || req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Instance not found' });
    const url = await s3PresignedUrl(r.rows[0].file_path, 3600);
    res.redirect(302, url);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve instance' });
  }
});

// ── Modality Worklist ─────────────────────────────────────────────────────────
router.get('/worklist', authAnyDicom, async (req, res) => {
  try {
    const { modality, date } = req.query;
    const tenantId = req.user.tenantId || req.user.id;
    const pool     = await connectPostgres();
    const r = await pool.query(
      `SELECT * FROM hg_dicom_worklist
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR modality   = $2)
         AND ($3::date IS NULL OR scheduled_date = $3::date)
         AND status NOT IN ('completed','cancelled')
       ORDER BY scheduled_date ASC, scheduled_time ASC`,
      [tenantId, modality || null, date || null]
    );
    res.json({ success: true, worklist: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch worklist' });
  }
});

// ── Add worklist item ─────────────────────────────────────────────────────────
router.post('/worklist', authAnyDicom, requireRole(['admin', 'hospital', 'doctor']), async (req, res) => {
  try {
    const { patientId, patientName, modality, scheduledDate,
            scheduledTime, requestedProcedure, accessionNumber } = req.body;
    if (!patientId || !modality || !scheduledDate)
      return res.status(400).json({ success: false, message: 'patientId, modality, scheduledDate required' });
    const pool = await connectPostgres();
    const r    = await pool.query(
      `INSERT INTO hg_dicom_worklist
         (patient_id, patient_name, modality, scheduled_date, scheduled_time,
          requested_procedure, accession_number, tenant_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',NOW())
       RETURNING *`,
      [patientId, patientName || null, modality, scheduledDate, scheduledTime || null,
       requestedProcedure || null, accessionNumber || null, req.user.tenantId || req.user.id]
    );
    res.status(201).json({ success: true, item: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add worklist item' });
  }
});

// ── Attach structured report to study ────────────────────────────────────────
router.post('/studies/:studyUID/report', authAnyDicom, requireRole(['admin', 'hospital', 'doctor']), async (req, res) => {
  try {
    const { findings, impression, reportedBy } = req.body;
    if (!findings) return res.status(400).json({ success: false, message: 'findings required' });
    const pool = await connectPostgres();
    const r    = await pool.query(
      `INSERT INTO hg_dicom_reports
         (study_instance_uid, findings, impression, reported_by,
          tenant_id, reported_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (study_instance_uid, tenant_id)
       DO UPDATE SET findings=$2, impression=$3, reported_by=$4, updated_at=NOW()
       RETURNING *`,
      [req.params.studyUID, findings, impression || null,
       reportedBy || req.user.id, req.user.tenantId || req.user.id]
    );
    res.json({ success: true, report: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save report' });
  }
});

export default router;
