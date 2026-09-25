/**
 * Hospital billing cron — nightly bed-day charging + overdue invoice flags
 */
import pool from '../db/pgPool.js';
import { runBedDayCharging } from './ip-bed-day-charging.service.js';
import { tick, tickStart, tickError, beginJob } from '../utils/cronRegistry.js';

const JOB_NAME = 'hospital-billing-nightly';

export async function runNightlyBilling() {
  if (!(await beginJob(JOB_NAME))) return { skipped: true };
  try {
    const hospitals = await pool.query(`SELECT id FROM hospitals WHERE is_active IS NOT FALSE LIMIT 200`);
    let bedDaysPosted = 0;
    let overdueMarked = 0;

    for (const h of hospitals.rows) {
      try {
        const bedResult = await runBedDayCharging(h.id);
        bedDaysPosted += bedResult?.charged || 0;
      } catch (e) {
        console.warn(`[billing-cron] bed-day ${h.id}:`, e.message);
      }

      const overdue = await pool.query(
        `UPDATE hospital_invoices
         SET status = 'overdue', updated_at = NOW()
         WHERE hospital_id = $1 AND status IN ('issued','partial')
           AND created_at < NOW() - INTERVAL '30 days'
         RETURNING id`,
        [h.id]
      );
      overdueMarked += overdue.rowCount;
    }

    tick(JOB_NAME, { hospitals: hospitals.rowCount, bedDaysPosted, overdueMarked });
    return { bedDaysPosted, overdueMarked };
  } catch (e) {
    tickError(JOB_NAME, e);
    throw e;
  }
}

export default { runNightlyBilling };
