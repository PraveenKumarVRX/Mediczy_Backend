import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { connectPostgres } from '../db/postgres.js';

const router = express.Router();
const authRoadmap = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    req.identity = jwt.verify(token, JWT_CONFIG.SECRET);
    req.tenantId = req.identity.tenant_id || req.identity.hospital_id || req.identity.id;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
const ensureTables = async () => {
  const db = await connectPostgres();
  await db.query(`
    CREATE TABLE IF NOT EXISTS sdoh_screenings (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      housing VARCHAR(40), food_access VARCHAR(40), transport VARCHAR(40), employment VARCHAR(40), safety VARCHAR(40),
      risk_level VARCHAR(24) NOT NULL, referrals JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wound_tracking_records (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      wound_type VARCHAR(80), stage VARCHAR(80), area_cm2 NUMERIC(10,2), healing_percent NUMERIC(5,2),
      note TEXT, image_ref VARCHAR(240), created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS culture_results (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER,
      organism VARCHAR(160) NOT NULL, antibiotic VARCHAR(160) NOT NULL, sensitivity VARCHAR(24) NOT NULL,
      specimen VARCHAR(120), collected_at DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pgx_profiles (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      gene VARCHAR(80) NOT NULL, phenotype VARCHAR(120) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS esg_entries (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, category VARCHAR(120) NOT NULL,
      quantity NUMERIC(12,2) NOT NULL, unit VARCHAR(40) NOT NULL, emissions_kgco2e NUMERIC(12,4) NOT NULL,
      captured_at DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS smart_room_devices (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, room_code VARCHAR(80) NOT NULL,
      device_code VARCHAR(80) NOT NULL, device_type VARCHAR(80) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'registered',
      last_seen_at TIMESTAMP, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, device_code)
    );
    CREATE TABLE IF NOT EXISTS smart_room_events (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, room_code VARCHAR(80) NOT NULL,
      device_code VARCHAR(80), event_type VARCHAR(120) NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMP NOT NULL DEFAULT NOW(), created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS voice_biometric_consents (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      consent_status VARCHAR(24) NOT NULL, captured_by VARCHAR(160), notes TEXT,
      captured_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS voice_biometric_enrollments (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      consent_id INTEGER REFERENCES voice_biometric_consents(id) ON DELETE SET NULL,
      sample_ref VARCHAR(240) NOT NULL, model_version VARCHAR(80), status VARCHAR(24) NOT NULL DEFAULT 'pending_validation',
      enrolled_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS voice_biometric_verifications (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      enrollment_id INTEGER REFERENCES voice_biometric_enrollments(id) ON DELETE SET NULL,
      sample_ref VARCHAR(240) NOT NULL, score NUMERIC(5,4), verdict VARCHAR(24) NOT NULL DEFAULT 'review_required',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ar_surgical_plans (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      case_reference VARCHAR(120) NOT NULL, dicom_study_ref VARCHAR(240), segmentation_ref VARCHAR(240), mesh_ref VARCHAR(240),
      target_device VARCHAR(120), status VARCHAR(24) NOT NULL DEFAULT 'draft', notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  return db;
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
const noise = (value) => Math.max(0, Math.round(value + (Math.random() - 0.5) * 2));

router.post('/sdoh/screenings', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, housing, foodAccess, transport, employment, safety } = req.body;
  if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });
  const flags = [housing, foodAccess, transport, employment, safety].filter((v) => ['unstable','insecure','limited','unsafe','unemployed'].includes(String(v).toLowerCase()));
  const riskLevel = flags.length >= 3 ? 'high' : flags.length ? 'medium' : 'low';
  const referrals = [riskLevel !== 'low' ? 'social_work' : null, foodAccess === 'insecure' ? 'ngo_food_support' : null, transport === 'limited' ? 'transport_assistance' : null].filter(Boolean);
  const { rows } = await db.query(`INSERT INTO sdoh_screenings (tenant_id, patient_id, housing, food_access, transport, employment, safety, risk_level, referrals) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`, [req.tenantId, patientId, housing, foodAccess, transport, employment, safety, riskLevel, JSON.stringify(referrals)]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/sdoh/screenings/:patientId', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT * FROM sdoh_screenings WHERE tenant_id = $1 AND patient_id = $2 ORDER BY created_at DESC`, [req.tenantId, req.params.patientId]);
  res.json({ success: true, data: rows });
});
router.post('/wounds', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, woundType, stage, areaCm2, healingPercent = 0, note, imageRef } = req.body;
  const { rows } = await db.query(`INSERT INTO wound_tracking_records (tenant_id, patient_id, wound_type, stage, area_cm2, healing_percent, note, image_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [req.tenantId, patientId, woundType, stage, areaCm2, healingPercent, note || null, imageRef || null]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/wounds/:patientId', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT * FROM wound_tracking_records WHERE tenant_id = $1 AND patient_id = $2 ORDER BY created_at DESC`, [req.tenantId, req.params.patientId]);
  res.json({ success: true, data: rows });
});
router.post('/trials/match', authRoadmap, async (req, res) => {
  const diagnoses = (req.body.diagnoses || []).map((d) => String(d).toLowerCase());
  const age = Number(req.body.age || 0);
  const matches = trials.filter((trial) => trial.conditions.some((c) => diagnoses.some((d) => d.includes(c))) && (!age || (age >= trial.minAge && age <= trial.maxAge)));
  res.json({ success: true, data: matches, source: 'curated_offline_registry' });
});
router.get('/staffing/forecast', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT COALESCE("appointmentDate"::date, CURRENT_DATE) AS day, COUNT(*)::int AS visits FROM appointments WHERE "appointmentDate" >= CURRENT_DATE - INTERVAL '28 days' GROUP BY day ORDER BY day`);
  const avg = rows.length ? rows.reduce((s, r) => s + Number(r.visits), 0) / rows.length : 0;
  const projectedPatients = Math.round(avg * 1.08);
  const recommendedNurses = Math.max(1, Math.ceil(projectedPatients / 6));
  res.json({ success: true, data: { projectedPatients, recommendedNurses, assumption: '8% buffer over trailing 28-day mean', samples: rows.length } });
});
router.post('/antibiogram/results', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, organism, antibiotic, sensitivity, specimen, collectedAt } = req.body;
  if (!organism || !antibiotic || !sensitivity) return res.status(400).json({ success: false, message: 'organism, antibiotic and sensitivity are required' });
  const { rows } = await db.query(`INSERT INTO culture_results (tenant_id, patient_id, organism, antibiotic, sensitivity, specimen, collected_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date,CURRENT_DATE)) RETURNING *`, [req.tenantId, patientId || null, organism, antibiotic, sensitivity, specimen || null, collectedAt || null]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/antibiogram/summary', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT organism, antibiotic, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE LOWER(sensitivity) = 'sensitive')::int AS sensitive, ROUND(100.0 * COUNT(*) FILTER (WHERE LOWER(sensitivity) = 'sensitive') / NULLIF(COUNT(*),0), 1) AS sensitivity_percent FROM culture_results WHERE tenant_id = $1 GROUP BY organism, antibiotic ORDER BY organism, antibiotic`, [req.tenantId]);
  res.json({ success: true, data: rows });
});
router.get('/infection-surveillance/alerts', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT organism, COUNT(*)::int AS isolates FROM culture_results WHERE tenant_id = $1 AND collected_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY organism HAVING COUNT(*) >= 3 ORDER BY isolates DESC`, [req.tenantId]);
  res.json({ success: true, data: rows.map((r) => ({ ...r, severity: Number(r.isolates) >= 5 ? 'high' : 'medium' })) });
});
router.get('/rwe/aggregate', authRoadmap, async (_req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT COALESCE(gender,'unknown') AS gender, COUNT(*)::int AS patients FROM users GROUP BY COALESCE(gender,'unknown')`);
  res.json({ success: true, data: rows.map((r) => ({ gender: r.gender, noisyPatientCount: noise(Number(r.patients)) })), privacy: 'noisy_aggregate_only' });
});
router.post('/pgx/profiles', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, gene, phenotype } = req.body;
  const { rows } = await db.query(`INSERT INTO pgx_profiles (tenant_id, patient_id, gene, phenotype) VALUES ($1,$2,$3,$4) RETURNING *`, [req.tenantId, patientId, gene, phenotype]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.post('/pgx/check', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, medication } = req.body;
  const rule = pgxMap[String(medication || '').toLowerCase()];
  if (!rule) return res.json({ success: true, data: { matched: false } });
  const { rows } = await db.query(`SELECT * FROM pgx_profiles WHERE tenant_id = $1 AND patient_id = $2 AND gene = $3 ORDER BY created_at DESC LIMIT 1`, [req.tenantId, patientId, rule.gene]);
  const profile = rows[0];
  const risky = profile && rule.risky.includes(String(profile.phenotype).toLowerCase());
  res.json({ success: true, data: { matched: !!profile, risky, gene: rule.gene, phenotype: profile?.phenotype || null, recommendation: risky ? rule.recommendation : null } });
});
router.post('/revenue-cycle/denial-risk', authRoadmap, async (req, res) => {
  const { documentationComplete, preAuthPresent, codeMismatch, payerHistoryDenialRate = 0 } = req.body;
  let score = Number(payerHistoryDenialRate || 0);
  if (!documentationComplete) score += 30;
  if (!preAuthPresent) score += 25;
  if (codeMismatch) score += 25;
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  res.json({ success: true, data: { score: Math.min(score, 100), level, suggestions: [!documentationComplete ? 'Complete required documentation' : null, !preAuthPresent ? 'Attach pre-authorization' : null, codeMismatch ? 'Review diagnosis-procedure pairing' : null].filter(Boolean) } });
});
router.post('/esg/entries', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const factors = { electricity_kwh: 0.708, diesel_litre: 2.68, plastic_kg: 6.0, pharma_waste_kg: 1.8 };
  const { category, quantity, unit } = req.body;
  const emissions = Number(quantity || 0) * Number(factors[category] || 0);
  const { rows } = await db.query(`INSERT INTO esg_entries (tenant_id, category, quantity, unit, emissions_kgco2e) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.tenantId, category, quantity, unit, emissions]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/esg/summary', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT category, SUM(quantity)::numeric AS quantity, SUM(emissions_kgco2e)::numeric AS emissions_kgco2e FROM esg_entries WHERE tenant_id = $1 GROUP BY category ORDER BY category`, [req.tenantId]);
  res.json({ success: true, data: rows });
});

