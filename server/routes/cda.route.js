/**
 * CDA R2 Document API
 *
 * POST /api/cda/discharge-summary/:admissionId   Generate discharge summary
 * POST /api/cda/referral/:appointmentId          Generate referral note
 * POST /api/cda/ccd/:patientId                  Generate Continuity of Care Document
 * POST /api/cda/imaging-report/:studyId          Generate imaging report CDA
 * GET  /api/cda/documents/:patientId             List CDA documents for patient
 * GET  /api/cda/documents/detail/:id             Get single CDA document (metadata)
 * GET  /api/cda/documents/download/:id           Download CDA XML
 * GET  /api/cda/documents/validate/:id           Validate stored CDA XML
 *
 * Standards: HL7 CDA R2, IHE PCC, ABDM PHR App
 */

import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';
import {
  ensureCdaTables,
  generateDischargeSummary,
  generateReferralNote,
  generateCCD,
  generateImagingReport,
  saveCdaDocument,
  listCdaDocuments,
  getCdaDocument,
  validateCdaXml,
} from '../services/cda-r2.service.js';

const router = Router();

// Checked by each handler through the service; calling it at import made the
// router unmountable wherever the pool is mocked.

router.use(authUser);

const tenantId = (req) => req.user?.tenant_id || req.user?.organization_id || req.user?.id;

// ── Fetch patient record ──────────────────────────────────────────────────────
async function fetchPatient(patientId) {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, date_of_birth, gender, phone, email,
            address, city, state, abha_id, abha_number
     FROM users WHERE id = $1`,
    [patientId]
  );
  return rows[0] || null;
}

async function fetchDoctor(doctorId) {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, specialization, registration_number
     FROM doctors WHERE id = $1`,
    [doctorId]
  );
  return rows[0] || null;
}

async function fetchHospital(tenantId) {
  if (!tenantId) return { name: 'Mediczy Healthcare' };
  const { rows } = await pool.query(
    'SELECT id, name, city, phone FROM tenants WHERE id = $1',
    [tenantId]
  );
  return rows[0] || { name: 'Mediczy Healthcare' };
}

