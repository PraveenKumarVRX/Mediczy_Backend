/**
 * Lab RIS Imaging Routes — PACS / DICOM
 *
 * POST   /api/lab/ris/upload          — upload DICOM / image / video
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

const router = express.Router();

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
    CREATE INDEX IF NOT EXISTS idx_ris_study_date ON ris_studies(study_date DESC);
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

// ─── Helper: extract DICOM tags from buffer ───────────────────────────────────
const parseDicomTags = (filePath) => {
  try {
    // Dynamic import to avoid ESM issues with older dicom-parser
    const buf = fs.readFileSync(filePath);
    // Simple DICOM header check (starts with 128-byte preamble + DICM magic)
    const isDicom = buf.length > 132 &&
      buf[128] === 0x44 && buf[129] === 0x49 &&
      buf[130] === 0x43 && buf[131] === 0x4D;
    if (!isDicom) return { isDicom: false, tags: {} };

    // Read key tags manually (avoid dependency issues)
    const tags = {};
    const getText = (offset, len) => {
      try { return buf.slice(offset, offset + len).toString('ascii').trim().replace(/\0/g,''); }
      catch { return ''; }
    };
    // Return basic info — client-side cornerstone handles full parsing
    return { isDicom: true, tags };
  } catch {
    return { isDicom: false, tags: {} };
  }
};

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

    const { isDicom, tags } = parseDicomTags(req.file.path);

    // Upload from /tmp to S3
    const ext    = path.extname(req.file.originalname) || '';
    const s3Key  = `ris/${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    await s3Client.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      Body:        fs.createReadStream(req.file.path),
      ContentType: req.file.mimetype || 'application/octet-stream',
    }));
    fs.unlink(req.file.path, () => {});

    const result = await pool.query(`
      INSERT INTO ris_studies
        (lab_id, patient_name, patient_dob, patient_sex,
         accession_number, study_instance_uid,
         modality, body_part, study_description, referring_physician,
         referring_doctor_id, referring_doctor_name,
         study_date, study_time, priority,
         file_name, original_name, file_path, file_size, mime_type,
         is_dicom, dicom_tags, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *
    `, [
      req.lab.id,
      patientName.trim(),
      patientDob || null,
      (patientSex || 'U').charAt(0).toUpperCase(),
      accessionNumber || `ACC-${Date.now()}`,
      studyInstanceUid || `1.2.3.${Date.now()}`,
      modality.toUpperCase(),
      bodyPart || null,
      studyDescription || null,
      referringPhysician || null,
      referringDoctorId ? parseInt(referringDoctorId) : null,
      referringDoctorName || null,
      studyDate || new Date().toISOString().slice(0,10),
      studyTime || null,
      priority,
      s3Key,
      req.file.originalname,
      s3Key,           // file_path now stores S3 key
      req.file.size,
      req.file.mimetype,
      isDicom,
      JSON.stringify(tags),
      notes || null,
    ]);

    return res.status(201).json({ success: true, study: result.rows[0] });
  } catch (err) {
    console.error('[RIS] Upload error:', err);
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
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

// ─── PUT /:id/status ─────────────────────────────────────────────────────────
router.put('/:id/status', authLab, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['Ordered','Scheduled','InProgress','Completed','Reported','Cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const row = await pool.query(
      `UPDATE ris_studies SET status = $1, updated_at = NOW()
       WHERE id = $2 AND lab_id = $3 RETURNING *`,
      [status, req.params.id, req.lab.id]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, study: row.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /:id/report ─────────────────────────────────────────────────────────
router.put('/:id/report', authLab, async (req, res) => {
  try {
    const { reportText, reportStatus = 'Final', reportedBy } = req.body;
    const row = await pool.query(
      `UPDATE ris_studies
       SET report_text = $1, report_status = $2, reported_by = $3,
           reported_at = NOW(), status = 'Reported', updated_at = NOW()
       WHERE id = $4 AND lab_id = $5 RETURNING *`,
      [reportText, reportStatus, reportedBy || req.lab.labName, req.params.id, req.lab.id]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, study: row.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', authLab, async (req, res) => {
  try {
    const row = await pool.query(
      'SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2',
      [req.params.id, req.lab.id]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const study = row.rows[0];
    if (study.file_path) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: study.file_path })).catch(() => {});
    }
    await pool.query('DELETE FROM ris_studies WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('[RIS] Delete error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
