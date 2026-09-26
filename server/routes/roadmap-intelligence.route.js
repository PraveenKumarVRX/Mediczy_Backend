/**
 * Roadmap intelligence: SDoH, wound tracking, antibiogram / infection surveillance, pharmacogenomics, ESG, smart rooms,
 * voice-biometric consent, AR surgical plans, RWE / staffing aggregates.
 *
 * Hardening (2026-09-26):
 *  - Tenant comes from the token's tenant claims (utils/tenant-identity.js), or — for a hospital-employed doctor, whose token
 *    carries none — from the doctor's own hospital. It is NEVER the caller's user id.
 *  - Role gate per endpoint: staff roles only (a patient or other-portal token is refused); the sensitive clinical writes
 *    (pharmacogenomics, voice biometrics, AR plans) need a clinical role.
 *  - Every query runs inside withRlsTransaction (the tables have FORCE row-level security — migration 20260926000006),
 *    and every patient reference is checked to belong to the caller's hospital before anything is written.
 *  - No request-time DDL: the schema is the migration's.
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { resolveTenantId } from '../utils/tenant-identity.js';
import { sendRouteError } from '../utils/route-errors.js';

const router = express.Router();

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'system_admin', 'super_admin', 'platform_admin', 'super-admin']);
const CLINICAL_ROLES = new Set(['doctor', 'hospital_doctor', 'nurse', 'ms', 'medical_superintendent', 'cmo', 'chief_medical_officer', 'icu_staff', 'ot_staff', 'quality_staff']);
const STAFF_ROLES = new Set([
  ...CLINICAL_ROLES, 'hospital', 'hospital_admin', 'hospital_staff', 'ceo', 'coo', 'cfo', 'staff', 'accounts_staff', 'billing',
  'mrd_staff', 'insurance_desk_staff', 'insurance_coordinator', 'hr_staff', 'it_edp_staff', 'security_staff', 'receptionist',
]);
const DOCTOR_ROLES = new Set(['doctor', 'hospital_doctor']);
const MIN_CELL = 5;   // small-cell suppression: a group smaller than this is reported as null, never as a guess

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

/**
 * Authenticates and resolves { tenantId } for the request.
 *   roles       roles allowed on this endpoint (platform admins are always allowed; they have no tenant of their own)
 *   allowPlatform  if true, a tenant-less platform admin passes with tenantId = null (aggregate endpoints only)
 */
const auth = (roles = STAFF_ROLES, { allowPlatform = false } = {}) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    let claims;
    try { claims = jwt.verify(token, JWT_CONFIG.SECRET); } catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }
    const role = claims.role || claims.userType;
    req.identity = claims;
    req.role = role;
    const isPlatformAdmin = PLATFORM_ADMIN_ROLES.has(role);
    if (!isPlatformAdmin && !roles.has(role)) return res.status(403).json({ success: false, code: 'ROLE_NOT_PERMITTED', message: 'Your role cannot use this feature' });

    let tenant = Number(resolveTenantId(claims));
    if (!(Number.isInteger(tenant) && tenant > 0) && DOCTOR_ROLES.has(role) && claims.id) {
      // Doctor tokens carry no tenant claim: the tenant is the hospital the doctor belongs to. An independent doctor has
      // none and is refused rather than being scoped to their own doctor id (a different id space).
      const { rows } = await pool.query('SELECT COALESCE(hospital_id, organization_id) AS org FROM doctors WHERE id = $1', [claims.id]);
      tenant = Number(rows[0]?.org);
    }
    if (Number.isInteger(tenant) && tenant > 0) {
      req.tenantId = tenant;
      req.platformView = false;
      return next();
    }
    if (isPlatformAdmin && allowPlatform) { req.tenantId = null; req.platformView = true; return next(); }
    return res.status(403).json({ success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'This account is not attached to a hospital.' });
  } catch (err) {
    console.error('[roadmap-intelligence] auth failed:', err.message);
    return res.status(503).json({ success: false, message: 'Could not verify the account' });
  }
};

