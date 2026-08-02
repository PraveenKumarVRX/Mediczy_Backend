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

const NEWS2_CRITICAL = 7;
const NEWS2_HIGH = 5;

export function evaluateNews2Deterioration({ bedId, wardZone, vitals }) {
  const news2 = vitals?.news2 ?? vitals?.NEWS2 ?? computeNews2(vitals);
  if (news2 == null) return null;
  let severity = null;
  if (news2 >= NEWS2_CRITICAL) severity = 'critical';
  else if (news2 >= NEWS2_HIGH) severity = 'high';
  if (!severity) return null;
  return { bedId, wardZone, news2, severity, message: `NEWS2 ${news2} — clinical review required` };
}

function computeNews2(v) {
  if (!v) return null;
  let score = 0;
  const rr = v.rr ?? v.respiratoryRate;
  const spo2 = v.spo2 ?? v.SpO2;
  const hr = v.hr ?? v.heartRate;
  const temp = v.temp ?? v.temperature;
  if (rr >= 25) score += 3;
  else if (rr >= 21) score += 2;
  if (spo2 != null && spo2 <= 91) score += 3;
  else if (spo2 != null && spo2 <= 93) score += 2;
  if (hr >= 131) score += 3;
  else if (hr >= 111) score += 1;
  if (temp != null && temp >= 39.1) score += 2;
  return score || null;
}

export function pushAmbientDeteriorationAlert(wardZone, bedId, vitals) {
  const alert = evaluateNews2Deterioration({ bedId, wardZone, vitals });
  if (!alert) return null;
  pushToZone(wardZone, 'ambient_deterioration', alert);
  pushToZone('command', 'ambient_deterioration', alert);
  return alert;
}
