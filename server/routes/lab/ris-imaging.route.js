/**
 * Lab RIS Imaging Routes — PACS / DICOM
 *
 * POST   /api/lab/ris/upload          — upload DICOM / image / video
 * POST   /api/lab/ris/upload-series   — batch DICOM instances (one study)
 * GET    /api/lab/ris/studies         — list studies (PACS worklist)
 * GET    /api/lab/ris/file/:id        — serve file (authenticated)
 * GET    /api/lab/ris/:id             — get study metadata
 * PUT    /api/lab/ris/:id/status      — update study status (Ordered→Scheduled→InProgress→Completed)
 * PUT    /api/lab/ris/:id/report      — save radiology report text
 * DELETE /api/lab/ris/:id             — delete study + file
 */
import express   from 'express';
import multer    from 'multer';
import path      from 'path';
import fs        from 'fs';
import os        from 'os';
import pool      from '../../db/pgPool.js';
import { authLab } from '../../middleware/authLab.middleware.js';
import { s3Client, BUCKET, s3PresignedUrl } from '../../utils/s3-storage.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto    from 'crypto';
import {
  parseDicomUidsFromFile,
  stowDicomToOrthanc,
  stowMultipleDicomFiles,
  formatDicomStudyDate,
} from '../../services/orthanc-pacs.service.js';
import { onDicomStudyIngested } from '../../services/imaging/imaging-ingest.service.js';
import { indexStudyDocument } from '../../services/imaging/imaging-search.service.js';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';

const router = express.Router();

const VALID_STUDY_STATUSES = ['Ordered', 'Scheduled', 'InProgress', 'Completed', 'Reported', 'Cancelled'];
const VALID_REPORT_STATUSES = ['Pending', 'Draft', 'Final', 'Addendum'];
const CRITICAL_VALUE_ALERT_STATUSES = ['Open', 'Acknowledged', 'Escalated'];
const QC_TEMPLATE_MODALITIES = ['CT', 'MRI', 'XR', 'USG', 'ECHO', 'MAMMO', 'FLUORO', 'NM', 'PET', 'OT'];
const ALLOWED_STATUS_TRANSITIONS = {
  Ordered: ['Scheduled', 'Cancelled'],
  Scheduled: ['InProgress', 'Cancelled'],
  InProgress: ['Completed', 'Cancelled'],
  Completed: ['Reported', 'Cancelled'],
  Reported: ['Cancelled'],
  Cancelled: [],
};

const getActor = (req) => ({
  actorId: req.lab?.id || null,
  actorName: req.lab?.labName || req.lab?.name || req.lab?.email || 'lab-user',
});

const writeAuditEvent = async (db, {
  studyId,
  labId,
  eventType,
  actorId,
  actorName,
  details = {},
}) => {
  await db.query(
    `INSERT INTO ris_study_audit_events
      (study_id, lab_id, event_type, actor_id, actor_name, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [studyId, labId, eventType, actorId, actorName, JSON.stringify(details || {})]
  );
};

const writeCustodyEvent = async (db, {
  studyId,
  labId,
  fromStatus,
  toStatus,
  reason,
  actorId,
  actorName,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO ris_sample_custody_events
      (study_id, lab_id, from_status, to_status, reason, actor_id, actor_name, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [studyId, labId, fromStatus, toStatus, reason || null, actorId, actorName, JSON.stringify(metadata || {})]
  );
};

const getLatestQcReview = async (db, studyId, labId) => {
  const row = await db.query(
    `SELECT id, qc_status, reviewed_by, reviewed_at, review_notes
     FROM ris_qc_reviews
     WHERE study_id = $1 AND lab_id = $2
     ORDER BY reviewed_at DESC, id DESC
     LIMIT 1`,
    [studyId, labId]
  );
  return row.rows[0] || null;
};

const getResultContext = async (db, studyId, labId) => {
  const row = await db.query(
    `SELECT id, reagent_lot_number, calibration_reference, context_notes, updated_at
     FROM ris_result_context
     WHERE study_id = $1 AND lab_id = $2
     LIMIT 1`,
    [studyId, labId]
  );
  return row.rows[0] || null;
};

const normalizeModality = (modality) => {
  const m = String(modality || '').trim().toUpperCase();
  if (m === 'X-RAY' || m === 'XRAY') return 'XR';
  if (m === 'ULTRASOUND') return 'USG';
  if (m === 'MAMMOGRAPHY') return 'MAMMO';
  if (m === 'FLUOROSCOPY') return 'FLUORO';
  if (m === 'OTHER') return 'OT';
  return m;
};

const validateChecklistAgainstTemplate = (templateRows, checklistAnswers = []) => {
  const requiredTemplateItems = templateRows.filter((row) => row.required);
  const answersMap = new Map(
    (Array.isArray(checklistAnswers) ? checklistAnswers : []).map((item) => [String(item.itemKey), Boolean(item.passed)])
  );

  const missingRequired = [];
  for (const item of requiredTemplateItems) {
    if (answersMap.get(String(item.item_key)) !== true) {
      missingRequired.push(item.item_key);
    }
  }
  return {
    passed: missingRequired.length === 0,
    missingRequired,
  };
};

const csvEscape = (value) => {
  if (value === null || typeof value === 'undefined') return '';
  const str = String(value).replace(/\r?\n/g, ' ');
  return `"${str.replace(/"/g, '""')}"`;
};

