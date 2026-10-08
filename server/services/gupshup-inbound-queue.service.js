import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { createRedisConnection } from '../config/redis-connection.js';
import { gupshupJobId, saveGupshupStatus } from './gupshup-webhook.service.js';

let queue, worker, redis, ready;
const NAME = 'gupshup-whatsapp-inbound';
function storage() {
  if (!redis) {
    redis = new Redis({ ...createRedisConnection(), maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 3000 });
    redis.on('error', () => console.warn('[Gupshup] Webhook Redis unavailable'));
    queue = new Queue(NAME, { connection: redis });
    queue.on('error', () => console.warn('[Gupshup] Inbound queue unavailable'));
  }
  if (!ready) {
    ready = (redis.status === 'ready' ? Promise.resolve() : new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); redis.off('error', fail); redis.off('ready', done); };
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('Webhook Redis unavailable')); };
      const timer = setTimeout(fail, 3000);
      redis.once('ready', done); redis.once('error', fail);
    })).then(() => queue.setGlobalConcurrency(1));
    ready.catch(() => { ready = null; });
  }
  return { queue, redis, ready };
}
export async function enqueueGupshupInbound(event) {
  const s = storage(); await s.ready;
  await s.queue.add('message', event, { jobId: gupshupJobId(event), attempts: 1,
    removeOnComplete: { age: 86400 }, removeOnFail: { age: 86400 } });
}
export async function recordGupshupStatus(event) {
  const s = storage(); await s.ready; await saveGupshupStatus(s.redis, event);
}
export function startGupshupInboundWorker(processMessage) {
  if (worker || process.env.WHATSAPP_PROVIDER !== 'gupshup' || process.env.NODE_ENV === 'test') return;
  storage();
  worker = new Worker(NAME, async job => {
    const s = storage(); await s.ready;
    // A stalled worker may already have sent a reply or created a booking. Never blindly repeat it.
    const claimed = await s.redis.set(`gupshup:processing:${job.id}`, 'started', 'EX', 604800, 'NX');
    if (!claimed) throw new Error('Interrupted message requires reconciliation before replay');
    try {
      await processMessage(job.data);
      await s.redis.set(`gupshup:processing:${job.id}`, 'completed', 'EX', 604800);
    } catch {
      // Do not serialize a provider error, token, patient message or URL into BullMQ failure logs.
      throw new Error('Inbound processing failed; reconcile provider delivery before replay');
    }
  }, { connection: createRedisConnection(), concurrency: 1 });
  worker.on('failed', job => console.warn('[Gupshup] Inbound job needs review', { jobId: job?.id }));
  worker.on('error', () => console.warn('[Gupshup] Inbound worker unavailable'));
}
export async function closeGupshupInbound() {
  if (worker) await worker.close();
  if (queue) await queue.close();
  if (redis) await redis.quit();
  worker = queue = redis = ready = undefined;
}
