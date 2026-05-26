/**
 * HyperGrid Canonical Event Bus Service
 *
 * Redis pub/sub for internal event routing.
 * Kafka is used for durable, ordered, replay-capable cross-service streams
 * (falls back gracefully if Kafka is not reachable).
 *
 * Canonical event shape:
 * {
 *   id:        string,   // unique event id
 *   type:      string,   // e.g. VitalsObserved, ClaimSubmitted, PatientAdmitted
 *   source:    string,   // mqtt | api | hl7 | fhir | scheduler
 *   tenantId:  string,
 *   patientId: string | null,
 *   payload:   object,
 *   timestamp: ISO8601 string,
 * }
 */

import { createClient } from 'redis';
import { Kafka, Partitioners } from 'kafkajs';

const REDIS_URL  = process.env.REDIS_URL   || 'redis://localhost:6379';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_TOPIC   = process.env.KAFKA_TOPIC    || 'hg.health.events';
const KAFKA_DISABLED =
  process.env.DISABLE_KAFKA === 'true' ||
  process.env.KAFKA_ENABLED === 'false';

let redisPublisher  = null;
let redisSubscriber = null;
let kafkaProducer   = null;
const listeners     = new Map(); // eventType → Set<handler>

// ─── Redis pub/sub ────────────────────────────────────────────────────────────
async function initRedis() {
  redisPublisher  = createClient({ url: REDIS_URL });
  redisSubscriber = createClient({ url: REDIS_URL });
  for (const c of [redisPublisher, redisSubscriber]) {
    c.on('error', e => console.error('[EventBus] Redis error:', e.message));
  }
  await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);

  // Route incoming events from Redis to local listeners
  await redisSubscriber.subscribe('hg:events', raw => {
    try {
      const event = JSON.parse(raw);
      dispatchLocal(event);
    } catch (_) {}
  });
  console.log('[EventBus] Redis pub/sub ready');
}

// ─── Kafka producer ───────────────────────────────────────────────────────────
async function initKafka() {
  if (KAFKA_DISABLED) {
    console.log('[EventBus] Kafka disabled by environment, using Redis-only mode');
    kafkaProducer = null;
    return;
  }

  try {
    const kafka = new Kafka({
      clientId: 'hypergrid-event-bus',
      brokers:  KAFKA_BROKERS,
      retry:    { retries: 3 },
    });
    kafkaProducer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
    await kafkaProducer.connect();
    console.log('[EventBus] Kafka producer connected');
  } catch (err) {
    console.warn('[EventBus] Kafka not available, using Redis-only mode:', err.message);
    kafkaProducer = null;
  }
}

// ─── Local dispatch ───────────────────────────────────────────────────────────
function dispatchLocal(event) {
  const handlers = listeners.get(event.type) || new Set();
  const wildcards = listeners.get('*') || new Set();
  [...handlers, ...wildcards].forEach(fn => {
    try { fn(event); } catch (e) { console.error('[EventBus] Handler error:', e.message); }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function initEventBus() {
  await initRedis();
  await initKafka();
}

/**
 * Publish a canonical health event.
 * Broadcasts to Redis (fan-out) and appends to Kafka (durable log).
 */
export async function publishEvent(event) {
  const enriched = {
    id:        event.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: event.timestamp || new Date().toISOString(),
    ...event,
  };

  // Redis pub/sub (real-time fan-out)
  if (redisPublisher?.isReady) {
    await redisPublisher.publish('hg:events', JSON.stringify(enriched)).catch(() => {});
  }

  // Kafka (durable ordered log)
  if (kafkaProducer) {
    await kafkaProducer.send({
      topic:    KAFKA_TOPIC,
      messages: [{ key: enriched.tenantId || 'global', value: JSON.stringify(enriched) }],
    }).catch(e => console.warn('[EventBus] Kafka send failed:', e.message));
  }

  // Also dispatch locally (same process)
  dispatchLocal(enriched);
  return enriched;
}

/**
 * Subscribe to a canonical event type.
 * Use '*' to receive all events.
 */
export function onEvent(eventType, handler) {
  if (!listeners.has(eventType)) listeners.set(eventType, new Set());
  listeners.get(eventType).add(handler);
  return () => listeners.get(eventType)?.delete(handler); // returns unsubscribe fn
}

export async function closeEventBus() {
  if (kafkaProducer)   await kafkaProducer.disconnect().catch(() => {});
  if (redisSubscriber) await redisSubscriber.quit().catch(() => {});
  if (redisPublisher)  await redisPublisher.quit().catch(() => {});
}

export function getEventBusStatus() {
  return {
    redis:    !!redisPublisher?.isReady,
    kafka:    !!kafkaProducer,
    listeners: [...listeners.keys()],
  };
}
