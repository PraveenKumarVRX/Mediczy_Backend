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
export default router;
