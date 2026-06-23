/**
 * Imaging workflow Kafka consumer — triage + workflow side-effects.
 */
import { connectKafkaConsumer, KAFKA_TOPICS } from '../config/kafka.js';
import { requestTriage } from '../services/imaging/imaging-triage.service.js';

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

export async function startImagingWorkflowWorker() {
  if (process.env.NODE_ENV === 'test') return null;
  const topics = [KAFKA_TOPICS.IMAGING_AI_TRIAGE_REQUESTED];
  _consumer = await connectKafkaConsumer('mediczy-imaging-workflow', topics, async ({ topic, message }) => {
    const payload = parseEnvelope(message);
    if (!payload) return;
    if (topic === KAFKA_TOPICS.IMAGING_AI_TRIAGE_REQUESTED) {
      await handleTriageRequested(payload);
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
