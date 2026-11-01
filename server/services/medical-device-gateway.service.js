import { createHash, createPublicKey, verify } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import pool from '../db/pgPool.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(['measurement', 'alarm', 'lifecycle']);
const ASSOCIATION_STATES = new Set(['confirmed', 'pending', 'conflict', 'unassigned']);
const QUALITY = new Set(['validated', 'suspect', 'invalid']);

export class DeviceGatewayError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function payloadHash(payload) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function positiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
}

function validTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function validateCanonicalEvent(event) {
  if (!event || typeof event !== 'object') throw new DeviceGatewayError(422, 'INVALID_EVENT', 'Event object is required');
  if (event.schemaVersion !== 'device-event/v1') throw new DeviceGatewayError(422, 'UNSUPPORTED_SCHEMA', 'schemaVersion must be device-event/v1');
  if (!UUID.test(String(event.eventId || ''))) throw new DeviceGatewayError(422, 'INVALID_EVENT_ID', 'eventId must be a UUID');
  if (!EVENT_TYPES.has(event.eventType)) throw new DeviceGatewayError(422, 'INVALID_EVENT_TYPE', 'eventType must be measurement, alarm, or lifecycle');
  if (!positiveInteger(event.gatewayId) || !positiveInteger(event.device?.registryId)) {
    throw new DeviceGatewayError(422, 'INVALID_SOURCE', 'gatewayId and device.registryId must be positive IDs');
  }
  if (!validTime(event.observedAt)) throw new DeviceGatewayError(422, 'INVALID_OBSERVED_AT', 'observedAt must be an ISO timestamp');
  if (!ASSOCIATION_STATES.has(event.association?.state)) {
    throw new DeviceGatewayError(422, 'INVALID_ASSOCIATION', 'association.state is required');
  }
  if (event.association.state === 'confirmed' && (!positiveInteger(event.association.patientId) || !positiveInteger(event.association.bindingId))) {
    throw new DeviceGatewayError(422, 'INVALID_ASSOCIATION', 'confirmed events require patientId and bindingId');
  }
  const measurements = event.measurements || [];
  if (event.eventType === 'measurement' && (!Array.isArray(measurements) || measurements.length === 0 || measurements.length > 50)) {
    throw new DeviceGatewayError(422, 'INVALID_MEASUREMENTS', 'Measurement events require 1 to 50 measurements');
  }
  if (!Array.isArray(measurements)) throw new DeviceGatewayError(422, 'INVALID_MEASUREMENTS', 'measurements must be an array');

  for (const measurement of measurements) {
    if (!measurement?.code?.system || !measurement?.code?.value || !QUALITY.has(measurement.quality)) {
      throw new DeviceGatewayError(422, 'INVALID_MEASUREMENT', 'Each measurement requires code.system, code.value, and valid quality');
    }
    const numeric = measurement.value;
    if (numeric === undefined && !measurement.valueText) {
      throw new DeviceGatewayError(422, 'INVALID_MEASUREMENT', 'Each measurement requires value or valueText');
    }
    if (numeric !== undefined && !Number.isFinite(Number(numeric))) {
      throw new DeviceGatewayError(422, 'INVALID_MEASUREMENT', 'Measurement value must be finite');
    }
  }
  return { ...event, observedAt: validTime(event.observedAt) };
}

