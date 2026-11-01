/**
 * Cloud-side subscriber for the dedicated Mosquitto deployment.
 *
 * The broker authenticates the edge connection; this service still verifies
 * every payload's enrolled Ed25519 signature before it is persisted.
 */
import mqtt from 'mqtt';
import { ingestSignedEvent } from './medical-device-gateway.service.js';

let client = null;

export function startMedicalDeviceMqttIngest() {
  if (client) return client;
  const url = process.env.MEDICAL_DEVICE_MQTT_URL;
  if (!url) {
    console.warn('[medical-device-mqtt] MEDICAL_DEVICE_MQTT_URL is not configured; clinical MQTT ingestion is disabled');
    return null;
  }
  client = mqtt.connect(url, {
    clientId: process.env.MEDICAL_DEVICE_MQTT_CLIENT_ID || `mediqzy-clinical-ingest-${process.pid}`,
    username: process.env.MEDICAL_DEVICE_MQTT_USERNAME,
    password: process.env.MEDICAL_DEVICE_MQTT_PASSWORD,
    reconnectPeriod: 5_000,
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  });
  client.on('connect', () => client.subscribe('mediqzy/v1/+/+/events', { qos: 1 }, err => {
    if (err) console.error('[medical-device-mqtt] subscribe failed:', err.message);
    else console.log('[medical-device-mqtt] subscribed to clinical device events');
  }));
  client.on('message', async (topic, buffer) => {
    try {
      const envelope = JSON.parse(buffer.toString('utf8'));
      await ingestSignedEvent(envelope.event, envelope.signature);
    } catch (error) {
      // Never log raw payloads: they can include patient identifiers.
      console.error(`[medical-device-mqtt] rejected event on ${topic}:`, error.code || error.message);
    }
  });
  client.on('error', error => console.error('[medical-device-mqtt] client error:', error.message));
  return client;
}

export async function stopMedicalDeviceMqttIngest() {
  if (!client) return;
  await new Promise(resolve => client.end(false, {}, resolve));
  client = null;
}
