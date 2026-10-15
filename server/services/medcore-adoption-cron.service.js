import cron from 'node-cron';
import { beginJob, tick, tickError } from '../utils/cronRegistry.js';
import { runDueAdherenceEvents } from './medcore-adoption.service.js';

const enabled = () => String(process.env.MEDCORE_ADOPTION_ENABLED || 'false').toLowerCase() === 'true';

export function startMedcoreAdoptionCron() {
  if (!enabled()) return;
  const schedule = process.env.MEDCORE_ADHERENCE_CRON || '* * * * *';
  cron.schedule(schedule, async () => {
    if (!(await beginJob('medcore_adherence_tick'))) return;
    try {
      const result = await runDueAdherenceEvents({ limit: 100 });
      tick('medcore_adherence_tick', { processed: result.length, sent: result.filter((event) => event.status === 'sent').length, failed: result.filter((event) => event.status === 'failed').length });
    } catch (error) {
      tickError('medcore_adherence_tick', error);
    }
  });
}

export default { startMedcoreAdoptionCron };
