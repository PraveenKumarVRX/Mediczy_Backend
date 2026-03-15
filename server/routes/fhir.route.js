/**
 * FHIR R4 API Routes
 * 
 * Exposes patient data as FHIR R4 resources for EHR/HIS interoperability.
 * Content-Type: application/fhir+json
 * 
 * Resources: Patient, Encounter, Condition, MedicationRequest,
 * DiagnosticReport, Observation, AllergyIntolerance
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import fhirMapper from '../services/fhir-mapper.service.js';
import { connectPostgres } from '../db/postgres.js';

const router = express.Router();

// Set FHIR content type on all responses
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');
  next();
});

// ── CapabilityStatement (server metadata) ────────────────────
router.get('/metadata', (req, res) => {
  res.json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    software: { name: 'Mediczy FHIR Server', version: '1.0.0' },
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [{
      mode: 'server',
      resource: [
        { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Encounter', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Condition', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'MedicationRequest', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'DiagnosticReport', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Observation', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'AllergyIntolerance', interaction: [{ code: 'read' }, { code: 'search-type' }] }
      ]
    }]
  });
});

// ── Patient ──────────────────────────────────────────────────
router.get('/Patient/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const result = await pool.query(
      `SELECT * FROM users WHERE id = $1 AND role IN ('patient','user')`, [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] });
    res.json(fhirMapper.mapPatient(result.rows[0]));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

router.get('/Patient', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { name, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    let query = `SELECT * FROM users WHERE role IN ('patient','user')`;
    const params = [];
    if (name) {
      params.push(`%${name}%`);
      query += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`;
    }
    query += ` ORDER BY id DESC LIMIT ${limit}`;
    const result = await pool.query(query, params);
    const resources = result.rows.map(r => fhirMapper.mapPatient(r));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

// ── Encounter ────────────────────────────────────────────────
router.get('/Encounter/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const result = await pool.query(`SELECT * FROM appointments WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] });
    res.json(fhirMapper.mapEncounter(result.rows[0]));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

router.get('/Encounter', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    let query = `SELECT * FROM appointments WHERE 1=1`;
    const params = [];
    if (patient) { params.push(patient); query += ` AND patient_id = $${params.length}`; }
    query += ` ORDER BY appointment_date DESC LIMIT ${limit}`;
    const result = await pool.query(query, params);
    const resources = result.rows.map(r => fhirMapper.mapEncounter(r));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

// ── Condition ────────────────────────────────────────────────
router.get('/Condition', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    // Try clinical_notes or diagnoses tables
    let result;
    try {
      result = await pool.query(
        `SELECT id, patient_id, assessment as description, icd10_codes, created_at 
         FROM clinical_notes WHERE patient_id = $1 AND assessment IS NOT NULL ORDER BY created_at DESC LIMIT $2`,
        [patient, limit]
      );
    } catch {
      result = { rows: [] };
    }
    const resources = [];
    for (const row of result.rows) {
      const codes = Array.isArray(row.icd10_codes) ? row.icd10_codes : [];
      if (codes.length > 0) {
        for (const code of codes) {
          resources.push(fhirMapper.mapCondition({
            id: `${row.id}-${code}`, patient_id: row.patient_id,
            icd10_code: typeof code === 'string' ? code : code.code,
            description: typeof code === 'object' ? code.description : row.description,
            created_at: row.created_at
          }, patient));
        }
      } else if (row.description) {
        resources.push(fhirMapper.mapCondition({
          id: row.id, description: row.description, created_at: row.created_at
        }, patient));
      }
    }
    res.json(fhirMapper.createBundle(resources));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

// ── MedicationRequest ────────────────────────────────────────
router.get('/MedicationRequest', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    let result;
    try {
      result = await pool.query(
        `SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [patient, limit]
      );
    } catch {
      result = { rows: [] };
    }
    const resources = result.rows.map(r => fhirMapper.mapMedicationRequest(r, patient));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

// ── Observation (vitals) ─────────────────────────────────────
router.get('/Observation', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, category, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    let result;
    try {
      result = await pool.query(
        `SELECT * FROM vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
        [patient, limit]
      );
    } catch {
      result = { rows: [] };
    }
    const resources = result.rows.map(r => fhirMapper.mapObservation(r, patient));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

// ── AllergyIntolerance ───────────────────────────────────────
router.get('/AllergyIntolerance', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    let result;
    try {
      result = await pool.query(
        `SELECT * FROM allergies WHERE patient_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [patient, limit]
      );
    } catch {
      result = { rows: [] };
    }
    const resources = result.rows.map(r => fhirMapper.mapAllergyIntolerance(r, patient));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) {
    res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }] });
  }
});

export default router;
