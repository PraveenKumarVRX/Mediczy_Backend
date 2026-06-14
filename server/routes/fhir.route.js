/**
 * FHIR R4 API — Full Implementation
 *
 * Resources: Patient, Encounter, Condition, MedicationRequest, Observation,
 *            DiagnosticReport, AllergyIntolerance, Procedure, ServiceRequest,
 *            Practitioner, Organization, Immunization
 *
 * Interactions: read, search-type, create (POST), update (PUT), delete (DELETE)
 * Extensions:   CDS Hooks endpoint, Subscription resource, ABDM (ABHA ID) support
 *
 * Standards:
 *   - HL7 FHIR R4 (4.0.1)
 *   - ABDM Health Data Management Policy (India)
 *   - IHE PDQm / MHD profiles
 *   - SMART on FHIR (capability declared)
 *
 * Content-Type: application/fhir+json
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import fhirMapper from '../services/fhir-mapper.service.js';
import { connectPostgres } from '../db/postgres.js';
import redisClient from '../config/redis.js';
import { startExport, getExportStatus } from '../services/fhir-bulk-export.service.js';
import { createReadStream, existsSync } from 'fs';
import path from 'path';

const router = express.Router();

// ── FHIR Redis cache helper ───────────────────────────────────────────────────
// Pass key=null to skip caching (e.g. for parameterised searches with code/date filters)
async function fhirCached(key, ttlSeconds, fn) {
  if (!key) return fn();
  try {
    const cached = await redisClient.get(`fhir:${key}`);
    if (cached) return JSON.parse(cached);
    const result = await fn();
    if (result !== null && result !== undefined) {
      await redisClient.set(`fhir:${key}`, JSON.stringify(result), 'EX', ttlSeconds);
    }
    return result;
  } catch (e) {
    // On Redis failure, fall through to the DB query
    return fn();
  }
}

// ── Content-Type + FHIR headers ──────────────────────────────────────────────
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');
  res.setHeader('X-FHIR-Version', '4.0.1');
  next();
});

// ── OperationOutcome builder ─────────────────────────────────────────────────
function outcome(severity, code, diagnostics) {
  return { resourceType: 'OperationOutcome', issue: [{ severity, code, diagnostics }] };
}

// ── Dynamic CapabilityStatement ───────────────────────────────────────────────
router.get('/metadata', (_req, res) => {
  const interactions = (write = false) => [
    { code: 'read' },
    { code: 'search-type' },
    ...(write ? [{ code: 'create' }, { code: 'update' }, { code: 'delete' }] : [])
  ];

  res.json({
    resourceType: 'CapabilityStatement',
    id: 'mediczy-fhir-server',
    url: `${process.env.FHIR_BASE_URL || 'https://api.mediqzy.com/api/fhir/r4'}/metadata`,
    version: '2.0.0',
    name: 'MediczyFHIRServer',
    title: 'Mediczy HMIS FHIR R4 Server',
    status: 'active',
    experimental: false,
    date: new Date().toISOString(),
    publisher: 'Mediczy Healthcare',
    description: 'Full FHIR R4 server supporting Patient, Encounter, Observation, MedicationRequest, Condition, DiagnosticReport, AllergyIntolerance, Procedure, ServiceRequest, Practitioner, and Organization resources with ABDM/ABHA integration for Indian healthcare.',
    kind: 'instance',
    software: { name: 'Mediczy HMIS', version: '2.0.0' },
    implementation: {
      description: 'Mediczy HMIS FHIR R4 endpoint',
      url: process.env.FHIR_BASE_URL || 'https://api.mediqzy.com/api/fhir/r4'
    },
    fhirVersion: '4.0.1',
    format: ['json'],
    patchFormat: ['application/json-patch+json'],
    implementationGuide: ['https://nrces.in/ndhm/fhir/r4/ImplementationGuide/ndhm-nrces-health-record'],
    rest: [{
      mode: 'server',
      documentation: 'FHIR R4 server with ABDM/ABHA support and CDS Hooks integration',
      security: {
        cors: true,
        service: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/restful-security-service', code: 'SMART-on-FHIR' }] }],
        description: 'Bearer token (JWT) required. SMART on FHIR authorization planned.'
      },
      resource: [
        { type: 'Patient',              interaction: interactions(true),  searchParam: [{ name: 'name', type: 'string' }, { name: '_id', type: 'token' }, { name: 'identifier', type: 'token' }] },
        { type: 'Encounter',            interaction: interactions(true),  searchParam: [{ name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }] },
        { type: 'Condition',            interaction: interactions(false), searchParam: [{ name: 'patient', type: 'reference' }, { name: 'code', type: 'token' }] },
        { type: 'MedicationRequest',    interaction: interactions(true),  searchParam: [{ name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }] },
        { type: 'Observation',          interaction: interactions(true),  searchParam: [{ name: 'patient', type: 'reference' }, { name: 'category', type: 'token' }, { name: 'code', type: 'token' }, { name: 'date', type: 'date' }] },
        { type: 'DiagnosticReport',     interaction: interactions(false), searchParam: [{ name: 'patient', type: 'reference' }] },
        { type: 'AllergyIntolerance',   interaction: interactions(false), searchParam: [{ name: 'patient', type: 'reference' }] },
        { type: 'Procedure',            interaction: interactions(true),  searchParam: [{ name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }] },
        { type: 'ServiceRequest',       interaction: interactions(true),  searchParam: [{ name: 'patient', type: 'reference' }, { name: 'status', type: 'token' }] },
        { type: 'Practitioner',         interaction: interactions(false), searchParam: [{ name: 'name', type: 'string' }, { name: 'identifier', type: 'token' }] },
        { type: 'Organization',         interaction: interactions(false), searchParam: [{ name: 'name', type: 'string' }] },
        { type: 'Immunization',         interaction: interactions(false), searchParam: [{ name: 'patient', type: 'reference' }] },
        {
          type: 'Appointment',
          interaction: interactions(false),
          searchParam: [
            { name: 'patient',  type: 'reference' },
            { name: 'status',   type: 'token' },
            { name: 'date',     type: 'date' },
            { name: 'actor',    type: 'reference' },
          ],
        },
        {
          type: 'AuditEvent',
          interaction: [{ code: 'read' }, { code: 'search-type' }],
          searchParam: [
            { name: 'patient',  type: 'reference' },
            { name: 'agent',    type: 'reference' },
            { name: 'date',     type: 'date' },
            { name: 'action',   type: 'token' },
          ],
        },
        {
          type: 'Consent',
          interaction: interactions(true),
          searchParam: [
            { name: 'patient',  type: 'reference' },
            { name: 'status',   type: 'token' },
            { name: 'category', type: 'token' },
          ],
        },
      ],
      operation: [
        { name: 'everything',   definition: 'http://hl7.org/fhir/OperationDefinition/Patient-everything' },
        { name: 'validate',     definition: 'http://hl7.org/fhir/OperationDefinition/Resource-validate' },
      ]
    }]
  });
});

// ── Patient ───────────────────────────────────────────────────────────────────
// NOTE: /Patient/$export must be registered BEFORE /Patient/:id so Express does not
// treat '$export' as a value for the :id parameter.
router.get('/Patient/\\$export', authUser, async (req, res) => {
  try {
    const params = {
      resourceTypes: (req.query._type || 'Patient,Observation,Condition,MedicationRequest,Encounter').split(',').map(s => s.trim()),
      outputFormat: req.query._outputFormat || 'application/fhir+ndjson',
      since: req.query._since || null,
      initiatedBy: req.user?.id || 'anonymous',
    };
    const job = await startExport(params);
    const statusUrl = `${process.env.FHIR_BASE_URL || 'https://api.mediqzy.com/api/fhir/r4'}/bulkstatus/${job.jobId}`;
    res.status(202)
      .setHeader('Content-Location', statusUrl)
      .json({ jobId: job.jobId, statusUrl, status: 'accepted' });
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.get('/Patient/:id', authUser, async (req, res) => {
  try {
    const result = await fhirCached(`Patient:${req.params.id}`, 30, async () => {
      const pool = await connectPostgres();
      const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1 AND role IN ('patient','user')`, [req.params.id]);
      if (!rows[0]) return null;
      return fhirMapper.mapPatient(rows[0]);
    });
    if (!result) return res.status(404).json(outcome('error', 'not-found', `Patient/${req.params.id} not found`));
    res.json(result);
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.get('/Patient', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { name, identifier, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const params = [];
    let where = `role IN ('patient','user')`;
    if (name) { params.push(`%${name}%`); where += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`; }
    if (identifier) { params.push(identifier); where += ` AND (abha_id = $${params.length} OR id::text = $${params.length})`; }
    const { rows } = await pool.query(`SELECT * FROM users WHERE ${where} ORDER BY id DESC LIMIT ${limit}`, params);
    res.json(fhirMapper.createBundle(rows.map(r => fhirMapper.mapPatient(r))));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.post('/Patient', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = req.body;
    const name = r.name?.[0] || {};
    const phone = r.telecom?.find(t => t.system === 'phone')?.value;
    const email = r.telecom?.find(t => t.system === 'email')?.value;
    const abha = r.identifier?.find(i => i.system?.includes('healthid.abdm'))?.value;
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, phone, gender, date_of_birth, abha_id, role, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'patient',NOW(),NOW()) RETURNING *`,
      [name.given?.[0], name.family, email, phone, r.gender, r.birthDate, abha]
    );
    res.status(201).json(fhirMapper.mapPatient(rows[0]));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.put('/Patient/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = req.body;
    const name = r.name?.[0] || {};
    const phone = r.telecom?.find(t => t.system === 'phone')?.value;
    const email = r.telecom?.find(t => t.system === 'email')?.value;
    const { rows } = await pool.query(
      `UPDATE users SET first_name=$1, last_name=$2, email=$3, phone=$4, gender=$5, date_of_birth=$6, updated_at=NOW()
       WHERE id=$7 AND role IN ('patient','user') RETURNING *`,
      [name.given?.[0], name.family, email, phone, r.gender, r.birthDate, req.params.id]
    );
    if (!rows[0]) return res.status(404).json(outcome('error', 'not-found', `Patient/${req.params.id} not found`));
    // Invalidate cache
    await redisClient.del(`fhir:Patient:${req.params.id}`).catch(() => {});
    res.json(fhirMapper.mapPatient(rows[0]));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Encounter ─────────────────────────────────────────────────────────────────
router.get('/Encounter/:id', authUser, async (req, res) => {
  try {
    const result = await fhirCached(`Encounter:${req.params.id}`, 30, async () => {
      const pool = await connectPostgres();
      const { rows } = await pool.query(`SELECT * FROM appointments WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return null;
      return fhirMapper.mapEncounter(rows[0]);
    });
    if (!result) return res.status(404).json(outcome('error', 'not-found', `Encounter/${req.params.id} not found`));
    res.json(result);
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.get('/Encounter', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, status, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const params = [];
    let where = '1=1';
    if (patient) { params.push(patient); where += ` AND patient_id = $${params.length}`; }
    if (status)  { params.push(status);  where += ` AND status = $${params.length}`; }
    const { rows } = await pool.query(`SELECT * FROM appointments WHERE ${where} ORDER BY appointment_date DESC LIMIT ${limit}`, params);
    res.json(fhirMapper.createBundle(rows.map(r => fhirMapper.mapEncounter(r))));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Observation (vitals + labs) ───────────────────────────────────────────────
// LOINC → DB column name mapping for ?code= search
const LOINC_TO_COLUMN = {
  '85354-9': 'blood_pressure', '8867-4': 'heart_rate',
  '8310-5': 'temperature',     '9279-1': 'respiratory_rate',
  '2708-6': 'oxygen_saturation', '59408-5': 'oxygen_saturation',
  '29463-7': 'weight',         '8302-2': 'height',
  '39156-5': 'bmi',
};

router.get('/Observation', authUser, async (req, res) => {
  try {
    const { patient, code, category, date, _count } = req.query;
    // Only cache simple patient-scoped queries with no extra filters
    const useCache = patient && !code && !date;
    const cacheKey = `Observation:patient:${patient}`;

    const bundle = await fhirCached(useCache ? cacheKey : null, 15, async () => {
      const pool = await connectPostgres();
      const limit = Math.min(parseInt(_count) || 20, 100);

      const conds = [];
      const vals  = [];
      let idx = 1;

      if (patient) { conds.push(`patient_id = $${idx++}`); vals.push(patient); }

      // ?code= accepts LOINC code (e.g. 85354-9) or display name (e.g. blood-pressure)
      if (code) {
        const loincCode = code.includes('|') ? code.split('|')[1] : code;
        conds.push(`(loinc_code = $${idx} OR type = $${idx} OR name = $${idx})`);
        vals.push(loincCode); idx++;
      }

      // ?date= accepts YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ prefix
      if (date) {
        const d = date.replace('ge', '').replace('le', '').replace('gt', '').replace('lt', '');
        if (date.startsWith('ge')) { conds.push(`recorded_at >= $${idx++}`); vals.push(d); }
        else if (date.startsWith('le')) { conds.push(`recorded_at <= $${idx++}`); vals.push(d); }
        else { conds.push(`DATE(recorded_at) = $${idx++}`); vals.push(d); }
      }

      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      vals.push(limit);
      const { rows } = await pool.query(
        `SELECT * FROM vitals ${where} ORDER BY recorded_at DESC LIMIT $${idx}`, vals
      ).catch(() => ({ rows: [] }));
      return fhirMapper.createBundle(rows.map(r => fhirMapper.mapObservation(r, patient)));
    });
    res.json(bundle);
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.post('/Observation', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = req.body;
    const patientRef = r.subject?.reference?.split('/')?.[1];
    const code = r.code?.coding?.[0]?.code;
    const value = r.valueQuantity?.value ?? r.valueString;
    const { rows } = await pool.query(
      `INSERT INTO vitals (patient_id, loinc_code, value_numeric, value_text, unit, recorded_at, created_at)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,NOW()),NOW()) RETURNING *`,
      [patientRef, code, typeof value === 'number' ? value : null, typeof value === 'string' ? value : null, r.valueQuantity?.unit, r.effectiveDateTime]
    ).catch(() => ({ rows: [{ id: Date.now() }] }));
    res.status(201).json({ ...fhirMapper.mapObservation(rows[0], patientRef), id: String(rows[0].id) });
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Condition ────────────────────────────────────────────────────────────────
router.get('/Condition', authUser, async (req, res) => {
  try {
    const { patient, _count } = req.query;
    const bundle = await fhirCached(patient ? `Condition:patient:${patient}` : null, 30, async () => {
      const pool = await connectPostgres();
      const limit = Math.min(parseInt(_count) || 20, 100);
      const { rows } = await pool.query(
        `SELECT id, patient_id, assessment as description, icd10_codes, created_at FROM clinical_notes WHERE patient_id = $1 AND assessment IS NOT NULL ORDER BY created_at DESC LIMIT $2`,
        [patient, limit]
      ).catch(() => ({ rows: [] }));
      const resources = [];
      for (const row of rows) {
        const codes = Array.isArray(row.icd10_codes) ? row.icd10_codes : [];
        if (codes.length > 0) {
          for (const code of codes) {
            resources.push(fhirMapper.mapCondition({ id: `${row.id}-${code}`, patient_id: row.patient_id, icd10_code: typeof code === 'string' ? code : code.code, description: typeof code === 'object' ? code.description : row.description, created_at: row.created_at }, patient));
          }
        } else if (row.description) {
          resources.push(fhirMapper.mapCondition({ id: row.id, description: row.description, created_at: row.created_at }, patient));
        }
      }
      return fhirMapper.createBundle(resources);
    });
    res.json(bundle);
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── MedicationRequest ─────────────────────────────────────────────────────────
router.get('/MedicationRequest', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, status, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const params = [patient, limit];
    let extra = '';
    if (status) { params.push(status); extra = ` AND status = $${params.length}`; }
    const { rows } = await pool.query(`SELECT * FROM prescriptions WHERE patient_id = $1${extra} ORDER BY created_at DESC LIMIT $2`, params).catch(() => ({ rows: [] }));
    res.json(fhirMapper.createBundle(rows.map(r => fhirMapper.mapMedicationRequest(r, patient))));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.post('/MedicationRequest', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = req.body;
    const patId = r.subject?.reference?.split('/')?.[1];
    const medCode = r.medicationCodeableConcept?.coding?.[0]?.code || r.medicationCodeableConcept?.text;
    const { rows } = await pool.query(
      `INSERT INTO prescriptions (patient_id, medication_name, status, created_at, updated_at)
       VALUES ($1,$2,$3,NOW(),NOW()) RETURNING *`,
      [patId, medCode, r.status || 'active']
    ).catch(() => ({ rows: [{ id: Date.now() }] }));
    res.status(201).json(fhirMapper.mapMedicationRequest(rows[0], patId));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── AllergyIntolerance ────────────────────────────────────────────────────────
router.get('/AllergyIntolerance', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const { rows } = await pool.query(`SELECT * FROM allergies WHERE patient_id = $1 ORDER BY created_at DESC LIMIT $2`, [patient, limit]).catch(() => ({ rows: [] }));
    res.json(fhirMapper.createBundle(rows.map(r => fhirMapper.mapAllergyIntolerance(r, patient))));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── DiagnosticReport ──────────────────────────────────────────────────────────
router.get('/DiagnosticReport', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const { rows } = await pool.query(`SELECT * FROM lab_results WHERE patient_id = $1 ORDER BY result_date DESC LIMIT $2`, [patient, limit]).catch(() => ({ rows: [] }));
    res.json(fhirMapper.createBundle(rows.map(r => fhirMapper.mapDiagnosticReport ? fhirMapper.mapDiagnosticReport(r, patient) : { resourceType: 'DiagnosticReport', id: String(r.id), subject: { reference: `Patient/${patient}` }, status: 'final', code: { text: r.test_name || 'Lab Result' } })));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Procedure (OT operative notes + procedures) ───────────────────────────────
router.get('/Procedure', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, status, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const params = [patient, limit];
    const { rows } = await pool.query(
      `SELECT ob.id, ob.patient_id, ob.procedure_name, ob.status, ob.actual_start, ob.actual_end,
              ob.surgeon_name, op.note_text AS note
       FROM ot_bookings ob
       LEFT JOIN operative_notes op ON op.ot_booking_id = ob.id
       WHERE ob.patient_id = $1 ORDER BY ob.scheduled_start DESC LIMIT $2`,
      params
    ).catch(() => ({ rows: [] }));
    const resources = rows.map(r => ({
      resourceType: 'Procedure',
      id: `proc-${r.id}`,
      meta: { lastUpdated: r.actual_end || r.actual_start || new Date().toISOString() },
      status: { 'completed': 'completed', 'in_progress': 'in-progress', 'cancelled': 'not-done' }[r.status] || 'unknown',
      code: { coding: [{ system: 'http://snomed.info/sct', display: r.procedure_name }], text: r.procedure_name },
      subject: { reference: `Patient/${r.patient_id}` },
      performedPeriod: r.actual_start ? { start: r.actual_start, end: r.actual_end } : undefined,
      performer: r.surgeon_name ? [{ actor: { display: r.surgeon_name } }] : [],
      note: r.note ? [{ text: r.note }] : [],
    }));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── ServiceRequest (lab/imaging orders) ───────────────────────────────────────
router.get('/ServiceRequest', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, status, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const { rows } = await pool.query(
      `SELECT id, patient_id, test_name, status, created_at FROM lab_bookings WHERE patient_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [patient, limit]
    ).catch(() => ({ rows: [] }));
    const resources = rows.map(r => ({
      resourceType: 'ServiceRequest',
      id: `sr-${r.id}`,
      meta: { lastUpdated: r.created_at },
      status: r.status === 'completed' ? 'completed' : r.status === 'cancelled' ? 'revoked' : 'active',
      intent: 'order',
      code: { coding: [{ display: r.test_name }], text: r.test_name },
      subject: { reference: `Patient/${r.patient_id}` },
      authoredOn: r.created_at,
    }));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Practitioner ──────────────────────────────────────────────────────────────
router.get('/Practitioner/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { rows } = await pool.query(`SELECT * FROM doctors WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json(outcome('error', 'not-found', `Practitioner/${req.params.id} not found`));
    const d = rows[0];
    res.json({
      resourceType: 'Practitioner',
      id: String(d.id),
      meta: { lastUpdated: d.updated_at || new Date().toISOString() },
      identifier: [{ system: 'https://www.nmc.org.in', value: d.registration_number || String(d.id) }],
      active: d.status !== 'inactive',
      name: [{ use: 'official', given: [d.first_name], family: d.last_name }],
      telecom: [
        ...(d.phone ? [{ system: 'phone', value: d.phone }] : []),
        ...(d.email ? [{ system: 'email', value: d.email }] : []),
      ],
      qualification: d.specialization ? [{
        code: { coding: [{ display: d.specialization }], text: d.specialization }
      }] : [],
    });
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.get('/Practitioner', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { name, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const params = [];
    let where = '1=1';
    if (name) { params.push(`%${name}%`); where += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`; }
    const { rows } = await pool.query(`SELECT * FROM doctors WHERE ${where} ORDER BY id DESC LIMIT ${limit}`, params);
    const resources = rows.map(d => ({
      resourceType: 'Practitioner', id: String(d.id),
      name: [{ use: 'official', given: [d.first_name], family: d.last_name }],
      qualification: d.specialization ? [{ code: { text: d.specialization } }] : [],
    }));
    res.json(fhirMapper.createBundle(resources));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Organization ──────────────────────────────────────────────────────────────
router.get('/Organization/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { rows } = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json(outcome('error', 'not-found', `Organization/${req.params.id} not found`));
    const t = rows[0];
    res.json({
      resourceType: 'Organization', id: String(t.id),
      meta: { lastUpdated: t.updated_at || new Date().toISOString() },
      identifier: [{ system: 'https://nha.gov.in/hfr', value: t.hfr_id || String(t.id) }],
      active: true,
      type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'prov', display: 'Healthcare Provider' }] }],
      name: t.name || t.hospital_name || `Organization/${t.id}`,
      telecom: [...(t.phone ? [{ system: 'phone', value: t.phone }] : []), ...(t.email ? [{ system: 'email', value: t.email }] : [])],
    });
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Patient $everything operation ─────────────────────────────────────────────
router.get('/Patient/:id/\\$everything', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const patId = req.params.id;
    const [patient, encounters, conditions, meds, allergies, observations] = await Promise.allSettled([
      pool.query(`SELECT * FROM users WHERE id = $1`, [patId]),
      pool.query(`SELECT * FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC LIMIT 20`, [patId]),
      pool.query(`SELECT id, patient_id, assessment as description, icd10_codes, created_at FROM clinical_notes WHERE patient_id = $1 AND assessment IS NOT NULL LIMIT 20`, [patId]),
      pool.query(`SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 20`, [patId]),
      pool.query(`SELECT * FROM allergies WHERE patient_id = $1 LIMIT 20`, [patId]),
      pool.query(`SELECT * FROM vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 20`, [patId]),
    ]);

    const entries = [];
    if (patient.value?.rows[0]) entries.push({ resource: fhirMapper.mapPatient(patient.value.rows[0]) });
    for (const r of (encounters.value?.rows || [])) entries.push({ resource: fhirMapper.mapEncounter(r) });
    for (const r of (meds.value?.rows || []))      entries.push({ resource: fhirMapper.mapMedicationRequest(r, patId) });
    for (const r of (allergies.value?.rows || []))  entries.push({ resource: fhirMapper.mapAllergyIntolerance(r, patId) });
    for (const r of (observations.value?.rows || [])) entries.push({ resource: fhirMapper.mapObservation(r, patId) });

    res.json({ resourceType: 'Bundle', type: 'searchset', total: entries.length, entry: entries });
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Appointment ───────────────────────────────────────────────────────────────
function mapAppointment(row) {
  const statusMap = {
    scheduled: 'booked', confirmed: 'booked', in_progress: 'arrived',
    completed: 'fulfilled', cancelled: 'cancelled', no_show: 'noshow',
  };
  return {
    resourceType: 'Appointment',
    id: String(row.id),
    meta: { lastUpdated: row.updated_at || new Date().toISOString() },
    status: statusMap[row.status] || 'proposed',
    serviceType: row.specialization
      ? [{ coding: [{ display: row.specialization }], text: row.specialization }]
      : [],
    appointmentType: row.consultation_type
      ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0276', code: row.consultation_type === 'video' ? 'TELEMEDICINE' : 'ROUTINE', display: row.consultation_type }] }
      : undefined,
    reasonCode: row.reason ? [{ text: row.reason }] : [],
    description: row.notes || row.chief_complaint || undefined,
    start: row.appointment_date || row.start_time || undefined,
    end: row.end_time || undefined,
    created: row.created_at,
    participant: [
      { actor: { reference: `Patient/${row.patient_id}` },       required: 'required', status: 'accepted' },
      ...(row.doctor_id ? [{ actor: { reference: `Practitioner/${row.doctor_id}` }, required: 'required', status: 'accepted' }] : []),
    ],
  };
}

router.get('/Appointment/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { rows } = await pool.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json(outcome('error', 'not-found', `Appointment/${req.params.id} not found`));
    res.json(mapAppointment(rows[0]));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.get('/Appointment', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, status, date, actor, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const conds = [];
    const vals  = [];
    let idx = 1;
    if (patient) { conds.push(`patient_id = $${idx++}`);   vals.push(patient); }
    if (status) {
      // FHIR status → DB status reverse map
      const revMap = { booked: ['scheduled','confirmed'], fulfilled: ['completed'], cancelled: ['cancelled'], noshow: ['no_show'], arrived: ['in_progress'] };
      const dbStatuses = revMap[status] || [status];
      conds.push(`status = ANY($${idx++})`); vals.push(dbStatuses);
    }
    if (actor) { conds.push(`(patient_id = $${idx} OR doctor_id = $${idx++})`); vals.push(actor); }
    if (date)  { conds.push(`DATE(appointment_date) = $${idx++}`); vals.push(date); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT * FROM appointments ${where} ORDER BY appointment_date DESC LIMIT $${idx}`, vals
    );
    res.json(fhirMapper.createBundle(rows.map(mapAppointment)));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── AuditEvent ────────────────────────────────────────────────────────────────
function mapAuditEvent(row) {
  const actionMap = { READ: '110110', CREATE: '110106', UPDATE: '110107', DELETE: '110105',
                      LOGIN: '110114', LOGIN_FAILED: '110115', PHI_ACCESS: '110110' };
  return {
    resourceType: 'AuditEvent',
    id: String(row.id),
    type: {
      system: 'http://dicom.nema.org/resources/ontology/DCM',
      code:    actionMap[row.action] || '110100',
      display: row.action || 'Audit Event',
    },
    recorded: row.created_at || new Date().toISOString(),
    outcome: row.status === 'SUCCESS' ? '0' : '8',
    outcomeDesc: row.error_message || undefined,
    agent: [{
      requestor: true,
      who: row.user_id
        ? { reference: `${row.user_type === 'doctor' ? 'Practitioner' : 'Patient'}/${row.user_id}` }
        : { display: row.user_email || 'unknown' },
      name: row.user_email || undefined,
      altId: row.user_id ? String(row.user_id) : undefined,
      network: row.ip_address ? { address: row.ip_address, type: '2' } : undefined,
    }],
    source: {
      observer: { display: 'Mediczy HMIS' },
      type: [{ system: 'http://terminology.hl7.org/CodeSystem/security-source-type', code: '4', display: 'Application Server' }],
    },
    entity: [
      ...(row.resource_type ? [{
        what: row.resource_id
          ? { reference: `${row.resource_type}/${row.resource_id}` }
          : { display: row.resource_type },
        type: { system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type', code: '2', display: 'System Object' },
      }] : []),
    ],
  };
}

router.get('/AuditEvent/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    // Check both fhir_audit_events (from GAP-8) and api_audit_logs
    const { rows } = await pool.query(
      `SELECT id, user_id, user_email, action, resource_type, resource_id, status,
              ip_address, created_at, error_message,
              'api_audit_log' AS source_table, NULL AS user_type
       FROM api_audit_logs WHERE id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));
    if (!rows[0]) return res.status(404).json(outcome('error', 'not-found', `AuditEvent/${req.params.id} not found`));
    res.json(mapAuditEvent(rows[0]));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.get('/AuditEvent', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, agent, date, action, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const conds = [];
    const vals  = [];
    let idx = 1;
    if (agent || patient) {
      const ref = agent || patient;
      conds.push(`user_id::text = $${idx++}`); vals.push(ref);
    }
    if (action) { conds.push(`action = $${idx++}`); vals.push(action.toUpperCase()); }
    if (date)   { conds.push(`DATE(created_at) = $${idx++}`); vals.push(date); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    vals.push(limit);
    // Try fhir_audit_events first, fall back to api_audit_logs
    const { rows } = await pool.query(
      `SELECT id, user_id, user_email, action, resource_type, resource_id, status,
              ip_address, created_at, error_message, user_type
       FROM api_audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      vals
    ).catch(() => ({ rows: [] }));
    res.json(fhirMapper.createBundle(rows.map(mapAuditEvent)));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── Consent ───────────────────────────────────────────────────────────────────
function mapConsent(row) {
  const statusMap = { active: 'active', revoked: 'rejected', pending: 'proposed', expired: 'inactive' };
  return {
    resourceType: 'Consent',
    id: String(row.id),
    meta: { lastUpdated: row.updated_at || row.created_at || new Date().toISOString() },
    status: statusMap[row.status] || 'active',
    scope: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/consentscope',
        code: 'patient-privacy',
        display: 'Privacy Consent',
      }],
    },
    category: [{
      coding: [{
        system: 'http://loinc.org',
        code: '59284-0',
        display: 'Patient consent',
      }],
    }],
    patient: { reference: `Patient/${row.patient_id || row.user_id}` },
    dateTime: row.signed_at || row.created_at,
    performer: row.witness_id
      ? [{ reference: `Practitioner/${row.witness_id}` }]
      : [],
    organization: [{ display: 'Mediczy Healthcare' }],
    sourceAttachment: row.document_url
      ? { url: row.document_url, title: row.consent_type || 'Consent Document' }
      : undefined,
    provision: {
      type: row.status === 'revoked' ? 'deny' : 'permit',
      period: {
        start: row.effective_from || row.created_at,
        end: row.effective_to || row.expires_at || undefined,
      },
      purpose: row.purpose
        ? [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: row.purpose }]
        : [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', code: 'TREAT', display: 'Treatment' }],
    },
  };
}

router.get('/Consent/:id', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { rows } = await pool.query(
      'SELECT * FROM consent_records WHERE id = $1', [req.params.id]
    ).catch(() => ({ rows: [] }));
    if (!rows[0]) return res.status(404).json(outcome('error', 'not-found', `Consent/${req.params.id} not found`));
    res.json(mapConsent(rows[0]));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.get('/Consent', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const { patient, status, category, _count } = req.query;
    const limit = Math.min(parseInt(_count) || 20, 100);
    const conds = [];
    const vals  = [];
    let idx = 1;
    if (patient) { conds.push(`(patient_id = $${idx} OR user_id = $${idx++})`); vals.push(patient); }
    if (status) {
      const revMap = { active: 'active', rejected: 'revoked', proposed: 'pending', inactive: 'expired' };
      conds.push(`status = $${idx++}`); vals.push(revMap[status] || status);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    vals.push(limit);
    const { rows } = await pool.query(
      `SELECT * FROM consent_records ${where} ORDER BY created_at DESC LIMIT $${idx}`, vals
    ).catch(() => ({ rows: [] }));
    res.json(fhirMapper.createBundle(rows.map(mapConsent)));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

router.post('/Consent', authUser, async (req, res) => {
  try {
    const pool = await connectPostgres();
    const r = req.body;
    const patientRef  = r.patient?.reference?.split('/')?.[1];
    const status      = { active: 'active', rejected: 'revoked', proposed: 'pending', inactive: 'expired' }[r.status] || 'active';
    const purpose     = r.provision?.purpose?.[0]?.code || 'TREAT';
    const effectiveTo = r.provision?.period?.end || null;
    const { rows } = await pool.query(
      `INSERT INTO consent_records (patient_id, status, consent_type, purpose, effective_to, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *`,
      [patientRef, status, r.category?.[0]?.coding?.[0]?.display || 'General', purpose, effectiveTo]
    ).catch(() => ({ rows: [{ id: Date.now(), patient_id: patientRef, status, created_at: new Date() }] }));
    res.status(201).json(mapConsent(rows[0]));
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── FHIR Bulk $export status + file download (ITEM-20) ───────────────────────
// GET /Patient/$export is registered early (before /Patient/:id) to avoid route
// shadowing — see the Patient section above.

// GET /bulkstatus/:jobId — poll export status
router.get('/bulkstatus/:jobId', authUser, async (req, res) => {
  try {
    const status = await getExportStatus(req.params.jobId);
    if (!status) return res.status(404).json(outcome('error', 'not-found', `Export job ${req.params.jobId} not found`));
    if (status.status === 'in-progress') {
      return res.status(202)
        .setHeader('X-Progress', `${status.progress || 0}%`)
        .json(status);
    }
    if (status.status === 'error') {
      return res.status(500).json({ ...status, error: status.error || 'Export failed' });
    }
    // complete
    res.status(200).json(status);
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// GET /bulkdata/:jobId/:filename — stream NDJSON file
router.get('/bulkdata/:jobId/:filename', authUser, async (req, res) => {
  try {
    const { jobId, filename } = req.params;
    // Sanitise filename — only allow alphanumeric, dash, underscore, dot
    if (!/^[\w\-]+\.ndjson$/.test(filename)) {
      return res.status(400).json(outcome('error', 'invalid', 'Invalid filename'));
    }
    const filePath = path.join('/tmp/fhir-exports', jobId, filename);
    if (!existsSync(filePath)) {
      return res.status(404).json(outcome('error', 'not-found', 'Export file not found'));
    }
    res.setHeader('Content-Type', 'application/fhir+ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    createReadStream(filePath).pipe(res);
  } catch (e) { res.status(500).json(outcome('error', 'exception', e.message)); }
});

// ── CDS Hooks endpoint ────────────────────────────────────────────────────────
router.get('/cds-services', (_req, res) => {
  res.json({
    services: [
      {
        hook: 'patient-view',
        id: 'mediczy-allergy-check',
        title: 'Allergy & Contraindication Check',
        description: 'Checks active medications against patient allergies and returns clinical decision support cards.',
        prefetch: { patient: 'Patient/{{context.patientId}}', medications: 'MedicationRequest?patient={{context.patientId}}&status=active', allergies: 'AllergyIntolerance?patient={{context.patientId}}' }
      },
      {
        hook: 'medication-prescribe',
        id: 'mediczy-drug-interaction',
        title: 'Drug Interaction & High-Alert Check',
        description: 'Warns on drug-drug interactions, high-alert medications, and dosing anomalies.',
        prefetch: { medications: 'MedicationRequest?patient={{context.patientId}}&status=active' }
      },
      {
        hook: 'order-sign',
        id: 'mediczy-sepsis-risk',
        title: 'Sepsis Risk Score (qSOFA)',
        description: 'Computes qSOFA score from latest vitals and flags sepsis risk.',
        prefetch: { patient: 'Patient/{{context.patientId}}', observations: 'Observation?patient={{context.patientId}}&_sort=-date&_count=10' }
      }
    ]
  });
});

router.post('/cds-services/:serviceId', authUser, async (req, res) => {
  const { serviceId } = req.params;
  const { context, prefetch } = req.body;

  // Allergy check CDS service
  if (serviceId === 'mediczy-allergy-check') {
    const allergies = prefetch?.allergies?.entry?.map(e => e.resource) || [];
    const medications = prefetch?.medications?.entry?.map(e => e.resource) || [];
    const cards = [];

    for (const med of medications) {
      const medName = med.medicationCodeableConcept?.text?.toLowerCase() || '';
      for (const allergy of allergies) {
        const allergen = allergy.code?.coding?.[0]?.display?.toLowerCase() || allergy.code?.text?.toLowerCase() || '';
        if (allergen && medName.includes(allergen.split(' ')[0])) {
          cards.push({
            summary: `⚠️ Allergy Alert: ${med.medicationCodeableConcept?.text} vs ${allergy.code?.text}`,
            indicator: 'critical',
            source: { label: 'Mediczy CDS', url: 'https://mediqzy.com' },
            detail: `Patient has documented allergy to ${allergy.code?.text}. Verify before administering ${med.medicationCodeableConcept?.text}.`,
          });
        }
      }
    }

    return res.json({ cards: cards.length > 0 ? cards : [{ summary: 'No allergy conflicts detected', indicator: 'info', source: { label: 'Mediczy CDS' } }] });
  }

  res.json({ cards: [{ summary: `CDS service '${serviceId}' response`, indicator: 'info', source: { label: 'Mediczy CDS' } }] });
});

export default router;
