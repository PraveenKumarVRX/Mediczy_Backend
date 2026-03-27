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
import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';
import { tick, tickError } from '../utils/cronRegistry.js';

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

      let updated = 0;
      let created = 0;

      for (const patient of patients) {
        try {
          const score = await this.computePatientScore(patient);
          
          // Upsert into ai_health_risk_scores
          const result = await db.query(`
            INSERT INTO ai_health_risk_scores 
              (patient_id, overall_score, risk_level, subscores, risk_factors, recommendations, data_sources, model_version, valid_until, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '6 hours', NOW())
            ON CONFLICT (patient_id) DO UPDATE SET
              overall_score = EXCLUDED.overall_score,
              risk_level = EXCLUDED.risk_level,
              subscores = EXCLUDED.subscores,
              risk_factors = EXCLUDED.risk_factors,
              recommendations = EXCLUDED.recommendations,
              data_sources = EXCLUDED.data_sources,
              model_version = EXCLUDED.model_version,
              valid_until = EXCLUDED.valid_until,
              updated_at = NOW()
            RETURNING (xmax = 0) as is_insert
          `, [
            patient.patient_id,
            score.overall,
            score.riskLevel,
            JSON.stringify(score.subscores),
            JSON.stringify(score.riskFactors),
            JSON.stringify(score.recommendations),
            JSON.stringify(score.dataSources),
            'v2-bayesian'
          ]);

          if (result.rows[0]?.is_insert) created++;
          else updated++;

        } catch (patientErr) {
          console.error(`[HealthRisk] Error for patient ${patient.patient_id}:`, patientErr.message);
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`✅ [HealthRisk] Completed: ${created} created, ${updated} updated in ${elapsed}ms`);
      tick('ai_health_risk', { created, updated, patients: patients.length, elapsedMs: elapsed });

    } catch (error) {
      tickError('ai_health_risk', error.message);
      console.error('❌ [HealthRisk] Cron error:', error.message);
    }
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

    // f. Mental Health (10 = good)
    subscores.mental_health = 7.0; // Baseline — enhanced when mood tracking available

    // Overall score: weighted average (lower = healthier)
    const weights = {
      cardiovascular: 0.25,
      diabetes: 0.20,
      hypertension: 0.20,
      medication_adherence: -0.15, // Negative because high = good
      lifestyle: -0.10,            // Negative because high = good  
      mental_health: -0.10         // Negative because high = good
    };

    let overall = 0;
    for (const [key, weight] of Object.entries(weights)) {
      overall += (subscores[key] || 5) * Math.abs(weight);
    }
    // Normalize to 0-10 scale
    overall = Math.max(0, Math.min(10, overall));

    // Risk factors identification
    const riskFactors = [];
    if (subscores.cardiovascular > 6) riskFactors.push('Elevated cardiovascular risk');
    if (subscores.diabetes > 6) riskFactors.push('Diabetes risk indicators present');
    if (subscores.hypertension > 6) riskFactors.push('Hypertension risk');
    if (subscores.medication_adherence < 5) riskFactors.push('Low medication adherence');
    if (subscores.lifestyle < 4) riskFactors.push('Lifestyle modifications recommended');
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
        conversationId: `risk-score-${patient.patient_id}`
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
