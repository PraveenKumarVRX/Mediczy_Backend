/**
 * Kafka Configuration — KafkaJS (Amazon MSK / self-hosted)
 * ---------------------------------------------------------
 * Replaces the previous stub that silently discarded all events.
 *
 * Topics are defined below. Add new topics here, never hardcode strings elsewhere.
 *
 * Infrastructure:
 *   Development : local Kafka (docker-compose)
 *   Production  : Amazon MSK (same VPC as RDS) with IAM auth or SCRAM-SHA-256
 *
 * Env vars required:
 *   KAFKA_BROKERS          comma-separated, e.g. "b-1.xxx.kafka.ap-south-1.amazonaws.com:9092"
 *   KAFKA_CLIENT_ID        e.g. "mediczy-app"
 *   KAFKA_SSL              "true" for MSK
 *   KAFKA_SASL_USERNAME    for SCRAM auth
 *   KAFKA_SASL_PASSWORD    for SCRAM auth
 *   KAFKA_ENABLED          set "true" to activate; "false" uses in-memory fallback
 */

import { Kafka, CompressionTypes, logLevel } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

// ─── Topic Registry ───────────────────────────────────────────────────────────

export const KAFKA_TOPICS = {
  // Clinical events
  PATIENT_REGISTERED:       'patient.registered',
  PATIENT_UPDATED:          'patient.updated',
  PATIENT_ADMITTED:         'patient.admitted',
  PATIENT_DISCHARGED:       'patient.discharged',

  // Appointment lifecycle
  APPOINTMENT_BOOKED:       'appointment.booked',
  APPOINTMENT_RESCHEDULED:  'appointment.rescheduled',
  APPOINTMENT_CANCELLED:    'appointment.cancelled',
  APPOINTMENT_COMPLETED:    'appointment.completed',
  APPOINTMENT_NO_SHOW:      'appointment.no_show',

  // Clinical
  EHR_ACCESSED:             'ehr.accessed',       // immutable audit stream
  EHR_UPDATED:              'ehr.updated',
  PRESCRIPTION_CREATED:     'prescription.created',
  VITALS_RECORDED:          'vitals.recorded',
  LAB_ORDER_CREATED:        'lab.order.created',
  LAB_RESULT_READY:         'lab.result.ready',

  // Notifications
  NOTIFICATION_REQUESTED:   'notification.requested',

  // Payments & Insurance
  PAYMENT_INITIATED:        'payment.initiated',
  PAYMENT_COMPLETED:        'payment.completed',
  CLAIM_SUBMITTED:          'claim.submitted',
  CLAIM_STATUS_UPDATED:     'claim.status.updated',

  // AI / Analytics (feeds DuckDB ETL)
  AI_RUN_COMPLETED:         'ai.run.completed',
  ANALYTICS_EVENT:          'analytics.event',

  // Platform / Tenant
  TENANT_PROVISIONED:       'tenant.provisioned',
  TENANT_SUSPENDED:         'tenant.suspended',

  // Video / Consultation
  CONSULTATION_STARTED:     'consultation.started',
  CONSULTATION_ENDED:       'consultation.ended',

  // Imaging / RIS-PACS workflow (Phases 1–4)
  IMAGING_STUDY_STORED:       'imaging.study.stored',
  IMAGING_WORKFLOW_TRANSITION:'imaging.workflow.transition',
  IMAGING_REPORT_DRAFTED:     'imaging.report.drafted',
  IMAGING_REPORT_FINALIZED:   'imaging.report.finalized',
  IMAGING_AI_TRIAGE_REQUESTED:'imaging.ai.triage.requested',
  IMAGING_AI_TRIAGE_COMPLETE: 'imaging.ai.triage.complete',
  IMAGING_COLLAB_ANNOTATION:  'imaging.collab.annotation',
};

// ─── Kafka Client ─────────────────────────────────────────────────────────────

const ENABLED = process.env.KAFKA_ENABLED === 'true';

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim());
const clientId = process.env.KAFKA_CLIENT_ID || 'mediczy-app';

let kafka = null;
let _producer = null;
let _producerReady = false;

function getKafkaClient() {
  if (!kafka) {
    const cfg = {
      clientId,
      brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 300,
        retries: 10,
        multiplier: 2,
        maxRetryTime: 30000,
      },
    };

    if (process.env.KAFKA_SSL === 'true') {
      cfg.ssl = true;
    }

    if (process.env.KAFKA_SASL_USERNAME) {
      cfg.sasl = {
        mechanism: 'scram-sha-256',
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD,
      };
    }

    kafka = new Kafka(cfg);
  }
  return kafka;
}

// ─── In-Memory Fallback (dev / Kafka disabled) ───────────────────────────────

const _inMemoryListeners = new Map();

