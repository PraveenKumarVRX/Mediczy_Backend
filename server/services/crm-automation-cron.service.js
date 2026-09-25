/**
 * Periodic tick for the CRM automation engine — see crm-automations.service.js
 * for the scheduling/idempotency model.
 */
import cron from 'node-cron';
import { tick, tickStart, tickError, beginJob } from '../utils/cronRegistry.js';
import { runAutomationTick } from './crm-automations.service.js';
import logger from '../config/logger.js';

const ENABLED = !['0', 'false', 'no'].includes(String(process.env.CRM_AUTOMATION_ENABLED ?? 'true').toLowerCase());
const SCHEDULE = process.env.CRM_AUTOMATION_CRON || '*/5 * * * *'; // every 5 min

export function startCrmAutomationCron() {
  if (!ENABLED) {
    logger.info('[CrmAutomation] cron disabled (CRM_AUTOMATION_ENABLED=false)');
    return;
  }
  cron.schedule(SCHEDULE, async () => {
    if (!(await beginJob('crm_automation_tick'))) return { skipped: true };
    try {
      const result = await runAutomationTick();
      tick('crm_automation_tick', result);
    } catch (err) {
      tickError('crm_automation_tick', err);
      logger.error('[CrmAutomation] cron failed', { error: err.message });
    }
  });
  logger.info(`[CrmAutomation] cron scheduled: ${SCHEDULE}`);
}

export default { startCrmAutomationCron };
