/**
 * ITEM-21: BullMQ patient batch queue for AI health risk scoring.
 *
 * Replaces sequential for-loop with a controlled queue:
 *   - Batch size 10 patients per job
 *   - Worker concurrency 2 (two batches processed simultaneously)
 *   - Redis-backed: survives process restarts, observable via Bull Board
 *
 * Redis connection reuses existing REDIS_URL / REDIS_HOST env vars.
 *
 * Usage (from cron):
 *   import { enqueuePatientBatches, startRiskWorker } from './patient-risk-queue.service.js';
 *   startRiskWorker(processBatchFn);   // once at startup
 *   await enqueuePatientBatches(patients, batchSize);  // on each cron tick
 */

import { Queue, Worker, QueueEvents } from 'bullmq';

const QUEUE_NAME   = 'patient-risk-scoring';
const BATCH_SIZE   = 10;
const CONCURRENCY  = 2;

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};

let _queue  = null;
let _worker = null;

export function getRiskQueue() {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _queue;
}

/**
 * Enqueue patients as batches of `batchSize` for processing.
 * Returns the number of jobs enqueued.
 */
export async function enqueuePatientBatches(patients, batchSize = BATCH_SIZE) {
  const queue = getRiskQueue();
  const jobs  = [];

  for (let i = 0; i < patients.length; i += batchSize) {
    jobs.push({
      name: `batch-${Math.floor(i / batchSize)}`,
      data: { patients: patients.slice(i, i + batchSize), batchIndex: Math.floor(i / batchSize) },
    });
  }

  if (jobs.length > 0) {
    await queue.addBulk(jobs);
  }

  console.log(`[PatientRiskQueue] Enqueued ${jobs.length} batches for ${patients.length} patients`);
  return jobs.length;
}

/**
 * Start the BullMQ worker. Call once at server startup.
 * processBatch: async (patients: Patient[]) => { created, updated, gateBlocked }
 */
export function startRiskWorker(processBatch) {
  if (_worker) return _worker; // already started

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { patients, batchIndex } = job.data;
      console.log(`[PatientRiskQueue] Processing batch ${batchIndex} (${patients.length} patients)`);
      return processBatch(patients);
    },
    {
      connection,
      concurrency: CONCURRENCY,
      limiter: { max: 10, duration: 1000 }, // max 10 jobs/sec burst protection
    }
  );

  _worker.on('completed', (job, result) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[PatientRiskQueue] Batch ${job.data.batchIndex} done:`, result);
    }
  });

  _worker.on('failed', (job, err) => {
    console.error(`[PatientRiskQueue] Batch ${job?.data?.batchIndex} failed:`, err.message);
  });

  console.log(`[PatientRiskQueue] Worker started (concurrency=${CONCURRENCY}, batchSize=${BATCH_SIZE})`);
  return _worker;
}

/**
 * Process patients synchronously in batches using Promise.allSettled
 * (fallback when BullMQ Redis is unavailable).
 */
export async function processBatchesDirect(patients, processBatch, batchSize = BATCH_SIZE) {
  let created = 0, updated = 0, gateBlocked = 0;
  const batches = [];

  for (let i = 0; i < patients.length; i += batchSize) {
    batches.push(patients.slice(i, i + batchSize));
  }

  // Process with concurrency 2
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(b => processBatch(b)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        created     += r.value?.created     || 0;
        updated     += r.value?.updated     || 0;
        gateBlocked += r.value?.gateBlocked || 0;
      }
    }
  }

  return { created, updated, gateBlocked };
}

export { QUEUE_NAME, BATCH_SIZE, CONCURRENCY };
