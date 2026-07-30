/**
 * Nightly cron: S3 imaging-daily → MinIO (primary) / Wasabi (fallback).
 * Schedule: 02:30 server local time.
 */
import cron from 'node-cron';
import { tick, tickStart, tickError } from '../../utils/cronRegistry.js';
import { transferImagingDailyToMinio } from './imaging-daily-minio-transfer.service.js';
import { isMinioConfigured, isWasabiConfigured } from './imaging-archive-client.service.js';
import logger from '../../config/logger.js';

const ENABLED = !['0', 'false', 'no'].includes(
  String(process.env.IMAGING_DAILY_TRANSFER_ENABLED ?? 'true').toLowerCase(),
);
const SCHEDULE = process.env.IMAGING_DAILY_TRANSFER_CRON || '30 2 * * *';

export function startImagingDailyMinioCron() {
  if (!ENABLED) {
    logger.info('[ImagingDailyTransfer] cron disabled (IMAGING_DAILY_TRANSFER_ENABLED=false)');
    return;
  }
  if (!isMinioConfigured() && !isWasabiConfigured()) {
    logger.warn('[ImagingDailyTransfer] cron not started — configure MinIO and/or Wasabi');
    return;
  }

  cron.schedule(SCHEDULE, async () => {
    tickStart('imaging_daily_minio_transfer');
    try {
      const result = await transferImagingDailyToMinio();
      tick('imaging_daily_minio_transfer', {
        copied: result.copied,
        failed: result.failed,
        skipped: result.skipped,
        bytes: result.bytes,
        providers: result.providers,
      });
    } catch (err) {
      tickError('imaging_daily_minio_transfer', err);
      logger.error('[ImagingDailyTransfer] cron failed', { error: err.message });
    }
  });

  logger.info(
    `[ImagingDailyTransfer] cron scheduled: ${SCHEDULE} (minio=${isMinioConfigured()} wasabi=${isWasabiConfigured()})`,
  );
}

export default { startImagingDailyMinioCron };
