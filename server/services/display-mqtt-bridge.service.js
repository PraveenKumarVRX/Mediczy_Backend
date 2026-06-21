/**
 * MQTT / HyperGrid vitals → display SSE bridge (GAP-IOT-001)
 */

import { createClient } from 'redis';
import mqtt from 'mqtt';
import { pushToZone, pushToAll } from './display-sse-broker.service.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MQTT_URL = process.env.MQTT_BROKER_URL || process.env.MQTT_URL || '';

let _started = false;
let redisSub = null;
let mqttClient = null;

function parseVitalsPayload(payload, topic) {
  const p = payload || {};
  const bedId = p.bedId || p.bed_id || p.bed || topic?.split('/').pop();
  const wardZone = p.wardZone || p.ward || p.zone || 'icu';
  return {
    bedId,
    wardZone: String(wardZone).toLowerCase().includes('icu') ? 'icu' : wardZone,
    vitals: {
      spo2: p.spo2 ?? p.SpO2 ?? null,
      hr: p.hr ?? p.heartRate ?? null,
      bp: p.bp ?? p.bloodPressure ?? null,
      temp: p.temp ?? p.temperature ?? null,
      rr: p.rr ?? p.respiratoryRate ?? null,
      news2: p.news2 ?? p.NEWS2 ?? null,
    },
    ts: Date.now(),
  };
}

export function pushVitalsToDisplay(wardZone, bedId, vitals) {
  pushToZone(wardZone, 'vitals_update', { bedId, vitals, ts: Date.now() });
}

async function handleHypergridEvent(event) {
  if (!event || event.type !== 'VitalsObserved') return;
  const payload = event.payload || {};
  const bedId = payload.bedId || event.deviceId || 'unknown';
  const wardZone = payload.ward || payload.icuWard || 'icu';
  pushVitalsToDisplay(wardZone, bedId, parseVitalsPayload(payload).vitals);
}

async function startRedisBridge() {
  try {
    redisSub = createClient({ url: REDIS_URL });
    redisSub.on('error', (e) => console.warn('[display-mqtt] Redis sub:', e.message));
    await redisSub.connect();
    await redisSub.subscribe('hg:events', (message) => {
      try {
        const event = JSON.parse(message);
        handleHypergridEvent(event);
      } catch (_) {}
    });
    console.info('[display-mqtt] Subscribed to Redis hg:events → display SSE');
  } catch (e) {
    console.warn('[display-mqtt] Redis bridge idle:', e.message);
    redisSub = null;
  }
}

function startExternalMqttBridge() {
  if (!MQTT_URL) return;
  mqttClient = mqtt.connect(MQTT_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
  });
  mqttClient.on('connect', () => {
    mqttClient.subscribe(['vitals/#', 'hg/device/+/+/vitals', 'hospital/vitals/#']);
    console.info('[display-mqtt] External MQTT connected');
  });
  mqttClient.on('message', (topic, buf) => {
    try {
      const payload = JSON.parse(buf.toString());
      const { wardZone, bedId, vitals } = parseVitalsPayload(payload, topic);
      pushVitalsToDisplay(wardZone, bedId, vitals);
    } catch (_) {}
  });
  mqttClient.on('error', (e) => console.warn('[display-mqtt] MQTT error:', e.message));
}

export async function startDisplayMqttBridge() {
  if (_started) return;
  _started = true;
  await startRedisBridge();
  startExternalMqttBridge();
}

export default { startDisplayMqttBridge, pushVitalsToDisplay };