function verifyGatewaySignature(event, signature, publicKey) {
  if (!signature) return false;
  try {
    const key = createPublicKey(publicKey);
    return verify(null, Buffer.from(payloadHash(event), 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export async function createAdapterRelease({ adapterId, version, manufacturer, deviceModel, firmwareRange = null, capabilities = {}, limitations = null, actorId }) {
  if (![adapterId, version, manufacturer, deviceModel].every(value => typeof value === 'string' && value.trim())) {
    throw new DeviceGatewayError(422, 'INVALID_ADAPTER', 'adapterId, version, manufacturer, and deviceModel are required');
  }
  const { rows } = await pool.query(
    `INSERT INTO medical_device_adapter_releases
       (adapter_id, version, manufacturer, device_model, firmware_range, capabilities, limitations, created_by)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
     RETURNING *`,
    [adapterId.trim(), version.trim(), manufacturer.trim(), deviceModel.trim(), firmwareRange, JSON.stringify(capabilities), limitations, actorId]
  );
  return rows[0];
}

export async function setAdapterReleaseStatus(id, status) {
  if (!['verified', 'certified', 'withdrawn'].includes(status)) throw new DeviceGatewayError(422, 'INVALID_ADAPTER_STATUS', 'Invalid adapter status');
  const { rows } = await pool.query(
    `UPDATE medical_device_adapter_releases SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [positiveInteger(id), status]
  );
  if (!rows[0]) throw new DeviceGatewayError(404, 'ADAPTER_NOT_FOUND', 'Adapter release not found');
  return rows[0];
}

export async function createEdgeGateway({ tenantId, name, site = null, publicKey, metadata = {}, actorId }) {
  if (!tenantId || !name || !publicKey) throw new DeviceGatewayError(422, 'INVALID_GATEWAY', 'tenant, name, and publicKey are required');
  try { createPublicKey(publicKey); } catch { throw new DeviceGatewayError(422, 'INVALID_GATEWAY_KEY', 'publicKey must be a valid PEM public key'); }
  const { rows } = await pool.query(
    `INSERT INTO medical_edge_gateways (tenant_id, name, site, public_key, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
    [tenantId, name, site, publicKey, JSON.stringify(metadata), actorId]
  );
  return rows[0];
}

export async function setEdgeGatewayStatus({ tenantId, gatewayId, status }) {
  if (!['active', 'suspended', 'decommissioned'].includes(status)) throw new DeviceGatewayError(422, 'INVALID_GATEWAY_STATUS', 'Invalid gateway status');
  const { rows } = await pool.query(
    `UPDATE medical_edge_gateways SET status = $3, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [positiveInteger(gatewayId), tenantId, status]
  );
  if (!rows[0]) throw new DeviceGatewayError(404, 'GATEWAY_NOT_FOUND', 'Gateway not found');
  return rows[0];
}

export async function registerMedicalDevice({ tenantId, edgeGatewayId, adapterReleaseId, name, serialNumber, udi = null, location = null, metadata = {} }) {
  const gatewayId = positiveInteger(edgeGatewayId);
  const adapterId = positiveInteger(adapterReleaseId);
  if (!gatewayId || !adapterId || !name || !serialNumber) throw new DeviceGatewayError(422, 'INVALID_DEVICE', 'gateway, certified adapter release, name, and serialNumber are required');
  const { rows: checks } = await pool.query(
    `SELECT g.id AS gateway_id, a.id AS adapter_id
       FROM medical_edge_gateways g CROSS JOIN medical_device_adapter_releases a
      WHERE g.id = $1 AND g.tenant_id = $2 AND g.status = 'active'
        AND a.id = $3 AND a.status = 'certified'`,
    [gatewayId, tenantId, adapterId]
  );
  if (!checks[0]) throw new DeviceGatewayError(409, 'DEVICE_PREREQUISITE_FAILED', 'Gateway must be active and adapter release certified');
  const { rows } = await pool.query(
    `INSERT INTO medical_devices (tenant_id, edge_gateway_id, adapter_release_id, name, serial_number, udi, location, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [tenantId, gatewayId, adapterId, name, serialNumber, udi, location, JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function createBinding({ tenantId, deviceId, patientId, encounterId = null, admissionId = null, bedId = null, confirmationMethod, actorId }) {
  if (!positiveInteger(deviceId) || !positiveInteger(patientId) || !confirmationMethod?.trim()) {
    throw new DeviceGatewayError(422, 'INVALID_BINDING', 'deviceId, patientId, and confirmationMethod are required');
  }
  const { rows: deviceRows } = await pool.query(
    `SELECT id FROM medical_devices WHERE id = $1 AND tenant_id = $2 AND status = 'active'`, [positiveInteger(deviceId), tenantId]
  );
  if (!deviceRows[0]) throw new DeviceGatewayError(409, 'DEVICE_NOT_ACTIVE', 'Only active tenant devices can be bound');
  const { rows } = await pool.query(
    `INSERT INTO medical_device_bindings
       (tenant_id, device_id, patient_id, encounter_id, admission_id, bed_id, confirmation_method, confirmed_by, confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
    [tenantId, positiveInteger(deviceId), positiveInteger(patientId), positiveInteger(encounterId), positiveInteger(admissionId), positiveInteger(bedId), confirmationMethod.trim(), actorId]
  );
  return rows[0];
}

export async function ingestSignedEvent(event, signature) {
  const normalized = validateCanonicalEvent(event);
  const gatewayId = positiveInteger(normalized.gatewayId);
  const deviceId = positiveInteger(normalized.device.registryId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: gateways } = await client.query(
      `SELECT id, tenant_id, public_key FROM medical_edge_gateways WHERE id = $1 AND status = 'active' FOR UPDATE`, [gatewayId]
    );
    const gateway = gateways[0];
    if (!gateway) throw new DeviceGatewayError(403, 'GATEWAY_NOT_ACTIVE', 'Gateway is not active');
    if (!verifyGatewaySignature(event, signature, gateway.public_key)) throw new DeviceGatewayError(403, 'INVALID_GATEWAY_SIGNATURE', 'Invalid gateway signature');

    const { rows: devices } = await client.query(
      `SELECT d.id, d.tenant_id, d.edge_gateway_id, a.status AS adapter_status
         FROM medical_devices d
         JOIN medical_device_adapter_releases a ON a.id = d.adapter_release_id
        WHERE d.id = $1 AND d.tenant_id = $2 AND d.edge_gateway_id = $3 AND d.status = 'active'`,
      [deviceId, gateway.tenant_id, gatewayId]
    );
    if (!devices[0] || devices[0].adapter_status !== 'certified') {
      throw new DeviceGatewayError(409, 'DEVICE_NOT_APPROVED', 'Device is not active with a certified adapter');
    }

    const { rows: inserted } = await client.query(
      `INSERT INTO medical_device_events
         (event_id, tenant_id, edge_gateway_id, device_id, schema_version, event_type, observed_at, clock_quality, payload, payload_sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [normalized.eventId, gateway.tenant_id, gatewayId, deviceId, normalized.schemaVersion, normalized.eventType,
       normalized.observedAt, normalized.clockQuality || 'unknown', JSON.stringify(normalized), payloadHash(normalized)]
    );
    if (!inserted[0]) {
      await client.query('ROLLBACK');
      return { eventId: normalized.eventId, disposition: 'duplicate' };
    }

    let disposition = 'pending_review';
    let reason = null;
    let bindingId = null;
    if (normalized.association.state !== 'confirmed') {
      disposition = 'quarantined';
      reason = 'association_not_confirmed';
    } else {
      const { rows: bindings } = await client.query(
        `SELECT id FROM medical_device_bindings
          WHERE id = $1 AND tenant_id = $2 AND device_id = $3 AND patient_id = $4
            AND status = 'confirmed' AND (ends_at IS NULL OR ends_at > NOW())`,
        [positiveInteger(normalized.association.bindingId), gateway.tenant_id, deviceId, positiveInteger(normalized.association.patientId)]
      );
      bindingId = bindings[0]?.id || null;
      if (!bindingId) { disposition = 'quarantined'; reason = 'binding_not_active'; }
    }

    await client.query(`UPDATE medical_device_events SET binding_id = $2, review_state = $3 WHERE event_id = $1`, [normalized.eventId, bindingId, disposition]);
    for (const measurement of normalized.measurements || []) {
      await client.query(
        `INSERT INTO medical_device_measurements
           (event_id, code_system, code, display, value_numeric, value_text, unit, ucum_code, quality)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [normalized.eventId, measurement.code.system, measurement.code.value, measurement.code.display || null,
         measurement.value === undefined ? null : Number(measurement.value), measurement.valueText || null,
         measurement.unit || null, measurement.ucum || null, measurement.quality]
      );
    }
    if (reason) {
      await client.query(
        `INSERT INTO medical_device_quarantine (event_id, tenant_id, reason_code, reason_detail)
         VALUES ($1,$2,$3,$4)`, [normalized.eventId, gateway.tenant_id, reason, 'Event retained but blocked from clinical review']
      );
    }
    await client.query(`UPDATE medical_edge_gateways SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1`, [gatewayId]);
    await client.query('COMMIT');
    return { eventId: normalized.eventId, disposition };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewEvent({ tenantId, eventId, decision, note, actorId }) {
  if (!UUID.test(String(eventId || '')) || !['accepted', 'rejected'].includes(decision) || !note?.trim()) {
    throw new DeviceGatewayError(422, 'INVALID_REVIEW', 'eventId, accepted/rejected decision, and review note are required');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE medical_device_events SET review_state = $3, reviewed_by = $4, reviewed_at = NOW(), review_note = $5
       WHERE event_id = $1 AND tenant_id = $2 AND review_state = 'pending' RETURNING *`,
      [eventId, tenantId, decision, actorId, note.trim()]
    );
    const event = rows[0];
    if (!event) throw new DeviceGatewayError(409, 'EVENT_NOT_REVIEWABLE', 'Event is not pending review in this tenant');
    if (decision === 'accepted') {
      await client.query(
        `INSERT INTO medical_connector_outbox (tenant_id, event_id, connector_type, payload)
         VALUES ($1,$2,'fhir-r4',$3::jsonb)`,
        [tenantId, eventId, JSON.stringify({ eventId, action: 'map-device-event-to-fhir-observation' })]
      );
    }
    await client.query('COMMIT');
    return event;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listQuarantine(tenantId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const { rows } = await pool.query(
    `SELECT q.*, e.device_id, e.observed_at, e.event_type
       FROM medical_device_quarantine q JOIN medical_device_events e ON e.event_id = q.event_id
      WHERE q.tenant_id = $1 AND q.status = 'open' ORDER BY q.created_at DESC LIMIT $2`,
    [tenantId, safeLimit]
  );
  return rows;
}

export function createUnsignedEventTemplate() {
  return { schemaVersion: 'device-event/v1', eventId: randomUUID(), eventType: 'measurement' };
}
