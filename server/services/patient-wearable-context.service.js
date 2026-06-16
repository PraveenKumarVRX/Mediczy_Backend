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
          value: latest.value,
          recordedAt: latest.recorded_at || latest.recordedAt || null,
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
