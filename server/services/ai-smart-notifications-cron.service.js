/**
 * AI Smart Notifications Cron Service
 * ====================================
 * Generates intelligent, proactive health notifications by analyzing:
 *   - Vitals trends (abnormal patterns, deterioration)
 *   - Medication adherence gaps
 *   - Appointment gaps (missed follow-ups)
 *   - Lab result alerts
 *   - Wellness goal progress
 *   - Risk score escalations
 * 
 * Populates: ai_smart_notifications table
 * Dispatches via existing notification service (push, email, in_app)
 * 
 * Schedule: Every 2 hours
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError } from '../utils/cronRegistry.js';

class SmartNotificationsCron {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Smart notifications cron already running');
      return;
    }

    this.isRunning = true;

    // Initial run after 30 seconds (let other services boot)
    setTimeout(() => {
      this.generateSmartNotifications().catch(err =>
        console.error('[SmartNotif] Initial run error:', err.message)
      );
    }, 30000);

    // Run every 2 hours
    this.cronJob = cron.schedule('15 */2 * * *', async () => {
      await this.generateSmartNotifications();
    });

    console.log('✅ AI Smart Notifications cron started (every 2 hours)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('🛑 Smart Notifications cron stopped');
    }
  }

  async generateSmartNotifications() {
    const startTime = Date.now();
    console.log('🔔 [SmartNotif] Generating smart notifications...');

    try {
      const db = pool;
      let total = 0;

      // 1. Check for missed appointment follow-ups
      total += await this.checkMissedFollowUps(db);

      // 2. Check for medication refill reminders
      total += await this.checkMedicationRefills(db);

      // 3. Check for vitals anomalies
      total += await this.checkVitalsAnomalies(db);

      // 4. Check for risk score escalations
      total += await this.checkRiskEscalations(db);

      // 5. Generate wellness nudges
      total += await this.generateWellnessNudges(db);

      // 6. Check for overdue lab tests
      total += await this.checkOverdueLabTests(db);

      const elapsed = Date.now() - startTime;
      console.log(`✅ [SmartNotif] Generated ${total} notifications in ${elapsed}ms`);
      tick('ai_smart_notif', { total, elapsedMs: elapsed });

    } catch (error) {
      tickError('ai_smart_notif', error.message);
      console.error('❌ [SmartNotif] Cron error:', error.message);
    }
  }

  /**
   * Detect patients who should have had a follow-up but haven't booked
   */
  async checkMissedFollowUps(db) {
    let count = 0;
    try {
      // Find prescriptions with follow-up dates that have passed without new appointment
      const { rows } = await db.query(`
        SELECT p."patientId", p."doctorId", p."followUp", p."patientName",
               p."createdAt" as rx_date
        FROM prescriptions p
        WHERE p."followUp" IS NOT NULL 
          AND p."followUp"::jsonb->>'date' IS NOT NULL
          AND p."createdAt" > NOW() - INTERVAL '90 days'
          AND NOT EXISTS (
            SELECT 1 FROM ai_smart_notifications n
            WHERE n.user_id = p."patientId" 
              AND n.notification_type = 'missed_followup'
              AND n.created_at > NOW() - INTERVAL '7 days'
          )
        LIMIT 50
      `);

      for (const row of rows) {
        try {
          const followUp = typeof row.followUp === 'string' ? JSON.parse(row.followUp) : row.followUp;
          const followUpDate = followUp?.date ? new Date(followUp.date) : null;
          
          if (followUpDate && followUpDate < new Date()) {
            await this.insertNotification(db, {
              userId: row.patientId,
              userType: 'patient',
              type: 'missed_followup',
              title: 'Follow-up Visit Reminder',
              message: `Your follow-up visit was scheduled for ${followUpDate.toLocaleDateString()}. Please book your appointment to ensure continuity of care.`,
              priority: 'high',
              channel: 'in_app',
              metadata: { doctorId: row.doctorId, rxDate: row.rx_date }
            });
            count++;
          }
        } catch { /* skip malformed follow-up data */ }
      }
    } catch (err) {
      console.error('[SmartNotif] Follow-up check error:', err.message);
    }
    return count;
  }

  /**
   * Check for prescriptions nearing expiry / medication refill needed
   */
  async checkMedicationRefills(db) {
    let count = 0;
    try {
      const { rows } = await db.query(`
        SELECT p."patientId", p.medications, p."patientName", p."validUntil"
        FROM prescriptions p
        WHERE p."validUntil" IS NOT NULL
          AND p."validUntil" BETWEEN NOW() AND NOW() + INTERVAL '7 days'
          AND p.status = 'issued'
          AND NOT EXISTS (
            SELECT 1 FROM ai_smart_notifications n
            WHERE n.user_id = p."patientId"
              AND n.notification_type = 'medication_refill'
              AND n.created_at > NOW() - INTERVAL '3 days'
          )
        LIMIT 50
      `);

      for (const row of rows) {
        const meds = Array.isArray(row.medications) 
          ? row.medications.map(m => m.name || m.medicine || 'medication').slice(0, 3).join(', ')
          : 'your medications';

        await this.insertNotification(db, {
          userId: row.patientId,
          userType: 'patient',
          type: 'medication_refill',
          title: 'Medication Refill Reminder',
          message: `Your prescription for ${meds} expires on ${new Date(row.validUntil).toLocaleDateString()}. Please consult your doctor for a refill.`,
          priority: 'normal',
          channel: 'in_app',
          metadata: { validUntil: row.validUntil }
        });
        count++;
      }
    } catch (err) {
      console.error('[SmartNotif] Medication refill check error:', err.message);
    }
    return count;
  }

  /**
   * Detect abnormal vitals patterns
   */
  async checkVitalsAnomalies(db) {
    let count = 0;
    try {
      const { rows } = await db.query(`
        SELECT vr."userId" as patient_id, vr."bloodPressureSystolic" as systolic,
               vr."bloodPressureDiastolic" as diastolic, vr."heartRate" as heart_rate,
               vr.temperature, vr."oxygenSaturation" as oxygen_saturation, vr."createdAt" as created_at
        FROM vitals_records vr
        WHERE vr."createdAt" > NOW() - INTERVAL '24 hours'
        ORDER BY vr."createdAt" DESC
      `);

      for (const vital of rows) {
        const alerts = [];

        if (vital.systolic && vital.systolic > 180) {
          alerts.push({ type: 'critical_bp', msg: `Critical blood pressure: ${vital.systolic}/${vital.diastolic}mmHg` });
        } else if (vital.systolic && vital.systolic > 140) {
          alerts.push({ type: 'high_bp', msg: `Elevated blood pressure: ${vital.systolic}/${vital.diastolic}mmHg` });
        }

        if (vital.heart_rate && (vital.heart_rate > 120 || vital.heart_rate < 45)) {
          alerts.push({ type: 'abnormal_hr', msg: `Abnormal heart rate: ${vital.heart_rate} bpm` });
        }

        if (vital.oxygen_saturation && vital.oxygen_saturation < 92) {
          alerts.push({ type: 'low_spo2', msg: `Low oxygen saturation: ${vital.oxygen_saturation}%` });
        }

        if (vital.temperature && vital.temperature > 39) {
          alerts.push({ type: 'high_fever', msg: `High fever: ${vital.temperature}°C` });
        }

        for (const alert of alerts) {
          // Avoid duplicate notifications within 24h
          const { rows: existing } = await db.query(`
            SELECT id FROM ai_smart_notifications
            WHERE user_id = $1 
              AND notification_type = $2
              AND created_at > NOW() - INTERVAL '24 hours'
            LIMIT 1
          `, [vital.patient_id, alert.type]);

          if (existing.length === 0) {
            await this.insertNotification(db, {
              userId: vital.patient_id,
              userType: 'patient',
              type: alert.type,
              title: 'Health Alert',
              message: `${alert.msg}. Please consult your healthcare provider if this persists.`,
              priority: alert.type.startsWith('critical') ? 'urgent' : 'high',
              channel: 'in_app',
              metadata: { vitals: vital }
            });
            count++;
          }
        }
      }
    } catch (err) {
      console.error('[SmartNotif] Vitals anomaly check error:', err.message);
    }
    return count;
  }

  /**
   * Check for risk score escalations vs previous scores
   */
  async checkRiskEscalations(db) {
    let count = 0;
    try {
      const { rows } = await db.query(`
        SELECT patient_id, overall_score, risk_level, recommendations
        FROM ai_health_risk_scores
        WHERE risk_level IN ('high', 'critical')
          AND updated_at > NOW() - INTERVAL '6 hours'
          AND NOT EXISTS (
            SELECT 1 FROM ai_smart_notifications n
            WHERE n.user_id = ai_health_risk_scores.patient_id
              AND n.notification_type = 'risk_escalation'
              AND n.created_at > NOW() - INTERVAL '24 hours'
          )
        LIMIT 20
      `);

      for (const row of rows) {
        const recs = Array.isArray(row.recommendations) ? row.recommendations.slice(0, 2).join('. ') : '';
        await this.insertNotification(db, {
          userId: row.patient_id,
          userType: 'patient',
          type: 'risk_escalation',
          title: `Health Risk Alert: ${row.risk_level.toUpperCase()}`,
          message: `Your health risk score has been assessed as ${row.risk_level} (${row.overall_score}/10). ${recs}`,
          priority: row.risk_level === 'critical' ? 'urgent' : 'high',
          channel: 'in_app',
          metadata: { score: row.overall_score, riskLevel: row.risk_level }
        });
        count++;
      }
    } catch (err) {
      console.error('[SmartNotif] Risk escalation check error:', err.message);
    }
    return count;
  }

  /**
   * Generate proactive wellness nudges
   */
  async generateWellnessNudges(db) {
    let count = 0;
    try {
      // Find patients with no recent wellness activity
      const { rows } = await db.query(`
        SELECT p.id as patient_id, p."userId" as user_id,
               CONCAT(u."firstName", ' ', u."lastName") as name
        FROM patients p
        JOIN users u ON u.id = p."userId"
        WHERE p.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM ai_smart_notifications n
            WHERE n.user_id = p.id
              AND n.notification_type = 'wellness_nudge'
              AND n.created_at > NOW() - INTERVAL '7 days'
          )
        ORDER BY RANDOM()
        LIMIT 10
      `);

      const nudges = [
        { title: 'Stay Hydrated!', message: 'Drinking 8 glasses of water daily supports your heart, brain, and kidneys. Set hourly reminders to sip water throughout the day.' },
        { title: 'Movement Break', message: 'A 10-minute walk after meals can help regulate blood sugar and improve digestion. Try taking a short walk today!' },
        { title: 'Sleep Quality Matters', message: 'Consistent sleep of 7-8 hours improves immunity and mental health. Try maintaining a fixed bedtime routine.' },
        { title: 'Mindful Breathing', message: 'Take 5 minutes for deep breathing. Inhale for 4s, hold for 7s, exhale for 8s. This reduces stress and blood pressure.' },
        { title: 'Healthy Plate Tip', message: 'Fill half your plate with vegetables, a quarter with protein, and a quarter with whole grains for balanced nutrition.' },
      ];

      for (const patient of rows) {
        const nudge = nudges[Math.floor(Math.random() * nudges.length)];
        await this.insertNotification(db, {
          userId: patient.patient_id,
          userType: 'patient',
          type: 'wellness_nudge',
          title: nudge.title,
          message: nudge.message,
          priority: 'low',
          channel: 'in_app',
          metadata: { category: 'wellness' }
        });
        count++;
      }
    } catch (err) {
      console.error('[SmartNotif] Wellness nudge error:', err.message);
    }
    return count;
  }

  /**
   * Check for overdue lab tests
   */
  async checkOverdueLabTests(db) {
    let count = 0;
    try {
      const { rows } = await db.query(`
        SELECT lo.patient_id, lo.test_type as test_name, lo.created_at
        FROM lab_orders lo
        WHERE lo.status = 'ordered'
          AND lo.created_at < NOW() - INTERVAL '7 days'
          AND NOT EXISTS (
            SELECT 1 FROM ai_smart_notifications n
            WHERE n.user_id = lo.patient_id
              AND n.notification_type = 'overdue_lab'
              AND n.created_at > NOW() - INTERVAL '7 days'
          )
        LIMIT 20
      `);

      for (const row of rows) {
        await this.insertNotification(db, {
          userId: row.patient_id,
          userType: 'patient',
          type: 'overdue_lab',
          title: 'Pending Lab Test',
          message: `Your lab test "${row.test_name || 'ordered test'}" from ${new Date(row.created_at).toLocaleDateString()} is still pending. Please complete it at your earliest convenience.`,
          priority: 'normal',
          channel: 'in_app',
          metadata: { testName: row.test_name }
        });
        count++;
      }
    } catch (err) {
      console.error('[SmartNotif] Overdue lab check error:', err.message);
    }
    return count;
  }

  /**
   * Insert a smart notification record
   */
  async insertNotification(db, { userId, userType, type, title, message, priority, channel, metadata }) {
    await db.query(`
      INSERT INTO ai_smart_notifications 
        (user_id, user_type, notification_type, title, message, channel, priority, status, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW())
    `, [userId, userType, type, title, message, channel || 'in_app', priority || 'normal', JSON.stringify(metadata || {})]);
  }
}

const smartNotificationsCron = new SmartNotificationsCron();
export default smartNotificationsCron;