// ── Discharge Summary ─────────────────────────────────────────────────────────
router.post('/discharge-summary/:admissionId', async (req, res) => {
  try {
    const admissionId = Number(req.params.admissionId);
    const { rows: admRows } = await pool.query(
      'SELECT * FROM admissions WHERE id = $1',
      [admissionId]
    );
    const admission = admRows[0];
    if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });

    const [patient, doctor, hospital] = await Promise.all([
      fetchPatient(admission.patient_id),
      fetchDoctor(admission.admitting_doctor_id || req.user?.doctorId),
      fetchHospital(tenantId(req)),
    ]);

    const { rows: dxRows } = await pool.query(
      `SELECT condition AS diagnosis, icd10_code FROM patient_conditions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [admission.patient_id]
    );
    const { rows: rxRows } = await pool.query(
      `SELECT pm.name, pm.composition, pm.dosage, pm.frequency FROM prescription_medications pm
       JOIN prescriptions p ON p.id = pm.prescription_id
       WHERE p.patient_id = $1 ORDER BY p.created_at DESC LIMIT 10`,
      [admission.patient_id]
    );
    const { rows: vtRows } = await pool.query(
      'SELECT bp, heart_rate, temperature, spo2, weight, height FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [admission.patient_id]
    );
    const { rows: alRows } = await pool.query(
      `SELECT unnest(allergies) AS allergen FROM users WHERE id = $1`,
      [admission.patient_id]
    );

    const result = generateDischargeSummary({
      patient, doctor, hospital, admission,
      diagnoses: dxRows,
      medications: rxRows,
      vitals: vtRows[0] || {},
      allergies: alRows.map(r => r.allergen),
      summaryText: req.body.summaryText || admission.summary || '',
    });

    const saved = await saveCdaDocument({
      tenantId: tenantId(req), patientId: admission.patient_id,
      documentType: 'discharge_summary', loincCode: '18842-5',
      cdaId: result.docId, xml: result.xml,
      referenceId: admissionId, referenceType: 'admission',
      generatedBy: req.user?.id,
    });

    res.status(201).json({ success: true, document: { id: saved.id, cdaId: result.docId, documentType: 'discharge_summary', generatedAt: saved.generated_at } });
  } catch (err) {
    console.error('[CDA] Discharge summary error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Referral Note ─────────────────────────────────────────────────────────────
router.post('/referral/:appointmentId', async (req, res) => {
  try {
    const appointmentId = Number(req.params.appointmentId);
    const { rows: apptRows } = await pool.query(
      'SELECT * FROM appointments WHERE id = $1',
      [appointmentId]
    );
    const appt = apptRows[0];
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

    const [patient, doctor, hospital] = await Promise.all([
      fetchPatient(appt.patient_id),
      fetchDoctor(appt.doctor_id),
      fetchHospital(tenantId(req)),
    ]);

    const { rows: dxRows } = await pool.query(
      `SELECT condition AS diagnosis, icd10_code FROM patient_conditions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [appt.patient_id]
    );
    const { rows: rxRows } = await pool.query(
      `SELECT pm.name, pm.composition, pm.dosage, pm.frequency FROM prescription_medications pm
       JOIN prescriptions p ON p.id = pm.prescription_id
       WHERE p.appointment_id = $1 ORDER BY p.created_at DESC LIMIT 5`,
      [appointmentId]
    );
    const { rows: alRows } = await pool.query(
      `SELECT unnest(allergies) AS allergen FROM users WHERE id = $1`, [appt.patient_id]
    );

    const result = generateReferralNote({
      patient, doctor, hospital, appointment: appt,
      diagnoses: dxRows, medications: rxRows,
      allergies: alRows.map(r => r.allergen),
      referralReason: req.body.referralReason || appt.reason || '',
      urgency: req.body.urgency || 'routine',
    });

    const saved = await saveCdaDocument({
      tenantId: tenantId(req), patientId: appt.patient_id,
      documentType: 'referral_note', loincCode: '57133-1',
      cdaId: result.docId, xml: result.xml,
      referenceId: appointmentId, referenceType: 'appointment',
      generatedBy: req.user?.id,
    });

    res.status(201).json({ success: true, document: { id: saved.id, cdaId: result.docId, documentType: 'referral_note', generatedAt: saved.generated_at } });
  } catch (err) {
    console.error('[CDA] Referral error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CCD (Continuity of Care) ──────────────────────────────────────────────────
router.post('/ccd/:patientId', async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    const [patient, doctor, hospital] = await Promise.all([
      fetchPatient(patientId),
      fetchDoctor(req.user?.doctorId || null),
      fetchHospital(tenantId(req)),
    ]);
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

    const [{ rows: dxRows }, { rows: rxRows }, { rows: vtRows }, { rows: alRows }, { rows: lbRows }] = await Promise.all([
      pool.query(`SELECT condition AS diagnosis, icd10_code FROM patient_conditions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10`, [patientId]),
      pool.query(`SELECT pm.name, pm.composition, pm.dosage, pm.frequency FROM prescription_medications pm JOIN prescriptions p ON p.id = pm.prescription_id WHERE p.patient_id = $1 ORDER BY p.created_at DESC LIMIT 10`, [patientId]),
      pool.query(`SELECT bp, heart_rate, temperature, spo2, weight, height FROM patient_vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [patientId]),
      pool.query(`SELECT unnest(allergies) AS allergen FROM users WHERE id = $1`, [patientId]),
      pool.query(`SELECT test_name, result_value AS result, unit, interpretation FROM lab_results WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10`, [patientId]),
    ]);

    const result = generateCCD({
      patient, doctor, hospital,
      diagnoses: dxRows, medications: rxRows,
      vitals: vtRows[0] || {}, allergies: alRows.map(r => r.allergen),
      labResults: lbRows,
    });

    const saved = await saveCdaDocument({
      tenantId: tenantId(req), patientId,
      documentType: 'ccd', loincCode: '34133-9',
      cdaId: result.docId, xml: result.xml,
      referenceId: patientId, referenceType: 'patient',
      generatedBy: req.user?.id,
    });

    res.status(201).json({ success: true, document: { id: saved.id, cdaId: result.docId, documentType: 'ccd', generatedAt: saved.generated_at } });
  } catch (err) {
    console.error('[CDA] CCD error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Imaging Report ────────────────────────────────────────────────────────────
router.post('/imaging-report/:studyId', async (req, res) => {
  try {
    const studyId = Number(req.params.studyId);
    const { rows: studyRows } = await pool.query(
      'SELECT * FROM ris_studies WHERE id = $1',
      [studyId]
    );
    const study = studyRows[0];
    if (!study) return res.status(404).json({ success: false, message: 'Study not found' });

    const [patient, doctor, hospital] = await Promise.all([
      fetchPatient(study.patient_id),
      fetchDoctor(study.referring_doctor_id || req.user?.doctorId),
      fetchHospital(tenantId(req)),
    ]);

    const result = generateImagingReport({
      patient, doctor, hospital, study,
      reportText: req.body.reportText || study.report_text || study.report || '',
    });

    const saved = await saveCdaDocument({
      tenantId: tenantId(req), patientId: study.patient_id,
      documentType: 'imaging_report', loincCode: '18748-4',
      cdaId: result.docId, xml: result.xml,
      referenceId: studyId, referenceType: 'ris_study',
      generatedBy: req.user?.id,
    });

    res.status(201).json({ success: true, document: { id: saved.id, cdaId: result.docId, documentType: 'imaging_report', generatedAt: saved.generated_at } });
  } catch (err) {
    console.error('[CDA] Imaging report error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── List documents for patient ────────────────────────────────────────────────
router.get('/documents/:patientId', async (req, res) => {
  try {
    const docs = await listCdaDocuments(Number(req.params.patientId), tenantId(req));
    res.json({ success: true, documents: docs, total: docs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get single document metadata ──────────────────────────────────────────────
router.get('/documents/detail/:id', async (req, res) => {
  try {
    const doc = await getCdaDocument(Number(req.params.id), tenantId(req));
    const { xml_content, ...meta } = doc;
    res.json({ success: true, document: meta });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Download CDA XML ──────────────────────────────────────────────────────────
router.get('/documents/download/:id', async (req, res) => {
  try {
    const doc = await getCdaDocument(Number(req.params.id), tenantId(req));
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="CDA_${doc.document_type}_${doc.cda_id}.xml"`);
    res.send(doc.xml_content);
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Validate stored CDA ───────────────────────────────────────────────────────
router.get('/documents/validate/:id', async (req, res) => {
  try {
    const doc = await getCdaDocument(Number(req.params.id), tenantId(req));
    const result = validateCdaXml(doc.xml_content || '');
    if (result.valid) {
      await pool.query('UPDATE cda_documents SET validated_at = NOW(), validation_errors = $1 WHERE id = $2', [[], doc.id]);
    } else {
      await pool.query('UPDATE cda_documents SET validated_at = NOW(), validation_errors = $1 WHERE id = $2', [result.errors, doc.id]);
    }
    res.json({ success: true, documentId: doc.id, ...result });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

export default router;
