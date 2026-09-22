/**
 * GAP-IOT-002 — Ambient deterioration alerts on ward/ICU displays
 *
 * CAPABILITY NOTE (do not overstate in model cards / regulatory docs):
 * "Ambient" here means the alert is broadcast to the ward/ICU ambient
 * displays — this module does NOT perform passive/sensor-driven ambient
 * monitoring. It recomputes NEWS2 from vitals already submitted via
 * vitals-ews.service.js (manual entry or device-fed) and pushes a
 * high/critical alert over SSE. There is no independent sensing here.
 */
import { pushToZone } from './display-sse-broker.service.js';
import { computeNews2 as computeNews2Full } from './news2.service.js';

const NEWS2_CRITICAL = 7;
const NEWS2_HIGH = 5;

// WP-1.8: this used to be a third, separately-wrong NEWS2 implementation — no blood pressure or consciousness
// at all, and a pulse band that jumped straight from 1 to 3 with no 111-130 -> 2 tier. It now delegates to the
// one shared, correct scorer (news2.service.js) instead of approximating a partial score from whatever fields
// this particular vitals shape happens to carry.
export function evaluateNews2Deterioration({ bedId, wardZone, vitals }) {
  let news2 = vitals?.news2 ?? vitals?.NEWS2;
  let complete = true;
  if (news2 == null) {
    if (!vitals) return null;
    const result = computeNews2Full({
      respiratoryRate: vitals.rr ?? vitals.respiratoryRate,
      spo2: vitals.spo2 ?? vitals.SpO2,
      spo2Scale: vitals.spo2Scale ?? 1,
      onOxygen: Boolean(vitals.onOxygen),
      systolicBp: vitals.systolicBp ?? vitals.bp_systolic ?? vitals.sbp,
      pulse: vitals.hr ?? vitals.heartRate ?? vitals.pulse,
      consciousness: vitals.consciousness ?? null,
      legacyGcsScore: vitals.gcs ?? vitals.gcsScore ?? null,
      temperature: vitals.temp ?? vitals.temperature,
    });
    news2 = result.score;
    complete = result.complete;
  }
  if (news2 == null) return null;
  let severity = null;
  if (news2 >= NEWS2_CRITICAL) severity = 'critical';
  else if (news2 >= NEWS2_HIGH) severity = 'high';
  if (!severity) return null;
  return { bedId, wardZone, news2, severity, complete, message: complete ? `NEWS2 ${news2} — clinical review required` : `NEWS2 ${news2} from an incomplete vitals set — clinical review required, complete the vitals` };
}

export function pushAmbientDeteriorationAlert(wardZone, bedId, vitals, organizationId = null) {
  const alert = evaluateNews2Deterioration({ bedId, wardZone, vitals });
  if (!alert) return null;
  pushToZone(wardZone, 'ambient_deterioration', alert, organizationId);
  pushToZone('command', 'ambient_deterioration', alert, organizationId);
  return alert;
}
