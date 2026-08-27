/**
 * Doctor RIS — Access to Lab-Referred Studies
 *
 * GET  /api/doctors/ris-referred              — list studies referred to this doctor
 * GET  /api/doctors/ris-referred/:id          — study metadata + report
 * GET  /api/doctors/ris-referred/file/:id     — serve imaging file (authenticated)
 * PUT  /api/doctors/ris-referred/:id/report   — save Draft, or sign & finalize the report
 *
 * Only studies where referring_doctor_id = authenticated doctor's ID are accessible.
 * Finalizing (Final) requires the doctor to have a medical registration number
 * on file and to explicitly certify the report — the report is stamped with a
 * signature hash binding the doctor's identity, registration number, report
 * content, and timestamp, the same seal-of-record a radiologist/medical
 * director puts on a signed report. The lab's own QC/reagent gates (built for
 * pathology instruments) don't apply to an imaging read, so they're skipped
 * here. In their place, finalizing re-runs the imaging evidence-grounding
 * gate against the exact text being signed (not just the originally
 * generated draft) — every pathology named in the report must trace back to
 * a structured evidence item, and every stated measurement must match. A
 * blocked report can still be signed with an explicit, audited override —
 * the qualified clinician's judgment stays final — but it can never be
 * signed silently.
 */
import express from 'express';
import path    from 'path';
import fs      from 'fs';
import crypto  from 'crypto';
import { fileURLToPath } from 'url';
import { authUser as authDoctor } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';
import { expandModalityFilter } from '../utils/imaging-modality.js';
import { writeAuditEvent, writeCustodyEvent } from './lab/ris-imaging.route.js';
import { onReportDraftSaved, onReportFinalized } from '../services/imaging/imaging-workflow-hooks.service.js';
import { indexStudyDocument } from '../services/imaging/imaging-search.service.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';
import { getLatestDraft } from '../services/imaging/imaging-report-drafter.service.js';
import qualityGates from '../services/ai-quality-gates.service.js';

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