/** Runs `fn(client)` inside the caller's tenant RLS transaction. */
const scoped = (req, fn) => withRlsTransaction(
  pool,
  { orgId: req.tenantId || 0, userId: Number(req.identity?.id) || 0, isPlatformAdmin: req.platformView === true },
  fn,
);

/** A patient reference must belong to the caller's hospital (users and patients are both RLS-scoped inside `scoped`). */
async function assertPatientInTenant(client, req, patientId) {
  const pid = Number(patientId);
  if (!Number.isInteger(pid) || pid <= 0) throw httpError(400, 'PATIENT_REQUIRED', 'A valid patientId is required');
  const { rowCount } = await client.query(
    `SELECT 1 FROM users u WHERE u.id = $1 AND u.organization_id = $2
     UNION ALL
     SELECT 1 FROM patients p JOIN users u ON u.id = p."userId" WHERE p.id = $1 AND u.organization_id = $2
     LIMIT 1`, [pid, req.tenantId]);
  if (!rowCount) throw httpError(404, 'PATIENT_NOT_FOUND', 'Patient not found in this hospital');
  return pid;
}

/** Wraps an async handler so a failure is a uniform error reply, never a hung request or a leaked SQL message. */
const handle = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) { sendRouteError(res, err, 500); }
};

const trials = [
  { id: 'CTRI-CARDIO-001', title: 'Cardiometabolic Outcomes Study', conditions: ['diabetes', 'hypertension'], minAge: 30, maxAge: 75 },
  { id: 'CTRI-ONCO-014', title: 'Breast Cancer Adjuvant Registry', conditions: ['breast cancer'], minAge: 18, maxAge: 80 },
  { id: 'CTRI-RENAL-009', title: 'CKD Progression Cohort', conditions: ['chronic kidney disease', 'ckd'], minAge: 18, maxAge: 85 },
];
const pgxMap = {
  codeine: { gene: 'CYP2D6', risky: ['poor metabolizer', 'ultrarapid metabolizer'], recommendation: 'Use non-codeine analgesic or review dose.' },
  clopidogrel: { gene: 'CYP2C19', risky: ['poor metabolizer'], recommendation: 'Consider alternate antiplatelet therapy.' },
  warfarin: { gene: 'CYP2C9', risky: ['poor metabolizer'], recommendation: 'Review lower starting dose and monitoring.' },
};

// ── SDoH ──────────────────────────────────────────────────────────────────────────────────────
router.post('/sdoh/screenings', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, housing, foodAccess, transport, employment, safety } = req.body;
  if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });
  const flags = [housing, foodAccess, transport, employment, safety].filter((v) => ['unstable', 'insecure', 'limited', 'unsafe', 'unemployed'].includes(String(v).toLowerCase()));
  const riskLevel = flags.length >= 3 ? 'high' : flags.length ? 'medium' : 'low';
  const referrals = [riskLevel !== 'low' ? 'social_work' : null, foodAccess === 'insecure' ? 'ngo_food_support' : null, transport === 'limited' ? 'transport_assistance' : null].filter(Boolean);
  const row = await scoped(req, async (c) => {
    const pid = await assertPatientInTenant(c, req, patientId);
    return (await c.query(`INSERT INTO sdoh_screenings (tenant_id, patient_id, housing, food_access, transport, employment, safety, risk_level, referrals) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
      [req.tenantId, pid, housing, foodAccess, transport, employment, safety, riskLevel, JSON.stringify(referrals)])).rows[0];
  });
  res.status(201).json({ success: true, data: row });
}));
router.get('/sdoh/screenings/:patientId', auth(STAFF_ROLES), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(`SELECT * FROM sdoh_screenings WHERE tenant_id = $1 AND patient_id = $2 ORDER BY created_at DESC`, [req.tenantId, req.params.patientId])).rows);
  res.json({ success: true, data: rows });
}));

// ── Wounds ────────────────────────────────────────────────────────────────────────────────────
router.post('/wounds', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, woundType, stage, areaCm2, healingPercent = 0, note, imageRef } = req.body;
  const row = await scoped(req, async (c) => {
    const pid = await assertPatientInTenant(c, req, patientId);
    return (await c.query(`INSERT INTO wound_tracking_records (tenant_id, patient_id, wound_type, stage, area_cm2, healing_percent, note, image_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId, pid, woundType, stage, areaCm2, healingPercent, note || null, imageRef || null])).rows[0];
  });
  res.status(201).json({ success: true, data: row });
}));
router.get('/wounds/:patientId', auth(STAFF_ROLES), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(`SELECT * FROM wound_tracking_records WHERE tenant_id = $1 AND patient_id = $2 ORDER BY created_at DESC`, [req.tenantId, req.params.patientId])).rows);
  res.json({ success: true, data: rows });
}));