function _inMemoryPublish(topic, message) {
  const listeners = _inMemoryListeners.get(topic) || [];
  for (const fn of listeners) {
    try { fn(message); } catch { /* ignore */ }
  }
}

export function onInMemoryEvent(topic, fn) {
  if (!_inMemoryListeners.has(topic)) _inMemoryListeners.set(topic, []);
  _inMemoryListeners.get(topic).push(fn);
}

// ─── Producer ─────────────────────────────────────────────────────────────────

export async function connectKafkaProducer() {
  if (!ENABLED) {
    console.log('📝 Kafka producer: disabled — using in-memory fallback');
    return { send: async () => true, disconnect: async () => true };
  }

  if (_producerReady && _producer) return _producer;

  _producer = getKafkaClient().producer({
    allowAutoTopicCreation: false,
    transactionTimeout: 30000,
    idempotent: true,
  });

  await _producer.connect();
  _producerReady = true;
  console.log('✅ Kafka producer connected');

  _producer.on('producer.disconnect', () => {
    _producerReady = false;
    console.warn('⚠️  Kafka producer disconnected — will reconnect on next publish');
  });

  return _producer;
}

/**
 * Publish an event to a Kafka topic.
 *
 * @param {string} topic       One of KAFKA_TOPICS values
 * @param {Object} payload     Event payload (will be JSON-serialised)
 * @param {Object} [options]
 * @param {string} [options.key]  Partition key (e.g. tenantId for ordering guarantees)
 */
export async function publishEvent(topic, payload, options = {}) {
  const envelope = {
    topic_name:  topic,
    event_id:    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    emitted_at:  new Date().toISOString(),
    client_id:   clientId,
    payload,
  };

  if (!ENABLED) {
    _inMemoryPublish(topic, envelope);
    return true;
  }

  try {
    if (!_producerReady) await connectKafkaProducer();

    await _producer.send({
      topic,
      compression: CompressionTypes.GZIP,
      messages: [{
        key:   options.key ? String(options.key) : undefined,
        value: JSON.stringify(envelope),
      }],
    });
    return true;
  } catch (err) {
    console.error(`❌ Kafka publish failed [${topic}]:`, err.message);
    // Fallback: in-memory so listeners still fire
    _inMemoryPublish(topic, envelope);
    return false;
  }
}

// ─── Consumer ─────────────────────────────────────────────────────────────────

/**
 * Create a Kafka consumer for a given group.
 *
 * @param {string}   groupId
 * @param {string[]} topics
 * @param {Function} eachMessage  async ({ topic, partition, message }) => void
 */
export async function connectKafkaConsumer(groupId, topics, eachMessage) {
  if (!ENABLED) {
    console.log(`📝 Kafka consumer [${groupId}]: disabled`);
    topics.forEach(t => onInMemoryEvent(t, (msg) => eachMessage({ topic: t, partition: 0, message: { value: JSON.stringify(msg) } })));
    return { disconnect: async () => true };
  }

  const consumer = getKafkaClient().consumer({ groupId });

  await consumer.connect();
  for (const t of topics) {
    await consumer.subscribe({ topic: t, fromBeginning: false });
  }

  await consumer.run({ eachMessage });
  console.log(`✅ Kafka consumer [${groupId}] subscribed to: ${topics.join(', ')}`);
  return consumer;
}

// ─── Admin (topic creation) ───────────────────────────────────────────────────

export async function ensureTopics() {
  if (!ENABLED) return;

  const admin = getKafkaClient().admin();
  await admin.connect();

  const existing  = new Set(await admin.listTopics());
  const toCreate  = Object.values(KAFKA_TOPICS)
    .filter(t => !existing.has(t))
    .map(topic => ({
      topic,
      numPartitions:     parseInt(process.env.KAFKA_PARTITIONS     || '3',  10),
      replicationFactor: parseInt(process.env.KAFKA_REPLICATION    || '2',  10),
      configEntries: [
        { name: 'retention.ms',        value: String(30 * 24 * 60 * 60 * 1000) }, // 30 days
        { name: 'compression.type',    value: 'gzip' },
      ],
    }));

  if (toCreate.length > 0) {
    await admin.createTopics({ topics: toCreate, waitForLeaders: true });
    console.log(`✅ Kafka: created ${toCreate.length} topics`);
  }

  await admin.disconnect();
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

export async function disconnectKafka() {
  if (_producer && _producerReady) {
    await _producer.disconnect();
    _producer     = null;
    _producerReady = false;
    console.log('✅ Kafka producer disconnected');
  }
}

process.on('SIGTERM', disconnectKafka);
process.on('SIGINT',  disconnectKafka);

export default { KAFKA_TOPICS, publishEvent, connectKafkaProducer, connectKafkaConsumer, ensureTopics };
