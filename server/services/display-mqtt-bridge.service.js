/**
 * MQTT / HyperGrid vitals → display SSE bridge (GAP-IOT-001)
 */

import { createClient } from 'redis';
import mqtt from 'mqtt';
import pool from '../db/pgPool.js';
import { pushToZone, pushToAll } from './display-sse-broker.service.js';
import { pushAmbientDeteriorationAlert } from './ambient-deterioration.service.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MQTT_URL = process.env.MQTT_BROKER_URL || process.env.MQTT_URL || '';

let _started = false;
let redisSub = null;
let mqttClient = null;
const gatewayOrgCache = new Map(); // gatewayId → { organizationId, at }
const GATEWAY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve which tenant a HyperGrid gateway belongs to (hg_devices.tenant_id),
 * so vitals/alerts land only on that tenant's boards — zone names like "icu"
 * are reused by every hospital (see display-sse-broker.service.js).
 */
async function resolveGatewayOrgId(gatewayId) {
  if (!gatewayId) return null;
  const cached = gatewayOrgCache.get(gatewayId);
  if (cached && Date.now() - cached.at < GATEWAY_CACHE_TTL_MS) return cached.organizationId;
  try {
    const { rows } = await pool.query(
      `SELECT tenant_id FROM hg_devices WHERE gateway_key = $1 OR id::text = $1 LIMIT 1`,
      [String(gatewayId)]
    );
    const organizationId = rows[0]?.tenant_id ? parseInt(rows[0].tenant_id, 10) : null;
    gatewayOrgCache.set(gatewayId, { organizationId, at: Date.now() });
    return organizationId;
  } catch (e) {
    console.warn('[display-mqtt] gateway org lookup failed:', e.message);
    return null;
  }
}

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

export function pushVitalsToDisplay(wardZone, bedId, vitals, organizationId = null) {
  pushToZone(wardZone, 'vitals_update', { bedId, vitals, ts: Date.now() }, organizationId);
  pushAmbientDeteriorationAlert(wardZone, bedId, vitals, organizationId);
}

async function handleHypergridEvent(event) {
  if (!event || event.type !== 'VitalsObserved') return;
  const payload = event.payload || {};
  const bedId = payload.bedId || event.deviceId || 'unknown';
  const wardZone = payload.ward || payload.icuWard || 'icu';
  const organizationId = await resolveGatewayOrgId(event.gatewayId);
  pushVitalsToDisplay(wardZone, bedId, parseVitalsPayload(payload).vitals, organizationId);
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
      // External broker topics (vitals/#, hospital/vitals/#) carry no gateway/tenant
      // identifier in the current scheme, so this path cannot yet be org-scoped —
      // same zone-only behavior as before. Not reachable in production today
      // (MQTT_BROKER_URL/MQTT_URL are unset); wire a tenant claim into the topic
      // or payload before pointing a real external broker at this.
      pushVitalsToDisplay(wardZone, bedId, vitals, null);
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
