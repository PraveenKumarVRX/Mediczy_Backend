/**
 * HyperGrid DICOMweb API — OHIF-compatible subset
 *
 * QIDO-RS  GET  /studies | /series | /instances  (Accept: application/dicom+json)
 * WADO-RS  GET  /studies/:uid/series/:uid/instances/:uid[/frames/1]
 * STOW-RS  POST /studies
 * Worklist GET  /worklist
 * Report   POST /studies/:studyUID/report
 */

import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authLab } from '../middleware/authLab.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { connectPostgres } from '../db/postgres.js';
import { publishEvent } from '../services/hypergrid-event-bus.service.js';
import { s3Storage, s3PresignedUrl, s3GetObjectBuffer } from '../utils/s3-storage.js';
import {
  wantsDicomJson,
  studyToDicomJson,
  seriesToDicomJson,
  instanceToDicomJson,
  groupInstancesBySeries,
  parseDicomBuffer,
  DEFAULT_SERIES_UID,
} from '../services/dicomweb-ohif.service.js';

const router = express.Router();
const upload = multer({ storage: s3Storage('dicom'), limits: { fileSize: 512 * 1024 * 1024 } });

router.use((req, res, next) => {
  const origin = process.env.OHIF_CORS_ORIGIN || req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

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
  const queryToken = req.query.access_token || req.query.token;
  if (queryToken && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${queryToken}`;
  }
  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
      if (decoded?.role === 'lab') {
        return authDicomAccess(req, res, next);
      }
      req.user = { ...decoded, id: decoded.id || decoded.userId, tenantId: decoded.tenantId || decoded.id };
      return next();
    } catch {
      // Fall through to regular authUser handling.
    }
  }
  return authUser(req, res, next);
};

function tenantId(req) {
  return req.user?.tenantId || req.user?.id;
}

async function loadStudy(pool, studyUID, tid) {
  const r = await pool.query(
    `SELECT * FROM hg_dicom_studies WHERE study_instance_uid = $1 AND tenant_id = $2`,
    [studyUID, tid],
  );
  return r.rows[0] || null;
}

async function loadInstances(pool, studyUID, tid, seriesUID = null) {
  const r = await pool.query(
    `SELECT * FROM hg_dicom_instances
     WHERE study_instance_uid = $1 AND tenant_id = $2
       AND ($3::text IS NULL OR series_instance_uid = $3)
     ORDER BY instance_number NULLS LAST, created_at ASC`,
    [studyUID, tid, seriesUID],
  );
  return r.rows;
}

// ── STOW-RS ───────────────────────────────────────────────────────────────────
router.post('/studies', authAnyDicom, upload.array('files'), async (req, res) => {
  try {
    const pool = await connectPostgres();
    const tid = tenantId(req);
    let studyUID = req.body.studyInstanceUID || null;
    let patientId = req.body.patientId || null;
    let patientName = req.body.patientName || null;
    let modality = req.body.modality || null;
    let studyDate = req.body.studyDate || null;
    let studyDescription = req.body.studyDescription || null;
    let accessionNumber = req.body.accessionNumber || null;

    const instances = [];
    for (const file of req.files || []) {
      let buffer = file.buffer;
      if (!buffer && file.key) {
        try { buffer = await s3GetObjectBuffer(file.key); } catch { /* uploaded via multer-s3 */ }
      }
      const tags = buffer ? parseDicomBuffer(buffer) : null;
      studyUID = studyUID || tags?.studyInstanceUID || `2.25.${Date.now()}`;
      patientId = patientId || tags?.patientId;
      patientName = patientName || tags?.patientName;
      modality = modality || tags?.modality;
      studyDate = studyDate || tags?.studyDate;
      studyDescription = studyDescription || tags?.studyDescription;
      accessionNumber = accessionNumber || tags?.accessionNumber;

      const sopUID = req.body.sopInstanceUID || tags?.sopInstanceUID || `2.25.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const seriesUID = req.body.seriesInstanceUID || tags?.seriesInstanceUID || DEFAULT_SERIES_UID;

      await pool.query(
        `INSERT INTO hg_dicom_instances
           (sop_instance_uid, study_instance_uid, series_instance_uid, file_path, file_size,
            content_type, modality, instance_number, tenant_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (sop_instance_uid, tenant_id) DO UPDATE
           SET file_path = EXCLUDED.file_path, file_size = EXCLUDED.file_size`,
        [sopUID, studyUID, seriesUID, file.key, file.size, file.mimetype || 'application/dicom',
         modality, tags?.instanceNumber || 1, tid],
      );
      instances.push({ sopInstanceUID: sopUID, seriesInstanceUID: seriesUID, s3Key: file.key });
    }

    if (!studyUID) studyUID = `2.25.${Date.now()}`;

    const studyRes = await pool.query(
      `INSERT INTO hg_dicom_studies
         (study_instance_uid, patient_id, patient_name, modality, study_date, study_description,
          accession_number, tenant_id, created_by, num_instances, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (study_instance_uid, tenant_id)
       DO UPDATE SET modality = COALESCE($4, hg_dicom_studies.modality),
                     study_description = COALESCE($6, hg_dicom_studies.study_description),
                     num_instances = $10, updated_at = NOW()
       RETURNING *`,
      [studyUID, patientId, patientName, modality, studyDate, studyDescription, accessionNumber,
       tid, req.user.id, instances.length],
    );

    await publishEvent({
      type: 'ImagingStudyStored',
      source: 'dicom',
      tenantId: tid,
      patientId: patientId || null,
      payload: { studyInstanceUID: studyUID, modality, instanceCount: instances.length },
    });

    if (wantsDicomJson(req)) {
      return res.status(200).json([studyToDicomJson(studyRes.rows[0], instances.length)]);
    }
    res.status(200).json({
      success: true,
      studyInstanceUID: studyUID,
      study: studyRes.rows[0],
      instances,
    });
  } catch (err) {
    console.error('[DICOM] Store error:', err);
    res.status(500).json({ success: false, message: 'Failed to store DICOM study' });
  }
});