// ── Trials / revenue cycle (pure computation) ─────────────────────────────────────────────────
router.post('/trials/match', auth(STAFF_ROLES), handle(async (req, res) => {
  const diagnoses = (req.body.diagnoses || []).map((d) => String(d).toLowerCase());
  const age = Number(req.body.age || 0);
  const matches = trials.filter((trial) => trial.conditions.some((c) => diagnoses.some((d) => d.includes(c))) && (!age || (age >= trial.minAge && age <= trial.maxAge)));
  res.json({ success: true, data: matches, source: 'curated_offline_registry' });
}));
router.post('/revenue-cycle/denial-risk', auth(STAFF_ROLES), handle(async (req, res) => {
  const { documentationComplete, preAuthPresent, codeMismatch, payerHistoryDenialRate = 0 } = req.body;
  let score = Number(payerHistoryDenialRate || 0);
  if (!documentationComplete) score += 30;
  if (!preAuthPresent) score += 25;
  if (codeMismatch) score += 25;
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  res.json({ success: true, data: { score: Math.min(score, 100), level, suggestions: [!documentationComplete ? 'Complete required documentation' : null, !preAuthPresent ? 'Attach pre-authorization' : null, codeMismatch ? 'Review diagnosis-procedure pairing' : null].filter(Boolean) } });
}));

// ── Aggregates over platform tables (tenant-scoped; platform admins get an explicitly labelled platform view) ──
router.get('/staffing/forecast', auth(STAFF_ROLES, { allowPlatform: true }), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(
    `SELECT COALESCE("appointmentDate"::date, CURRENT_DATE) AS day, COUNT(*)::int AS visits FROM appointments
      WHERE "appointmentDate" >= CURRENT_DATE - INTERVAL '28 days' AND ($1::int IS NULL OR organization_id = $1)
      GROUP BY day ORDER BY day`, [req.tenantId])).rows);
  const avg = rows.length ? rows.reduce((s, r) => s + Number(r.visits), 0) / rows.length : 0;
  const projectedPatients = Math.round(avg * 1.08);
  const recommendedNurses = Math.max(1, Math.ceil(projectedPatients / 6));
  res.json({ success: true, data: { projectedPatients, recommendedNurses, assumption: '8% buffer over trailing 28-day mean', samples: rows.length, scope: req.tenantId ? 'hospital' : 'platform' } });
}));
router.get('/rwe/aggregate', auth(STAFF_ROLES, { allowPlatform: true }), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(
    `SELECT COALESCE(gender::text,'unknown') AS gender, COUNT(*)::int AS patients FROM users
      WHERE ($1::int IS NULL OR organization_id = $1) GROUP BY COALESCE(gender::text,'unknown') ORDER BY 1`, [req.tenantId])).rows);
  const data = rows.map((r) => {
    const n = Number(r.patients);
    const patientCount = n < MIN_CELL ? null : n;
    // `noisyPatientCount` is kept as a deprecated alias for the current client; it is the same REAL (or suppressed) value.
    return { gender: r.gender, patientCount, noisyPatientCount: patientCount, suppressed: patientCount === null };
  });
  res.json({ success: true, data, scope: req.tenantId ? 'hospital' : 'platform', privacy: `exact_counts_cells_under_${MIN_CELL}_suppressed` });
}));

