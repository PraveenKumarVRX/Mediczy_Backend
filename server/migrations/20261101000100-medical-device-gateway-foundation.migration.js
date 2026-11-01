/**
 * Medical-device gateway foundation.
 *
 * This migration intentionally creates a clinical-device boundary separate from
 * the older HyperGrid asset/IoT tables. Device data is never accepted into the
 * clinical workflow without an approved adapter and explicit patient binding.
 */
import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('biomedical_calibration_schedule') IS NOT NULL THEN
          ALTER TABLE biomedical_calibration_schedule
            DROP CONSTRAINT IF EXISTS biomedical_calibration_schedule_equipment_id_calibration_type_key;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conname = 'biomedical_calibration_schedule_tenant_equipment_type_key'
               AND conrelid = 'biomedical_calibration_schedule'::regclass
          ) THEN
            ALTER TABLE biomedical_calibration_schedule
              ADD CONSTRAINT biomedical_calibration_schedule_tenant_equipment_type_key
              UNIQUE (tenant_id, equipment_id, calibration_type);
          END IF;
        END IF;
      END $$;
    `).catch((error) => {
      // Older installations may not have biomedical tables yet; their original
      // migration now creates the tenant-scoped constraint directly.
      if (!/does not exist/i.test(error.message)) throw error;
    });
    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_device_adapter_releases (
        id BIGSERIAL PRIMARY KEY,
        adapter_id VARCHAR(160) NOT NULL,
        version VARCHAR(80) NOT NULL,
        manufacturer VARCHAR(200) NOT NULL,
        device_model VARCHAR(200) NOT NULL,
        firmware_range VARCHAR(160),
        capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
        limitations TEXT,
        status VARCHAR(24) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'verified', 'certified', 'withdrawn')),
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (adapter_id, version, manufacturer, device_model)
      );
      CREATE INDEX IF NOT EXISTS idx_mdgr_adapter_status
        ON medical_device_adapter_releases (status, manufacturer, device_model);

      CREATE TABLE IF NOT EXISTS medical_edge_gateways (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        name VARCHAR(200) NOT NULL,
        site VARCHAR(200),
        public_key TEXT NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'enrolled'
          CHECK (status IN ('enrolled', 'active', 'suspended', 'decommissioned')),
        last_seen_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, public_key)
      );
      CREATE INDEX IF NOT EXISTS idx_mdgr_gateway_tenant_status
        ON medical_edge_gateways (tenant_id, status);

      CREATE TABLE IF NOT EXISTS medical_devices (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        edge_gateway_id BIGINT NOT NULL REFERENCES medical_edge_gateways(id),
        adapter_release_id BIGINT NOT NULL REFERENCES medical_device_adapter_releases(id),
        name VARCHAR(200) NOT NULL,
        serial_number VARCHAR(200) NOT NULL,
        udi VARCHAR(300),
        location VARCHAR(300),
        status VARCHAR(24) NOT NULL DEFAULT 'registered'
          CHECK (status IN ('registered', 'active', 'maintenance', 'quarantined', 'decommissioned')),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, serial_number),
        UNIQUE (tenant_id, udi)
      );
      CREATE INDEX IF NOT EXISTS idx_mdgr_device_gateway ON medical_devices (edge_gateway_id, status);
      CREATE INDEX IF NOT EXISTS idx_mdgr_device_tenant ON medical_devices (tenant_id, status);

      CREATE TABLE IF NOT EXISTS medical_device_bindings (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        device_id BIGINT NOT NULL REFERENCES medical_devices(id),
        patient_id BIGINT NOT NULL,
        encounter_id BIGINT,
        admission_id BIGINT,
        bed_id BIGINT,
        status VARCHAR(24) NOT NULL DEFAULT 'confirmed'
          CHECK (status IN ('pending', 'confirmed', 'ended', 'conflict')),
        confirmation_method VARCHAR(40) NOT NULL,
        confirmed_by BIGINT,
        confirmed_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        ended_by BIGINT,
        end_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mdgr_active_binding_per_device
        ON medical_device_bindings (device_id) WHERE status IN ('pending', 'confirmed');
      CREATE INDEX IF NOT EXISTS idx_mdgr_binding_patient
        ON medical_device_bindings (tenant_id, patient_id, status);

      CREATE TABLE IF NOT EXISTS medical_device_events (
        event_id UUID PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        edge_gateway_id BIGINT NOT NULL REFERENCES medical_edge_gateways(id),
        device_id BIGINT NOT NULL REFERENCES medical_devices(id),
        binding_id BIGINT REFERENCES medical_device_bindings(id),
        schema_version VARCHAR(64) NOT NULL,
        event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('measurement', 'alarm', 'lifecycle')),
        observed_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        clock_quality VARCHAR(24) NOT NULL DEFAULT 'unknown'
          CHECK (clock_quality IN ('synchronized', 'estimated', 'unknown', 'invalid')),
        payload JSONB NOT NULL,
        payload_sha256 CHAR(64) NOT NULL,
        review_state VARCHAR(24) NOT NULL DEFAULT 'pending'
          CHECK (review_state IN ('pending', 'accepted', 'rejected', 'quarantined')),
        reviewed_by BIGINT,
        reviewed_at TIMESTAMPTZ,
        review_note TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mdgr_events_device_time
        ON medical_device_events (device_id, observed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mdgr_events_review
        ON medical_device_events (tenant_id, review_state, received_at DESC);

      CREATE TABLE IF NOT EXISTS medical_device_measurements (
        id BIGSERIAL PRIMARY KEY,
        event_id UUID NOT NULL REFERENCES medical_device_events(event_id) ON DELETE CASCADE,
        code_system VARCHAR(300) NOT NULL,
        code VARCHAR(80) NOT NULL,
        display VARCHAR(300),
        value_numeric DOUBLE PRECISION,
        value_text TEXT,
        unit VARCHAR(80),
        ucum_code VARCHAR(80),
        quality VARCHAR(24) NOT NULL CHECK (quality IN ('validated', 'suspect', 'invalid')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
      );
      CREATE INDEX IF NOT EXISTS idx_mdgr_measurements_event ON medical_device_measurements (event_id);

      CREATE TABLE IF NOT EXISTS medical_device_quarantine (
        id BIGSERIAL PRIMARY KEY,
        event_id UUID NOT NULL UNIQUE REFERENCES medical_device_events(event_id) ON DELETE CASCADE,
        tenant_id BIGINT NOT NULL,
        reason_code VARCHAR(80) NOT NULL,
        reason_detail TEXT,
        status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
        resolved_by BIGINT,
        resolved_at TIMESTAMPTZ,
        resolution_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mdgr_quarantine_open ON medical_device_quarantine (tenant_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS medical_connector_outbox (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        event_id UUID NOT NULL UNIQUE REFERENCES medical_device_events(event_id),
        connector_type VARCHAR(32) NOT NULL CHECK (connector_type IN ('fhir-r4', 'hl7v2', 'dicomweb')),
        payload JSONB NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_mdgr_outbox_pending
        ON medical_connector_outbox (tenant_id, status, created_at);
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      DROP TABLE IF EXISTS medical_connector_outbox;
      DROP TABLE IF EXISTS medical_device_quarantine;
      DROP TABLE IF EXISTS medical_device_measurements;
      DROP TABLE IF EXISTS medical_device_events;
      DROP TABLE IF EXISTS medical_device_bindings;
      DROP TABLE IF EXISTS medical_devices;
      DROP TABLE IF EXISTS medical_edge_gateways;
      DROP TABLE IF EXISTS medical_device_adapter_releases;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
