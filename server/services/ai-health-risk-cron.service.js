/**
 * AI Health Risk Score Cron Service
 * =================================
 * Computes personalized health risk scores for all patients every 6 hours.
 * Populates: ai_health_risk_scores table
 * 
 * Scoring dimensions:
 *   - Cardiovascular risk (based on vitals, BMI, age, chronic conditions)
 *   - Diabetes risk (HbA1c, fasting glucose, BMI, family history)
 *   - Hypertension risk (BP readings over time)
 *   - Medication adherence (prescription fills vs expected)
 *   - Lifestyle score (activity, sleep, diet from wellness logs)
 * 
 * Uses Bayesian weighted scoring with LLM-enhanced recommendations.
 */

import cron from 'node-cron';
import { getCronPool } from '../db/pgPool.js';
const pool = getCronPool();
import llmProvider from './ai-brain/llm-provider.js';
import { tick, tickError, tickStart, beginJob } from '../utils/cronRegistry.js';
import interpretabilityService from './ai-interpretability.service.js';
import qualityGates from './ai-quality-gates.service.js';
import { processBatchesDirect } from './patient-risk-queue.service.js';
import { resolveMentalHealthSubscore } from '../utils/mentalHealthSubscore.js';

class HealthRiskScoreCron {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  /**
   * Start the cron job — runs every 6 hours
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Health risk score cron already running');
      return;
    }

    this.isRunning = true;

    // Run immediately on startup, then every 6 hours
    this.computeAllScores().catch(err => console.error('[HealthRisk] Initial run error:', err.message));

    this.cronJob = cron.schedule('0 */6 * * *', async () => {
      await this.computeAllScores();
    });

    console.log('✅ AI Health Risk Score cron started (every 6 hours)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('🛑 Health Risk Score cron stopped');
    }
  }

  /**
   * Compute risk scores for all active patients
   */
  async computeAllScores() {
    const startTime = Date.now();
    if (!(await beginJob('ai_health_risk'))) return { skipped: true };
    console.log('🏥 [HealthRisk] Starting health risk score computation...');

    try {
      const db = pool;

      // Get all patients with their user data
      const { rows: patients } = await db.query(`
        SELECT p.id as patient_id, p."userId" as user_id, p."bloodGroup",
               p.height, p.weight, p.allergies, p."chronicConditions",
               p."currentMedications", p.status,
               u."firstName", u."lastName", u.email, u."dateOfBirth", u.gender, u."phoneNumber"
        FROM patients p
        JOIN users u ON u.id = p."userId"
        WHERE p.status = 'active'
        LIMIT 500
      `);

      if (patients.length === 0) {
        console.log('[HealthRisk] No active patients found');
        return;
      }

      // ITEM-21: Process in batches of 10 with concurrency 2 (no cron storm)
      const { created, updated, gateBlocked, blockerTally } = await processBatchesDirect(
        patients,
        async (batch) => this._processBatch(batch, db),
      );

      const elapsed = Date.now() - startTime;
      const blockerSummary = Object.entries(blockerTally || {})
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => `${code}×${count}`)
        .join(', ');
      console.log(`✅ [HealthRisk] Completed: ${created} created, ${updated} updated, ${gateBlocked} gate-blocked in ${elapsed}ms${blockerSummary ? ` — blockers: ${blockerSummary}` : ''}`);
      tick('ai_health_risk', { created, updated, gateBlocked, blockerTally, patients: patients.length, elapsedMs: elapsed });

    } catch (error) {
      tickError('ai_health_risk', error.message);
      console.error('❌ [HealthRisk] Cron error:', error.message);
    }
  }

  /** Process a batch of patients; returns { created, updated, gateBlocked } */
  async _processBatch(batch, db) {
    let created = 0, updated = 0, gateBlocked = 0;
    const blockerTally = {};
    for (const patient of batch) {
      try {
        const score      = await this.computePatientScore(patient);
        const confidence = interpretabilityService.computeConfidenceScore(score.dataSources, patient);
        const gateResult = await qualityGates.checkRiskScore({
          patientId: patient.patient_id, overall: score.overall, subscores: score.subscores,
          riskLevel: score.riskLevel, recommendations: score.recommendations,
          confidence, dataSources: score.dataSources, patient,
        });
        if (gateResult.hasBlockers) {
          gateBlocked++;
          // Tallied and reported once per run instead of one warn per patient: a normal run
          // blocks most patients for incomplete data and printed ~136 identical lines. The
          // per-patient audit trail is logGateResult() -> ai_quality_gate_log, which is the
          // record that actually matters and is unchanged.
          for (const blocker of gateResult.blockers) {
            blockerTally[blocker.code] = (blockerTally[blocker.code] || 0) + 1;
          }
          await qualityGates.logGateResult(gateResult, { source: 'health_risk_cron' });
          continue;
        }
        const explanation = interpretabilityService.buildRiskScoreExplanation(patient, score.subscores, score.dataSources);
        const result = await db.query(`
          INSERT INTO ai_health_risk_scores
            (patient_id, overall_score, risk_level, subscores, risk_factors, recommendations,
             data_sources, model_version, shap_values, feature_attributions, counterfactuals,
             confidence_score, data_completeness, valid_until, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()+INTERVAL '6 hours',NOW())
          ON CONFLICT (patient_id) DO UPDATE SET
            overall_score=$2, risk_level=$3, subscores=$4, risk_factors=$5, recommendations=$6,
            data_sources=$7, model_version=$8, shap_values=$9, feature_attributions=$10,
            counterfactuals=$11, confidence_score=$12, data_completeness=$13,
            valid_until=NOW()+INTERVAL '6 hours', updated_at=NOW()
          RETURNING (xmax=0) as is_insert
        `, [
          patient.patient_id, score.overall, score.riskLevel,
          JSON.stringify(score.subscores), JSON.stringify(score.riskFactors),
          JSON.stringify(score.recommendations), JSON.stringify(score.dataSources), 'v2-bayesian',
          JSON.stringify(explanation.shap), JSON.stringify(explanation.shap.ranked),
          JSON.stringify(explanation.counterfactual), confidence.score, confidence.percent,
        ]);
        if (result.rows[0]?.is_insert) created++; else updated++;
        if (gateResult.hasWarnings) await qualityGates.logGateResult(gateResult, { source: 'health_risk_cron', riskLevel: score.riskLevel });
      } catch (err) {
        console.error(`[HealthRisk] Error for patient ${patient.patient_id}:`, err.message);
      }
    }
    return { created, updated, gateBlocked, blockerTally };
  }

  /**
   * Compute individual patient risk score using Bayesian weighted method
   */
  async computePatientScore(patient) {
    const db = pool;

    // Gather data sources
    const dataSources = {};

    // 1. Latest vitals
    let latestVitals = null;
    try {
      const { rows } = await db.query(`
        SELECT * FROM vitals_records
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC LIMIT 1
      `, [patient.user_id]);
      if (rows.length > 0) {
        latestVitals = rows[0];
        dataSources.vitals = true;
      }
    } catch { dataSources.vitals = false; }

    // 2. Prescription history (last 6 months)
    let prescriptions = [];
    try {
      const { rows } = await db.query(`
        SELECT medications, diagnosis, "chronicConditions", "createdAt"
        FROM prescriptions
        WHERE "patientId" = $1
          AND "createdAt" > NOW() - INTERVAL '6 months'
        ORDER BY "createdAt" DESC
        LIMIT 10
      `, [patient.patient_id]);
      prescriptions = rows;
      dataSources.prescriptions = rows.length;
    } catch { dataSources.prescriptions = 0; }

    // 3. Lab results
    let labResults = [];
    try {
      const { rows } = await db.query(`
        SELECT * FROM lab_orders
        WHERE patient_id = $1
          AND created_at > NOW() - INTERVAL '6 months'
        ORDER BY created_at DESC LIMIT 5
      `, [patient.patient_id]);
      labResults = rows;
      dataSources.labs = rows.length;
    } catch { dataSources.labs = 0; }

    // 4. AI-extracted report lab values
    let reportLabValues = [];
    try {
      const { rows } = await db.query(`
        SELECT parameter_name, value, unit, status, reference_range, report_date
        FROM ai_report_lab_values
        WHERE patient_id = $1
          AND extracted_at > NOW() - INTERVAL '6 months'
        ORDER BY extracted_at DESC
        LIMIT 50
      `, [patient.patient_id]);
      reportLabValues = rows;
      dataSources.report_lab_values = rows.length;
    } catch { dataSources.report_lab_values = 0; }

    // --- Bayesian Scoring ---
    const subscores = {};

    // a. Cardiovascular Risk (0-10, 10 = highest risk)
    subscores.cardiovascular = this.calcCardiovascularRisk(patient, latestVitals, reportLabValues);

    // b. Diabetes Risk
    subscores.diabetes = this.calcDiabetesRisk(patient, latestVitals, labResults, reportLabValues);

    // c. Hypertension Risk
    subscores.hypertension = this.calcHypertensionRisk(latestVitals);

    // d. Medication Adherence (inverted: 10 = good adherence)
    subscores.medication_adherence = this.calcMedicationAdherence(prescriptions, patient);

    // e. Lifestyle Score (10 = healthy)
    subscores.lifestyle = await this.calcLifestyleScore(patient.patient_id);

    // f. Mental Health (10 = good). MED-MIND-001 G-10: this was the literal 7.0
    // for every patient on the platform while being shown to them as a score.
    // Now derived from their own PHQ-9/GAD-7 results, falling back to their mood
    // diary. Absent (not 7, not 5) when they have neither — see the weighting below.
    const mentalHealth = await this.calcMentalHealthScore(patient.patient_id);
    if (mentalHealth) {
      subscores.mental_health = mentalHealth.value;
      dataSources.mental_health = mentalHealth.source;
    }

    // Overall risk score, 0-10 where HIGHER = more risk.
    //
    // MED-MIND-001: the previous loop was `overall += (subscores[key] || 5) *
    // Math.abs(weight)` over weights that were negative for the three
    // "higher = better" subscores. Math.abs() discarded that sign, so good
    // medication adherence, a healthy lifestyle and good mental health all
    // INCREASED the computed risk. It went unnoticed because mental_health was a
    // constant and the other two rarely vary much — but with a real
    // mental_health subscore it would have meant severe depression (low score)
    // making a patient look HEALTHIER. Inverted explicitly here, matching the
    // established `(10 - x) * weight` form in ai-his-score.service.js.
    //
    // A subscore that is absent is EXCLUDED and the remaining weights are
    // renormalised, rather than silently defaulted to 5.
    const WEIGHTS = {
      cardiovascular: 0.25,
      diabetes: 0.20,
      hypertension: 0.20,
      medication_adherence: 0.15,
      lifestyle: 0.10,
      mental_health: 0.10,
    };
    // Subscores where a HIGH value is good, so risk = 10 - value.
    const HIGHER_IS_BETTER = new Set(['medication_adherence', 'lifestyle', 'mental_health']);

    let weighted = 0;
    let weightUsed = 0;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
      const raw = subscores[key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue; // absent -> excluded
      const asRisk = HIGHER_IS_BETTER.has(key) ? (10 - raw) : raw;
      weighted += asRisk * weight;
      weightUsed += weight;
    }
    // Renormalise over the weights actually used; 5.0 only when nothing is known.
    let overall = weightUsed > 0 ? weighted / weightUsed : 5.0;
    overall = Math.max(0, Math.min(10, Math.round(overall * 100) / 100));

    // Risk factors identification
    const riskFactors = [];
    if (subscores.cardiovascular > 6) riskFactors.push('Elevated cardiovascular risk');
    if (subscores.diabetes > 6) riskFactors.push('Diabetes risk indicators present');
    if (subscores.hypertension > 6) riskFactors.push('Hypertension risk');
    if (subscores.medication_adherence < 5) riskFactors.push('Low medication adherence');
    if (subscores.lifestyle < 4) riskFactors.push('Lifestyle modifications recommended');
    // Worded as an observation of the patient's own screening result, never as a
    // diagnosis — the instruments are Tier A, non-diagnostic (MED-MIND-001 §6).
    if (typeof subscores.mental_health === 'number' && subscores.mental_health <= 5) {
      riskFactors.push('Recent mental wellness check-in suggests speaking to a professional');
    }
    if (patient.chronicConditions?.length > 0) {
      riskFactors.push(`Chronic conditions: ${patient.chronicConditions.join(', ')}`);
    }
    if (patient.allergies?.length > 0) {
      riskFactors.push(`Known allergies: ${patient.allergies.join(', ')}`);
    }

    // Calculate BMI if height/weight available
    if (patient.height && patient.weight) {
      const heightM = patient.height / 100;
      const bmi = patient.weight / (heightM * heightM);
      if (bmi > 30) riskFactors.push(`Obesity (BMI: ${bmi.toFixed(1)})`);
      else if (bmi > 25) riskFactors.push(`Overweight (BMI: ${bmi.toFixed(1)})`);
      else if (bmi < 18.5) riskFactors.push(`Underweight (BMI: ${bmi.toFixed(1)})`);
    }

    // Risk level classification
    let riskLevel = 'low';
    if (overall >= 7) riskLevel = 'critical';
    else if (overall >= 5.5) riskLevel = 'high';
    else if (overall >= 3.5) riskLevel = 'moderate';

    // Generate LLM recommendations for high-risk patients
    let recommendations = this.getBaselineRecommendations(subscores, riskFactors);
    if (riskLevel === 'high' || riskLevel === 'critical') {
      try {
        const llmRecs = await this.getLLMRecommendations(patient, subscores, riskFactors);
        if (llmRecs.length > 0) recommendations = llmRecs;
      } catch {
        // Keep baseline recommendations
      }
    }

    return {
      overall: Math.round(overall * 100) / 100,
      riskLevel,
      subscores,
      riskFactors,
      recommendations,
      dataSources
    };
  }

  /**
   * Cardiovascular risk scoring
   */
  calcCardiovascularRisk(patient, vitals, reportLabValues = []) {
    let score = 3.0; // baseline

    // Age factor
    const age = patient.dateOfBirth
      ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 30;
    if (age > 65) score += 2.5;
    else if (age > 50) score += 1.5;
    else if (age > 40) score += 0.5;

    // BMI factor
    if (patient.height && patient.weight) {
      const bmi = patient.weight / Math.pow(patient.height / 100, 2);
      if (bmi > 35) score += 2.0;
      else if (bmi > 30) score += 1.5;
      else if (bmi > 25) score += 0.5;
    }

    // Vitals factor
    if (vitals) {
      const systolic = vitals.bloodPressureSystolic || vitals.systolic;
      if (systolic > 160) score += 2.0;
      else if (systolic > 140) score += 1.5;
      else if (systolic > 130) score += 0.5;

      const hr = vitals.heartRate || vitals.heart_rate;
      if (hr && (hr > 100 || hr < 50)) score += 1.0;
    }

    // Chronic conditions
    const conditions = patient.chronicConditions || [];
    if (conditions.some(c => /heart|cardiac|coronary/i.test(c))) score += 2.0;
    if (conditions.some(c => /cholesterol|lipid/i.test(c))) score += 1.0;

    // Report lab values — cholesterol, triglycerides, LDL
    for (const lv of reportLabValues) {
      const name = (lv.parameter_name || '').toLowerCase();
      const val = parseFloat(lv.value);
      if (isNaN(val)) continue;

      if (/total\s*cholesterol/i.test(name) && val > 240) score += 1.5;
      else if (/ldl/i.test(name) && val > 160) score += 1.5;
      else if (/triglyceride/i.test(name) && val > 200) score += 1.0;
      else if (/hdl/i.test(name) && val < 40) score += 1.0;
      if (lv.status === 'high' || lv.status === 'critical') {
        if (/cholesterol|ldl|triglyceride|crp|homocysteine/i.test(name)) score += 0.5;
      }
    }

    return Math.min(10, Math.max(0, score));
  }

  /**
   * Diabetes risk scoring
   */
  calcDiabetesRisk(patient, vitals, labs, reportLabValues = []) {
    let score = 2.0;

    const conditions = patient.chronicConditions || [];
    if (conditions.some(c => /diabetes|diabetic|dm|hba1c/i.test(c))) score += 3.0;

    // BMI
    if (patient.height && patient.weight) {
      const bmi = patient.weight / Math.pow(patient.height / 100, 2);
      if (bmi > 30) score += 2.0;
      else if (bmi > 25) score += 1.0;
    }

    // Age factor
    const age = patient.dateOfBirth
      ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 30;
    if (age > 45) score += 1.0;

    // Report lab values — glucose, HbA1c, insulin
    for (const lv of reportLabValues) {
      const name = (lv.parameter_name || '').toLowerCase();
      const val = parseFloat(lv.value);
      if (isNaN(val)) continue;

      if (/hba1c|glycated\s*h/i.test(name)) {
        if (val > 6.5) score += 3.0;
        else if (val > 5.7) score += 1.5;
      } else if (/fasting.*glucose|glucose.*fasting|fbs/i.test(name)) {
        if (val > 126) score += 2.5;
        else if (val > 100) score += 1.0;
      } else if (/random.*glucose|glucose|blood\s*sugar|rbs/i.test(name)) {
        if (val > 200) score += 2.5;
        else if (val > 140) score += 1.0;
      }
      if (lv.status === 'high' || lv.status === 'critical') {
        if (/glucose|sugar|hba1c|insulin/i.test(name)) score += 0.5;
      }
    }

    return Math.min(10, Math.max(0, score));
  }

  /**
   * Hypertension risk scoring
   */
  calcHypertensionRisk(vitals) {
    let score = 2.0;

    if (vitals) {
      const sys = vitals.bloodPressureSystolic || vitals.systolic;
      const dia = vitals.bloodPressureDiastolic || vitals.diastolic;

      if (sys > 180 || dia > 120) score = 9.0;
      else if (sys > 160 || dia > 100) score = 7.5;
      else if (sys > 140 || dia > 90) score = 6.0;
      else if (sys > 130 || dia > 85) score = 4.5;
      else if (sys > 120 || dia > 80) score = 3.0;
    }

    return Math.min(10, Math.max(0, score));
  }

  /**
   * Medication adherence scoring (higher = better)
   */
  calcMedicationAdherence(prescriptions, patient) {
    if (prescriptions.length === 0) return 7.0; // No prescriptions = baseline good

    const currentMeds = patient.currentMedications || [];
    const prescribedMeds = prescriptions.flatMap(p => {
      const meds = p.medications;
      if (Array.isArray(meds)) return meds.map(m => m.name || m.medicine || m);
      return [];
    });

    // If patient has current medications listed → assume adherent
    if (currentMeds.length > 0) return 8.0;
    if (prescribedMeds.length > 0 && currentMeds.length === 0) return 5.0;

    return 7.0;
  }

  /**
   * Lifestyle score from wellness logs (higher = healthier)
   */
  /**
   * MED-MIND-001 G-10 — mental-health subscore from the patient's own data.
   *
   * Prefers a validated instrument result (PHQ-9 / GAD-7) from the last 6
   * months; falls back to their mood diary over the last 30 days. Returns null
   * when neither exists, so the caller omits the subscore instead of inventing
   * one. Every failure path returns null rather than a number: a missing table
   * or a query error must never be reported to a patient as a score.
   *
   * Note the patient_id -> user_id hop: program_enrollments is keyed by user_id
   * and health_diary by userId, while this service works in patient_id.
   */
  async calcMentalHealthScore(patientId) {
    const db = pool;
    let userId = null;
    try {
      const { rows } = await db.query(`SELECT "userId" FROM patients WHERE id = $1`, [patientId]);
      userId = rows[0]?.userId ?? null;
    } catch { return null; }
    if (!userId) return null;

    const instrumentResults = [];
    try {
      // Latest result per instrument for this user, across all their enrollments.
      const { rows } = await db.query(`
        SELECT DISTINCT ON (r.instrument_code)
               r.instrument_code, r.severity_band, r.administered_at
          FROM program_assessment_responses r
          JOIN program_enrollments e ON e.id = r.enrollment_id
         WHERE e.user_id = $1
           AND r.administered_at > NOW() - INTERVAL '6 months'
           AND r.severity_band IS NOT NULL
         ORDER BY r.instrument_code, r.administered_at DESC
      `, [userId]);
      for (const r of rows) {
        instrumentResults.push({ instrumentCode: r.instrument_code, band: r.severity_band });
      }
    } catch { /* table absent or unreadable — fall through to the diary */ }

    let moodAverage;
    if (!instrumentResults.length) {
      try {
        const { rows } = await db.query(`
          SELECT AVG(mood)::numeric AS avg_mood, COUNT(mood)::int AS n
            FROM health_diary
           WHERE "userId" = $1
             AND mood IS NOT NULL
             AND "entryDate" > NOW() - INTERVAL '30 days'
        `, [userId]);
        // Require at least 3 entries: one bad day is not a mental-health score.
        if (rows[0] && rows[0].n >= 3) moodAverage = Number(rows[0].avg_mood);
      } catch { /* ignore */ }
    }

    return resolveMentalHealthSubscore({ instrumentResults, moodAverage });
  }

  async calcLifestyleScore(patientId) {
    try {
      const db = pool;
      const { rows } = await db.query(`
        SELECT metric_type, metric_value
        FROM ai_wellness_logs
        WHERE patient_id = $1
          AND created_at > NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT 30
      `, [patientId]);

      if (rows.length === 0) return 6.0; // No data = baseline

      let score = 6.0;
      const steps = rows.filter(r => r.metric_type === 'steps');
      const sleep = rows.filter(r => r.metric_type === 'sleep_hours');

      if (steps.length > 0) {
        const avgSteps = steps.reduce((s, r) => s + (parseFloat(r.metric_value) || 0), 0) / steps.length;
        if (avgSteps >= 10000) score += 2.0;
        else if (avgSteps >= 7000) score += 1.0;
        else if (avgSteps < 3000) score -= 1.0;
      }

      if (sleep.length > 0) {
        const avgSleep = sleep.reduce((s, r) => s + (parseFloat(r.metric_value) || 0), 0) / sleep.length;
        if (avgSleep >= 7 && avgSleep <= 9) score += 1.0;
        else if (avgSleep < 5) score -= 1.0;
      }

      return Math.min(10, Math.max(0, score));
    } catch {
      return 6.0;
    }
  }

  /**
   * Baseline recommendations based on subscores
   */
  getBaselineRecommendations(subscores, riskFactors) {
    const recs = [];

    if (subscores.cardiovascular > 6) {
      recs.push('Schedule a cardiovascular health checkup');
      recs.push('Monitor blood pressure daily');
    }
    if (subscores.diabetes > 6) {
      recs.push('Get HbA1c levels tested');
      recs.push('Monitor blood glucose regularly');
    }
    if (subscores.hypertension > 6) {
      recs.push('Follow DASH diet for blood pressure management');
      recs.push('Reduce sodium intake to < 2300mg/day');
    }
    if (subscores.medication_adherence < 5) {
      recs.push('Set medication reminders');
      recs.push('Discuss medication concerns with your doctor');
    }
    if (subscores.lifestyle < 5) {
      recs.push('Aim for 30 minutes of moderate exercise daily');
      recs.push('Ensure 7-8 hours of quality sleep');
    }

    if (recs.length === 0) {
      recs.push('Maintain your current healthy lifestyle');
      recs.push('Schedule annual preventive health checkup');
    }

    return recs;
  }

  /**
   * Get LLM-enhanced recommendations for high-risk patients
   */
  async getLLMRecommendations(patient, subscores, riskFactors) {
    try {
      const prompt = `You are a preventive health AI. Based on the following patient risk profile, provide 3-5 specific, actionable health recommendations. Be concise.

Patient Profile:
- Age: ${patient.dateOfBirth ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'unknown'}
- Gender: ${patient.gender || 'unknown'}
- Chronic Conditions: ${(patient.chronicConditions || []).join(', ') || 'none reported'}
- Allergies: ${(patient.allergies || []).join(', ') || 'none'}

Risk Scores (0-10, higher = more risk):
${Object.entries(subscores).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Identified Risk Factors:
${riskFactors.join('\n')}

Respond with ONLY a JSON array of recommendation strings. Example: ["Rec 1", "Rec 2"]`;

      const result = await llmProvider.chat({
        messages: [{ role: 'user', content: prompt }],
        tools: null,
        conversationId: `risk-score-${patient.patient_id}`,
        skipCache: true, // per-patient recommendations — never serve from a shared cache
      });

      const content = result.content || '';
      // Extract JSON array from response  
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (err) {
      console.error('[HealthRisk] LLM recommendations error:', err.message);
    }
    return [];
  }
}

const healthRiskScoreCron = new HealthRiskScoreCron();
export default healthRiskScoreCron;
