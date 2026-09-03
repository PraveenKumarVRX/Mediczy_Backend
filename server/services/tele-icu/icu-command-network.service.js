/**
 * Cross-Hospital ICU Command Network (Model 1 "command-centre-as-a-service", Tier 2).
 * Today the ICU view is single-org scoped. This adds hub-and-spoke networks,
 * intensivist shift rostering across spokes, and a cross-org census roll-up
 * reusing the existing getICUCensus per member organisation.
 */
import pool from '../../db/pgPool.js';
import { getICUCensus } from '../icu.service.js';

export const MEMBER_ROLES = ['hub', 'spoke'];

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Is a roster shift covering the given moment (UTC)? */
export function isShiftCovering(roster, at = new Date()) {
  if (!roster || roster.status === 'cancelled') return false;
  const d = new Date(at);
  const day = d.toISOString().slice(0, 10);
  if (roster.shift_date && String(roster.shift_date).slice(0, 10) !== day) return false;
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const [sh, sm] = String(roster.shift_start || '00:00').split(':').map(Number);
  const [eh, em] = String(roster.shift_end || '23:59').split(':').map(Number);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60; // overnight shift
  const m = minutes < start ? minutes + 24 * 60 : minutes;
  return m >= start && m <= end;
}

/** Who is on-call for a spoke org right now (spoke-specific wins over network-wide). */
export function pickOnCall(rosters, spokeOrgId = null, at = new Date()) {
  const covering = rosters.filter(r =>
    isShiftCovering(r, at) &&
    (!r.spoke_org_id || r.spoke_org_id === spokeOrgId)
  );
  const spokeSpecific = covering.filter(r => r.spoke_org_id);
  return (spokeSpecific[0] || covering[0]) || null;
}

// ── DB ───────────────────────────────────────────────────────────────────────

let tablesEnsured = null;
export async function ensureTables() {
  if (!tablesEnsured) {
    tablesEnsured = pool.query(`
      CREATE TABLE IF NOT EXISTS icu_command_networks (
        id BIGSERIAL PRIMARY KEY,
        hub_organization_id INTEGER NOT NULL,
        name VARCHAR(120) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS icu_command_network_members (
        id BIGSERIAL PRIMARY KEY,
        network_id BIGINT NOT NULL REFERENCES icu_command_networks(id) ON DELETE CASCADE,
        organization_id INTEGER NOT NULL,
        role VARCHAR(10) NOT NULL DEFAULT 'spoke' CHECK (role IN ('hub','spoke')),
        icu_units JSONB DEFAULT '[]'::jsonb,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (network_id, organization_id)
      );
      CREATE TABLE IF NOT EXISTS icu_command_rosters (
        id BIGSERIAL PRIMARY KEY,
        network_id BIGINT NOT NULL REFERENCES icu_command_networks(id) ON DELETE CASCADE,
        intensivist_id INTEGER NOT NULL,
        intensivist_name VARCHAR(160),
        spoke_org_id INTEGER,
        shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
        shift_start VARCHAR(5) NOT NULL DEFAULT '08:00',
        shift_end VARCHAR(5) NOT NULL DEFAULT '20:00',
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_icr_lookup ON icu_command_rosters(network_id, shift_date, status);
    `).catch(err => { tablesEnsured = null; throw err; });
  }
  return tablesEnsured;
}

// ── Networks & membership ────────────────────────────────────────────────────

export async function createNetwork({ hubOrganizationId, name, metadata = {} }) {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO icu_command_networks (hub_organization_id, name, metadata) VALUES ($1,$2,$3::jsonb) RETURNING *`,
    [hubOrganizationId, name, JSON.stringify(metadata)]
  );
  await pool.query(
    `INSERT INTO icu_command_network_members (network_id, organization_id, role) VALUES ($1,$1,'hub')`,
    [rows[0].id]
  );
  return rows[0];
}

export async function addMember(networkId, { organizationId, role = 'spoke', icuUnits = [] }) {
  await ensureTables();
  if (!MEMBER_ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  const { rows } = await pool.query(
    `INSERT INTO icu_command_network_members (network_id, organization_id, role, icu_units)
     VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (network_id, organization_id)
       DO UPDATE SET role = EXCLUDED.role, icu_units = EXCLUDED.icu_units
     RETURNING *`,
    [networkId, organizationId, role, JSON.stringify(icuUnits)]
  );
  return rows[0];
}

export async function listNetworks(organizationId) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT n.*,
            (SELECT COUNT(*) FROM icu_command_network_members m WHERE m.network_id = n.id) AS member_count
     FROM icu_command_networks n
     WHERE n.hub_organization_id = $1
        OR EXISTS (SELECT 1 FROM icu_command_network_members m
                   WHERE m.network_id = n.id AND m.organization_id = $1)
     ORDER BY n.created_at DESC`,
    [organizationId]
  );
  return rows;
}

// ── Rostering ────────────────────────────────────────────────────────────────

export async function addRosterShift({ networkId, intensivistId, intensivistName = null, spokeOrgId = null, shiftDate, shiftStart, shiftEnd }) {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO icu_command_rosters
       (network_id, intensivist_id, intensivist_name, spoke_org_id, shift_date, shift_start, shift_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [networkId, intensivistId, intensivistName, spokeOrgId, shiftDate || null, shiftStart || '08:00', shiftEnd || '20:00']
  );
  return rows[0];
}

export async function listRoster(networkId, { shiftDate = null } = {}) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT * FROM icu_command_rosters
     WHERE network_id = $1 AND ($2::DATE IS NULL OR shift_date = $2)
     ORDER BY shift_date, shift_start`,
    [networkId, shiftDate]
  );
  return rows;
}

/** On-call intensivist for a spoke right now (uses pickOnCall). */
export async function getOnCall(networkId, spokeOrgId = null) {
  await ensureTables();
  const rosters = await listRoster(networkId);
  return pickOnCall(rosters, spokeOrgId);
}

// ── Cross-org census ─────────────────────────────────────────────────────────

/**
 * Roll up the ICU census across every member organisation of a network.
 * Reuses the existing per-org getICUCensus; a failing spoke degrades to an
 * error entry instead of breaking the whole command-centre board.
 */
export async function getNetworkCensus(networkId) {
  await ensureTables();
  const { rows: members } = await pool.query(
    `SELECT m.organization_id, m.role, m.icu_units FROM icu_command_network_members m
     WHERE m.network_id = $1 ORDER BY m.role DESC, m.organization_id`,
    [networkId]
  );
  if (!members.length) throw new Error(`network ${networkId} has no members`);

  const spokes = await Promise.all(members.map(async m => {
    try {
      const census = await getICUCensus(m.organization_id);
      return { organizationId: m.organization_id, role: m.role, census: census || null, error: null };
    } catch (err) {
      return { organizationId: m.organization_id, role: m.role, census: null, error: err.message };
    }
  }));

  const activeTotal = spokes.reduce((n, s) => n + (s.census?.activeCount ?? s.census?.active ?? 0), 0);
  return {
    networkId,
    memberCount: members.length,
    spokes,
    totals: { activeIcuPatients: activeTotal },
    generatedAt: new Date().toISOString(),
  };
}