const buildEvidenceCsv = ({ generatedAt, generatedBy, summary, filters, studies, auditEvents, custodyEvents, qcReviews, criticalAlerts, resultContexts, signature }) => {
  const lines = [];

  lines.push('section,key,value');
  lines.push(`meta,generatedAt,${csvEscape(generatedAt)}`);
  lines.push(`meta,generatedBy,${csvEscape(generatedBy?.labName || generatedBy?.actor || '')}`);
  lines.push(`meta,contentHash,${csvEscape(signature?.contentHash || '')}`);
  lines.push(`meta,filterFrom,${csvEscape(filters?.from || '')}`);
  lines.push(`meta,filterTo,${csvEscape(filters?.to || '')}`);

  lines.push(`summary,studies,${summary?.studies || 0}`);
  lines.push(`summary,auditEvents,${summary?.auditEvents || 0}`);
  lines.push(`summary,custodyEvents,${summary?.custodyEvents || 0}`);
  lines.push(`summary,qcReviews,${summary?.qcReviews || 0}`);
  lines.push(`summary,criticalAlerts,${summary?.criticalAlerts || 0}`);
  lines.push(`summary,resultContexts,${summary?.resultContexts || 0}`);

  lines.push('');
  lines.push('studies,id,patient_name,modality,status,report_status,accession_number,created_at');
  for (const row of studies || []) {
    lines.push([
      'studies',
      row.id,
      csvEscape(row.patient_name),
      csvEscape(row.modality),
      csvEscape(row.status),
      csvEscape(row.report_status),
      csvEscape(row.accession_number),
      csvEscape(row.created_at),
    ].join(','));
  }

  lines.push('');
  lines.push('audit_events,id,study_id,event_type,actor_name,created_at');
  for (const row of auditEvents || []) {
    lines.push([
      'audit_events',
      row.id,
      row.study_id,
      csvEscape(row.event_type),
      csvEscape(row.actor_name),
      csvEscape(row.created_at),
    ].join(','));
  }

  lines.push('');
  lines.push('custody_events,id,study_id,from_status,to_status,reason,created_at');
  for (const row of custodyEvents || []) {
    lines.push([
      'custody_events',
      row.id,
      row.study_id,
      csvEscape(row.from_status),
      csvEscape(row.to_status),
      csvEscape(row.reason),
      csvEscape(row.created_at),
    ].join(','));
  }

  lines.push('');
  lines.push('qc_reviews,id,study_id,qc_status,reviewed_by,reviewed_at');
  for (const row of qcReviews || []) {
    lines.push([
      'qc_reviews',
      row.id,
      row.study_id,
      csvEscape(row.qc_status),
      csvEscape(row.reviewed_by),
      csvEscape(row.reviewed_at),
    ].join(','));
  }

  lines.push('');
  lines.push('critical_alerts,id,study_id,status,alert_reason,raised_by,raised_at,acknowledged_by,acknowledged_at');
  for (const row of criticalAlerts || []) {
    lines.push([
      'critical_alerts',
      row.id,
      row.study_id,
      csvEscape(row.status),
      csvEscape(row.alert_reason),
      csvEscape(row.raised_by),
      csvEscape(row.raised_at),
      csvEscape(row.acknowledged_by),
      csvEscape(row.acknowledged_at),
    ].join(','));
  }

  lines.push('');
  lines.push('result_contexts,id,study_id,reagent_lot_number,calibration_reference,updated_at');
  for (const row of resultContexts || []) {
    lines.push([
      'result_contexts',
      row.id,
      row.study_id,
      csvEscape(row.reagent_lot_number),
      csvEscape(row.calibration_reference),
      csvEscape(row.updated_at),
    ].join(','));
  }

  return lines.join('\n');
};

