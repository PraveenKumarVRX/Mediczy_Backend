/**
 * Minimal managed edge-agent runtime.
 *
 * It accepts canonical events from an approved local adapter over stdin, signs
 * them, persists an encrypted-at-rest deployment-specific spool in production,
 * and publishes QoS 1 envelopes to Mosquitto. No OEM transport is bundled here:
 * adapters must be independently approved and loaded by a later adapter host.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createPrivateKey, sign } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import mqtt from 'mqtt';

const gatewayId = process.env.EDGE_GATEWAY_ID;
const mqttUrl = process.env.MEDICAL_DEVICE_MQTT_URL;
const privateKeyPem = process.env.EDGE_GATEWAY_PRIVATE_KEY;
const spoolPath = process.env.EDGE_GATEWAY_SPOOL_PATH || '/var/lib/mediqzy-edge/pending-events.jsonl';

if (!gatewayId || !mqttUrl || !privateKeyPem) {
  throw new Error('EDGE_GATEWAY_ID, MEDICAL_DEVICE_MQTT_URL, and EDGE_GATEWAY_PRIVATE_KEY are required');
}
const privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'));

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function envelope(event) {
  return { event, signature: sign(null, Buffer.from(stableStringify(event), 'utf8'), privateKey).toString('base64') };
}

async function appendToSpool(message) {
  await mkdir(path.dirname(spoolPath), { recursive: true });
  await appendFile(spoolPath, `${JSON.stringify(message)}\n`, { mode: 0o600 });
}

async function drainSpool(client) {
  let content = '';
  try { content = await readFile(spoolPath, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const pending = content.trim().split('\n').filter(Boolean).map(JSON.parse);
  const remaining = [];
  for (const message of pending) {
    try { await publish(client, message); } catch { remaining.push(message); }
  }
  const replacement = `${spoolPath}.next`;
  await writeFile(replacement, remaining.map(value => JSON.stringify(value)).join('\n') + (remaining.length ? '\n' : ''), { mode: 0o600 });
  await rename(replacement, spoolPath);
}

function publish(client, message) {
  const topic = `mediqzy/v1/${gatewayId}/${message.event.device.registryId}/events`;
  return new Promise((resolve, reject) => client.publish(topic, JSON.stringify(message), { qos: 1 }, error => error ? reject(error) : resolve()));
}

const client = mqtt.connect(mqttUrl, {
  clientId: `mediqzy-edge-${gatewayId}`,
  username: process.env.MEDICAL_DEVICE_MQTT_USERNAME,
  password: process.env.MEDICAL_DEVICE_MQTT_PASSWORD,
  reconnectPeriod: 5_000,
  rejectUnauthorized: process.env.NODE_ENV === 'production',
});
client.on('connect', () => drainSpool(client).catch(error => console.error('[edge-agent] spool drain failed:', error.message)));
client.on('error', error => console.error('[edge-agent] MQTT error:', error.message));

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines.filter(Boolean)) {
    Promise.resolve().then(async () => {
      const event = JSON.parse(line);
      if (String(event.gatewayId) !== String(gatewayId)) throw new Error('event gatewayId does not match this edge gateway');
      const message = envelope(event);
      try { await publish(client, message); } catch { await appendToSpool(message); }
    }).catch(error => console.error('[edge-agent] rejected local event:', error.message));
  }
});
