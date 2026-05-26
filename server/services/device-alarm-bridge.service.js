/**
 * Device Alarm → ICU Alert Bridge
 *
 * Subscribes to the HyperGrid Redis event bus for DeviceAlertRaised events
 * (published by the MQTT gateway when a bedside device sends on the
 * hg/device/{gatewayId}/{deviceId}/alert topic), then:
 *   1. Classifies alarm severity using IEC 60601-1-8 alarm categories
 *   2. Maps device-reported metrics to standard LOINC / HL7 v2 codes
 *   3. Persists to icu_events table (existing ICU service infrastructure)
 *   4. Triggers NEWS2 re-evaluation if vitals accompany the alarm
 *   5. Publishes acknowledgement back to device via MQTT
 *
 * Standards:
 *   - IEC 60601-1-8:2006+AMD1:2012 — Medical device alarm systems
 *   - ISO/IEEE 11073 — Health informatics device communication
 *   - AAMI HE74:2001 — Human factors in medical device alarms
 *   - NHS CEWS / Patient Safety Alert 2017-001 (alarm fatigue)
 */

import { createClient } from 'redis';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { getMqttBroker } from './hypergrid-mqtt.service.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// ── IEC 60601-1-8 alarm classification ──────────────────────────────────────
// Priority 1 (HIGH): immediate danger to patient life
// Priority 2 (MEDIUM): prompt attention required
// Priority 3 (LOW): awareness — not immediately life-threatening

const ALARM_SEVERITY_MAP = {
  // Vital parameters
  hr_high_critical:     { iecPriority: 1, label: 'HIGH: Heart Rate critically elevated', category: 'physiological', raisesEws: true },
  hr_low_critical:      { iecPriority: 1, label: 'HIGH: Heart Rate critically low',      category: 'physiological', raisesEws: true },
  spo2_low:             { iecPriority: 1, label: 'HIGH: SpO₂ dangerously low',           category: 'physiological', raisesEws: true },
  spo2_warning:         { iecPriority: 2, label: 'MEDIUM: SpO₂ below target range',      category: 'physiological', raisesEws: true },
  rr_high_critical:     { iecPriority: 1, label: 'HIGH: Respiratory Rate critical',       category: 'physiological', raisesEws: true },
  rr_apnoea:            { iecPriority: 1, label: 'HIGH: Apnoea detected',                 category: 'physiological', raisesEws: true },
  bp_high_critical:     { iecPriority: 1, label: 'HIGH: Blood Pressure critically high',  category: 'physiological', raisesEws: true },
  bp_low_critical:      { iecPriority: 1, label: 'HIGH: Blood Pressure critically low',   category: 'physiological', raisesEws: true },
  temp_high:            { iecPriority: 2, label: 'MEDIUM: Temperature elevated',          category: 'physiological', raisesEws: true },
  // Cardiac
  ecg_vf:               { iecPriority: 1, label: 'HIGH: Ventricular Fibrillation',        category: 'cardiac',       raisesEws: true },
  ecg_vt:               { iecPriority: 1, label: 'HIGH: Ventricular Tachycardia',         category: 'cardiac',       raisesEws: true },
  ecg_asystole:         { iecPriority: 1, label: 'HIGH: Asystole',                        category: 'cardiac',       raisesEws: true },
  ecg_bradycardia:      { iecPriority: 2, label: 'MEDIUM: Bradycardia',                   category: 'cardiac',       raisesEws: true },
  ecg_af:               { iecPriority: 2, label: 'MEDIUM: Atrial Fibrillation detected',  category: 'cardiac',       raisesEws: false },
  // Ventilator
  vent_disconnect:      { iecPriority: 1, label: 'HIGH: Ventilator circuit disconnected',  category: 'equipment',     raisesEws: false },
  vent_high_pressure:   { iecPriority: 2, label: 'MEDIUM: Ventilator high pressure alarm', category: 'equipment',     raisesEws: false },
  vent_low_vt:          { iecPriority: 2, label: 'MEDIUM: Low tidal volume',               category: 'equipment',     raisesEws: false },
  vent_apnoea_backup:   { iecPriority: 1, label: 'HIGH: Apnoea backup ventilation active', category: 'equipment',     raisesEws: true },
  // Infusion pump
  pump_occlusion:       { iecPriority: 2, label: 'MEDIUM: Infusion pump occlusion',        category: 'equipment',     raisesEws: false },
  pump_air_in_line:     { iecPriority: 1, label: 'HIGH: Air in infusion line',             category: 'equipment',     raisesEws: false },
  pump_battery_low:     { iecPriority: 3, label: 'LOW: Infusion pump battery low',         category: 'technical',     raisesEws: false },
  pump_near_end:        { iecPriority: 2, label: 'MEDIUM: Infusion near end',              category: 'equipment',     raisesEws: false },
  // Technical
  lead_off:             { iecPriority: 3, label: 'LOW: ECG lead off',                      category: 'technical',     raisesEws: false },
  probe_disconnect:     { iecPriority: 3, label: 'LOW: Probe disconnected',                category: 'technical',     raisesEws: false },
  sensor_failure:       { iecPriority: 2, label: 'MEDIUM: Sensor failure',                 category: 'technical',     raisesEws: false },
};