// ── Antibiogram / infection surveillance ──────────────────────────────────────────────────────
router.post('/antibiogram/results', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, organism, antibiotic, sensitivity, specimen, collectedAt } = req.body;
  if (!organism || !antibiotic || !sensitivity) return res.status(400).json({ success: false, message: 'organism, antibiotic and sensitivity are required' });
  const row = await scoped(req, async (c) => {
    const pid = patientId ? await assertPatientInTenant(c, req, patientId) : null;
    return (await c.query(`INSERT INTO culture_results (tenant_id, patient_id, organism, antibiotic, sensitivity, specimen, collected_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date,CURRENT_DATE)) RETURNING *`,
      [req.tenantId, pid, organism, antibiotic, sensitivity, specimen || null, collectedAt || null])).rows[0];
  });
  res.status(201).json({ success: true, data: row });
}));
router.get('/antibiogram/summary', auth(STAFF_ROLES), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(`SELECT organism, antibiotic, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE LOWER(sensitivity) = 'sensitive')::int AS sensitive, ROUND(100.0 * COUNT(*) FILTER (WHERE LOWER(sensitivity) = 'sensitive') / NULLIF(COUNT(*),0), 1) AS sensitivity_percent FROM culture_results WHERE tenant_id = $1 GROUP BY organism, antibiotic ORDER BY organism, antibiotic`, [req.tenantId])).rows);
  res.json({ success: true, data: rows });
}));
router.get('/infection-surveillance/alerts', auth(STAFF_ROLES), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(`SELECT organism, COUNT(*)::int AS isolates FROM culture_results WHERE tenant_id = $1 AND collected_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY organism HAVING COUNT(*) >= 3 ORDER BY isolates DESC`, [req.tenantId])).rows);
  res.json({ success: true, data: rows.map((r) => ({ ...r, severity: Number(r.isolates) >= 5 ? 'high' : 'medium' })) });
}));

// ── Pharmacogenomics ──────────────────────────────────────────────────────────────────────────
router.post('/pgx/profiles', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, gene, phenotype } = req.body;
  if (!gene || !phenotype) return res.status(400).json({ success: false, message: 'gene and phenotype are required' });
  const row = await scoped(req, async (c) => {
    const pid = await assertPatientInTenant(c, req, patientId);
    return (await c.query(`INSERT INTO pgx_profiles (tenant_id, patient_id, gene, phenotype) VALUES ($1,$2,$3,$4) RETURNING *`, [req.tenantId, pid, gene, phenotype])).rows[0];
  });
  res.status(201).json({ success: true, data: row });
}));
router.post('/pgx/check', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, medication } = req.body;
  const rule = pgxMap[String(medication || '').toLowerCase()];
  if (!rule) return res.json({ success: true, data: { matched: false } });
  const profile = await scoped(req, async (c) => (await c.query(`SELECT * FROM pgx_profiles WHERE tenant_id = $1 AND patient_id = $2 AND gene = $3 ORDER BY created_at DESC LIMIT 1`, [req.tenantId, patientId, rule.gene])).rows[0]);
  const risky = profile && rule.risky.includes(String(profile.phenotype).toLowerCase());
  res.json({ success: true, data: { matched: !!profile, risky, gene: rule.gene, phenotype: profile?.phenotype || null, recommendation: risky ? rule.recommendation : null } });
}));

