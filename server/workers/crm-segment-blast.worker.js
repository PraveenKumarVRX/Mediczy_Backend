import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis-connection.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { processSegmentBlastJob } from '../services/crm-segment-blast.service.js';

const connection = createRedisConnection();

export const crmSegmentBlastWorker = new Worker(
  QUEUE_NAMES.CRM_SEGMENT_BLAST,
  async (job) => processSegmentBlastJob(job.data),
  { connection, concurrency: Number(process.env.CRM_SEGMENT_BLAST_CONCURRENCY || 3) }
);

crmSegmentBlastWorker.on('failed', (job, error) => {
  console.error('[CrmSegmentBlastWorker] job failed:', job?.id, error.message);
});
