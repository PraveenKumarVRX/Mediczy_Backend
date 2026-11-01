import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../routes/hypergrid-mqtt.route.js', import.meta.url), 'utf8');
const broker = fs.readFileSync(new URL('../services/hypergrid-mqtt.service.js', import.meta.url), 'utf8');

describe('HyperGrid MQTT schema contract', () => {
  it('stores hashed secrets against the migration-defined gateway key and status', () => {
    expect(route).toMatch(/gateway_key, secret_hash, tenant_id, status/i);
    expect(route).not.toMatch(/device_key, api_secret, tenant_id, active/i);
    expect(broker).toMatch(/gateway_key = \$1[\s\S]*secret_hash = \$2[\s\S]*status = 'active'/i);
  });

  it('persists and reads the migration-defined device-reading fields', () => {
    expect(broker).toMatch(/reading_type, value, unit, quality, raw_payload, patient_id, recorded_at/i);
    expect(route).toMatch(/r\.reading_type/i);
    expect(route).toMatch(/r\.recorded_at DESC/i);
  });
});