// ── ESG ───────────────────────────────────────────────────────────────────────────────────────
router.post('/esg/entries', auth(STAFF_ROLES), handle(async (req, res) => {
  const factors = { electricity_kwh: 0.708, diesel_litre: 2.68, plastic_kg: 6.0, pharma_waste_kg: 1.8 };
  const { category, quantity, unit } = req.body;
  const emissions = Number(quantity || 0) * Number(factors[category] || 0);
  const row = await scoped(req, async (c) => (await c.query(`INSERT INTO esg_entries (tenant_id, category, quantity, unit, emissions_kgco2e) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.tenantId, category, quantity, unit, emissions])).rows[0]);
  res.status(201).json({ success: true, data: row });
}));
router.get('/esg/summary', auth(STAFF_ROLES, { allowPlatform: true }), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(`SELECT category, SUM(quantity)::numeric AS quantity, SUM(emissions_kgco2e)::numeric AS emissions_kgco2e FROM esg_entries WHERE ($1::int IS NULL OR tenant_id = $1) GROUP BY category ORDER BY category`, [req.tenantId])).rows);
  res.json({ success: true, data: rows });
}));

// ── Smart rooms ───────────────────────────────────────────────────────────────────────────────
router.post('/smart-room/devices', auth(STAFF_ROLES), handle(async (req, res) => {
  const { roomCode, deviceCode, deviceType, metadata = {} } = req.body;
  if (!roomCode || !deviceCode || !deviceType) return res.status(400).json({ success: false, message: 'roomCode, deviceCode and deviceType are required' });
  const row = await scoped(req, async (c) => (await c.query(`
    INSERT INTO smart_room_devices (tenant_id, room_code, device_code, device_type, metadata)
    VALUES ($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT (tenant_id, device_code)
    DO UPDATE SET room_code=EXCLUDED.room_code, device_type=EXCLUDED.device_type, metadata=EXCLUDED.metadata
    RETURNING *`, [req.tenantId, roomCode, deviceCode, deviceType, JSON.stringify(metadata)])).rows[0]);
  res.status(201).json({ success: true, data: row });
}));
router.post('/smart-room/events', auth(STAFF_ROLES), handle(async (req, res) => {
  const { roomCode, deviceCode, eventType, payload = {}, occurredAt } = req.body;
  if (!roomCode || !eventType) return res.status(400).json({ success: false, message: 'roomCode and eventType are required' });
  const row = await scoped(req, async (c) => {
    if (deviceCode) await c.query(`UPDATE smart_room_devices SET last_seen_at=NOW(), status='online' WHERE tenant_id=$1 AND device_code=$2`, [req.tenantId, deviceCode]);
    return (await c.query(`INSERT INTO smart_room_events (tenant_id, room_code, device_code, event_type, payload, occurred_at) VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6::timestamp,NOW())) RETURNING *`,
      [req.tenantId, roomCode, deviceCode || null, eventType, JSON.stringify(payload), occurredAt || null])).rows[0];
  });
  res.status(201).json({ success: true, data: row });
}));
router.get('/smart-room/overview', auth(STAFF_ROLES), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(`SELECT room_code, COUNT(*)::int AS devices, COUNT(*) FILTER (WHERE status='online')::int AS online_devices, MAX(last_seen_at) AS last_seen_at FROM smart_room_devices WHERE tenant_id=$1 GROUP BY room_code ORDER BY room_code`, [req.tenantId])).rows);
  res.json({ success: true, data: rows, readiness: 'requires_deployed_room_sensors_and_event_contract_validation' });
}));

// ── Voice biometrics (consent-gated) ──────────────────────────────────────────────────────────
router.post('/voice-biometrics/consents', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, consentStatus, capturedBy, notes } = req.body;
  if (!patientId || !consentStatus) return res.status(400).json({ success: false, message: 'patientId and consentStatus are required' });
  const row = await scoped(req, async (c) => {
    const pid = await assertPatientInTenant(c, req, patientId);
    return (await c.query(`INSERT INTO voice_biometric_consents (tenant_id, patient_id, consent_status, captured_by, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.tenantId, pid, consentStatus, capturedBy || null, notes || null])).rows[0];
  });
  res.status(201).json({ success: true, data: row });
}));
router.post('/voice-biometrics/enrollments', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, consentId, sampleRef, modelVersion } = req.body;
  if (!patientId || !consentId || !sampleRef) return res.status(400).json({ success: false, message: 'patientId, consentId and sampleRef are required' });
  const out = await scoped(req, async (c) => {
    const pid = await assertPatientInTenant(c, req, patientId);
    const consent = (await c.query(`SELECT * FROM voice_biometric_consents WHERE id=$1 AND tenant_id=$2 AND patient_id=$3 ORDER BY captured_at DESC LIMIT 1`, [consentId, req.tenantId, pid])).rows[0];
    if (!consent || consent.consent_status !== 'granted') return null;
    return (await c.query(`INSERT INTO voice_biometric_enrollments (tenant_id, patient_id, consent_id, sample_ref, model_version) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.tenantId, pid, consentId, sampleRef, modelVersion || null])).rows[0];
  });
  if (!out) return res.status(409).json({ success: false, message: 'Granted consent is required before enrollment' });
  res.status(201).json({ success: true, data: out, readiness: 'pending_model_validation' });
}));
router.post('/voice-biometrics/verifications', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, enrollmentId, sampleRef, score = null } = req.body;
  if (!patientId || !enrollmentId || !sampleRef) return res.status(400).json({ success: false, message: 'patientId, enrollmentId and sampleRef are required' });
  const verdict = score === null ? 'review_required' : Number(score) >= 0.9 ? 'match_candidate' : 'non_match_candidate';
  const row = await scoped(req, async (c) => {
    const pid = await assertPatientInTenant(c, req, patientId);
    const enrollment = (await c.query(`SELECT 1 FROM voice_biometric_enrollments WHERE id=$1 AND tenant_id=$2 AND patient_id=$3`, [enrollmentId, req.tenantId, pid])).rows[0];
    if (!enrollment) throw httpError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment not found for this patient');
    return (await c.query(`INSERT INTO voice_biometric_verifications (tenant_id, patient_id, enrollment_id, sample_ref, score, verdict) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [req.tenantId, pid, enrollmentId, sampleRef, score, verdict])).rows[0];
  });
  res.status(201).json({ success: true, data: row, readiness: 'requires_spoofing_evaluation_and_clinical_consent_governance' });
}));

