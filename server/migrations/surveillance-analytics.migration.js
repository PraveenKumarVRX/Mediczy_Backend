/**
 * Migration: Surveillance camera analytics
 * ================================================================
 * Per-camera vision analytics inside the Security module, fed by an on-premises
 * edge gateway that pulls frames from the hospital's DVR/NVR and cameras.
 *
 *   surveillance_gateway        edge agent identities (key stored as sha256 only)
 *   surveillance_recorder       DVR / NVR / direct IP camera hosts
 *   surveillance_camera         one row per channel, with privacy classification
 *   surveillance_rule           per-camera analytics rules (thresholds, schedule)
 *   surveillance_event          detections and camera-native alarms
 *   surveillance_frame_log      one row per frame received (no image is stored)
 *
 * Camera frames are analysed in memory and discarded; only counts, event
 * records and the frame log are kept. Additive only; safe to run repeatedly.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS surveillance_gateway (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        name             TEXT NOT NULL,
        site_label       TEXT,
        api_key_hash     TEXT NOT NULL UNIQUE,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        last_seen_at     TIMESTAMPTZ,
        agent_version    TEXT,
        created_by       INTEGER,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_surv_gateway_org ON surveillance_gateway (organization_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS surveillance_recorder (
        id               SERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        gateway_id       INTEGER REFERENCES surveillance_gateway(id),
        name             TEXT NOT NULL,
        kind             TEXT NOT NULL DEFAULT 'dvr' CHECK (kind IN ('dvr', 'nvr', 'ip_camera')),
        vendor           TEXT NOT NULL DEFAULT 'onvif_generic' CHECK (vendor IN ('hikvision', 'dahua', 'cpplus', 'uniview', 'axis', 'onvif_generic', 'other')),
        model            TEXT,
        host             TEXT,
        port             INTEGER CHECK (port IS NULL OR (port > 0 AND port < 65536)),
        channel_count    INTEGER CHECK (channel_count IS NULL OR channel_count > 0),
        status           TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'online', 'offline', 'error')),
        last_seen_at     TIMESTAMPTZ,
        note             TEXT,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_surv_recorder_org_name ON surveillance_recorder (organization_id, lower(name)) WHERE is_active`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS surveillance_camera (
        id                          SERIAL PRIMARY KEY,
        organization_id             INTEGER NOT NULL,
        recorder_id                 INTEGER REFERENCES surveillance_recorder(id),
        channel_no                  INTEGER CHECK (channel_no IS NULL OR channel_no > 0),
        name                        TEXT NOT NULL,
        zone                        TEXT,
        zone_type                   TEXT NOT NULL DEFAULT 'other' CHECK (zone_type IN ('entrance', 'perimeter', 'parking', 'corridor', 'lobby', 'emergency', 'pharmacy', 'server_room', 'store', 'ward', 'icu', 'ot', 'other')),
        -- 'clinical' areas (wards, ICU, theatres) are blocked from analytics until an admin approves.
        privacy_class               TEXT NOT NULL DEFAULT 'clinical' CHECK (privacy_class IN ('public', 'restricted', 'clinical')),
        privacy_approved_by         INTEGER,
        privacy_approved_at         TIMESTAMPTZ,
        privacy_note                TEXT,
        status                      TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'online', 'offline')),
        last_frame_at               TIMESTAMPTZ,
        last_analysed_at            TIMESTAMPTZ,
        analysis_interval_seconds   INTEGER NOT NULL DEFAULT 60 CHECK (analysis_interval_seconds >= 10 AND analysis_interval_seconds <= 3600),
        daily_frame_budget          INTEGER NOT NULL DEFAULT 1440 CHECK (daily_frame_budget >= 0 AND daily_frame_budget <= 20000),
        is_enabled                  BOOLEAN NOT NULL DEFAULT true,
        is_active                   BOOLEAN NOT NULL DEFAULT true,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_surv_camera_org ON surveillance_camera (organization_id) WHERE is_active`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_surv_camera_channel ON surveillance_camera (recorder_id, channel_no) WHERE is_active AND recorder_id IS NOT NULL AND channel_no IS NOT NULL`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS surveillance_rule (
        id                SERIAL PRIMARY KEY,
        organization_id   INTEGER NOT NULL,
        camera_id         INTEGER NOT NULL REFERENCES surveillance_camera(id),
        analytic          TEXT NOT NULL CHECK (analytic IN (
                            'crowd_density', 'person_count', 'vehicle_count', 'restricted_area', 'after_hours_presence',
                            'fall_or_collapse', 'fire_smoke', 'blocked_exit', 'abandoned_object')),
        threshold         INTEGER CHECK (threshold IS NULL OR threshold >= 0),
        severity          TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
        cooldown_minutes  INTEGER NOT NULL DEFAULT 10 CHECK (cooldown_minutes >= 0 AND cooldown_minutes <= 1440),
        -- Optional daily window in hospital-local time, e.g. {"start":"22:00","end":"06:00"}.
        schedule          JSONB,
        config            JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_enabled        BOOLEAN NOT NULL DEFAULT true,
        created_by        INTEGER,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_surv_rule_camera ON surveillance_rule (camera_id) WHERE is_enabled`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS surveillance_event (
        id               BIGSERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        camera_id        INTEGER NOT NULL REFERENCES surveillance_camera(id),
        rule_id          INTEGER REFERENCES surveillance_rule(id),
        source           TEXT NOT NULL CHECK (source IN ('vision', 'camera_native', 'system')),
        analytic         TEXT NOT NULL,
        severity         TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
        observed_count   INTEGER,
        confidence       TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
        description      TEXT,
        detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'dismissed', 'escalated')),
        handled_by       INTEGER,
        handled_at       TIMESTAMPTZ,
        handler_note     TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_surv_event_org_status ON surveillance_event (organization_id, status, detected_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_surv_event_camera ON surveillance_event (camera_id, detected_at DESC)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS surveillance_frame_log (
        id               BIGSERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        camera_id        INTEGER NOT NULL REFERENCES surveillance_camera(id),
        gateway_id       INTEGER REFERENCES surveillance_gateway(id),
        received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        outcome          TEXT NOT NULL,
        provider         TEXT,
        latency_ms       INTEGER,
        result           JSONB
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_surv_frame_camera_time ON surveillance_frame_log (camera_id, received_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_surv_frame_org_time ON surveillance_frame_log (organization_id, received_at DESC)`);

    await client.query('COMMIT');
    console.log('✅ Surveillance analytics migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of ['surveillance_frame_log', 'surveillance_event', 'surveillance_rule', 'surveillance_camera', 'surveillance_recorder', 'surveillance_gateway']) {
      await client.query(`DROP TABLE IF EXISTS ${t}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node surveillance-analytics.migration.js
if (process.argv[1] && process.argv[1].includes('surveillance-analytics.migration')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