// ─── GET /api/doctors/ris-referred/by-study/:studyInstanceUID ────────────────
// Direct-link lookup for the 3D/CDSS workspace. Still scoped to the
// authenticated doctor's referred studies only.
router.get('/by-study/:studyInstanceUID', authDoctor, async (req, res) => {
  try {
    const doctorId = req.user?.id;
    if (!doctorId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const studyUID = String(req.params.studyInstanceUID || '').trim().replace(/,+$/g, '').trim();
    if (!studyUID) return res.status(400).json({ success: false, message: 'studyInstanceUID required' });

    const row = await pool.query(
      `SELECT ${STUDY_COLS}
       FROM ris_studies
       WHERE study_instance_uid = $1 AND referring_doctor_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [studyUID, doctorId]
    );
    if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, study: row.rows[0] });
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

const DOCTOR_ALLOWED_REPORT_STATUSES = ['Draft', 'Final'];

router.put('/:id/report', authDoctor, async (req, res) => {
  const doctorId = req.user?.id;
  if (!doctorId) return res.status(401).json({ success: false, message: 'Not authenticated' });

  const client = await pool.connect();
  try {
    const { reportText, reportStatus = 'Draft', certify, overrideBlockers, overrideReason } = req.body || {};
    if (!DOCTOR_ALLOWED_REPORT_STATUSES.includes(reportStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid report status' });
    }
    const finalizing = reportStatus === 'Final';
    if (finalizing && !String(reportText || '').trim()) {
      return res.status(400).json({ success: false, message: 'reportText is required to finalize a report' });
    }
    if (finalizing && !certify) {
      return res.status(400).json({
        success: false,
        message: 'Certification required to finalize — confirm "I certify this report" before signing.',
      });
    }
    const registrationNumber = req.user?.registrationNumber;
    if (finalizing && !String(registrationNumber || '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'Add your medical registration number to your profile before signing a final report.',
      });
    }

    await client.query('BEGIN');

    const currentRes = await client.query(
      `SELECT id, lab_id, status, report_status, modality
       FROM ris_studies
       WHERE id = $1 AND referring_doctor_id = $2
       FOR UPDATE`,
      [req.params.id, doctorId]
    );
    if (!currentRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const current = currentRes.rows[0];
    const labId = current.lab_id;

    if (finalizing && !['Completed', 'Reported'].includes(current.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'A report can only be finalized once the study is Completed',
      });
    }

    let gateResult = null;
    if (finalizing) {
      const latestDraft = await getLatestDraft(current.id, labId).catch(() => null);
      gateResult = await qualityGates.checkImagingReport({
        studyId: current.id,
        modality: current.modality,
        draftText: reportText,
        structuredFindings: latestDraft?.structured_findings || null,
        confidence: latestDraft?.confidence_score != null ? Number(latestDraft.confidence_score) : null,
        triageStatus: null,
      });
      qualityGates.logGateResult(gateResult, {
        source: 'imaging_report_finalize_doctor', studyId: current.id, tenantId: labId,
      }).catch(() => {});

      if (gateResult.hasBlockers) {
        if (!overrideBlockers || !String(overrideReason || '').trim()) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Report failed safety verification and cannot be signed as-is',
            blockers: gateResult.blockers,
            requiresOverride: true,
          });
        }
      }
    }

    const doctorName = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ')
      || req.user?.name || req.user?.email || 'referring-doctor';
    const nextStudyStatus = finalizing ? 'Reported' : current.status;

    let reportedBy = doctorName;
    let signatureHash = null;
    let signedAt = null;
    if (finalizing) {
      const signedAtIso = new Date().toISOString();
      signatureHash = crypto.createHash('sha256')
        .update(`${current.id}|${doctorId}|${registrationNumber}|${reportText}|${signedAtIso}`)
        .digest('hex');
      signedAt = signedAtIso;
      reportedBy = `Dr. ${doctorName} (Reg. No. ${registrationNumber})`;
    }

    const row = await client.query(
      `UPDATE ris_studies
       SET report_text = COALESCE($1, report_text),
           report_status = $2,
           reported_by = $3,
           reported_at = NOW(),
           status = $4,
           report_signed_by_id = CASE WHEN $5 THEN $6 ELSE report_signed_by_id END,
           report_signed_by_name = CASE WHEN $5 THEN $7 ELSE report_signed_by_name END,
           report_signed_by_registration = CASE WHEN $5 THEN $8 ELSE report_signed_by_registration END,
           report_signature_hash = CASE WHEN $5 THEN $9 ELSE report_signature_hash END,
           report_signed_at = CASE WHEN $5 THEN $10::timestamptz ELSE report_signed_at END,
           updated_at = NOW()
       WHERE id = $11 AND referring_doctor_id = $6
       RETURNING *`,
      [
        reportText || null, reportStatus, reportedBy, nextStudyStatus,
        finalizing, doctorId, doctorName, registrationNumber || null, signatureHash, signedAt,
        req.params.id,
      ]
    );

    await writeAuditEvent(client, {
      studyId: row.rows[0].id,
      labId,
      eventType: 'REPORT_UPDATED',
      actorId: doctorId,
      actorName: doctorName,
      details: {
        fromReportStatus: current.report_status,
        toReportStatus: reportStatus,
        actorRole: 'referring_doctor',
        signed: finalizing,
        ...(gateResult?.hasBlockers ? {
          safetyGateBlockers: gateResult.blockers,
          safetyGateOverridden: true,
          overrideReason,
        } : {}),
      },
    });

    if (current.status !== nextStudyStatus) {
      await writeCustodyEvent(client, {
        studyId: row.rows[0].id,
        labId,
        fromStatus: current.status,
        toStatus: nextStudyStatus,
        reason: 'Report signed and finalized by referring doctor',
        actorId: doctorId,
        actorName: doctorName,
        metadata: { reportStatus, registrationNumber },
      });
    }

    await client.query('COMMIT');
    const saved = row.rows[0];
    const hookCtx = { study: saved, tenantId: labId, actorId: doctorId, actorName: doctorName };
    if (finalizing) {
      onReportFinalized(hookCtx).catch((e) => console.warn('[DoctorRIS] workflow finalize:', e?.message));
    } else {
      onReportDraftSaved({ studyId: saved.id, ...hookCtx, reportText: saved.report_text }).catch(() => {});
    }
    publishEvent(
      finalizing ? KAFKA_TOPICS.IMAGING_REPORT_FINALIZED : KAFKA_TOPICS.IMAGING_REPORT_DRAFTED,
      {
        studyId: saved.id,
        studyInstanceUID: saved.study_instance_uid,
        tenantId: labId,
        reportStatus,
      },
    ).catch(() => {});
    indexStudyDocument({
      tenantId: labId,
      studyInstanceUID: saved.study_instance_uid,
      patientName: saved.patient_name,
      modality: saved.modality,
      studyDate: saved.study_date,
      reportText: saved.report_text,
      impression: saved.report_text,
    }).catch(() => {});
    return res.json({ success: true, study: saved });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

export default router;
