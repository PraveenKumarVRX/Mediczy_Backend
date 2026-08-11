/**
 * Doctor RIS — Read-Only Access to Lab-Referred Studies
 *
 * GET  /api/doctors/ris-referred              — list studies referred to this doctor
 * GET  /api/doctors/ris-referred/:id          — study metadata + report
 * GET  /api/doctors/ris-referred/file/:id     — serve imaging file (authenticated)
 *
 * Only studies where referring_doctor_id = authenticated doctor's ID are returned.
 */
import express from 'express';
import path    from 'path';
import fs      from 'fs';
import { fileURLToPath } from 'url';
import { authUser as authDoctor } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';
import { expandModalityFilter } from '../utils/imaging-modality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router    = express.Router();

const STUDY_COLS = `
  id, lab_id, patient_name, patient_sex, patient_dob,
  accession_number, study_instance_uid,
  modality, body_part, study_description,
  referring_physician, referring_doctor_id, referring_doctor_name,
  study_date, priority, status,
  file_name, mime_type, file_size, is_dicom,
  report_text, report_status, reported_by, reported_at,
  notes, image_count, series_count, created_at
`;

// ─── GET /api/doctors/ris-referred ───────────────────────────────────────────
router.get('/', authDoctor, async (req, res) => {
  try {
    const doctorId = req.user?.id;
    if (!doctorId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const {
      modality, status, patientName,
      from, to, page = 1, limit = 50,
    } = req.query;

    const conditions = ['referring_doctor_id = $1'];
    const params     = [doctorId];
    let p = 2;

    if (modality) {
      const mods = expandModalityFilter(modality);
      conditions.push(`UPPER(TRIM(modality)) = ANY($${p++}::text[])`);
      params.push(mods);
    }
    if (status)      { conditions.push(`status = $${p++}`);             params.push(status); }
    if (patientName) { conditions.push(`patient_name ILIKE $${p++}`);   params.push(`%${patientName}%`); }
    if (from)        { conditions.push(`study_date >= $${p++}`);        params.push(from); }
    if (to)          { conditions.push(`study_date <= $${p++}`);        params.push(to); }

    const where  = conditions.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT ${STUDY_COLS}
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
      total:   parseInt(countRes.rows[0].count),
      page:    parseInt(page),
      limit:   parseInt(limit),
    });
  } catch (err) {
    console.error('[DoctorRIS] List error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/doctors/ris-referred/file/:id ──────────────────────────────────
// Must come BEFORE /:id to avoid route shadowing
router.get('/file/:id', authDoctor, async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const row = await pool.query(
      'SELECT * FROM ris_studies WHERE id = $1 AND referring_doctor_id = $2',
      [req.params.id, doctorId]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const study   = row.rows[0];
    const absPath = path.join(__dirname, '../../', study.file_path);
    if (!fs.existsSync(absPath)) return res.status(404).json({ success: false, message: 'File missing' });

    res.setHeader('Content-Type', study.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${study.file_name}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(absPath);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/doctors/ris-referred/:id ───────────────────────────────────────
router.get('/:id', authDoctor, async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const row = await pool.query(
      `SELECT ${STUDY_COLS} FROM ris_studies WHERE id = $1 AND referring_doctor_id = $2`,
      [req.params.id, doctorId]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, study: row.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
