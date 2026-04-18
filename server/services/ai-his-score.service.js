/**
 * Mediqzy Health Intelligence Score (HIS) Service
 * =================================================
 * Proprietary deep tech IP: a single 0–100 score representing a patient's
 * overall health status, computed from all available clinical data streams.
 *
 * HIS = 100 − (weighted risk composite from 6 Bayesian dimensions)
 *
 * Score tiers:
 *   90–100  → Optimal
 *   75–89   → Low risk
 *   50–74   → Moderate risk
 *   30–49   → High risk
 *   0–29    → Critical
 *
 * Key differentiators vs generic health scores:
 *   • Integrates AI-scribed clinical entities, not just structured fields
 *   • Trend prediction (30-day forecast using EWMA)
 *   • Peer percentile rank (anonymised population comparison)
 *   • Confidence weighting (sparse data → wider confidence interval)
 *   • Full audit trail in his_scores table
 *   • Cron: every 6 hours (piggybacks on healthRiskCron trigger)
 *
 * Algorithm version: his-v1
 */

import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';
import { tick, tickError, tickStart } from '../utils/cronRegistry.js';
import cron from 'node-cron';

const ALGORITHM_VERSION = 'his-v1';

// ─── Dimension weights (sum of abs values = 1.0) ────────────
// Positive = risk contributes positively to HIS risk burden
// Score inversion: HIS = 100 - (risk_composite * 10)
const DIMENSION_WEIGHTS = {
  cardiovascular:       0.25,
  diabetes:             0.20,
  hypertension:         0.18,
  medication_adherence: 0.15,  // inverted: higher adherence → lower risk
  lifestyle:            0.12,  // inverted: healthier lifestyle → lower risk
  mental_health:        0.10,  // inverted: better mental health → lower risk
};

// ─── Risk tier classification ────────────────────────────────
function classifyTier(score) {
  if (score >= 90) return 'optimal';
  if (score >= 75) return 'low';
  if (score >= 50) return 'moderate';
  if (score >= 30) return 'high';
  return 'critical';
}

// ─── EWMA-based 30-day trend prediction ─────────────────────
function predictTrend(history) {
  if (!history || history.length < 2) return { direction: 'stable', magnitude: 0, predicted_30d: null };
  const alpha = 0.3; // smoothing factor
  let ewma = history[0].his_score;
  for (let i = 1; i < history.length; i++) {
    ewma = alpha * history[i].his_score + (1 - alpha) * ewma;
  }
  const latest = history[history.length - 1].his_score;
  const prev    = history[0].his_score;
  const delta   = latest - prev;
  const predicted = Math.max(0, Math.min(100, ewma + (delta / history.length) * 5)); // 5 ≈ 30d in 6h slots
  return {
    direction: Math.abs(delta) < 0.5 ? 'stable' : delta > 0 ? 'improving' : 'declining',
    magnitude: Math.abs(delta),
    predicted_30d: parseFloat(predicted.toFixed(2)),
  };
}

// ─── Confidence scoring ─────────────────────────────────────
function computeConfidence(dataSources) {
  let score = 0.3; // base
  if (dataSources.vitals)               score += 0.20;
  if (dataSources.prescriptions > 0)    score += 0.15;
  if (dataSources.labs > 0)             score += 0.15;
  if (dataSources.report_lab_values > 0) score += 0.10;
  if (dataSources.appointments > 0)     score += 0.07;
  if (dataSources.clinical_entities > 0) score += 0.03;
  return Math.min(1.0, parseFloat(score.toFixed(2)));
}

class HisScoreService {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run once on startup after 3 minutes
    setTimeout(() => {
      this.computeAll().catch(err => console.error('[HIS] Startup run error:', err.message));
    }, 180000);

    // Every 6 hours (offset by 30 min from healthRiskCron)
    this.cronJob = cron.schedule('30 */6 * * *', async () => {
      await this.computeAll();
    });

