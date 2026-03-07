/**
 * AI Clinical Insights Cron Service
 * ====================================
 * Analyzes patient populations and individual records to generate
 * actionable clinical insights for doctors and hospital admins.
 * 
 * Insight types:
 *   - trend_alert: Patient vitals showing worsening trend
 *   - adherence_gap: Medication non-adherence patterns
 *   - comorbidity_risk: Unmanaged comorbidity combinations
 *   - population_health: Aggregate disease pattern insights
 *   - preventive_care: Overdue screenings/vaccines
 *   - readmission_risk: Patients likely to revisit within 30 days
 * 
 * Populates: ai_clinical_insights table
 * Schedule: Every 8 hours
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';

class ClinicalInsightsCron {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Clinical insights cron already running');
      return;
    }

    this.isRunning = true;

    // Initial run after 2 minutes
    setTimeout(() => {
      this.generateInsights().catch(err =>
        console.error('[ClinicalInsights] Initial run error:', err.message)
      );
    }, 120000);

    // Run every 8 hours
    this.cronJob = cron.schedule('0 */8 * * *', async () => {
      await this.generateInsights();
    });

    console.log('✅ AI Clinical Insights cron started (every 8 hours)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('🛑 Clinical Insights cron stopped');
    }
  }

  async generateInsights() {
    const startTime = Date.now();
    console.log('🔬 [ClinicalInsights] Generating clinical insights...');

    try {
      const db = pool;
      let total = 0;

      // 1. Vitals trend alerts
      total += await this.analyzeVitalsTrends(db);

      // 2. Medication adherence gaps
      total += await this.analyzeMedicationAdherence(db);

      // 3. Comorbidity risk combinations
      total += await this.analyzeComorbidityRisks(db);

      // 4. Population health insights
      total += await this.analyzePopulationHealth(db);

      // 5. Preventive care reminders
      total += await this.analyzePreventiveCare(db);

      // 6. Readmission risk analysis
      total += await this.analyzeReadmissionRisk(db);

      // Cleanup old insights
      await this.cleanupExpiredInsights(db);

      const elapsed = Date.now() - startTime;
      console.log(`✅ [ClinicalInsights] Generated ${total} insights in ${elapsed}ms`);

    } catch (error) {
      console.error('❌ [ClinicalInsights] Cron error:', error.message);
    }
  }

  /**
   * Detect worsening vitals trends across consecutive readings
   */
  async analyzeVitalsTrends(db) {
    let count = 0;
    try {
      // Find patients with multiple recent vitals readings showing deterioration
      const { rows } = await db.query(`
        WITH recent_vitals AS (
          SELECT "userId" as patient_id,
                 "bloodPressureSystolic" as systolic, "bloodPressureDiastolic" as diastolic,
                 "heartRate" as heart_rate, "oxygenSaturation" as oxygen_saturation, temperature,
                 "createdAt" as created_at,
                 ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC) as rn
          FROM vitals_records
          WHERE "createdAt" > NOW() - INTERVAL '30 days'
        )
        SELECT 
          a.patient_id,
          a.systolic as latest_systolic, a.diastolic as latest_diastolic,
          a.heart_rate as latest_hr, a.oxygen_saturation as latest_spo2,
          b.systolic as prev_systolic, b.diastolic as prev_diastolic,
          b.heart_rate as prev_hr, b.oxygen_saturation as prev_spo2
        FROM recent_vitals a
        JOIN recent_vitals b ON a.patient_id = b.patient_id AND b.rn = 2
        WHERE a.rn = 1
      `);

      for (const row of rows) {
        const alerts = [];

        // Check BP trend
        if (row.latest_systolic && row.prev_systolic) {
          const bpChange = row.latest_systolic - row.prev_systolic;
          if (bpChange > 20) {
            alerts.push(`Blood pressure rising: ${row.prev_systolic}→${row.latest_systolic} mmHg (+${bpChange})`);
          }
          if (bpChange < -20 && row.latest_systolic < 100) {
            alerts.push(`Blood pressure dropping: ${row.prev_systolic}→${row.latest_systolic} mmHg (${bpChange})`);
          }
        }

        // Check SpO2 trend
        if (row.latest_spo2 && row.prev_spo2) {
          const spo2Change = row.latest_spo2 - row.prev_spo2;
          if (spo2Change < -3 && row.latest_spo2 < 95) {
            alerts.push(`Oxygen saturation declining: ${row.prev_spo2}%→${row.latest_spo2}% (${spo2Change}%)`);
          }
        }

        // Check HR trend
        if (row.latest_hr && row.prev_hr) {
          const hrChange = row.latest_hr - row.prev_hr;
          if (Math.abs(hrChange) > 20) {
            alerts.push(`Heart rate change: ${row.prev_hr}→${row.latest_hr} bpm (${hrChange > 0 ? '+' : ''}${hrChange})`);
          }
        }

        for (const alert of alerts) {
          const inserted = await this.insertInsight(db, {
            type: 'trend_alert',
            targetType: 'patient',
            targetId: row.patient_id,
            title: 'Vitals Trend Alert',
            description: alert,
            severity: alert.includes('dropping') || alert.includes('declining') ? 'warning' : 'info',
            isActionable: true,
            data: { latestVitals: { systolic: row.latest_systolic, diastolic: row.latest_diastolic, hr: row.latest_hr, spo2: row.latest_spo2 } }
          });
          if (inserted) count++;
        }
      }
    } catch (err) {
      console.error('[ClinicalInsights] Vitals trends error:', err.message);
    }
    return count;
  }

  /**
   * Analyze medication adherence patterns
   */
  async analyzeMedicationAdherence(db) {
    let count = 0;
    try {
      // Find patients with active prescriptions but no pharmacy fills
      const { rows } = await db.query(`
        SELECT p."patientId", p.medications, p."patientName", p."createdAt",
               p.status, p."validUntil"
        FROM prescriptions p
        WHERE p.status = 'issued'
          AND p."createdAt" > NOW() - INTERVAL '60 days'
          AND p."dispensedAt" IS NULL
          AND p.medications IS NOT NULL
          AND jsonb_array_length(COALESCE(p.medications, '[]'::jsonb)) > 0
        LIMIT 30
      `);

      for (const row of rows) {
        const daysSinceRx = Math.floor((Date.now() - new Date(row.createdAt).getTime()) / (86400000));
        if (daysSinceRx < 7) continue; // Give time to fill

        const medNames = Array.isArray(row.medications) 
          ? row.medications.map(m => m.name || m.medicine || '').filter(Boolean).slice(0, 3).join(', ')
          : 'prescribed medications';

        const inserted = await this.insertInsight(db, {
          type: 'adherence_gap',
          targetType: 'patient',
          targetId: row.patientId,
          title: 'Medication Not Dispensed',
          description: `Prescription for ${medNames} issued ${daysSinceRx} days ago has not been dispensed. Patient may not be adhering to treatment plan.`,
          severity: daysSinceRx > 30 ? 'warning' : 'info',
          isActionable: true,
          data: { daysSinceRx, medications: medNames }
        });
        if (inserted) count++;
      }
    } catch (err) {
      console.error('[ClinicalInsights] Adherence analysis error:', err.message);
    }
    return count;
  }

  /**
   * Identify risky comorbidity combinations
   */
  async analyzeComorbidityRisks(db) {
    let count = 0;
    try {
      const { rows } = await db.query(`
        SELECT p.id as patient_id, p."chronicConditions", p."currentMedications", p.allergies
        FROM patients p
        WHERE p.status = 'active'
          AND p."chronicConditions" IS NOT NULL
          AND array_length(p."chronicConditions", 1) >= 2
        LIMIT 50
      `);

      const riskyPairs = [
        { cond1: /diabetes/i, cond2: /hypertension/i, risk: 'Diabetic hypertension increases cardiovascular event risk 2-4x', severity: 'warning' },
        { cond1: /diabetes/i, cond2: /kidney|renal|ckd/i, risk: 'Diabetic nephropathy risk — monitor eGFR quarterly', severity: 'warning' },
        { cond1: /heart|cardiac/i, cond2: /copd|asthma/i, risk: 'Cardiac + respiratory comorbidity — careful medication selection required', severity: 'warning' },
        { cond1: /liver|hepat/i, cond2: /diabetes/i, risk: 'Hepatic + diabetic — NAFLD risk, metformin dose adjustment may be needed', severity: 'info' },
      ];

      for (const patient of rows) {
        const conditions = patient.chronicConditions || [];
        for (const pair of riskyPairs) {
          const hasCond1 = conditions.some(c => pair.cond1.test(c));
          const hasCond2 = conditions.some(c => pair.cond2.test(c));

          if (hasCond1 && hasCond2) {
            const inserted = await this.insertInsight(db, {
              type: 'comorbidity_risk',
              targetType: 'patient',
              targetId: patient.patient_id,
              title: 'Comorbidity Risk Alert',
              description: pair.risk,
              severity: pair.severity,
              isActionable: true,
              data: { conditions: conditions }
            });
            if (inserted) count++;
          }
        }
      }
    } catch (err) {
      console.error('[ClinicalInsights] Comorbidity analysis error:', err.message);
    }
    return count;
  }

  /**
   * Population-level health insights for admin/hospital dashboards
   */
  async analyzePopulationHealth(db) {
    let count = 0;
    try {
      // Top chronic conditions distribution
      const { rows: condStats } = await db.query(`
        SELECT unnest("chronicConditions") as condition, COUNT(*) as patient_count
        FROM patients
        WHERE "chronicConditions" IS NOT NULL AND array_length("chronicConditions", 1) > 0
        GROUP BY condition
        ORDER BY patient_count DESC
        LIMIT 10
      `);

      if (condStats.length > 0) {
        const topConditions = condStats.map(r => `${r.condition} (${r.patient_count} patients)`).join(', ');
        const inserted = await this.insertInsight(db, {
          type: 'population_health',
          targetType: 'system',
          targetId: null,
          title: 'Top Chronic Conditions Distribution',
          description: `Most prevalent chronic conditions: ${topConditions}`,
          severity: 'info',
          isActionable: false,
          data: { conditions: condStats }
        });
        if (inserted) count++;
      }

      // Appointment volume trends
      const { rows: apptStats } = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE status = 'no_show') as no_shows,
          COUNT(*) as total
        FROM appointments
        WHERE "createdAt" > NOW() - INTERVAL '7 days'
      `);

      if (apptStats.length > 0 && apptStats[0].total > 0) {
        const stats = apptStats[0];
        const cancelRate = ((stats.cancelled / stats.total) * 100).toFixed(1);
        if (parseFloat(cancelRate) > 20) {
          const inserted = await this.insertInsight(db, {
            type: 'population_health',
            targetType: 'system',
            targetId: null,
            title: 'High Cancellation Rate Alert',
            description: `${cancelRate}% appointment cancellation rate this week (${stats.cancelled}/${stats.total}). Consider patient outreach.`,
            severity: 'warning',
            isActionable: true,
            data: stats
          });
          if (inserted) count++;
        }
      }
    } catch (err) {
      console.error('[ClinicalInsights] Population health error:', err.message);
    }
    return count;
  }

  /**
   * Preventive care gap analysis
   */
  async analyzePreventiveCare(db) {
    let count = 0;
    try {
      // Find patients without recent lab work who have chronic conditions
      const { rows } = await db.query(`
        SELECT p.id as patient_id, p."chronicConditions", p."lastVisitDate"
        FROM patients p
        WHERE p.status = 'active'
          AND p."chronicConditions" IS NOT NULL
          AND array_length(p."chronicConditions", 1) > 0
          AND NOT EXISTS (
            SELECT 1 FROM lab_orders lo
            WHERE lo.patient_id = p.id
              AND lo.created_at > NOW() - INTERVAL '6 months'
          )
          AND NOT EXISTS (
            SELECT 1 FROM ai_clinical_insights ci
            WHERE ci.target_id = p.id
              AND ci.insight_type = 'preventive_care'
              AND ci.created_at > NOW() - INTERVAL '30 days'
          )
        LIMIT 20
      `);

      for (const patient of rows) {
        const conditions = (patient.chronicConditions || []).join(', ');
        const inserted = await this.insertInsight(db, {
          type: 'preventive_care',
          targetType: 'patient',
          targetId: patient.patient_id,
          title: 'Lab Work Overdue',
          description: `Patient with ${conditions} has no lab orders in 6+ months. Recommend routine monitoring labs.`,
          severity: 'info',
          isActionable: true,
          data: { chronicConditions: patient.chronicConditions, lastVisit: patient.lastVisitDate }
        });
        if (inserted) count++;
      }
    } catch (err) {
      console.error('[ClinicalInsights] Preventive care error:', err.message);
    }
    return count;
  }

  /**
   * Readmission risk analysis
   */
  async analyzeReadmissionRisk(db) {
    let count = 0;
    try {
      // Patients with multiple visits in short timeframe
      const { rows } = await db.query(`
        SELECT p.id as patient_id, p."totalVisits", p."lastVisitDate",
               p."chronicConditions"
        FROM patients p
        WHERE p.status = 'active'
          AND p."totalVisits" >= 3
          AND p."lastVisitDate" > NOW() - INTERVAL '30 days'
          AND NOT EXISTS (
            SELECT 1 FROM ai_clinical_insights ci
            WHERE ci.target_id = p.id
              AND ci.insight_type = 'readmission_risk'
              AND ci.created_at > NOW() - INTERVAL '14 days'
          )
        LIMIT 20
      `);

      for (const patient of rows) {
        if (patient.totalVisits >= 5) {
          const inserted = await this.insertInsight(db, {
            type: 'readmission_risk',
            targetType: 'patient',
            targetId: patient.patient_id,
            title: 'High Readmission Risk',
            description: `Patient has ${patient.totalVisits} visits with last visit ${new Date(patient.lastVisitDate).toLocaleDateString()}. May indicate inadequate treatment or complex care needs.`,
            severity: 'warning',
            isActionable: true,
            data: { totalVisits: patient.totalVisits, conditions: patient.chronicConditions }
          });
          if (inserted) count++;
        }
      }
    } catch (err) {
      console.error('[ClinicalInsights] Readmission risk error:', err.message);
    }
    return count;
  }

  /**
   * Insert a clinical insight (with deduplication)
   */
  async insertInsight(db, { type, targetType, targetId, title, description, severity, isActionable, data }) {
    try {
      // Check for recent duplicate
      const { rows } = await db.query(`
        SELECT id FROM ai_clinical_insights
        WHERE insight_type = $1 AND target_type = $2 AND COALESCE(target_id, 0) = COALESCE($3, 0)
          AND title = $4
          AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      `, [type, targetType, targetId, title]);

      if (rows.length > 0) return false;

      await db.query(`
        INSERT INTO ai_clinical_insights 
          (insight_type, target_type, target_id, title, description, severity, data, is_actionable, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '30 days', NOW())
      `, [type, targetType, targetId, title, description, severity, JSON.stringify(data || {}), isActionable]);

      return true;
    } catch (err) {
      console.error('[ClinicalInsights] Insert error:', err.message);
      return false;
    }
  }

  /**
   * Clean up expired insights
   */
  async cleanupExpiredInsights(db) {
    try {
      const { rowCount } = await db.query(`
        DELETE FROM ai_clinical_insights
        WHERE expires_at < NOW()
      `);
      if (rowCount > 0) {
        console.log(`[ClinicalInsights] Cleaned up ${rowCount} expired insights`);
      }
    } catch (err) {
      console.error('[ClinicalInsights] Cleanup error:', err.message);
    }
  }
}

const clinicalInsightsCron = new ClinicalInsightsCron();
export default clinicalInsightsCron;
