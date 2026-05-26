/**
 * HyperGrid MQTT Device Fabric Service
 *
 * Embedded MQTT broker (Aedes) + canonical event publisher.
 * Every device message is normalised into a HyperGrid HealthEvent
 * and forwarded to the canonical event bus (Redis pub/sub).
 *
 * Topics consumed:
 *   hg/device/{gatewayId}/{deviceId}/vitals
 *   hg/device/{gatewayId}/{deviceId}/alert
 *   hg/device/{gatewayId}/{deviceId}/telemetry
 *   hg/gateway/{gatewayId}/status
 *   hg/asset/{gatewayId}/{assetId}/location
 */

import Aedes from 'aedes';
import * as AedesModule from 'aedes';
import net from 'net';
import { createClient } from 'redis';
import { connectPostgres } from '../db/postgres.js';

const MQTT_PORT   = parseInt(process.env.MQTT_TCP_PORT  || '1883', 10);
const WS_PORT     = parseInt(process.env.MQTT_WS_PORT   || '8883', 10);
const REDIS_URL   = process.env.REDIS_URL || 'redis://localhost:6379';

let broker   = null;
let tcpServer = null;
let redisPublisher = null;

function createAedesBroker(opts) {
  // Prefer modern API from namespace export.
  if (AedesModule?.Aedes && typeof AedesModule.Aedes.createBroker === 'function') {
    return AedesModule.Aedes.createBroker(opts);
  }

  // Support createBroker exposed directly on default export in some builds.
  if (Aedes && typeof Aedes.createBroker === 'function') {
    return Aedes.createBroker(opts);
  }

  const candidate =
    typeof Aedes === 'function'
      ? Aedes
      : (Aedes && typeof Aedes.default === 'function' ? Aedes.default : null);

  if (!candidate) {
    throw new Error('Unsupported Aedes export format');
  }

  return new candidate(opts);
}

// ─── Canonical event types ────────────────────────────────────────────────────
const TOPIC_PATTERNS = [
  { regex: /^hg\/device\/([^/]+)\/([^/]+)\/vitals$/,    type: 'VitalsObserved'     },
  { regex: /^hg\/device\/([^/]+)\/([^/]+)\/alert$/,     type: 'DeviceAlertRaised'  },
  { regex: /^hg\/device\/([^/]+)\/([^/]+)\/telemetry$/, type: 'TelemetryReceived'  },
  { regex: /^hg\/gateway\/([^/]+)\/status$/,            type: 'GatewayStatusUpdate'},
  { regex: /^hg\/asset\/([^/]+)\/([^/]+)\/location$/,   type: 'AssetLocationUpdate'},
];

function matchTopic(topic) {
  for (const p of TOPIC_PATTERNS) {
    const m = topic.match(p.regex);
    if (m) return { type: p.type, groups: m.slice(1) };
  }
  return null;
}

async function publishCanonicalEvent(event) {
  if (!redisPublisher) return;
  try {
    await redisPublisher.publish('hg:events', JSON.stringify(event));
  } catch (err) {
    console.error('[MQTT] Redis publish error:', err.message);
  }
}

async function persistDeviceReading(event) {
  try {
    const client = await connectPostgres();
    await client.query(
      `INSERT INTO hg_device_readings
         (gateway_id, device_id, event_type, payload, received_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT DO NOTHING`,
      [event.gatewayId, event.deviceId, event.type, JSON.stringify(event.payload)]
    );
  } catch (err) {
    console.error('[MQTT] DB persist error:', err.message);
  }
}

// ─── Broker startup ───────────────────────────────────────────────────────────
export async function startMqttBroker() {
  // Redis publisher for canonical events
  redisPublisher = createClient({ url: REDIS_URL });
  redisPublisher.on('error', e => console.error('[MQTT] Redis error:', e.message));
  await redisPublisher.connect().catch(() => {
    console.warn('[MQTT] Redis not available — canonical events will not be published');
    redisPublisher = null;
  });

  broker = await Promise.resolve(createAedesBroker({
    authenticate(client, username, password, cb) {
      // Validate device API key stored in hg_devices table
      if (!username || !password) return cb(null, false);
      connectPostgres().then(pool => {
        pool.query(
          `SELECT id FROM hg_devices WHERE device_key = $1 AND api_secret = $2 AND active = TRUE`,
          [username, password.toString()]
        ).then(r => cb(null, r.rowCount > 0))
          .catch(() => cb(null, false));
      }).catch(() => cb(null, false));
    },
  }));

  // Normalise every published message into a canonical event
  broker.on('publish', async (packet, client) => {
    if (!client) return; // system messages
    const topic   = packet.topic;
    const matched = matchTopic(topic);
    if (!matched) return;

    let payload = {};
    try { payload = JSON.parse(packet.payload.toString()); } catch (_) {}

    const [gatewayId, deviceId] = matched.groups;
    const event = {
      id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type:      matched.type,
      source:    'mqtt',
      gatewayId: gatewayId || null,
      deviceId:  deviceId  || null,
      clientId:  client.id,
      topic,
      payload,
      timestamp: new Date().toISOString(),
    };

    await Promise.all([
      publishCanonicalEvent(event),
      persistDeviceReading(event),
    ]);
  });

  broker.on('clientConnected',    c => console.log('[MQTT] Connected:',    c.id));
  broker.on('clientDisconnected', c => console.log('[MQTT] Disconnected:', c.id));
  broker.on('error', err => console.error('[MQTT] Broker error:', err.message));

  // TCP server (standard MQTT)
  tcpServer = net.createServer(broker.handle);
  tcpServer.listen(MQTT_PORT, () =>
    console.log(`[MQTT] Broker listening on TCP :${MQTT_PORT}`)
  );

  return broker;
}

export function getMqttBroker() { return broker; }

export async function stopMqttBroker() {
  if (tcpServer) tcpServer.close();
  if (broker)    broker.close();
  if (redisPublisher) await redisPublisher.quit();
}

export function getMqttStats() {
  if (!broker) return null;
  return {
    connectedClients: broker.connectedClients,
    closed:           broker.closed,
  };
}
