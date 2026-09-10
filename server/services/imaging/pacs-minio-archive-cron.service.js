/**
 * Nightly cron: PACS S3 bucket -> on-prem PACS MinIO archive copy.
 * Schedule: midnight server local time by default.
 * See pacs-minio-archive.service.js for the full architecture rationale.
 */
import cron from 'node-cron';
import { tick, tickStart, tickError } from '../../utils/cronRegistry.js';
import { archivePacsBucketToMinio, isPacsArchiveMinioConfigured } from './pacs-minio-archive.service.js';
import logger from '../../config/logger.js';

const ENABLED = !['0', 'false', 'no'].includes(
  String(process.env.PACS_MINIO_ARCHIVE_ENABLED ?? 'true').toLowerCase(),
);
const SCHEDULE = process.env.PACS_MINIO_ARCHIVE_CRON || '0 0 * * *';

export function startPacsMinioArchiveCron() {
  if (!ENABLED) {
    logger.info('[PacsMinioArchive] cron disabled (PACS_MINIO_ARCHIVE_ENABLED=false)');
    return;
  }
  if (!isPacsArchiveMinioConfigured()) {
    logger.warn('[PacsMinioArchive] cron not started — configure PACS_ARCHIVE_MINIO_* env vars');
    return;
  }

  cron.schedule(SCHEDULE, async () => {
    tickStart('pacs_minio_archive');
    try {
      const result = await archivePacsBucketToMinio();
      tick('pacs_minio_archive', {
        scanned: result.scanned,
        copied: result.copied,
        skipped: result.skipped,
        failed: result.failed,
        bytes: result.bytes,
      });
    } catch (err) {
      tickError('pacs_minio_archive', err);
      logger.error('[PacsMinioArchive] cron failed', { error: err.message });
    }
  });

  logger.info(`[PacsMinioArchive] cron scheduled: ${SCHEDULE}`);
}

export default { startPacsMinioArchiveCron };
