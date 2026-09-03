/**
 * Tele-ICU Bedside Device Bridge (Model 1, Tier 2).
 * Ties PTZ cameras + bedside audio units to ICU beds, logs AV sessions and
 * PTZ/audio commands. The ICU clinical stack (NEWS2, vents, command centre)
 * already exists; this is the missing device→bed orchestration layer.
 *
 * PTZ commands are queued here; an ONVIF-side agent on the hospital network
 * polls /pending-commands and acks execution — outbound-only connectivity,
 * no inbound firewall rules at the hospital.
 */
import pool from '../../db/pgPool.js';

export const DEVICE_TYPES = ['camera', 'audio'];
export const COMMAND_TYPES = ['ptz_move', 'ptz_preset', 'ptz_zoom', 'audio_mute', 'audio_unmute'];
export const SESSION_TYPES = ['round', 'emergency', 'family', 'continuous'];

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Validate/normalize a PTZ/audio command payload; throws on invalid. */
export function validatePtzCommand(commandType, payload = {}) {
  if (!COMMAND_TYPES.includes(commandType)) throw new Error(`invalid commandType: ${commandType}`);
  switch (commandType) {
    case 'ptz_move': {
      const { pan = 0, tilt = 0, zoom = 0 } = payload;
      for (const [k, v] of Object.entries({ pan, tilt, zoom })) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < -100 || n > 100) throw new Error(`${k} must be within -100..100`);
      }
      return { pan: Number(pan), tilt: Number(tilt), zoom: Number(zoom) };
    }
    case 'ptz_preset': {
      const preset = Number(payload.preset);
      if (!Number.isInteger(preset) || preset < 1 || preset > 255) throw new Error('preset must be an integer 1..255');
      return { preset };
    }
    case 'ptz_zoom': {
      const zoom = Number(payload.zoom);
      if (!Number.isFinite(zoom) || zoom < -100 || zoom > 100) throw new Error('zoom must be within -100..100');
      return { zoom };
    }
    case 'audio_mute':
    case 'audio_unmute':
      return { mute: commandType === 'audio_mute' };
    default:
      throw new Error(`invalid commandType: ${commandType}`);
  }
}

// ── DB ───────────────────────────────────────────────────────────────────────

let tablesEnsured = null;
export async function ensureTables() {
  if (!tablesEnsured) {
    tablesEnsured = pool.query(`
      CREATE TABLE IF NOT EXISTS tele_icu_bed_devices (
        id BIGSERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        bed_id VARCHAR(80) NOT NULL,
        icu_unit VARCHAR(80),
        device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('camera','audio')),
        vendor VARCHAR(80),
        model VARCHAR(80),
        stream_url TEXT,
        ptz_capable BOOLEAN NOT NULL DEFAULT FALSE,
        presets JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'registered',
        last_heartbeat TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (organization_id, bed_id, device_type)
      );
      CREATE INDEX IF NOT EXISTS idx_tibd_org_bed ON tele_icu_bed_devices(organization_id, bed_id);
    `).catch(err => { tablesEnsured = null; throw err; });
  }
  return tablesEnsured;
}

