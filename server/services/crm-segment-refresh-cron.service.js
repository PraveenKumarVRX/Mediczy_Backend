/**
 * Periodic refresh of every active CRM segment's materialized membership.
 * See crm-segments.service.js for the filter/membership model.
 */
import cron from 'node-cron';
import { tick, tickStart, tickError } from '../utils/cronRegistry.js';
import { refreshAllActiveSegments } from './crm-segments.service.js';
import logger from '../config/logger.js';

const ENABLED = !['0', 'false', 'no'].includes(String(process.env.CRM_SEGMENT_REFRESH_ENABLED ?? 'true').toLowerCase());
const SCHEDULE = process.env.CRM_SEGMENT_REFRESH_CRON || '*/15 * * * *'; // every 15 min

export function startCrmSegmentRefreshCron() {
  if (!ENABLED) {
    logger.info('[CrmSegmentRefresh] cron disabled (CRM_SEGMENT_REFRESH_ENABLED=false)');
    return;
  }
  cron.schedule(SCHEDULE, async () => {
    tickStart('crm_segment_refresh');
    try {
      const result = await refreshAllActiveSegments();
      tick('crm_segment_refresh', result);
    } catch (err) {
      tickError('crm_segment_refresh', err);
      logger.error('[CrmSegmentRefresh] cron failed', { error: err.message });
    }
  });
  logger.info(`[CrmSegmentRefresh] cron scheduled: ${SCHEDULE}`);
}

export default { startCrmSegmentRefreshCron };
