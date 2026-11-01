import pool from '../db/pgPool.js';

/** Tenant-scoped control-plane records for Biomedical device integration. */
export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS biomedical_gateway_adapters (
        id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        adapter_id VARCHAR(120) NOT NULL, version VARCHAR(60) NOT NULL,
        manufacturer VARCHAR(160) NOT NULL, device_model VARCHAR(160) NOT NULL,
        protocol VARCHAR(60), capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','verified','certified','withdrawn')),
        created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, adapter_id, version)
      );
      CREATE TABLE IF NOT EXISTS biomedical_edge_gateways (
        id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        name VARCHAR(160) NOT NULL, site VARCHAR(160), gateway_key_hash VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','active','suspended','decommissioned')),
        last_seen_at TIMESTAMPTZ, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, gateway_key_hash)
      );
      CREATE TABLE IF NOT EXISTS biomedical_gateway_devices (
        id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
        edge_gateway_id BIGINT NOT NULL REFERENCES biomedical_edge_gateways(id),
        adapter_id BIGINT NOT NULL REFERENCES biomedical_gateway_adapters(id),
        name VARCHAR(160) NOT NULL, serial_number VARCHAR(160) NOT NULL, location VARCHAR(200),
        status VARCHAR(20) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','active','maintenance','quarantined','decommissioned')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, serial_number)
      );
      CREATE TABLE IF NOT EXISTS biomedical_device_bindings (
        id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, device_id BIGINT NOT NULL REFERENCES biomedical_gateway_devices(id),
        patient_id INTEGER NOT NULL, encounter_id INTEGER, bed_id INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','ended','conflict')),
        confirmation_method VARCHAR(80) NOT NULL, confirmed_by INTEGER, confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ, ended_by INTEGER, end_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_biomed_gateway_active_binding ON biomedical_device_bindings(device_id) WHERE status IN ('pending','confirmed');
      CREATE TABLE IF NOT EXISTS biomedical_gateway_events (
        id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, device_id BIGINT NOT NULL REFERENCES biomedical_gateway_devices(id),
        binding_id BIGINT REFERENCES biomedical_device_bindings(id), event_type VARCHAR(30) NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb, review_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','rejected','quarantined')),
        review_note TEXT, reviewed_by INTEGER, reviewed_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS biomedical_gateway_quarantine (
        id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, event_id BIGINT NOT NULL UNIQUE REFERENCES biomedical_gateway_events(id),
        reason VARCHAR(160) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ, resolved_by INTEGER, resolution_note TEXT
      );
      CREATE TABLE IF NOT EXISTS biomedical_gateway_outbox (
        id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, event_id BIGINT NOT NULL UNIQUE REFERENCES biomedical_gateway_events(id),
        target VARCHAR(30) NOT NULL DEFAULT 'fhir-r4', status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
        attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), delivered_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_biomed_gateway_events ON biomedical_gateway_events(tenant_id, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_biomed_gateway_quarantine ON biomedical_gateway_quarantine(tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_biomed_gateway_outbox ON biomedical_gateway_outbox(tenant_id, status, created_at DESC);
    `);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function down() {
  await pool.query(`DROP TABLE IF EXISTS biomedical_gateway_outbox, biomedical_gateway_quarantine, biomedical_gateway_events, biomedical_device_bindings, biomedical_gateway_devices, biomedical_edge_gateways, biomedical_gateway_adapters CASCADE`);
}