export async function ensureSessionTables() {
  await ensureTables();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tele_icu_av_sessions (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      bed_id VARCHAR(80) NOT NULL,
      session_type VARCHAR(20) NOT NULL DEFAULT 'round',
      started_by INTEGER,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      end_reason TEXT,
      metadata JSONB DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_tiavs ON tele_icu_av_sessions(organization_id, bed_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS tele_icu_device_commands (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      device_id BIGINT REFERENCES tele_icu_bed_devices(id),
      session_id BIGINT,
      command_type VARCHAR(30) NOT NULL,
      payload JSONB DEFAULT '{}'::jsonb,
      issued_by INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      executed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_tidc_pending ON tele_icu_device_commands(device_id, status);
  `);
}

// ── Device registry ──────────────────────────────────────────────────────────

export async function registerBedDevice({ organizationId, bedId, icuUnit = null, deviceType, vendor = null, model = null, streamUrl = null, ptzCapable = false, presets = [], metadata = {} }) {
  await ensureTables();
  if (!DEVICE_TYPES.includes(deviceType)) throw new Error(`invalid deviceType: ${deviceType}`);
  const { rows } = await pool.query(
    `INSERT INTO tele_icu_bed_devices
       (organization_id, bed_id, icu_unit, device_type, vendor, model, stream_url, ptz_capable, presets, status, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'registered',$10::jsonb)
     ON CONFLICT (organization_id, bed_id, device_type)
       DO UPDATE SET icu_unit = EXCLUDED.icu_unit, vendor = EXCLUDED.vendor, model = EXCLUDED.model,
                     stream_url = EXCLUDED.stream_url, ptz_capable = EXCLUDED.ptz_capable,
                     presets = EXCLUDED.presets, updated_at = NOW()
     RETURNING *`,
    [organizationId, bedId, icuUnit, deviceType, vendor, model, streamUrl, !!ptzCapable, JSON.stringify(presets), JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function listBedDevices(organizationId, { bedId = null, icuUnit = null } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM tele_icu_bed_devices
     WHERE organization_id = $1
       AND ($2::VARCHAR IS NULL OR bed_id = $2)
       AND ($3::VARCHAR IS NULL OR icu_unit = $3)
     ORDER BY bed_id, device_type`,
    [organizationId, bedId, icuUnit]
  );
  return rows;
}

export async function deviceHeartbeat(deviceId, organizationId, { status = 'online' } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `UPDATE tele_icu_bed_devices SET status = $3, last_heartbeat = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [deviceId, organizationId, status]
  );
  if (!rows.length) throw new Error(`device ${deviceId} not found`);
  return rows[0];
}

// ── Sessions & commands ──────────────────────────────────────────────────────

export async function startAvSession({ organizationId, bedId, sessionType = 'round', startedBy = null, metadata = {} }) {
  await ensureSessionTables();
  if (!SESSION_TYPES.includes(sessionType)) throw new Error(`invalid sessionType: ${sessionType}`);
  const { rows } = await pool.query(
    `INSERT INTO tele_icu_av_sessions (organization_id, bed_id, session_type, started_by, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
    [organizationId, bedId, sessionType, startedBy, JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function endAvSession(sessionId, organizationId, { endReason = null } = {}) {
  await ensureSessionTables();
  const { rows } = await pool.query(
    `UPDATE tele_icu_av_sessions SET ended_at = NOW(), end_reason = $3
     WHERE id = $1 AND organization_id = $2 AND ended_at IS NULL RETURNING *`,
    [sessionId, organizationId, endReason]
  );
  if (!rows.length) throw new Error(`session ${sessionId} not open or not found`);
  return rows[0];
}

/** Issue a PTZ/audio command (queued for the on-site agent). */
export async function issueCommand({ organizationId, deviceId, sessionId = null, commandType, payload = {}, issuedBy = null }) {
  await ensureSessionTables();
  const normalized = validatePtzCommand(commandType, payload);
  const { rows: dev } = await pool.query(
    `SELECT id, ptz_capable FROM tele_icu_bed_devices WHERE id = $1 AND organization_id = $2`,
    [deviceId, organizationId]
  );
  if (!dev.length) throw new Error(`device ${deviceId} not found`);
  if (commandType.startsWith('ptz_') && !dev[0].ptz_capable) {
    throw new Error(`device ${deviceId} is not PTZ-capable`);
  }
  const { rows } = await pool.query(
    `INSERT INTO tele_icu_device_commands (organization_id, device_id, session_id, command_type, payload, issued_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
    [organizationId, deviceId, sessionId, commandType, JSON.stringify(normalized), issuedBy]
  );
  return rows[0];
}

/** On-site agent poll: pending commands for a device, then ack executed ones. */
export async function pollPendingCommands(deviceId, organizationId, { ackIds = [] } = {}) {
  await ensureSessionTables();
  if (ackIds.length) {
    await pool.query(
      `UPDATE tele_icu_device_commands SET status = 'executed', executed_at = NOW()
       WHERE device_id = $1 AND organization_id = $2 AND id = ANY($3::BIGINT[]) AND status = 'pending'`,
      [deviceId, organizationId, ackIds]
    );
  }
  const { rows } = await pool.query(
    `SELECT id, session_id, command_type, payload, created_at FROM tele_icu_device_commands
     WHERE device_id = $1 AND organization_id = $2 AND status = 'pending'
     ORDER BY created_at ASC LIMIT 20`,
    [deviceId, organizationId]
  );
  return rows;
}