router.post('/smart-room/devices', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { roomCode, deviceCode, deviceType, metadata = {} } = req.body;
  if (!roomCode || !deviceCode || !deviceType) return res.status(400).json({ success: false, message: 'roomCode, deviceCode and deviceType are required' });
  const { rows } = await db.query(`
    INSERT INTO smart_room_devices (tenant_id, room_code, device_code, device_type, metadata)
    VALUES ($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT (tenant_id, device_code)
    DO UPDATE SET room_code=EXCLUDED.room_code, device_type=EXCLUDED.device_type, metadata=EXCLUDED.metadata
    RETURNING *
  `, [req.tenantId, roomCode, deviceCode, deviceType, JSON.stringify(metadata)]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.post('/smart-room/events', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { roomCode, deviceCode, eventType, payload = {}, occurredAt } = req.body;
  if (!roomCode || !eventType) return res.status(400).json({ success: false, message: 'roomCode and eventType are required' });
  if (deviceCode) await db.query(`UPDATE smart_room_devices SET last_seen_at=NOW(), status='online' WHERE tenant_id=$1 AND device_code=$2`, [req.tenantId, deviceCode]);
  const { rows } = await db.query(`INSERT INTO smart_room_events (tenant_id, room_code, device_code, event_type, payload, occurred_at) VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6::timestamp,NOW())) RETURNING *`, [req.tenantId, roomCode, deviceCode || null, eventType, JSON.stringify(payload), occurredAt || null]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.get('/smart-room/overview', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT room_code, COUNT(*)::int AS devices, COUNT(*) FILTER (WHERE status='online')::int AS online_devices, MAX(last_seen_at) AS last_seen_at FROM smart_room_devices WHERE tenant_id=$1 GROUP BY room_code ORDER BY room_code`, [req.tenantId]);
  res.json({ success: true, data: rows, readiness: 'requires_deployed_room_sensors_and_event_contract_validation' });
});
router.post('/voice-biometrics/consents', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, consentStatus, capturedBy, notes } = req.body;
  if (!patientId || !consentStatus) return res.status(400).json({ success: false, message: 'patientId and consentStatus are required' });
  const { rows } = await db.query(`INSERT INTO voice_biometric_consents (tenant_id, patient_id, consent_status, captured_by, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.tenantId, patientId, consentStatus, capturedBy || null, notes || null]);
  res.status(201).json({ success: true, data: rows[0] });
});
router.post('/voice-biometrics/enrollments', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, consentId, sampleRef, modelVersion } = req.body;
  if (!patientId || !consentId || !sampleRef) return res.status(400).json({ success: false, message: 'patientId, consentId and sampleRef are required' });
  const { rows: consents } = await db.query(`SELECT * FROM voice_biometric_consents WHERE id=$1 AND tenant_id=$2 AND patient_id=$3 ORDER BY captured_at DESC LIMIT 1`, [consentId, req.tenantId, patientId]);
  if (!consents[0] || consents[0].consent_status !== 'granted') return res.status(409).json({ success: false, message: 'Granted consent is required before enrollment' });
  const { rows } = await db.query(`INSERT INTO voice_biometric_enrollments (tenant_id, patient_id, consent_id, sample_ref, model_version) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.tenantId, patientId, consentId, sampleRef, modelVersion || null]);
  res.status(201).json({ success: true, data: rows[0], readiness: 'pending_model_validation' });
});
router.post('/voice-biometrics/verifications', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, enrollmentId, sampleRef, score = null } = req.body;
  if (!patientId || !enrollmentId || !sampleRef) return res.status(400).json({ success: false, message: 'patientId, enrollmentId and sampleRef are required' });
  const verdict = score === null ? 'review_required' : Number(score) >= 0.9 ? 'match_candidate' : 'non_match_candidate';
  const { rows } = await db.query(`INSERT INTO voice_biometric_verifications (tenant_id, patient_id, enrollment_id, sample_ref, score, verdict) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [req.tenantId, patientId, enrollmentId, sampleRef, score, verdict]);
  res.status(201).json({ success: true, data: rows[0], readiness: 'requires_spoofing_evaluation_and_clinical_consent_governance' });
});
router.post('/ar-surgical-plans', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { patientId, caseReference, dicomStudyRef, segmentationRef, meshRef, targetDevice, notes } = req.body;
  if (!patientId || !caseReference) return res.status(400).json({ success: false, message: 'patientId and caseReference are required' });
  const { rows } = await db.query(`INSERT INTO ar_surgical_plans (tenant_id, patient_id, case_reference, dicom_study_ref, segmentation_ref, mesh_ref, target_device, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [req.tenantId, patientId, caseReference, dicomStudyRef || null, segmentationRef || null, meshRef || null, targetDevice || null, notes || null]);
  res.status(201).json({ success: true, data: rows[0], readiness: 'requires_segmentation_pipeline_and_device_validation' });
});
router.patch('/ar-surgical-plans/:id', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { segmentationRef, meshRef, targetDevice, status, notes } = req.body;
  const { rows } = await db.query(`UPDATE ar_surgical_plans SET segmentation_ref=COALESCE($3,segmentation_ref), mesh_ref=COALESCE($4,mesh_ref), target_device=COALESCE($5,target_device), status=COALESCE($6,status), notes=COALESCE($7,notes), updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`, [req.params.id, req.tenantId, segmentationRef || null, meshRef || null, targetDevice || null, status || null, notes || null]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'AR surgical plan not found' });
  res.json({ success: true, data: rows[0], readiness: 'requires_segmentation_pipeline_and_device_validation' });
});
router.get('/ar-surgical-plans/:patientId', authRoadmap, async (req, res) => {
  const db = await ensureTables();
  const { rows } = await db.query(`SELECT * FROM ar_surgical_plans WHERE tenant_id=$1 AND patient_id=$2 ORDER BY created_at DESC`, [req.tenantId, req.params.patientId]);
  res.json({ success: true, data: rows });
});
export default router;
