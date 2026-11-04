import HealthReading from '../models/postgres/health-reading.model.postgres.js';

const SUMMARY_TYPES = ['heart_rate', 'blood_pressure', 'spo2', 'steps', 'sleep'];

/**
 * Lightweight wearable snapshot for AI consult / triage context.
 */
export async function getWearableContextForUser(userId) {
  if (!userId) return null;

  const summary = {};
  for (const type of SUMMARY_TYPES) {
    try {
      const latest = await HealthReading.getLatestReading(userId, type);
      if (latest?.value != null) {
        summary[type] = {
          ...freshReading(latest, type),
        };
      }
    } catch {
      // Non-blocking — missing readings are fine
    }
  }

  if (Object.keys(summary).length === 0) return null;

  let abnormalCount = 0;
  try {
    const abnormal = await HealthReading.getAbnormalReadings(userId, 7);
    abnormalCount = Array.isArray(abnormal) ? abnormal.length : 0;
  } catch {
    abnormalCount = 0;
  }

  return {
    wearableSummary: summary,
    abnormalReadingsLast7Days: abnormalCount,
    hasWearableData: true,
  };
}

export default { getWearableContextForUser };

export function freshReading(reading, type, now = Date.now()) {
  const recordedAt = reading.recorded_at || reading.recordedAt || null;
  const timestamp = new Date(recordedAt || '').getTime();
  const ttl = ['steps','sleep'].includes(type) ? 86400000 : 900000;
  const fresh = Number.isFinite(timestamp) && timestamp <= now && now-timestamp<=ttl;
  return fresh ? { status:'fresh',value:reading.value,unit:reading.unit || null,recordedAt }
    : { status:Number.isFinite(timestamp) ? 'stale' : 'unknown',recordedAt };
}