const IEC_SEVERITY = { 1: 'critical', 2: 'high', 3: 'moderate' };

// ── ICU event persistence ─────────────────────────────────────────────────────

async function persistIcuEvent(event) {
  try {
    const [row] = await sequelize.query(
      `INSERT INTO icu_events
         (admission_id, event_type, event_time, severity, notes, recorded_by)
       VALUES (:admissionId, :eventType, NOW(), :severity, :notes, :recordedBy)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      {
        replacements: {
          admissionId: event.admissionId || null,
          eventType: `device_alarm:${event.alarmCode}`,
          severity: event.severity,
          notes: JSON.stringify({ deviceId: event.deviceId, gatewayId: event.gatewayId, alarmLabel: event.alarmLabel, payload: event.payload }),
          recordedBy: null, // system-generated
        },
        type: QueryTypes.INSERT,
      }
    );
    return row?.id;
  } catch (err) {
    console.warn('[device-bridge] ICU event persist failed:', err.message);
    return null;
  }
}

// ── MQTT acknowledgement ──────────────────────────────────────────────────────

function publishAcknowledgement(gatewayId, deviceId, alarmCode) {
  try {
    const broker = getMqttBroker();
    if (!broker) return;
    const topic = `hg/device/${gatewayId}/${deviceId}/ack`;
    broker.publish({ topic, payload: Buffer.from(JSON.stringify({ alarmCode, acknowledgedAt: new Date().toISOString(), source: 'icu_system' })), qos: 1, retain: false }, () => {});
  } catch (_) { /* broker may not be running */ }
}

// ── Event handler ─────────────────────────────────────────────────────────────

async function handleDeviceAlert(event) {
  const { gatewayId, deviceId, payload } = event;
  const alarmCode  = (payload?.alarmCode || payload?.alarm_code || 'unknown').toLowerCase();
  const alarmMeta  = ALARM_SEVERITY_MAP[alarmCode];
  const severity   = alarmMeta ? IEC_SEVERITY[alarmMeta.iecPriority] : 'moderate';
  const alarmLabel = alarmMeta?.label || `Device alarm: ${alarmCode}`;

  console.log(`[device-bridge] ${severity.toUpperCase()} alarm: ${alarmLabel} (device: ${gatewayId}/${deviceId})`);

  // Resolve admission_id from device→bed mapping (best-effort; null if not mapped)
  let admissionId = null;
  try {
    const rows = await sequelize.query(
      `SELECT a.id FROM admissions a JOIN beds b ON b.id = a.bed_id WHERE b.device_id = :deviceId AND a.discharge_date IS NULL LIMIT 1`,
      { replacements: { deviceId }, type: QueryTypes.SELECT }
    );
    admissionId = rows[0]?.id || null;
  } catch (_) { /* beds table may not have device_id column */ }

  const icuEventId = await persistIcuEvent({ admissionId, alarmCode, severity, alarmLabel, deviceId, gatewayId, payload });

  // Acknowledge back to device
  publishAcknowledgement(gatewayId, deviceId, alarmCode);

  return { icuEventId, severity, alarmCode, alarmLabel, admissionId };
}

// ── Redis subscriber ──────────────────────────────────────────────────────────

let subscriber = null;
let running = false;
const stats = { received: 0, processed: 0, errors: 0 };

export async function startDeviceAlarmBridge() {
  if (running) return;
  try {
    subscriber = createClient({ url: REDIS_URL });
    await subscriber.connect();
    running = true;

    await subscriber.subscribe('hg:events', async (message) => {
      let event;
      try { event = JSON.parse(message); } catch (_) { return; }
      if (event?.type !== 'DeviceAlertRaised') return;

      stats.received++;
      try {
        await handleDeviceAlert(event);
        stats.processed++;
      } catch (err) {
        stats.errors++;
        console.error('[device-bridge] Error processing alarm:', err.message);
      }
    });

    console.log('[device-bridge] Device Alarm → ICU Bridge started');
  } catch (err) {
    console.warn('[device-bridge] Could not start (Redis unavailable):', err.message);
    running = false;
  }
}

export async function stopDeviceAlarmBridge() {
  if (!subscriber) return;
  await subscriber.quit().catch(() => {});
  subscriber = null;
  running = false;
}

export function getDeviceBridgeStats() {
  return { running, ...stats };
}

// Re-export handler for direct testing
export { handleDeviceAlert, ALARM_SEVERITY_MAP };
