/**
 * Digital floor map: the hospital's own configured departments (hospital_floor_maps, edited on
 * Hospital OS > Wayfinding) placed on a 100x80 grid, with occupancy only where a real source exists.
 *
 *   zone 'er' / 'opd'  -> today's waiting + called queue entries of this organization
 *   zone 'ot'          -> this organization's active OT rooms that are in progress / prep
 *   anything else      -> no occupancy source: utilizationPct is null and status is 'unknown'
 *
 * Nothing here is invented: no configured floors means no nodes.
 */

import pool from '../db/pgPool.js';
import { listFloors } from './wayfinding.service.js';

export const floorLabel = (n) => (Number(n) === 0 ? 'G' : String(n));

function statusFor(pct) {
  if (pct === null) return 'unknown';
  return pct >= 90 ? 'critical' : pct >= 70 ? 'busy' : pct >= 40 ? 'moderate' : 'normal';
}

/** Pure: floors + occupancy facts -> nodes. `occupancy` = { queue: {er, opd}, ot: {active, busy} | null }. */
export function buildNodes({ floors, floor = 'all', occupancy = {}, twins = [] }) {
  const nodes = [];
  for (const f of floors) {
    const label = floorLabel(f.floor_number);
    if (floor !== 'all' && label !== String(floor)) continue;
    for (const d of f.departments || []) {
      if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue; // not placed on the map yet
      const zone = d.zone || 'other';
      let occupied = null;
      let capacity = Number.isFinite(d.capacity) ? d.capacity : null;
      if (zone === 'er' || zone === 'opd') occupied = occupancy.queue?.[zone] ?? null;
      if (zone === 'ot' && occupancy.ot) {
        occupied = occupancy.ot.busy;
        capacity = capacity ?? occupancy.ot.active;
      }
      const pct = occupied !== null && capacity ? Math.min(100, Math.round((occupied / capacity) * 100)) : null;
      const twin = twins.find((t) => t.external_id === d.id);
      nodes.push({
        id: d.id, name: d.name, floor: label, x: d.x, y: d.y, type: zone,
        capacity, occupied, utilizationPct: pct, status: statusFor(pct),
        twinAttributes: twin?.attributes || null,
      });
    }
  }
  return nodes;
}

async function rows(sql, params) {
  try {
    return (await pool.query(sql, params)).rows;
  } catch {
    return null; // table missing or unavailable: treat as "no source"
  }
}

export async function getFloorMap(organizationId, floor = 'all') {
  const floors = await listFloors(organizationId);
  const placed = floors.flatMap((f) => (f.departments || []).filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y)));
  const zones = new Set(placed.map((d) => d.zone));

  const occupancy = { queue: {}, ot: null };
  if (zones.has('er') || zones.has('opd')) {
    const q = await rows(
      `SELECT department, COUNT(*)::int AS c FROM hospital_queue_entries
        WHERE organization_id = $1 AND department IN ('er','opd') AND status IN ('waiting','called')
          AND check_in_at::date = CURRENT_DATE GROUP BY department`,
      [organizationId]
    );
    if (q) for (const r of q) occupancy.queue[r.department] = r.c;
    if (q) for (const z of ['er', 'opd']) occupancy.queue[z] ??= 0;
  }
  if (zones.has('ot')) {
    const r = await rows(`SELECT status FROM ot_rooms WHERE organization_id = $1 AND active = true`, [organizationId]);
    if (r) occupancy.ot = { active: r.length, busy: r.filter((x) => /progress|prep/i.test(x.status || '')).length };
  }

  let twins = [];
  try {
    const { listTwins } = await import('./hypergrid-twins.service.js');
    twins = await listTwins({ tenantId: organizationId, twinType: 'asset', limit: 100 });
  } catch { /* optional */ }

  const nodes = buildNodes({ floors, floor, occupancy, twins });
  return {
    configured: floors.length > 0,
    placed: placed.length,
    floors: floors.map((f) => ({ label: floorLabel(f.floor_number), name: f.floor_name })),
    live: nodes.some((n) => n.utilizationPct !== null),
    nodes,
  };
}

export default { buildNodes, getFloorMap, floorLabel };
