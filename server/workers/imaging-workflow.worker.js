/**
 * Imaging workflow Kafka consumer — triage, report finalize side-effects.
 */
import { connectKafkaConsumer, KAFKA_TOPICS } from '../config/kafka.js';
import { requestTriage } from '../services/imaging/imaging-triage.service.js';
import { onReportFinalized } from '../services/imaging/imaging-workflow-hooks.service.js';
import pool from '../db/pgPool.js';

let _consumer = null;

function parseEnvelope(message) {
  try {
    const raw = JSON.parse(message.value.toString());
    return raw.payload || raw;
  } catch {
    return null;
  }
}

async function handleTriageRequested(payload) {
  if (!payload?.studyInstanceUID) return;
  await requestTriage(payload).catch((err) => {
    console.warn('[ImagingWorkflowWorker] triage.requested:', err?.message);
  });
}

async function handleReportFinalized(payload) {
  const { studyId, tenantId } = payload || {};
  if (!studyId || !tenantId) return;
  const r = await pool.query(`SELECT * FROM ris_studies WHERE id = $1 AND lab_id = $2`, [studyId, tenantId]);
  const study = r.rows[0];
  if (!study) return;
  await onReportFinalized({
    study,
    tenantId,
    actorId: null,
    actorName: 'kafka-worker',
  }).catch((err) => console.warn('[ImagingWorkflowWorker] finalize:', err?.message));
}

export async function startImagingWorkflowWorker() {
  if (process.env.NODE_ENV === 'test') return null;
  const topics = [
    KAFKA_TOPICS.IMAGING_AI_TRIAGE_REQUESTED,
    KAFKA_TOPICS.IMAGING_REPORT_FINALIZED,
  ];
  _consumer = await connectKafkaConsumer('mediczy-imaging-workflow', topics, async ({ topic, message }) => {
    const payload = parseEnvelope(message);
    if (!payload) return;
    if (topic === KAFKA_TOPICS.IMAGING_AI_TRIAGE_REQUESTED) {
      await handleTriageRequested(payload);
    } else if (topic === KAFKA_TOPICS.IMAGING_REPORT_FINALIZED) {
      await handleReportFinalized(payload);
    }
  });
  console.log('✅ Imaging workflow Kafka worker started');
  return _consumer;
}

export async function stopImagingWorkflowWorker() {
  if (_consumer?.disconnect) await _consumer.disconnect();
  _consumer = null;
}

export default { startImagingWorkflowWorker, stopImagingWorkflowWorker };