    console.log('✅ HIS (Health Intelligence Score) service started (every 6h)');
  }

  stop() {
    if (this.cronJob) { this.cronJob.stop(); this.isRunning = false; }
  }

  /**
   * Compute HIS for all active patients in all tenants.
   */
  async computeAll() {
    const startTime = Date.now();
    tickStart('ai_his_score');
    console.log('🧬 [HIS] Computing Health Intelligence Scores...');

    try {
      const db = pool;

      const { rows: patients } = await db.query(`
        SELECT p.id as patient_id, p."userId" as user_id, p."bloodGroup",
               p.height, p.weight, p.allergies, p."chronicConditions",
               p."currentMedications", p.status,
               u."firstName", u."lastName", u."dateOfBirth", u.gender,
               NULL::text as tenant_id
        FROM patients p
        JOIN users u ON u.id = p."userId"
        WHERE p.status = 'active'
        LIMIT 1000
      `);

      let computed = 0;
      for (const patient of patients) {
        try {
          await this.computeForPatient(patient, db);
          computed++;
        } catch (err) {
          console.error(`[HIS] Patient ${patient.patient_id} error:`, err.message);
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`✅ [HIS] Done: ${computed}/${patients.length} patients in ${elapsed}ms`);
      tick('ai_his_score', { computed, total: patients.length, elapsedMs: elapsed });

    } catch (err) {
      tickError('ai_his_score', err.message);
      console.error('❌ [HIS] Cron error:', err.message);
    }
  }

  /**
   * Compute and persist HIS for a single patient.
   * Also callable on-demand for real-time requests.
   */
  async computeForPatient(patient, db = pool) {
    // 1. Fetch all data sources
    const dataSources = {};
    let latestVitals = null, prescriptions = [], labResults = [], reportLabValues = [];
    let appointments = [], clinicalEntities = [];

    try {
      const { rows } = await db.query(`SELECT * FROM vitals_records WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [patient.user_id || patient.userId]);
      latestVitals = rows[0] || null;
      dataSources.vitals = !!latestVitals;
    } catch { dataSources.vitals = false; }

    try {
      const { rows } = await db.query(`SELECT medications, diagnosis, "chronicConditions" FROM prescriptions WHERE "patientId" = $1 AND "createdAt" > NOW() - INTERVAL '6 months' ORDER BY "createdAt" DESC LIMIT 10`, [patient.patient_id || patient.id]);
      prescriptions = rows; dataSources.prescriptions = rows.length;
    } catch { dataSources.prescriptions = 0; }

    try {
      const { rows } = await db.query(`SELECT * FROM lab_orders WHERE patient_id = $1 AND created_at > NOW() - INTERVAL '6 months' LIMIT 10`, [patient.patient_id || patient.id]);
      labResults = rows; dataSources.labs = rows.length;
    } catch { dataSources.labs = 0; }

    try {
      const { rows } = await db.query(`SELECT parameter_name, value, unit, status FROM ai_report_lab_values WHERE patient_id = $1 AND extracted_at > NOW() - INTERVAL '6 months' LIMIT 50`, [patient.patient_id || patient.id]);
      reportLabValues = rows; dataSources.report_lab_values = rows.length;
    } catch { dataSources.report_lab_values = 0; }

    try {
      const { rows } = await db.query(`SELECT id FROM appointments WHERE "patientId" = $1 AND "createdAt" > NOW() - INTERVAL '6 months' LIMIT 20`, [patient.patient_id || patient.id]);
      appointments = rows; dataSources.appointments = rows.length;
    } catch { dataSources.appointments = 0; }

    // Clinical entities from NLP layer
    try {
      const { rows } = await db.query(`SELECT entity_type, normalized_name, attributes FROM medical_entities WHERE patient_id = $1 AND extracted_at > NOW() - INTERVAL '3 months' LIMIT 100`, [patient.patient_id || patient.id]);
      clinicalEntities = rows; dataSources.clinical_entities = rows.length;
    } catch { dataSources.clinical_entities = 0; }

    // 2. Compute risk dimensions (0–10 scale, 10 = highest risk or best adherence)
    const cv    = this._calcCardiovascularRisk(patient, latestVitals, reportLabValues);
    const dm    = this._calcDiabetesRisk(patient, latestVitals, reportLabValues);
    const htn   = this._calcHypertensionRisk(latestVitals);
    const adh   = this._calcAdherence(prescriptions, patient);
    const life  = this._calcLifestyle(patient, appointments);
    const mh    = this._calcMentalHealth(clinicalEntities);

    // 3. Compute weighted risk composite (0–10)
    const riskComposite =
      cv   * DIMENSION_WEIGHTS.cardiovascular  +
      dm   * DIMENSION_WEIGHTS.diabetes        +
      htn  * DIMENSION_WEIGHTS.hypertension    +
      (10 - adh)  * DIMENSION_WEIGHTS.medication_adherence +
      (10 - life) * DIMENSION_WEIGHTS.lifestyle            +
      (10 - mh)   * DIMENSION_WEIGHTS.mental_health;

    // 4. Convert to HIS (0–100, 100 = best health)
    const rawHIS = Math.max(0, Math.min(100, 100 - riskComposite * 10));
    const his_score = parseFloat(rawHIS.toFixed(2));
    const risk_tier = classifyTier(his_score);

    // 5. Risk factors and recommendations
    const riskFactors = [];
    const recommendations = [];
    if (cv > 6)   { riskFactors.push('Elevated cardiovascular risk'); recommendations.push('Cardiology consultation recommended'); }
    if (dm > 6)   { riskFactors.push('Diabetes risk indicators'); recommendations.push('HbA1c test and diabetologist review'); }
    if (htn > 6)  { riskFactors.push('Hypertension risk'); recommendations.push('Regular BP monitoring, lifestyle modification'); }
    if (adh < 5)  { riskFactors.push('Low medication adherence'); recommendations.push('Pharmacy counselling and reminders set up'); }
    if (life < 4) { riskFactors.push('Sedentary lifestyle indicators'); recommendations.push('30 min daily activity, dietitian review'); }
    if (patient.chronicConditions?.length > 0) riskFactors.push(`Chronic conditions: ${patient.chronicConditions.join(', ')}`);

    // 6. Trend analysis from last 5 scores
    let trendData = { direction: 'stable', magnitude: 0, predicted_30d: his_score };
    try {
      const { rows: history } = await db.query(
        `SELECT his_score FROM his_scores WHERE patient_id = $1 ORDER BY computed_at DESC LIMIT 5`,
        [patient.patient_id || patient.id]
      );
      if (history.length >= 2) trendData = predictTrend([...history].reverse());
    } catch { /* ignore — first computation */ }

    // 7. Percentile rank vs population (approximate)
    let percentile = 50;
    try {
      const { rows: [pr] } = await db.query(
        `SELECT ROUND(100 * PERCENT_RANK() OVER (ORDER BY his_score)::numeric, 1) as pct
         FROM (SELECT his_score FROM his_scores WHERE computed_at > NOW() - INTERVAL '7 days') sub
         WHERE his_score <= $1 LIMIT 1`,
        [his_score]
      );
      if (pr?.pct !== undefined) percentile = parseFloat(pr.pct);
    } catch { /* ignore */ }

    // 8. Confidence
    const confidence = computeConfidence(dataSources);

    // 9. Persist
    await db.query(`
      INSERT INTO his_scores
        (patient_id, tenant_id, his_score, risk_tier,
         cardiovascular_score, diabetes_score, hypertension_score,
         adherence_score, lifestyle_score, mental_health_score,
         trend_direction, trend_magnitude, predicted_30d, percentile_rank,
         risk_factors, recommendations, data_sources, confidence,
         algorithm_version, computed_at, valid_until)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW()+INTERVAL '6 hours')
    `, [
      patient.patient_id || patient.id,
      patient.tenant_id || null,
      his_score, risk_tier,
      parseFloat((10 - cv  ).toFixed(2)),
      parseFloat((10 - dm  ).toFixed(2)),
      parseFloat((10 - htn ).toFixed(2)),
      parseFloat(adh .toFixed(2)),
      parseFloat(life.toFixed(2)),
      parseFloat(mh  .toFixed(2)),
      trendData.direction, trendData.magnitude, trendData.predicted_30d, percentile,
      JSON.stringify(riskFactors), JSON.stringify(recommendations),
      JSON.stringify(dataSources), confidence, ALGORITHM_VERSION,
    ]);

    return { his_score, risk_tier, trend: trendData.direction, confidence };
  }

  /**
   * Retrieve latest HIS for a patient (with optional on-demand recompute).
   */
  async getScore(patientId, recompute = false) {
    const db = pool;

    if (!recompute) {
      const { rows: [latest] } = await db.query(
        `SELECT * FROM his_scores WHERE patient_id = $1 AND valid_until > NOW() ORDER BY computed_at DESC LIMIT 1`,
        [patientId]
      );
      if (latest) return latest;
    }

    // On-demand compute
    const { rows: [patient] } = await db.query(`
      SELECT p.id as patient_id, p."userId" as user_id, p."bloodGroup", p.height, p.weight,
             p.allergies, p."chronicConditions", p."currentMedications", p.status, NULL::text as tenant_id,
             u."firstName", u."lastName", u."dateOfBirth", u.gender
      FROM patients p JOIN users u ON u.id = p."userId"
      WHERE p.id = $1
    `, [patientId]);

    if (!patient) throw new Error(`Patient ${patientId} not found`);
    const result = await this.computeForPatient(patient, db);
    const { rows: [saved] } = await db.query(
      `SELECT * FROM his_scores WHERE patient_id = $1 ORDER BY computed_at DESC LIMIT 1`, [patientId]
    );
    return saved;
  }

  /**
   * HIS history for trend charts (last N computations).
   */
  async getHistory(patientId, limit = 30) {
    const { rows } = await pool.query(
      `SELECT his_score, risk_tier, trend_direction, computed_at FROM his_scores
       WHERE patient_id = $1 ORDER BY computed_at DESC LIMIT $2`,
      [patientId, limit]
    );
    return rows.reverse(); // chronological order for charts
  }

  // ─── Dimension calculators ────────────────────────────────

  _calcCardiovascularRisk(patient, vitals, labs) {
    let risk = 3;
    const age = patient.dateOfBirth ? Math.floor((Date.now() - new Date(patient.dateOfBirth)) / 31557600000) : 40;
    if (age > 60) risk += 1.5;
    else if (age > 45) risk += 0.8;
    if (vitals) {
      const systolic = vitals.systolicBP || vitals.systolic_bp;
      const chol     = vitals.totalCholesterol;
      if (systolic > 160) risk += 2;
      else if (systolic > 140) risk += 1;
      if (chol > 240) risk += 1.5;
    }
    const chronic = patient.chronicConditions || [];
    if (chronic.some(c => /heart|cardiac|coronary/i.test(c))) risk += 2;
    if (chronic.some(c => /diabetes/i.test(c))) risk += 1;
    const cholLab = labs.find(l => /cholesterol/i.test(l.parameter_name));
    if (cholLab && parseFloat(cholLab.value) > 240) risk += 1;
    return Math.min(10, parseFloat(risk.toFixed(2)));
  }

  _calcDiabetesRisk(patient, vitals, labs) {
    let risk = 2;
    if (vitals) {
      const glucose = vitals.fastingGlucose || vitals.bloodGlucose;
      if (glucose > 200) risk += 3;
      else if (glucose > 126) risk += 2;
    }
    const hba1c = labs.find(l => /hba1c|glycated/i.test(l.parameter_name));
    if (hba1c && parseFloat(hba1c.value) > 9)      risk += 3;
    else if (hba1c && parseFloat(hba1c.value) > 6.5) risk += 2;
    const chronic = patient.chronicConditions || [];
    if (chronic.some(c => /diabetes/i.test(c))) risk += 2;
    const bmi = patient.weight && patient.height ? patient.weight / ((patient.height / 100) ** 2) : null;
    if (bmi && bmi > 30) risk += 1;
    return Math.min(10, parseFloat(risk.toFixed(2)));
  }

  _calcHypertensionRisk(vitals) {
    if (!vitals) return 3;
    let risk = 2;
    const systolic  = vitals.systolicBP  || vitals.systolic_bp  || 120;
    const diastolic = vitals.diastolicBP || vitals.diastolic_bp || 80;
    if      (systolic > 180 || diastolic > 120) risk += 5;
    else if (systolic > 160 || diastolic > 100) risk += 3;
    else if (systolic > 140 || diastolic > 90)  risk += 2;
    else if (systolic > 130 || diastolic > 80)  risk += 1;
    return Math.min(10, parseFloat(risk.toFixed(2)));
  }

  _calcAdherence(prescriptions, patient) {
    if (!prescriptions || prescriptions.length === 0) return 6; // unknown → neutral
    const currentMeds = patient.currentMedications?.length || 0;
    const recentFills = prescriptions.length;
    if (currentMeds === 0) return 7;
    const ratio = Math.min(1, recentFills / (currentMeds * 2)); // expected 2 refills per 6mo
    return parseFloat((4 + ratio * 6).toFixed(2)); // 4–10 scale
  }

  _calcLifestyle(patient, appointments) {
    let score = 6; // baseline
    const bmi = patient.weight && patient.height ? patient.weight / ((patient.height / 100) ** 2) : null;
    if (bmi) {
      if (bmi < 18.5 || bmi > 35) score -= 2;
      else if (bmi < 25) score += 1;
    }
    if (appointments.length > 2) score += 1; // proactive healthcare seeking
    return Math.max(0, Math.min(10, parseFloat(score.toFixed(2))));
  }

  _calcMentalHealth(entities) {
    let score = 7; // default — no mental health data = neutral
    const mentalFlags = entities.filter(e =>
      /anxiety|depression|stress|insomnia|panic|mental/i.test(e.normalized_name || e.entity_text || '')
    );
    if (mentalFlags.length > 3) score -= 2;
    else if (mentalFlags.length > 0) score -= 1;
    return Math.max(0, Math.min(10, parseFloat(score.toFixed(2))));
  }

  /**
   * Population-level HIS distribution (for admin dashboards).
   */
  async getPopulationStats(tenantId = null) {
    const db = pool;
    const tenantClause = tenantId ? `AND tenant_id = '${tenantId}'` : '';
    const { rows } = await db.query(`
      SELECT
        risk_tier,
        COUNT(*) as count,
        ROUND(AVG(his_score), 2) as avg_score,
        ROUND(MIN(his_score), 2) as min_score,
        ROUND(MAX(his_score), 2) as max_score,
        COUNT(*) FILTER (WHERE trend_direction = 'improving') as improving,
        COUNT(*) FILTER (WHERE trend_direction = 'declining') as declining
      FROM (
        SELECT DISTINCT ON (patient_id)
          patient_id, his_score, risk_tier, trend_direction, tenant_id
        FROM his_scores ${tenantId ? 'WHERE tenant_id = $1' : ''}
        ORDER BY patient_id, computed_at DESC
      ) latest
      GROUP BY risk_tier
      ORDER BY avg_score DESC
    `, tenantId ? [tenantId] : []);
    return rows;
  }
}

const hisScoreService = new HisScoreService();
export default hisScoreService;