// ── QIDO-RS: studies ──────────────────────────────────────────────────────────
router.get('/studies', authAnyDicom, async (req, res) => {
  try {
    const { PatientID, patientId, Modality, modality, StudyDate, studyDate, limit = 50, page = 1 } = req.query;
    const pid = PatientID || patientId;
    const mod = Modality || modality;
    const sdate = StudyDate || studyDate;
    const tid = tenantId(req);
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT s.*, COUNT(i.id)::int AS instance_count
       FROM hg_dicom_studies s
       LEFT JOIN hg_dicom_instances i
         ON i.study_instance_uid = s.study_instance_uid AND i.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
         AND ($2::text IS NULL OR s.patient_id::text = $2 OR s.patient_name ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR s.modality = $3)
         AND ($4::text IS NULL OR s.study_date::text = $4)
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT $5 OFFSET $6`,
      [tid, pid || null, mod || null, sdate || null, parseInt(limit, 10), offset],
    );

    if (wantsDicomJson(req)) {
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(r.rows.map((row) => studyToDicomJson(row, row.instance_count)));
    }
    res.json({ success: true, studies: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to query studies' });
  }
});

// ── QIDO-RS: series (all tenants studies) ───────────────────────────────────
router.get('/series', authAnyDicom, async (req, res) => {
  try {
    const { StudyInstanceUID, studyUID } = req.query;
    const uid = StudyInstanceUID || studyUID;
    if (!uid) return res.status(400).json({ success: false, message: 'StudyInstanceUID required' });
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, uid, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, uid, tid);
    const grouped = groupInstancesBySeries(instances);
    const series = [...grouped.entries()].map(([seriesUid, insts]) =>
      seriesToDicomJson(study, seriesUid, insts),
    );
    if (wantsDicomJson(req)) {
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(series);
    }
    return res.json({ success: true, series });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to query series' });
  }
});

// ── QIDO-RS: instances ────────────────────────────────────────────────────────
router.get('/instances', authAnyDicom, async (req, res) => {
  try {
    const { StudyInstanceUID, SeriesInstanceUID } = req.query;
    if (!StudyInstanceUID) return res.status(400).json({ success: false, message: 'StudyInstanceUID required' });
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, StudyInstanceUID, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, StudyInstanceUID, tid, SeriesInstanceUID || null);
    const payload = instances.map((inst) => instanceToDicomJson(study, inst));
    if (wantsDicomJson(req)) {
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(payload);
    }
    return res.json({ success: true, instances });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to query instances' });
  }
});

// ── WADO-RS: study metadata (legacy + OHIF) ───────────────────────────────────
router.get('/studies/:studyUID', authAnyDicom, async (req, res) => {
  try {
    const pool = await connectPostgres();
<<<<<<< HEAD
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
=======
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json({ success: false, message: 'Study not found' });
    const instances = await loadInstances(pool, req.params.studyUID, tid);
    if (wantsDicomJson(req)) {
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json([studyToDicomJson(study, instances.length)]);
    }
    res.json({ success: true, study, instances });
>>>>>>> origin/cursor/dicom-modality-port-fix-c94d
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve study' });
  }
});

// ── QIDO-RS: series for study ─────────────────────────────────────────────────
router.get('/studies/:studyUID/series', authAnyDicom, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, req.params.studyUID, tid);
    const grouped = groupInstancesBySeries(instances);
    const series = [...grouped.entries()].map(([seriesUid, insts]) =>
      seriesToDicomJson(study, seriesUid, insts),
    );
    if (wantsDicomJson(req)) {
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(series);
    }
    return res.json({ success: true, series });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve series' });
  }
});

// ── QIDO-RS: instances for series ─────────────────────────────────────────────
router.get('/studies/:studyUID/series/:seriesUID/instances', authAnyDicom, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const tid = tenantId(req);
    const study = await loadStudy(pool, req.params.studyUID, tid);
    if (!study) return res.status(404).json([]);
    const instances = await loadInstances(pool, req.params.studyUID, tid, req.params.seriesUID);
    const payload = instances.map((inst) => instanceToDicomJson(study, inst));
    if (wantsDicomJson(req)) {
      res.setHeader('Content-Type', 'application/dicom+json');
      return res.json(payload);
    }
    return res.json({ success: true, instances });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve instances' });
  }
});

async function streamInstance(req, res) {
  const pool = await connectPostgres();
  const tid = tenantId(req);
  const { studyUID, seriesUID, sopUID } = req.params;
  const r = await pool.query(
    `SELECT i.* FROM hg_dicom_instances i
     WHERE i.sop_instance_uid = $1 AND i.study_instance_uid = $2 AND i.tenant_id = $3
       AND ($4::text IS NULL OR i.series_instance_uid = $4)`,
    [sopUID, studyUID, tid, seriesUID || null],
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Instance not found' });
  const inst = r.rows[0];
  const accept = String(req.headers.accept || '').toLowerCase();
  if (accept.includes('application/dicom') || req.path.includes('/frames/')) {
    const buf = await s3GetObjectBuffer(inst.file_path);
    res.setHeader('Content-Type', inst.content_type || 'application/dicom');
    return res.send(buf);
  }
  const url = await s3PresignedUrl(inst.file_path, 3600);
  return res.redirect(302, url);
}

// ── WADO-RS: retrieve instance (OHIF standard path) ───────────────────────────
router.get('/studies/:studyUID/series/:seriesUID/instances/:sopUID', authAnyDicom, streamInstance);
router.get('/studies/:studyUID/series/:seriesUID/instances/:sopUID/frames/:frame', authAnyDicom, streamInstance);

// ── Legacy instance file redirect ─────────────────────────────────────────────
router.get('/studies/:studyUID/instances/:sopUID/file', authAnyDicom, async (req, res) => {
  req.params.seriesUID = null;
  return streamInstance(req, res);
});

// ── Modality Worklist ─────────────────────────────────────────────────────────
router.get('/worklist', authAnyDicom, async (req, res) => {
  try {
    const { modality, date } = req.query;
    const pool = await connectPostgres();
    const r = await pool.query(
      `SELECT * FROM hg_dicom_worklist
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR modality = $2)
         AND ($3::date IS NULL OR scheduled_date = $3::date)
         AND status NOT IN ('completed','cancelled')
       ORDER BY scheduled_date ASC, scheduled_time ASC NULLS LAST`,
      [tenantId(req), modality || null, date || null],
    );
    res.json({ success: true, worklist: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch worklist' });
  }
});

router.post('/worklist', authAnyDicom, requireRole(['admin', 'hospital', 'doctor']), async (req, res) => {
  try {
    const { patientId, patientName, modality, scheduledDate, scheduledTime, requestedProcedure, accessionNumber } = req.body;
    if (!patientId || !modality || !scheduledDate) {
      return res.status(400).json({ success: false, message: 'patientId, modality, scheduledDate required' });
    }
    const pool = await connectPostgres();
    const r = await pool.query(
      `INSERT INTO hg_dicom_worklist
         (patient_id, patient_name, modality, scheduled_date, scheduled_time,
          requested_procedure, accession_number, tenant_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',NOW()) RETURNING *`,
      [patientId, patientName || null, modality, scheduledDate, scheduledTime || null,
       requestedProcedure || null, accessionNumber || null, tenantId(req)],
    );
    res.status(201).json({ success: true, item: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add worklist item' });
  }
});

router.post('/studies/:studyUID/report', authAnyDicom, requireRole(['admin', 'hospital', 'doctor']), async (req, res) => {
  try {
    const { findings, impression, reportedBy } = req.body;
    if (!findings) return res.status(400).json({ success: false, message: 'findings required' });
    const pool = await connectPostgres();
    const r = await pool.query(
      `INSERT INTO hg_dicom_reports
         (study_instance_uid, findings, impression, reported_by, tenant_id, reported_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (study_instance_uid, tenant_id)
       DO UPDATE SET findings=$2, impression=$3, reported_by=$4, updated_at=NOW()
       RETURNING *`,
      [req.params.studyUID, findings, impression || null, reportedBy || req.user.id, tenantId(req)],
    );
    res.json({ success: true, report: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save report' });
  }
});

export default router;
