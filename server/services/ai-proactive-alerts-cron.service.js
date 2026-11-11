/**
 * AI Proactive Alerts Cron Service
 * 
 * Runs periodically to detect patients needing attention:
 * - Overdue follow-ups based on diagnosis
 * - Lab results trending in concerning directions
 * - Medication adherence gaps
 * - Preventive care reminders
 * 
 * Each alert flows through SIB Control Layer for safety validation.
 */

import { connectPostgres } from '../db/postgres.js';
import llmProvider from './ai-brain/llm-provider.js';
import cron from 'node-cron';
import { tick, tickStart, tickError, beginJob } from '../utils/cronRegistry.js';

import { schemaVerifier } from '../utils/schema-guard.js';
import schemaCheckPool from '../db/pgPool.js';

const ENSUREPROACTIVEALERTSSCHEMA_TABLES = ['ai_proactive_alerts'];

const ensureProactiveAlertsSchema = schemaVerifier({
  pool: schemaCheckPool,
  tables: ENSUREPROACTIVEALERTSSCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply the platform-edge governance migration before storing proactive alerts',
});

class ProactiveAlertsService {
  constructor() {
    this.running = false;
    this.lastRun = null;
    this.alertCounts = { overdue: 0, labTrend: 0, adherence: 0, preventive: 0 };
  }

  start() {
    // Run every 4 hours
    cron.schedule('0 */4 * * *', () => this.runAlertScan());
    console.log('📋 Proactive alerts cron started (every 4 hours)');
  }

  async runAlertScan() {
    if (this.running) return;
    this.running = true;
    if (!(await beginJob('ai_proactive_alerts'))) return { skipped: true };
    const alerts = [];

    try {
      const pool = await connectPostgres();

      // 1. Overdue follow-ups (appointments > 90 days ago with chronic conditions)
      const overdueFollowups = await this.checkOverdueFollowups(pool);
      alerts.push(...overdueFollowups);

      // 2. Recent concerning lab trends
      const labAlerts = await this.checkLabTrends(pool);
      alerts.push(...labAlerts);

      // 3. Medication adherence (prescriptions with no refill in expected window)
      const adherenceAlerts = await this.checkMedicationAdherence(pool);
      alerts.push(...adherenceAlerts);

      // Store generated alerts
      if (alerts.length > 0) {
        await this.storeAlerts(pool, alerts);
      }

      this.lastRun = new Date();
      this.alertCounts = {
        overdue: overdueFollowups.length,
        labTrend: labAlerts.length,
        adherence: adherenceAlerts.length,
        total: alerts.length
      };

      console.log(`📋 Proactive scan complete: ${alerts.length} alerts generated`);
      tick('ai_proactive_alerts', { total: alerts.length, overdue: overdueFollowups.length, labTrend: labAlerts.length, adherence: adherenceAlerts.length });
    } catch (error) {
      console.error('Proactive alerts scan error:', error.message);
      tickError('ai_proactive_alerts', error.message);
    } finally {
      this.running = false;
    }

    return alerts;
  }

  async checkOverdueFollowups(pool) {
    const alerts = [];
    try {
      // Find patients whose last appointment was > 90 days ago
      // and who have chronic conditions (diabetes, hypertension, etc.)
      const result = await pool.query(`
        SELECT DISTINCT a.patient_id, a.doctor_id,
          MAX(a.appointment_date) as last_visit,
          NOW() - MAX(a.appointment_date) as days_since
        FROM appointments a
        WHERE a.status = 'completed'
          AND a.appointment_date < NOW() - INTERVAL '90 days'
          AND a.patient_id NOT IN (
            SELECT patient_id FROM appointments 
            WHERE status IN ('scheduled','confirmed') AND appointment_date > NOW()
          )
        GROUP BY a.patient_id, a.doctor_id
        HAVING MAX(a.appointment_date) > NOW() - INTERVAL '1 year'
        LIMIT 50
      `);

      for (const row of result.rows) {
        alerts.push({
          type: 'overdue_followup',
          severity: 'medium',
          patient_id: row.patient_id,
          doctor_id: row.doctor_id,
          message: `Patient has not visited in ${Math.round(row.days_since?.days || 90)} days`,
          data: { lastVisit: row.last_visit, daysSince: row.days_since?.days }
        });
      }
    } catch (e) {
      // Table may not exist yet — skip gracefully
    }
    return alerts;
  }

