/**
 * MQTT vitals → display SSE bridge (stub + hook for ICU boards).
 * Wire to hospital IoT broker when MQTT_URL is configured.
 */

import { pushToZone } from './display-sse-broker.service.js';

let _started = false;

export function startDisplayMqttBridge() {
  if (_started || !process.env.MQTT_BROKER_URL) {
    if (!process.env.MQTT_BROKER_URL) {
      console.info('[display-mqtt] MQTT_BROKER_URL not set — vitals bridge idle');
    }
    return;
  }
  _started = true;
  console.info('[display-mqtt] Bridge would connect to', process.env.MQTT_BROKER_URL);
}

/** Push vitals update to ICU/ward displays (called from ICU services or MQTT consumer). */
export function pushVitalsToDisplay(wardZone, bedId, vitals) {
  pushToZone(wardZone, 'vitals_update', { bedId, vitals, ts: Date.now() });
}

export default { startDisplayMqttBridge, pushVitalsToDisplay };