// ─── DB bootstrap ────────────────────────────────────────────────────────────
const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ris_studies (
      id               BIGSERIAL PRIMARY KEY,
      lab_id           INTEGER NOT NULL,
      patient_id       INTEGER,
      patient_name     VARCHAR(255) NOT NULL,
      patient_dob      DATE,
      patient_sex      CHAR(1) DEFAULT 'U',
      accession_number VARCHAR(64),
      study_instance_uid VARCHAR(128),
      modality         VARCHAR(20) NOT NULL DEFAULT 'OT',
      body_part        VARCHAR(100),
      study_description VARCHAR(500),
      referring_physician VARCHAR(255),
      referring_doctor_id INTEGER,
      referring_doctor_name VARCHAR(255),
      study_date       DATE NOT NULL DEFAULT CURRENT_DATE,
      study_time       TIME,
      priority         VARCHAR(20) DEFAULT 'Routine' CHECK (priority IN ('STAT','Urgent','Routine')),
      status           VARCHAR(30) DEFAULT 'Ordered' CHECK (status IN ('Ordered','Scheduled','InProgress','Completed','Reported','Cancelled')),
      file_name        VARCHAR(500) NOT NULL,
      original_name    VARCHAR(500) NOT NULL,
      file_path        VARCHAR(1000) NOT NULL,
      file_size        INTEGER NOT NULL DEFAULT 0,
      mime_type        VARCHAR(100) NOT NULL,
      is_dicom         BOOLEAN DEFAULT FALSE,
      dicom_tags       JSONB DEFAULT '{}',
      series_count     INTEGER DEFAULT 1,
      image_count      INTEGER DEFAULT 1,
      report_text      TEXT,
      report_status    VARCHAR(20) DEFAULT 'Pending' CHECK (report_status IN ('Pending','Draft','Final','Addendum')),
      reported_by      VARCHAR(255),
      reported_at      TIMESTAMPTZ,
      notes            TEXT,
      tenant_id        INTEGER,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_lab_id    ON ris_studies(lab_id);
    CREATE INDEX IF NOT EXISTS idx_ris_patient    ON ris_studies(patient_name);
    CREATE INDEX IF NOT EXISTS idx_ris_modality   ON ris_studies(modality);
    CREATE INDEX IF NOT EXISTS idx_ris_status     ON ris_studies(status);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS series_instance_uid VARCHAR(128);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS sop_instance_uid VARCHAR(128);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS orthanc_study_id VARCHAR(64);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS orthanc_instance_id VARCHAR(64);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS pacs_source VARCHAR(20) DEFAULT 's3';
    CREATE INDEX IF NOT EXISTS idx_ris_study_date ON ris_studies(study_date DESC);

    CREATE TABLE IF NOT EXISTS ris_study_audit_events (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      actor_id INTEGER,
      actor_name VARCHAR(255),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_audit_study ON ris_study_audit_events(study_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ris_sample_custody_events (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      from_status VARCHAR(30),
      to_status VARCHAR(30) NOT NULL,
      reason VARCHAR(500),
      actor_id INTEGER,
      actor_name VARCHAR(255),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_custody_study ON ris_sample_custody_events(study_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ris_qc_reviews (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      qc_status VARCHAR(20) NOT NULL CHECK (qc_status IN ('Passed','Failed','NeedsReview')),
      review_notes TEXT,
      reviewed_by VARCHAR(255),
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_qc_study ON ris_qc_reviews(study_id, reviewed_at DESC);

    CREATE TABLE IF NOT EXISTS ris_result_context (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      reagent_lot_number VARCHAR(120) NOT NULL,
      calibration_reference VARCHAR(120) NOT NULL,
      context_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (study_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ris_result_context_study ON ris_result_context(study_id);

    CREATE TABLE IF NOT EXISTS ris_critical_value_alerts (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      alert_reason VARCHAR(500) NOT NULL,
      value_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Acknowledged','Escalated')),
      raised_by VARCHAR(255),
      raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      due_at TIMESTAMPTZ,
      acknowledged_by VARCHAR(255),
      acknowledged_at TIMESTAMPTZ,
      acknowledgment_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_critical_study ON ris_critical_value_alerts(study_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ris_critical_status ON ris_critical_value_alerts(lab_id, status, due_at);

    CREATE TABLE IF NOT EXISTS ris_qc_templates (
      id BIGSERIAL PRIMARY KEY,
      lab_id INTEGER NOT NULL,
      modality VARCHAR(20) NOT NULL,
      item_key VARCHAR(120) NOT NULL,
      item_label VARCHAR(255) NOT NULL,
      required BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lab_id, modality, item_key)
    );
    CREATE INDEX IF NOT EXISTS idx_ris_qc_template_modality ON ris_qc_templates(lab_id, modality, display_order);
  `);
};
ensureTable().catch(e => console.error('[RIS] Table init error:', e.message));

// ─── Multer ───────────────────────────────────────────────────────────────────
const ALLOWED_MIME = [
  'image/jpeg','image/jpg','image/png','image/gif','image/webp','image/bmp','image/tiff',
  'application/dicom','application/octet-stream',
  'video/mp4','video/webm','video/ogg','video/quicktime',
  'application/pdf',
];
// Write to /tmp first so parseDicomTags can read from disk, then upload to S3
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename:    (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `ris_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB for DICOM series
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_MIME.includes(file.mimetype)
      || file.originalname.toLowerCase().endsWith('.dcm');
    cb(null, ok);
  },
});

// ─── Helper: DICOM UID extraction (dicom-parser) ───────────────────────────
const readDicomMeta = (filePath) => parseDicomUidsFromFile(filePath);

// ─── POST /upload ─────────────────────────────────────────────────────────────
router.post('/upload', authLab, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  try {
    const {
      patientName, patientDob, patientSex,
      modality = 'OT', bodyPart, studyDescription,
      referringPhysician, referringDoctorId, referringDoctorName,
      studyDate, studyTime,
      priority = 'Routine', accessionNumber,
      studyInstanceUid, notes,
    } = req.body;

    if (!patientName) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'patientName is required' });
    }

    const dicomMeta = readDicomMeta(req.file.path);
    const isDicom = dicomMeta.isDicom;

    let orthancResult = null;
    if (isDicom) {
      const fileBuffer = fs.readFileSync(req.file.path);
      try {
        orthancResult = await stowDicomToOrthanc(fileBuffer, req.file.originalname || 'instance.dcm');
      } catch (orthancErr) {
        fs.unlinkSync(req.file.path);
        return res.status(502).json({
          success: false,
          message: `Orthanc STOW-RS failed: ${orthancErr.message}. DICOM must be ingested to PACS before RIS registration.`,
        });
      }
    }

    // Archive to S3 (compliance backup; OHIF reads from Orthanc)
    const ext    = path.extname(req.file.originalname) || '';
    const s3Key  = `ris/${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    await s3Client.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      Body:        fs.createReadStream(req.file.path),
      ContentType: req.file.mimetype || 'application/octet-stream',
    }));
    fs.unlink(req.file.path, () => {});

    const resolvedStudyUid = orthancResult?.studyInstanceUID
      || studyInstanceUid
      || dicomMeta.studyInstanceUID
      || (isDicom ? null : `1.2.3.${Date.now()}`);
    if (isDicom && !resolvedStudyUid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Could not resolve StudyInstanceUID from DICOM' });
    }

    const result = await pool.query(`
      INSERT INTO ris_studies
        (lab_id, patient_name, patient_dob, patient_sex,
         accession_number, study_instance_uid, series_instance_uid, sop_instance_uid,
         orthanc_study_id, orthanc_instance_id, pacs_source,
         modality, body_part, study_description, referring_physician,
         referring_doctor_id, referring_doctor_name,
         study_date, study_time, priority,
         file_name, original_name, file_path, file_size, mime_type,
         is_dicom, dicom_tags, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      RETURNING *
    `, [
      req.lab.id,
      (orthancResult?.patientName || patientName).trim(),
      patientDob || null,
      (patientSex || 'U').charAt(0).toUpperCase(),
      orthancResult?.accessionNumber || accessionNumber || `ACC-${Date.now()}`,
      resolvedStudyUid,
      orthancResult?.seriesInstanceUID || dicomMeta.seriesInstanceUID || null,
      orthancResult?.sopInstanceUID || dicomMeta.sopInstanceUID || null,
      orthancResult?.orthancStudyId || null,
      orthancResult?.orthancInstanceId || null,
      isDicom ? 'orthanc' : 's3',
      (orthancResult?.modality || modality).toUpperCase(),
      bodyPart || null,
      orthancResult?.studyDescription || studyDescription || null,
      referringPhysician || null,
      referringDoctorId ? parseInt(referringDoctorId) : null,
      referringDoctorName || null,
      orthancResult?.studyDate
        ? (formatDicomStudyDate(orthancResult.studyDate) || studyDate || new Date().toISOString().slice(0, 10))
        : (formatDicomStudyDate(dicomMeta.studyDate) || studyDate || new Date().toISOString().slice(0, 10)),
      studyTime || null,
      priority,
      s3Key,
      req.file.originalname,
      s3Key,
      req.file.size,
      req.file.mimetype,
      isDicom,
      JSON.stringify({ ...dicomMeta, orthancMethod: orthancResult?.method }),
      notes || null,
    ]);

    const study = result.rows[0];

    // Index in HyperGrid metadata using real Orthanc UIDs (for worklist / reports)
    if (isDicom && study.study_instance_uid) {
      try {
        await pool.query(
          `INSERT INTO hg_dicom_studies
             (study_instance_uid, patient_id, patient_name, modality,
              study_date, study_description, accession_number, tenant_id, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
           ON CONFLICT (study_instance_uid, tenant_id)
           DO UPDATE SET modality = EXCLUDED.modality, updated_at = NOW()`,
          [
            study.study_instance_uid,
            study.patient_id || null,
            study.patient_name,
            study.modality,
            study.study_date,
            study.study_description,
            study.accession_number,
            req.lab.id,
            req.lab.id,
          ],
        );
        if (study.sop_instance_uid) {
          await pool.query(
            `INSERT INTO hg_dicom_instances
               (sop_instance_uid, study_instance_uid, series_instance_uid, file_path, file_size,
                content_type, tenant_id, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
             ON CONFLICT (sop_instance_uid, tenant_id) DO NOTHING`,
            [
              study.sop_instance_uid,
              study.study_instance_uid,
              study.series_instance_uid,
              study.file_path,
              study.file_size,
              study.mime_type,
              req.lab.id,
            ],
          );
        }
      } catch (syncErr) {
        console.warn('[RIS] HyperGrid metadata sync warning:', syncErr?.message || syncErr);
      }
    }

    const actor = getActor(req);
    await writeAuditEvent(pool, {
      studyId: study.id,
      labId: req.lab.id,
      eventType: 'STUDY_CREATED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: {
        patientName: study.patient_name,
        modality: study.modality,
        priority: study.priority,
      },
    });
    await writeCustodyEvent(pool, {
      studyId: study.id,
      labId: req.lab.id,
      fromStatus: null,
      toStatus: study.status,
      reason: 'Study uploaded',
      actorId: actor.actorId,
      actorName: actor.actorName,
    });

    if (isDicom) {
      await onDicomStudyIngested({
        study,
        tenantId: req.lab.id,
        orthancResult,
        s3Key,
      }).catch((err) => console.warn('[RIS] imaging ingest hook:', err?.message));
    }

    return res.status(201).json({ success: true, study });
  } catch (err) {
    console.error('[RIS] Upload error:', err);
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /upload-series — batch DICOM instances (one study) ─────────────────
router.post('/upload-series', authLab, upload.array('files', 100), async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  try {
    const {
      patientName, patientDob, patientSex,
      modality = 'OT', bodyPart, studyDescription,
      referringPhysician, referringDoctorId, referringDoctorName,
      studyDate, studyTime,
      priority = 'Routine', accessionNumber, notes,
    } = req.body;

    if (!patientName) {
      files.forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });
      return res.status(400).json({ success: false, message: 'patientName is required' });
    }

    const dicomBuffers = [];
    for (const f of files) {
      const meta = readDicomMeta(f.path);
      if (!meta.isDicom) {
        files.forEach((x) => { try { fs.unlinkSync(x.path); } catch {} });
        return res.status(400).json({ success: false, message: `Non-DICOM file in batch: ${f.originalname}` });
      }
      dicomBuffers.push({
        buffer: fs.readFileSync(f.path),
        filename: f.originalname || 'instance.dcm',
        meta,
      });
    }

    let orthancResult;
    try {
      orthancResult = await stowMultipleDicomFiles(dicomBuffers);
    } catch (orthancErr) {
      files.forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });
      return res.status(502).json({
        success: false,
        message: `Orthanc batch STOW failed: ${orthancErr.message}`,
      });
    }

    const primaryMeta = dicomBuffers[0].meta;
    const s3Keys = [];
    for (const f of files) {
      const ext = path.extname(f.originalname) || '.dcm';
      const s3Key = `ris/${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: fs.createReadStream(f.path),
        ContentType: f.mimetype || 'application/dicom',
      }));
      s3Keys.push(s3Key);
      fs.unlink(f.path, () => {});
    }

    const resolvedStudyUid = orthancResult.studyInstanceUID || primaryMeta.studyInstanceUID;
    if (!resolvedStudyUid) {
      return res.status(400).json({ success: false, message: 'Could not resolve StudyInstanceUID from batch' });
    }

    const result = await pool.query(`
      INSERT INTO ris_studies
        (lab_id, patient_name, patient_dob, patient_sex,
         accession_number, study_instance_uid, series_instance_uid, sop_instance_uid,
         orthanc_study_id, orthanc_instance_id, pacs_source,
         modality, body_part, study_description, referring_physician,
         referring_doctor_id, referring_doctor_name,
         study_date, study_time, priority,
         file_name, original_name, file_path, file_size, mime_type,
         is_dicom, dicom_tags, notes, image_count, series_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      RETURNING *
    `, [
      req.lab.id,
      (orthancResult.patientName || patientName).trim(),
      patientDob || null,
      (patientSex || 'U').charAt(0).toUpperCase(),
      orthancResult.accessionNumber || accessionNumber || `ACC-${Date.now()}`,
      resolvedStudyUid,
      orthancResult.seriesInstanceUID || primaryMeta.seriesInstanceUID || null,
      orthancResult.sopInstanceUID || primaryMeta.sopInstanceUID || null,
      orthancResult.orthancStudyId || null,
      orthancResult.orthancInstanceId || null,
      'orthanc',
      (orthancResult.modality || modality).toUpperCase(),
      bodyPart || null,
      orthancResult.studyDescription || studyDescription || null,
      referringPhysician || null,
      referringDoctorId ? parseInt(referringDoctorId, 10) : null,
      referringDoctorName || null,
      orthancResult.studyDate
        ? (formatDicomStudyDate(orthancResult.studyDate) || studyDate || new Date().toISOString().slice(0, 10))
        : (formatDicomStudyDate(primaryMeta.studyDate) || studyDate || new Date().toISOString().slice(0, 10)),
      studyTime || null,
      priority,
      s3Keys[0],
      files[0].originalname,
      s3Keys[0],
      files.reduce((sum, f) => sum + f.size, 0),
      'application/dicom',
      true,
      JSON.stringify({ batch: true, instanceCount: orthancResult.instanceCount, s3Keys }),
      notes || null,
      orthancResult.instanceCount || files.length,
      1,
    ]);

    const study = result.rows[0];
    const actor = getActor(req);
    await writeAuditEvent(pool, {
      studyId: study.id,
      labId: req.lab.id,
      eventType: 'STUDY_BATCH_UPLOADED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: { instanceCount: orthancResult.instanceCount, patientName: study.patient_name },
    });

    await onDicomStudyIngested({
      study,
      tenantId: req.lab.id,
      orthancResult,
      s3Key: s3Keys[0],
    }).catch((err) => console.warn('[RIS] batch ingest hook:', err?.message));

    return res.status(201).json({
      success: true,
      study,
      instanceCount: orthancResult.instanceCount,
    });
  } catch (err) {
    console.error('[RIS] Batch upload error:', err);
    (req.files || []).forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /studies ─────────────────────────────────────────────────────────────
router.get('/studies', authLab, async (req, res) => {
  try {
    const {
      modality, status, priority, patientName,
      from, to, page = 1, limit = 50,
    } = req.query;

    const conditions = ['lab_id = $1'];
    const params = [req.lab.id];
    let p = 2;

    if (modality)     { conditions.push(`modality = $${p++}`);    params.push(modality.toUpperCase()); }
    if (status)       { conditions.push(`status = $${p++}`);      params.push(status); }
    if (priority)     { conditions.push(`priority = $${p++}`);    params.push(priority); }
    if (patientName)  { conditions.push(`patient_name ILIKE $${p++}`); params.push(`%${patientName}%`); }
    if (from)         { conditions.push(`study_date >= $${p++}`); params.push(from); }
    if (to)           { conditions.push(`study_date <= $${p++}`); params.push(to); }

    const where  = conditions.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, lab_id, patient_name, patient_sex, patient_dob,
                accession_number, study_instance_uid,
                modality, body_part, study_description, referring_physician,
                study_date, study_time, priority, status,
                file_name, mime_type, file_size, is_dicom,
                report_status, reported_by, reported_at, notes,
                image_count, series_count, created_at
         FROM ris_studies WHERE ${where}
         ORDER BY study_date DESC, created_at DESC
         LIMIT $${p} OFFSET $${p+1}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM ris_studies WHERE ${where}`, params),
    ]);

    return res.json({
      success: true,
      studies: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('[RIS] List error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /file/:id ────────────────────────────────────────────────────────────
router.get('/file/:id', authLab, async (req, res) => {
  try {
    const row = await pool.query(
      'SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const study = row.rows[0];
    const url   = await s3PresignedUrl(study.file_path, 3600);
    return res.redirect(302, url);
  } catch (err) {
    console.error('[RIS] File serve error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:id (metadata) ──────────────────────────────────────────────────────
router.get('/:id', authLab, async (req, res) => {
  try {
    const row = await pool.query(
      'SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, study: row.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:id/audit ─────────────────────────────────────────────────────────
router.get('/:id/audit', authLab, async (req, res) => {
  try {
    const studyCheck = await pool.query(
      'SELECT id FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    if (!studyCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const rows = await pool.query(
      `SELECT id, study_id, event_type, actor_id, actor_name, details, created_at
       FROM ris_study_audit_events
       WHERE study_id = $1 AND lab_id = $2
       ORDER BY created_at DESC`,
      [req.params.id, req.lab.id]
    );

    return res.json({ success: true, auditEvents: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:id/custody ───────────────────────────────────────────────────────
router.get('/:id/custody', authLab, async (req, res) => {
  try {
    const studyCheck = await pool.query(
      'SELECT id FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    if (!studyCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const rows = await pool.query(
      `SELECT id, study_id, from_status, to_status, reason, actor_id, actor_name, metadata, created_at
       FROM ris_sample_custody_events
       WHERE study_id = $1 AND lab_id = $2
       ORDER BY created_at DESC`,
      [req.params.id, req.lab.id]
    );

    return res.json({ success: true, custodyEvents: rows.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /qc/templates/:modality ────────────────────────────────────────────
router.get('/qc/templates/:modality', authLab, async (req, res) => {
  try {
    const modality = normalizeModality(req.params.modality);
    const templateRows = await pool.query(
      `SELECT item_key, item_label, required, display_order
       FROM ris_qc_templates
       WHERE lab_id = $1 AND modality = $2
       ORDER BY display_order ASC, id ASC`,
      [req.lab.id, modality]
    );

    return res.json({
      success: true,
      modality,
      templateItems: templateRows.rows,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /qc/templates/:modality ────────────────────────────────────────────
router.put('/qc/templates/:modality', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    const modality = normalizeModality(req.params.modality);
    const templateItems = Array.isArray(req.body?.templateItems) ? req.body.templateItems : [];

    if (!QC_TEMPLATE_MODALITIES.includes(modality)) {
      return res.status(400).json({ success: false, message: 'Invalid modality for QC template' });
    }
    if (!templateItems.length) {
      return res.status(400).json({ success: false, message: 'templateItems are required' });
    }

    await client.query('BEGIN');
    await client.query(
      'DELETE FROM ris_qc_templates WHERE lab_id = $1 AND modality = $2',
      [req.lab.id, modality]
    );

    let order = 1;
    for (const item of templateItems) {
      const itemKey = String(item?.itemKey || '').trim();
      const itemLabel = String(item?.itemLabel || '').trim();
      if (!itemKey || !itemLabel) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Each template item needs itemKey and itemLabel' });
      }
      await client.query(
        `INSERT INTO ris_qc_templates
          (lab_id, modality, item_key, item_label, required, display_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.lab.id, modality, itemKey, itemLabel, item?.required !== false, Number(item?.displayOrder || order)]
      );
      order += 1;
    }

    await client.query('COMMIT');
    return res.json({ success: true, modality, itemCount: templateItems.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── PUT /:id/qc ─────────────────────────────────────────────────────────────
router.put('/:id/qc', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    const qcStatus = String(req.body?.qcStatus || '').trim();
    const reviewNotes = req.body?.reviewNotes || null;
    const checklistAnswers = Array.isArray(req.body?.checklistAnswers) ? req.body.checklistAnswers : [];
    const reviewedBy = req.body?.reviewedBy || req.lab.labName || req.lab.name || req.lab.email;
    const validQcStatuses = ['Passed', 'Failed', 'NeedsReview'];

    if (!validQcStatuses.includes(qcStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid qcStatus' });
    }

    await client.query('BEGIN');
    const studyCheck = await client.query(
      'SELECT id FROM ris_studies WHERE id = $1 AND lab_id = $2 FOR UPDATE',
      [req.params.id, req.lab.id]
    );
    if (!studyCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const studyMeta = await client.query(
      'SELECT modality FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    const normalizedModality = normalizeModality(studyMeta.rows[0]?.modality || 'OT');
    const templateRows = await client.query(
      `SELECT item_key, required
       FROM ris_qc_templates
       WHERE lab_id = $1 AND modality = $2`,
      [req.lab.id, normalizedModality]
    );
    const checklistValidation = validateChecklistAgainstTemplate(templateRows.rows, checklistAnswers);
    if (qcStatus === 'Passed' && templateRows.rows.length > 0 && !checklistValidation.passed) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Required QC checklist items must pass before setting qcStatus=Passed',
        missingRequiredItems: checklistValidation.missingRequired,
      });
    }

    const qcRow = await client.query(
      `INSERT INTO ris_qc_reviews (study_id, lab_id, qc_status, review_notes, reviewed_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, req.lab.id, qcStatus, reviewNotes, reviewedBy]
    );

    const actor = getActor(req);
    await writeAuditEvent(client, {
      studyId: Number(req.params.id),
      labId: req.lab.id,
      eventType: 'QC_REVIEW_UPDATED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: {
        qcStatus,
        reviewedBy,
        reviewNotes,
        checklistAnswersCount: checklistAnswers.length,
        checklistMissingRequired: checklistValidation.missingRequired,
      },
    });

    await client.query('COMMIT');
    return res.json({ success: true, qcReview: qcRow.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /critical-alerts/summary ───────────────────────────────────────────
router.get('/critical-alerts/summary', authLab, async (req, res) => {
  try {
    const row = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Open')::int         AS open_count,
         COUNT(*) FILTER (WHERE status = 'Escalated')::int    AS escalated_count,
         COUNT(*) FILTER (WHERE status = 'Acknowledged')::int AS acknowledged_count,
         COUNT(*) FILTER (WHERE status = 'Open' AND due_at IS NOT NULL AND due_at < NOW())::int AS overdue_open_count
       FROM ris_critical_value_alerts
       WHERE lab_id = $1`,
      [req.lab.id]
    );

    return res.json({
      success: true,
      summary: row.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /critical-alerts/escalate-overdue ─────────────────────────────────
router.post('/critical-alerts/escalate-overdue', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const overdueRows = await client.query(
      `SELECT id, study_id, status
       FROM ris_critical_value_alerts
       WHERE lab_id = $1
         AND status = 'Open'
         AND due_at IS NOT NULL
         AND due_at < NOW()
       FOR UPDATE`,
      [req.lab.id]
    );

    if (overdueRows.rows.length) {
      await client.query(
        `UPDATE ris_critical_value_alerts
         SET status = 'Escalated',
             updated_at = NOW()
         WHERE lab_id = $1
           AND status = 'Open'
           AND due_at IS NOT NULL
           AND due_at < NOW()`,
        [req.lab.id]
      );

      const actor = getActor(req);
      for (const row of overdueRows.rows) {
        await writeAuditEvent(client, {
          studyId: row.study_id,
          labId: req.lab.id,
          eventType: 'CRITICAL_VALUE_ESCALATED',
          actorId: actor.actorId,
          actorName: actor.actorName,
          details: {
            alertId: row.id,
            fromStatus: row.status,
            toStatus: 'Escalated',
            reason: 'SLA overdue',
          },
        });
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true, escalatedCount: overdueRows.rows.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /cron/health ────────────────────────────────────────────────────────
router.get('/cron/health', authLab, async (_req, res) => {
  try {
    const { getStatus } = await import('../../utils/cronRegistry.js');
    const allTasks = getStatus();
    const labTasks = allTasks.filter((task) => task.key === 'lab_critical_escalation');
    return res.json({
      success: true,
      tasks: labTasks,
      retrievedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /export/evidence-pack ───────────────────────────────────────────────
router.get('/export/evidence-pack', authLab, async (req, res) => {
  try {
    const from = String(req.query?.from || '').trim();
    const to = String(req.query?.to || '').trim();
    const dateFilters = [];
    const params = [req.lab.id];
    let p = 2;

    if (from) {
      dateFilters.push(`s.created_at >= $${p++}`);
      params.push(from);
    }
    if (to) {
      dateFilters.push(`s.created_at <= $${p++}`);
      params.push(to);
    }
    const filterSql = dateFilters.length ? ` AND ${dateFilters.join(' AND ')}` : '';

    const studies = await pool.query(
      `SELECT s.id, s.patient_name, s.modality, s.status, s.report_status, s.created_at, s.updated_at,
              s.reported_by, s.reported_at, s.accession_number
       FROM ris_studies s
       WHERE s.lab_id = $1 ${filterSql}
       ORDER BY s.created_at DESC
       LIMIT 500`,
      params
    );

    const generatedAt = new Date().toISOString();
    const generatedBy = {
      labId: req.lab.id,
      labName: req.lab.labName || req.lab.name || req.lab.email || 'lab-user',
      actor: req.lab.email || req.lab.name || req.lab.labName || 'lab-user',
    };

    const studyIds = studies.rows.map((row) => row.id);
    if (!studyIds.length) {
      const emptyPayload = {
        success: true,
        generatedAt,
        generatedBy,
        filters: { from: from || null, to: to || null },
        summary: { studies: 0, auditEvents: 0, custodyEvents: 0, qcReviews: 0, criticalAlerts: 0, resultContexts: 0 },
        data: {
          studies: [],
          auditEvents: [],
          custodyEvents: [],
          qcReviews: [],
          criticalAlerts: [],
          resultContexts: [],
        },
      };
      const emptyHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ filters: emptyPayload.filters, summary: emptyPayload.summary, data: emptyPayload.data }))
        .digest('hex');

      const signedEmptyPayload = {
        ...emptyPayload,
        signature: {
          algorithm: 'sha256',
          contentHash: emptyHash,
          generatedAt,
          generatedBy,
        },
      };

      const downloadFormat = String(req.query?.download || '').toLowerCase();
      if (downloadFormat === 'csv') {
        const csv = buildEvidenceCsv({
          generatedAt,
          generatedBy,
          summary: signedEmptyPayload.summary,
          filters: signedEmptyPayload.filters,
          studies: [],
          auditEvents: [],
          custodyEvents: [],
          qcReviews: [],
          criticalAlerts: [],
          resultContexts: [],
          signature: signedEmptyPayload.signature,
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="lab-evidence-pack-${Date.now()}-${emptyHash.slice(0, 12)}.csv"`);
        return res.send(csv);
      }
      if (downloadFormat === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="lab-evidence-pack-${Date.now()}-${emptyHash.slice(0, 12)}.json"`);
      }
      return res.json(signedEmptyPayload);
    }

    const [auditEvents, custodyEvents, qcReviews, criticalAlerts, resultContexts] = await Promise.all([
      pool.query(
        `SELECT id, study_id, event_type, actor_id, actor_name, details, created_at
         FROM ris_study_audit_events
         WHERE lab_id = $1 AND study_id = ANY($2::bigint[])
         ORDER BY created_at DESC`,
        [req.lab.id, studyIds]
      ),
      pool.query(
        `SELECT id, study_id, from_status, to_status, reason, actor_id, actor_name, metadata, created_at
         FROM ris_sample_custody_events
         WHERE lab_id = $1 AND study_id = ANY($2::bigint[])
         ORDER BY created_at DESC`,
        [req.lab.id, studyIds]
      ),
      pool.query(
        `SELECT id, study_id, qc_status, review_notes, reviewed_by, reviewed_at
         FROM ris_qc_reviews
         WHERE lab_id = $1 AND study_id = ANY($2::bigint[])
         ORDER BY reviewed_at DESC`,
        [req.lab.id, studyIds]
      ),
      pool.query(
        `SELECT id, study_id, status, alert_reason, value_payload, raised_by, raised_at,
                due_at, acknowledged_by, acknowledged_at, acknowledgment_notes
         FROM ris_critical_value_alerts
         WHERE lab_id = $1 AND study_id = ANY($2::bigint[])
         ORDER BY created_at DESC`,
        [req.lab.id, studyIds]
      ),
      pool.query(
        `SELECT id, study_id, reagent_lot_number, calibration_reference, context_notes, updated_at
         FROM ris_result_context
         WHERE lab_id = $1 AND study_id = ANY($2::bigint[])
         ORDER BY updated_at DESC`,
        [req.lab.id, studyIds]
      ),
    ]);

    const payload = {
      success: true,
      generatedAt,
      generatedBy,
      filters: { from: from || null, to: to || null },
      summary: {
        studies: studies.rows.length,
        auditEvents: auditEvents.rows.length,
        custodyEvents: custodyEvents.rows.length,
        qcReviews: qcReviews.rows.length,
        criticalAlerts: criticalAlerts.rows.length,
        resultContexts: resultContexts.rows.length,
      },
      data: {
        studies: studies.rows,
        auditEvents: auditEvents.rows,
        custodyEvents: custodyEvents.rows,
        qcReviews: qcReviews.rows,
        criticalAlerts: criticalAlerts.rows,
        resultContexts: resultContexts.rows,
      },
    };

    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ filters: payload.filters, summary: payload.summary, data: payload.data }))
      .digest('hex');

    payload.signature = {
      algorithm: 'sha256',
      contentHash,
      generatedAt,
      generatedBy,
    };

    const downloadFormat = String(req.query?.download || '').toLowerCase();
    if (downloadFormat === 'csv') {
      const csv = buildEvidenceCsv({
        generatedAt,
        generatedBy,
        summary: payload.summary,
        filters: payload.filters,
        studies: payload.data.studies,
        auditEvents: payload.data.auditEvents,
        custodyEvents: payload.data.custodyEvents,
        qcReviews: payload.data.qcReviews,
        criticalAlerts: payload.data.criticalAlerts,
        resultContexts: payload.data.resultContexts,
        signature: payload.signature,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="lab-evidence-pack-${Date.now()}-${contentHash.slice(0, 12)}.csv"`);
      return res.send(csv);
    }
    if (downloadFormat === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="lab-evidence-pack-${Date.now()}-${contentHash.slice(0, 12)}.json"`);
    }
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /:id/result-context ────────────────────────────────────────────────
router.put('/:id/result-context', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    const reagentLotNumber = String(req.body?.reagentLotNumber || '').trim();
    const calibrationReference = String(req.body?.calibrationReference || '').trim();
    const contextNotes = req.body?.contextNotes || null;

    if (!reagentLotNumber || !calibrationReference) {
      return res.status(400).json({
        success: false,
        message: 'reagentLotNumber and calibrationReference are required',
      });
    }

    await client.query('BEGIN');
    const studyCheck = await client.query(
      'SELECT id FROM ris_studies WHERE id = $1 AND lab_id = $2 FOR UPDATE',
      [req.params.id, req.lab.id]
    );
    if (!studyCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const ctxRow = await client.query(
      `INSERT INTO ris_result_context (study_id, lab_id, reagent_lot_number, calibration_reference, context_notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (study_id)
       DO UPDATE SET
         reagent_lot_number = EXCLUDED.reagent_lot_number,
         calibration_reference = EXCLUDED.calibration_reference,
         context_notes = EXCLUDED.context_notes,
         updated_at = NOW()
       RETURNING *`,
      [req.params.id, req.lab.id, reagentLotNumber, calibrationReference, contextNotes]
    );

    const actor = getActor(req);
    await writeAuditEvent(client, {
      studyId: Number(req.params.id),
      labId: req.lab.id,
      eventType: 'RESULT_CONTEXT_UPDATED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: {
        reagentLotNumber,
        calibrationReference,
      },
    });

    await client.query('COMMIT');
    return res.json({ success: true, context: ctxRow.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── GET /:id/critical-alerts ───────────────────────────────────────────────
router.get('/:id/critical-alerts', authLab, async (req, res) => {
  try {
    const studyCheck = await pool.query(
      'SELECT id FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    if (!studyCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const alerts = await pool.query(
      `SELECT id, study_id, status, alert_reason, value_payload, raised_by, raised_at,
              due_at, acknowledged_by, acknowledged_at, acknowledgment_notes, updated_at
       FROM ris_critical_value_alerts
       WHERE study_id = $1 AND lab_id = $2
       ORDER BY created_at DESC`,
      [req.params.id, req.lab.id]
    );

    return res.json({ success: true, alerts: alerts.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:id/critical-alerts ──────────────────────────────────────────────
router.post('/:id/critical-alerts', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    const alertReason = String(req.body?.alertReason || '').trim();
    const valuePayload = req.body?.valuePayload || {};
    const raisedBy = req.body?.raisedBy || req.lab.labName || req.lab.name || req.lab.email;
    const forceOverdue = req.body?.forceOverdue === true;
    const dueMinutes = Number.isFinite(Number(req.body?.dueMinutes)) ? Number(req.body.dueMinutes) : 30;

    if (!alertReason) {
      return res.status(400).json({ success: false, message: 'alertReason is required' });
    }

    await client.query('BEGIN');
    const studyCheck = await client.query(
      'SELECT id FROM ris_studies WHERE id = $1 AND lab_id = $2 FOR UPDATE',
      [req.params.id, req.lab.id]
    );
    if (!studyCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const dueAtExpr = forceOverdue
      ? `NOW() - INTERVAL '1 minute'`
      : `NOW() + ($6::text || ' minutes')::interval`;
    const alertSql = `INSERT INTO ris_critical_value_alerts
        (study_id, lab_id, alert_reason, value_payload, status, raised_by, due_at)
       VALUES ($1, $2, $3, $4::jsonb, 'Open', $5, ${dueAtExpr})
       RETURNING *`;
    const alertParams = forceOverdue
      ? [req.params.id, req.lab.id, alertReason, JSON.stringify(valuePayload), raisedBy]
      : [req.params.id, req.lab.id, alertReason, JSON.stringify(valuePayload), raisedBy, String(Math.max(5, dueMinutes))];
    const alertRow = await client.query(alertSql, alertParams);

    const actor = getActor(req);
    await writeAuditEvent(client, {
      studyId: Number(req.params.id),
      labId: req.lab.id,
      eventType: 'CRITICAL_VALUE_RAISED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: {
        alertId: alertRow.rows[0].id,
        alertReason,
      },
    });

    await client.query('COMMIT');
    return res.status(201).json({ success: true, alert: alertRow.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── PUT /critical-alerts/:alertId/ack ──────────────────────────────────────
router.put('/critical-alerts/:alertId/ack', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    const status = String(req.body?.status || 'Acknowledged').trim();
    const acknowledgmentNotes = req.body?.acknowledgmentNotes || null;
    const acknowledgedBy = req.body?.acknowledgedBy || req.lab.labName || req.lab.name || req.lab.email;

    if (!CRITICAL_VALUE_ALERT_STATUSES.includes(status) || status === 'Open') {
      return res.status(400).json({ success: false, message: 'Invalid acknowledgment status' });
    }

    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id, study_id, status
       FROM ris_critical_value_alerts
       WHERE id = $1 AND lab_id = $2
       FOR UPDATE`,
      [req.params.alertId, req.lab.id]
    );
    if (!current.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const alert = await client.query(
      `UPDATE ris_critical_value_alerts
       SET status = $1,
           acknowledged_by = $2,
           acknowledged_at = NOW(),
           acknowledgment_notes = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, acknowledgedBy, acknowledgmentNotes, req.params.alertId]
    );

    const actor = getActor(req);
    await writeAuditEvent(client, {
      studyId: current.rows[0].study_id,
      labId: req.lab.id,
      eventType: 'CRITICAL_VALUE_ACKNOWLEDGED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: {
        alertId: Number(req.params.alertId),
        fromStatus: current.rows[0].status,
        toStatus: status,
      },
    });

    await client.query('COMMIT');
    return res.json({ success: true, alert: alert.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── PUT /:id/status ─────────────────────────────────────────────────────────
router.put('/:id/status', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    if (!VALID_STUDY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    await client.query('BEGIN');

    const currentRes = await client.query(
      `SELECT id, status
       FROM ris_studies
       WHERE id = $1 AND lab_id = $2
       FOR UPDATE`,
      [req.params.id, req.lab.id]
    );
    if (!currentRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const currentStatus = currentRes.rows[0].status;
    if (currentStatus === status) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'Status unchanged', study: currentRes.rows[0] });
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${currentStatus} to ${status}`,
      });
    }

    const row = await client.query(
      `UPDATE ris_studies
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND lab_id = $3
       RETURNING *`,
      [status, req.params.id, req.lab.id]
    );

    const actor = getActor(req);
    await writeAuditEvent(client, {
      studyId: row.rows[0].id,
      labId: req.lab.id,
      eventType: 'STATUS_CHANGED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: { fromStatus: currentStatus, toStatus: status },
    });
    await writeCustodyEvent(client, {
      studyId: row.rows[0].id,
      labId: req.lab.id,
      fromStatus: currentStatus,
      toStatus: status,
      reason: req.body?.reason || 'Status updated',
      actorId: actor.actorId,
      actorName: actor.actorName,
    });

    await client.query('COMMIT');
    return res.json({ success: true, study: row.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── PUT /:id/report ─────────────────────────────────────────────────────────
router.put('/:id/report', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    const { reportText, reportStatus = 'Final', reportedBy, criticalValue } = req.body;
    if (!VALID_REPORT_STATUSES.includes(reportStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid report status' });
    }
    if ((reportStatus === 'Final' || reportStatus === 'Addendum') && !String(reportText || '').trim()) {
      return res.status(400).json({ success: false, message: 'reportText is required for final report states' });
    }

    await client.query('BEGIN');

    const currentRes = await client.query(
      `SELECT id, status, report_status
       FROM ris_studies
       WHERE id = $1 AND lab_id = $2
       FOR UPDATE`,
      [req.params.id, req.lab.id]
    );
    if (!currentRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const current = currentRes.rows[0];
    if ((reportStatus === 'Final' || reportStatus === 'Addendum') && !['Completed', 'Reported'].includes(current.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Final reports are allowed only after study is Completed',
      });
    }

    if (reportStatus === 'Final') {
      const latestQc = await getLatestQcReview(client, req.params.id, req.lab.id);
      if (!latestQc || latestQc.qc_status !== 'Passed') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'QC pass is required before finalizing report',
        });
      }

      const resultContext = await getResultContext(client, req.params.id, req.lab.id);
      if (!resultContext?.reagent_lot_number || !resultContext?.calibration_reference) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Result context with reagentLotNumber and calibrationReference is required before finalizing',
        });
      }
    }

    const nextStudyStatus = (reportStatus === 'Final' || reportStatus === 'Addendum')
      ? 'Reported'
      : current.status;

    const row = await client.query(
      `UPDATE ris_studies
       SET report_text = COALESCE($1, report_text),
           report_status = $2,
           reported_by = $3,
           reported_at = NOW(),
           status = $4,
           updated_at = NOW()
       WHERE id = $5 AND lab_id = $6
       RETURNING *`,
      [reportText || null, reportStatus, reportedBy || req.lab.labName, nextStudyStatus, req.params.id, req.lab.id]
    );

    const actor = getActor(req);
    await writeAuditEvent(client, {
      studyId: row.rows[0].id,
      labId: req.lab.id,
      eventType: 'REPORT_UPDATED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: {
        fromReportStatus: current.report_status,
        toReportStatus: reportStatus,
      },
    });

    if (criticalValue?.enabled === true) {
      const alertReason = String(criticalValue?.reason || 'Critical value in finalized report').trim();
      if (alertReason) {
        const dueMinutes = Number.isFinite(Number(criticalValue?.dueMinutes))
          ? Number(criticalValue.dueMinutes)
          : 30;
        const alertRow = await client.query(
          `INSERT INTO ris_critical_value_alerts
            (study_id, lab_id, alert_reason, value_payload, status, raised_by, due_at)
           VALUES ($1, $2, $3, $4::jsonb, 'Open', $5, NOW() + ($6::text || ' minutes')::interval)
           RETURNING id`,
          [
            req.params.id,
            req.lab.id,
            alertReason,
            JSON.stringify(criticalValue?.payload || {}),
            reportedBy || req.lab.labName || req.lab.name || req.lab.email,
            String(Math.max(5, dueMinutes)),
          ]
        );

        await writeAuditEvent(client, {
          studyId: row.rows[0].id,
          labId: req.lab.id,
          eventType: 'CRITICAL_VALUE_RAISED',
          actorId: actor.actorId,
          actorName: actor.actorName,
          details: {
            alertId: alertRow.rows[0].id,
            alertReason,
          },
        });
      }
    }

    if (current.status !== nextStudyStatus) {
      await writeCustodyEvent(client, {
        studyId: row.rows[0].id,
        labId: req.lab.id,
        fromStatus: current.status,
        toStatus: nextStudyStatus,
        reason: `Report moved to ${reportStatus}`,
        actorId: actor.actorId,
        actorName: actor.actorName,
        metadata: { reportStatus },
      });
    }

    await client.query('COMMIT');
    const saved = row.rows[0];
    const topic = reportStatus === 'Final'
      ? KAFKA_TOPICS.IMAGING_REPORT_FINALIZED
      : KAFKA_TOPICS.IMAGING_REPORT_DRAFTED;
    publishEvent(topic, {
      studyId: saved.id,
      studyInstanceUID: saved.study_instance_uid,
      tenantId: req.lab.id,
      reportStatus,
    }).catch(() => {});
    if (reportStatus === 'Draft' || reportStatus === 'Final') {
      indexStudyDocument({
        tenantId: req.lab.id,
        studyInstanceUID: saved.study_instance_uid,
        patientName: saved.patient_name,
        modality: saved.modality,
        studyDate: saved.study_date,
        reportText: saved.report_text,
        impression: saved.report_text,
      }).catch(() => {});
    }
    return res.json({ success: true, study: saved });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', authLab, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const row = await client.query(
      'SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    if (!row.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const study = row.rows[0];
    const actor = getActor(req);
    await writeAuditEvent(client, {
      studyId: study.id,
      labId: req.lab.id,
      eventType: 'STUDY_DELETED',
      actorId: actor.actorId,
      actorName: actor.actorName,
      details: { status: study.status, filePath: study.file_path },
    });

    if (study.file_path) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: study.file_path })).catch(() => {});
    }
    await client.query('DELETE FROM ris_studies WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[RIS] Delete error:', err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

export default router;