// ── AR surgical plans ─────────────────────────────────────────────────────────────────────────
router.post('/ar-surgical-plans', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { patientId, caseReference, dicomStudyRef, segmentationRef, meshRef, targetDevice, notes } = req.body;
  if (!patientId || !caseReference) return res.status(400).json({ success: false, message: 'patientId and caseReference are required' });
  const row = await scoped(req, async (c) => {
    const pid = await assertPatientInTenant(c, req, patientId);
    return (await c.query(`INSERT INTO ar_surgical_plans (tenant_id, patient_id, case_reference, dicom_study_ref, segmentation_ref, mesh_ref, target_device, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId, pid, caseReference, dicomStudyRef || null, segmentationRef || null, meshRef || null, targetDevice || null, notes || null])).rows[0];
  });
  res.status(201).json({ success: true, data: row, readiness: 'requires_segmentation_pipeline_and_device_validation' });
}));
router.patch('/ar-surgical-plans/:id', auth(CLINICAL_ROLES), handle(async (req, res) => {
  const { segmentationRef, meshRef, targetDevice, status, notes } = req.body;
  const row = await scoped(req, async (c) => (await c.query(`UPDATE ar_surgical_plans SET segmentation_ref=COALESCE($3,segmentation_ref), mesh_ref=COALESCE($4,mesh_ref), target_device=COALESCE($5,target_device), status=COALESCE($6,status), notes=COALESCE($7,notes), updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
    [req.params.id, req.tenantId, segmentationRef || null, meshRef || null, targetDevice || null, status || null, notes || null])).rows[0]);
  if (!row) return res.status(404).json({ success: false, message: 'AR surgical plan not found' });
  res.json({ success: true, data: row, readiness: 'requires_segmentation_pipeline_and_device_validation' });
}));
router.get('/ar-surgical-plans/:patientId', auth(STAFF_ROLES), handle(async (req, res) => {
  const rows = await scoped(req, async (c) => (await c.query(`SELECT * FROM ar_surgical_plans WHERE tenant_id=$1 AND patient_id=$2 ORDER BY created_at DESC`, [req.tenantId, req.params.patientId])).rows);
  res.json({ success: true, data: rows });
}));

export default router;