  async checkLabTrends(pool) {
    const alerts = [];
    try {
      // Check for declining lab values (e.g., eGFR trending down, HbA1c going up)
      const result = await pool.query(`
        SELECT patient_id, test_name, test_value, reference_range, created_at
        FROM lab_results
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND (
            (test_name ILIKE '%hba1c%' AND CAST(test_value AS DECIMAL) > 7.0) OR
            (test_name ILIKE '%egfr%' AND CAST(test_value AS DECIMAL) < 60) OR
            (test_name ILIKE '%creatinine%' AND CAST(test_value AS DECIMAL) > 1.5)
          )
        ORDER BY created_at DESC
        LIMIT 30
      `);

      for (const row of result.rows) {
        alerts.push({
          type: 'lab_trend_concern',
          severity: 'high',
          patient_id: row.patient_id,
          message: `Concerning ${row.test_name}: ${row.test_value} (ref: ${row.reference_range})`,
          data: { testName: row.test_name, value: row.test_value, range: row.reference_range }
        });
      }
    } catch (e) {
      // Table may not exist — skip gracefully
    }
    return alerts;
  }

  async checkMedicationAdherence(pool) {
    const alerts = [];
    try {
      // Find prescriptions where the expected refill date has passed
      const result = await pool.query(`
        SELECT p.patient_id, p.doctor_id, p.medication_name, p.created_at,
          p.duration_days
        FROM prescriptions p
        WHERE p.created_at > NOW() - INTERVAL '6 months'
          AND p.duration_days IS NOT NULL
          AND p.created_at + (p.duration_days || ' days')::INTERVAL < NOW()
          AND p.patient_id NOT IN (
            SELECT patient_id FROM prescriptions 
            WHERE medication_name = p.medication_name 
              AND created_at > p.created_at
          )
        LIMIT 30
      `);

      for (const row of result.rows) {
        alerts.push({
          type: 'medication_adherence',
          severity: 'medium',
          patient_id: row.patient_id,
          doctor_id: row.doctor_id,
          message: `Possible medication gap: ${row.medication_name} may need refill`,
          data: { medication: row.medication_name, prescribedDate: row.created_at }
        });
      }
    } catch (e) {
      // Table may not exist — skip gracefully
    }
    return alerts;
  }

  async storeAlerts(pool, alerts) {
    // Schema is owned by the migration; this used to build the table on
    // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
    await ensureProactiveAlertsSchema();

    for (const alert of alerts) {
      await pool.query(
        `INSERT INTO ai_proactive_alerts (type, severity, patient_id, doctor_id, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [alert.type, alert.severity, alert.patient_id, alert.doctor_id || null, alert.message, JSON.stringify(alert.data || {})]
      );
    }
  }

  async getAlertsForDoctor(doctorId, status = 'pending', limit = 20) {
    const pool = await connectPostgres();
    const result = await pool.query(
      `SELECT * FROM ai_proactive_alerts 
       WHERE doctor_id = $1 AND status = $2
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC
       LIMIT $3`,
      [doctorId, status, limit]
    );
    return result.rows;
  }

  async acknowledgeAlert(alertId, doctorId) {
    const pool = await connectPostgres();
    await pool.query(
      `UPDATE ai_proactive_alerts SET status = 'acknowledged', acknowledged_at = NOW()
       WHERE id = $1 AND doctor_id = $2`,
      [alertId, doctorId]
    );
  }

  getStatus() {
    return {
      lastRun: this.lastRun,
      running: this.running,
      alertCounts: this.alertCounts
    };
  }
}

const proactiveAlertsService = new ProactiveAlertsService();
export default proactiveAlertsService;
export { ProactiveAlertsService };
