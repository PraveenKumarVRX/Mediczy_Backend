import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';

class LabCriticalAlertCronService {
  constructor() {
    this.isRunning = false;
  }

  async escalateOverdueAlerts() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const overdueRows = await client.query(
        `SELECT id, study_id, lab_id
         FROM ris_critical_value_alerts
         WHERE status = 'Open'
           AND due_at IS NOT NULL
           AND due_at < NOW()
         FOR UPDATE`
      );

      if (!overdueRows.rows.length) {
        await client.query('COMMIT');
        return { escalatedCount: 0 };
      }

      const ids = overdueRows.rows.map((row) => row.id);
      await client.query(
        `UPDATE ris_critical_value_alerts
         SET status = 'Escalated',
             updated_at = NOW()
         WHERE id = ANY($1::bigint[])`,
        [ids]
      );

      for (const row of overdueRows.rows) {
        await client.query(
          `INSERT INTO ris_study_audit_events
            (study_id, lab_id, event_type, actor_id, actor_name, details)
           VALUES ($1, $2, $3, NULL, 'system-cron', $4::jsonb)`,
          [
            row.study_id,
            row.lab_id,
            'CRITICAL_VALUE_ESCALATED',
            JSON.stringify({
              alertId: row.id,
              reason: 'SLA overdue auto-escalation',
              source: 'lab_critical_escalation_cron',
            }),
          ]
        );
      }

      await client.query('COMMIT');
      return { escalatedCount: overdueRows.rows.length };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Lab critical alert cron already running');
      return;
    }

    this.isRunning = true;

    cron.schedule('*/15 * * * *', async () => {
      if (!(await beginJob('lab_critical_escalation'))) return;
      try {
        const result = await this.escalateOverdueAlerts();
        tick('lab_critical_escalation', result);
        if (result.escalatedCount > 0) {
          console.log(`🚨 Escalated overdue lab critical alerts: ${result.escalatedCount}`);
        }
      } catch (error) {
        tickError('lab_critical_escalation', error.message);
        console.error('❌ Lab critical alert escalation cron failed:', error.message);
      }
    }, {
      timezone: 'Asia/Kolkata',
    });

    console.log('✅ Lab critical alert escalation cron started (every 15 minutes)');
  }
}

const labCriticalAlertCronService = new LabCriticalAlertCronService();

export default labCriticalAlertCronService;
