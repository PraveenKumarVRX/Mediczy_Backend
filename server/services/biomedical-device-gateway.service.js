import { createHash, timingSafeEqual } from 'node:crypto';
import pool from '../db/pgPool.js';

const asId = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
const hashKey = (value) => createHash('sha256').update(value).digest('hex');
const keyMatches = (storedHash, suppliedKey) => {
  if (!storedHash || typeof suppliedKey !== 'string' || !suppliedKey) return false;
  const candidate = hashKey(suppliedKey);
  if (storedHash.length !== candidate.length) return false;
  return timingSafeEqual(Buffer.from(storedHash, 'utf8'), Buffer.from(candidate, 'utf8'));
};

class BiomedicalDeviceGatewayService {
  async overview(tenantId) {
    const { rows } = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM biomedical_edge_gateways WHERE tenant_id=$1) gateways,
      (SELECT COUNT(*)::int FROM biomedical_edge_gateways WHERE tenant_id=$1 AND status='active') active_gateways,
      (SELECT COUNT(*)::int FROM biomedical_gateway_devices WHERE tenant_id=$1 AND status='active') active_devices,
      (SELECT COUNT(*)::int FROM biomedical_gateway_events WHERE tenant_id=$1 AND received_at > NOW()-INTERVAL '24 hours') events_24h,
      (SELECT COUNT(*)::int FROM biomedical_gateway_events WHERE tenant_id=$1 AND review_status='pending') pending_review,
      (SELECT COUNT(*)::int FROM biomedical_gateway_quarantine WHERE tenant_id=$1 AND status='open') open_quarantine,
      (SELECT COUNT(*)::int FROM biomedical_gateway_outbox WHERE tenant_id=$1 AND status='failed') failed_deliveries`, [tenantId]);
    return rows[0];
  }

  async adapters(tenantId) { return (await pool.query(`SELECT * FROM biomedical_gateway_adapters WHERE tenant_id=$1 ORDER BY manufacturer, device_model, version DESC`, [tenantId])).rows; }
  async createAdapter(tenantId, body, userId) {
    const { adapterId, version, manufacturer, deviceModel, protocol, capabilities = {} } = body;
    if (![adapterId, version, manufacturer, deviceModel].every(v => typeof v === 'string' && v.trim())) throw fail('Adapter ID, version, manufacturer, and device model are required');
    const { rows } = await pool.query(`INSERT INTO biomedical_gateway_adapters (tenant_id,adapter_id,version,manufacturer,device_model,protocol,capabilities,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`, [tenantId, adapterId.trim(), version.trim(), manufacturer.trim(), deviceModel.trim(), protocol || null, JSON.stringify(capabilities), userId]);
    return rows[0];
  }
  async updateAdapterStatus(tenantId, id, status) {
    if (!['verified', 'certified', 'withdrawn'].includes(status)) throw fail('Invalid adapter status');
    const { rows } = await pool.query(`UPDATE biomedical_gateway_adapters SET status=$3,updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`, [asId(id), tenantId, status]);
    if (!rows[0]) throw fail('Adapter release not found', 404); return rows[0];
  }

  async gateways(tenantId) {
    return (await pool.query(`SELECT g.id,g.tenant_id,g.name,g.site,g.status,g.last_seen_at,g.metadata,g.created_at,g.updated_at,COUNT(d.id)::int device_count FROM biomedical_edge_gateways g LEFT JOIN biomedical_gateway_devices d ON d.edge_gateway_id=g.id AND d.status <> 'decommissioned' WHERE g.tenant_id=$1 GROUP BY g.id ORDER BY g.created_at DESC`, [tenantId])).rows;
  }
  async createGateway(tenantId, body, userId) {
    const { name, site, gatewayKey, metadata = {} } = body;
    if (![name, gatewayKey].every(v => typeof v === 'string' && v.trim())) throw fail('Gateway name and provisioning key are required');
    const { rows } = await pool.query(`INSERT INTO biomedical_edge_gateways (tenant_id,name,site,gateway_key_hash,metadata,created_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id,tenant_id,name,site,status,last_seen_at,metadata,created_at,updated_at`, [tenantId, name.trim(), site || null, hashKey(gatewayKey.trim()), JSON.stringify(metadata), userId]);
    return rows[0];
  }
  async updateGatewayStatus(tenantId, id, status) {
    if (!['active', 'suspended', 'decommissioned'].includes(status)) throw fail('Invalid gateway status');
    const { rows } = await pool.query(`UPDATE biomedical_edge_gateways SET status=$3,updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`, [asId(id), tenantId, status]);
    if (!rows[0]) throw fail('Gateway not found', 404); return rows[0];
  }

  async devices(tenantId) {
    return (await pool.query(`SELECT d.*,g.name gateway_name,g.status gateway_status,a.adapter_id,a.version adapter_version,a.manufacturer,a.device_model,a.status adapter_status,MAX(e.received_at) last_event_at,COUNT(e.id) FILTER(WHERE e.received_at > NOW()-INTERVAL '24 hours')::int events_24h,COUNT(e.id) FILTER(WHERE e.review_status='quarantined' AND e.received_at > NOW()-INTERVAL '24 hours')::int quarantined_24h FROM biomedical_gateway_devices d JOIN biomedical_edge_gateways g ON g.id=d.edge_gateway_id JOIN biomedical_gateway_adapters a ON a.id=d.adapter_id LEFT JOIN biomedical_gateway_events e ON e.device_id=d.id WHERE d.tenant_id=$1 GROUP BY d.id,g.id,a.id ORDER BY d.created_at DESC`, [tenantId])).rows;
  }
  async createDevice(tenantId, body) {
    const gatewayId = asId(body.edgeGatewayId), adapterId = asId(body.adapterId);
    if (!gatewayId || !adapterId || !body.name?.trim() || !body.serialNumber?.trim()) throw fail('Gateway, certified adapter, device name, and serial number are required');
    const { rows: valid } = await pool.query(`SELECT 1 FROM biomedical_edge_gateways g JOIN biomedical_gateway_adapters a ON a.id=$3 WHERE g.id=$1 AND g.tenant_id=$2 AND g.status='active' AND a.tenant_id=$2 AND a.status='certified'`, [gatewayId, tenantId, adapterId]);
    if (!valid[0]) throw fail('Gateway must be active and adapter must be certified', 409);
    const { rows } = await pool.query(`INSERT INTO biomedical_gateway_devices (tenant_id,edge_gateway_id,adapter_id,name,serial_number,location,status) VALUES ($1,$2,$3,$4,$5,$6,'registered') RETURNING *`, [tenantId, gatewayId, adapterId, body.name.trim(), body.serialNumber.trim(), body.location || null]);
    return rows[0];
  }
  async updateDeviceStatus(tenantId, id, status) {
    if (!['registered', 'active', 'maintenance', 'quarantined', 'decommissioned'].includes(status)) throw fail('Invalid device status');
    const { rows } = await pool.query(`UPDATE biomedical_gateway_devices SET status=$3,updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`, [asId(id), tenantId, status]);
    if (!rows[0]) throw fail('Device not found', 404); return rows[0];
  }

  async bindings(tenantId) { return (await pool.query(`SELECT b.*,d.name device_name,d.serial_number,d.location FROM biomedical_device_bindings b JOIN biomedical_gateway_devices d ON d.id=b.device_id WHERE b.tenant_id=$1 ORDER BY b.created_at DESC`, [tenantId])).rows; }
  async createBinding(tenantId, body, userId) {
    const deviceId = asId(body.deviceId), patientId = asId(body.patientId);
    if (!deviceId || !patientId || !body.confirmationMethod?.trim()) throw fail('Device, patient, and confirmation method are required');
    const { rows: devices } = await pool.query(`SELECT 1 FROM biomedical_gateway_devices WHERE id=$1 AND tenant_id=$2 AND status='active'`, [deviceId, tenantId]);
    if (!devices[0]) throw fail('Only active devices can be bound', 409);
    const { rows } = await pool.query(`INSERT INTO biomedical_device_bindings (tenant_id,device_id,patient_id,encounter_id,bed_id,confirmation_method,confirmed_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [tenantId, deviceId, patientId, asId(body.encounterId), asId(body.bedId), body.confirmationMethod.trim(), userId]);
    return rows[0];
  }
  async endBinding(tenantId, id, reason, userId) {
    if (!reason?.trim()) throw fail('End reason is required');
    const { rows } = await pool.query(`UPDATE biomedical_device_bindings SET status='ended',ended_at=NOW(),ended_by=$3,end_reason=$4 WHERE id=$1 AND tenant_id=$2 AND status IN ('pending','confirmed') RETURNING *`, [asId(id), tenantId, userId, reason.trim()]);
    if (!rows[0]) throw fail('Active binding not found', 404); return rows[0];
  }

  /**
   * Ingest a telemetry/alarm/lifecycle event from an enrolled edge gateway. Gateway-credential
   * authenticated (x-gateway-key against the hashed provisioning key) — there is no user JWT on
   * this path, since the caller is an on-premise gateway appliance, not a logged-in person.
   * An event lands as 'pending' review only when the device has an active patient binding;
   * otherwise it is quarantined rather than silently discarded, so nothing attributable gets lost.
   */
  async ingestEvent(gatewayId, gatewayKey, body = {}) {
    const gwId = asId(gatewayId);
    if (!gwId) throw fail('Gateway not found', 404);
    const { rows: gateways } = await pool.query(`SELECT id,tenant_id,gateway_key_hash FROM biomedical_edge_gateways WHERE id=$1 AND status='active'`, [gwId]);
    const gateway = gateways[0];
    if (!gateway || !keyMatches(gateway.gateway_key_hash, gatewayKey)) throw fail('Invalid gateway credentials', 401);

    const deviceId = asId(body.deviceId);
    const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : '';
    const observedAt = body.observedAt ? new Date(body.observedAt) : new Date();
    if (!deviceId || !eventType || Number.isNaN(observedAt.getTime())) throw fail('deviceId, eventType, and a valid observedAt are required');
    const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: devices } = await client.query(
        `SELECT id FROM biomedical_gateway_devices WHERE id=$1 AND tenant_id=$2 AND edge_gateway_id=$3 AND status='active' FOR UPDATE`,
        [deviceId, gateway.tenant_id, gateway.id]
      );
      if (!devices[0]) throw fail('Device is not an active device enrolled on this gateway', 409);

      const { rows: bindings } = await client.query(
        `SELECT id FROM biomedical_device_bindings WHERE device_id=$1 AND tenant_id=$2 AND status IN ('pending','confirmed') ORDER BY created_at DESC LIMIT 1`,
        [deviceId, gateway.tenant_id]
      );
      const bindingId = bindings[0]?.id || null;
      const reviewStatus = bindingId ? 'pending' : 'quarantined';

      const { rows: inserted } = await client.query(
        `INSERT INTO biomedical_gateway_events (tenant_id,device_id,binding_id,event_type,observed_at,payload,review_status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
        [gateway.tenant_id, deviceId, bindingId, eventType, observedAt.toISOString(), JSON.stringify(payload), reviewStatus]
      );
      const event = inserted[0];

      if (reviewStatus === 'quarantined') {
        await client.query(
          `INSERT INTO biomedical_gateway_quarantine (tenant_id,event_id,reason) VALUES ($1,$2,$3)`,
          [gateway.tenant_id, event.id, 'No active patient binding for this device']
        );
      }
      await client.query(`UPDATE biomedical_edge_gateways SET last_seen_at=NOW(), updated_at=NOW() WHERE id=$1`, [gateway.id]);
      await client.query('COMMIT');
      return event;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async events(tenantId, limit = 50) { return (await pool.query(`SELECT e.*,d.name device_name FROM biomedical_gateway_events e JOIN biomedical_gateway_devices d ON d.id=e.device_id WHERE e.tenant_id=$1 ORDER BY e.received_at DESC LIMIT $2`, [tenantId, Math.min(Math.max(Number(limit) || 50, 1), 200)])).rows; }
  async quarantine(tenantId) { return (await pool.query(`SELECT q.*,e.event_type,e.observed_at,d.name device_name FROM biomedical_gateway_quarantine q JOIN biomedical_gateway_events e ON e.id=q.event_id JOIN biomedical_gateway_devices d ON d.id=e.device_id WHERE q.tenant_id=$1 AND q.status='open' ORDER BY q.created_at DESC`, [tenantId])).rows; }
  async reviewEvent(tenantId, id, decision, note, userId) {
    if (!['accepted', 'rejected'].includes(decision) || !note?.trim()) throw fail('Decision and review note are required');
    const client = await pool.connect();
    try { await client.query('BEGIN'); const { rows } = await client.query(`UPDATE biomedical_gateway_events SET review_status=$3,review_note=$4,reviewed_by=$5,reviewed_at=NOW() WHERE id=$1 AND tenant_id=$2 AND review_status='pending' RETURNING *`, [asId(id), tenantId, decision, note.trim(), userId]); if (!rows[0]) throw fail('Event is not pending review', 409); if (decision === 'accepted') await client.query(`INSERT INTO biomedical_gateway_outbox (tenant_id,event_id) VALUES ($1,$2)`, [tenantId, rows[0].id]); await client.query('COMMIT'); return rows[0]; } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async outbox(tenantId) { return (await pool.query(`SELECT o.*,d.name device_name,e.observed_at FROM biomedical_gateway_outbox o JOIN biomedical_gateway_events e ON e.id=o.event_id JOIN biomedical_gateway_devices d ON d.id=e.device_id WHERE o.tenant_id=$1 ORDER BY o.created_at DESC`, [tenantId])).rows; }
}

export default new BiomedicalDeviceGatewayService();
