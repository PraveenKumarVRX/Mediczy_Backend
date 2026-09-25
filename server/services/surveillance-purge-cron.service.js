/**
 * Surveillance housekeeping — trims the per-frame log (operational data, 30-day retention).
 * Detection events are kept: they are the audit trail of what security staff were told.
 */
import cron from 'node-cron';
import { tick, tickError, tickStart, beginJob } from '../utils/cronRegistry.js';
import surveillance from './surveillance-analytics.service.js';

export function startSurveillancePurgeCron() {
  cron.schedule('20 3 * * *', async () => {
    if (!(await beginJob('surveillance_purge'))) return { skipped: true };
    try { tick('surveillance_purge', await surveillance.purge()); } catch (err) { tickError('surveillance_purge', err.message); }
  });
  console.log('[Surveillance] frame-log purge cron scheduled (daily 03:20)');
}

export default { startSurveillancePurgeCron };
