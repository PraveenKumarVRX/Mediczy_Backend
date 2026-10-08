/**
 * Lobby wayfinding for kiosks.
 *
 * Answers come only from floor maps an administrator has entered for the kiosk's own
 * organization (hospital_floor_maps; its hospital_id column holds the tenant id). Nothing is inferred or invented: with no map the
 * kiosk says to ask at reception, and a destination that is not in the directory is
 * reported as not found.
 */

import pool from '../db/pgPool.js';

const RECEPTION = 'Please proceed to the main reception desk for assistance.';
const MAX_DEPARTMENTS_PER_FLOOR = 200;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s]/gi, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 1);

export async function listFloors(organizationId) {
  try {
    const { rows } = await pool.query(
      `SELECT floor_number, floor_name, departments, landmarks, updated_at
         FROM hospital_floor_maps WHERE hospital_id = $1 ORDER BY floor_number`,
      [organizationId]
    );
    return rows;
  } catch (err) {
    // Table not migrated yet: behave as "no maps configured".
    if (err.code === '42P01') return [];
    throw err;
  }
}

/** Best department for a free-text request, or null. Exact name/alias beats token overlap. */
export function findDestination(floors, query) {
  const q = norm(query);
  if (!q) return null;
  const qTokens = new Set(tokens(q));
  let best = null;

  for (const floor of floors) {
    for (const dept of floor.departments || []) {
      const names = [dept.name, dept.id, ...(Array.isArray(dept.aliases) ? dept.aliases : [])].map(norm).filter(Boolean);
      let score = 0;
      for (const n of names) {
        if (n === q) score = Math.max(score, 100);
        else if (q.includes(n)) score = Math.max(score, 60 + Math.min(n.length, 30));
        else {
          const overlap = tokens(n).filter((t) => qTokens.has(t)).length;
          if (overlap) score = Math.max(score, 20 * overlap);
        }
      }
      if (score && (!best || score > best.score)) best = { score, dept, floor };
    }
  }
  return best && best.score >= 20 ? best : null;
}

/** Steps built only from what is configured plus the floor number. */
export function buildDirections({ dept, floor }) {
  const steps = [];
  if (Number(floor.floor_number) !== 0) {
    steps.push(`Take the lift or stairs to ${floor.floor_name || `floor ${floor.floor_number}`}.`);
  }
  if (Array.isArray(dept.directions) && dept.directions.length) {
    steps.push(...dept.directions.map(String));
  } else {
    steps.push(`Follow the signs for ${dept.name}.`);
  }
  if (dept.landmark) steps.push(`Look for: ${dept.landmark}.`);
  return steps;
}

export async function answerQuery({ organizationId, deviceId = null, query, language = 'en' }) {
  const floors = await listFloors(organizationId);
  const base = { query, language, aiAssisted: false };

  let result;
  let matched = null;
  if (!floors.length) {
    result = { ...base, configured: false, matched: false, zone: 'lobby', direction: RECEPTION, steps: [RECEPTION] };
  } else {
    const hit = findDestination(floors, query);
    if (!hit) {
      const direction = `We could not find "${String(query).slice(0, 80)}" in our directory. ${RECEPTION}`;
      result = { ...base, configured: true, matched: false, zone: 'lobby', direction, steps: [direction] };
    } else {
      const steps = buildDirections(hit);
      matched = hit.dept.name;
      result = {
        ...base, configured: true, matched: true,
        zone: hit.dept.id || hit.dept.name, destination: hit.dept.name,
        floor: { number: hit.floor.floor_number, name: hit.floor.floor_name },
        direction: steps.join(' '), steps,
      };
    }
  }

  pool.query(
    `INSERT INTO wayfinding_queries (hospital_id, device_id, query_text, matched, lang) VALUES ($1,$2,$3,$4,$5)`,
    [organizationId, deviceId, String(query).slice(0, 500), matched, String(language).slice(0, 10)]
  ).catch(() => {});

  return result;
}

export function validateFloor(input) {
  const floorNumber = Number(input?.floorNumber);
  if (!Number.isInteger(floorNumber) || floorNumber < -5 || floorNumber > 100) {
    return { error: 'floorNumber must be an integer between -5 and 100' };
  }
  const departments = input?.departments ?? [];
  if (!Array.isArray(departments) || departments.length > MAX_DEPARTMENTS_PER_FLOOR) {
    return { error: `departments must be an array of at most ${MAX_DEPARTMENTS_PER_FLOOR}` };
  }
  const clean = [];
  for (const d of departments) {
    const name = String(d?.name || '').trim();
    if (!name || name.length > 100) return { error: 'every department needs a name of 1-100 characters' };
    clean.push({
      id: String(d.id || name).trim().slice(0, 60),
      name,
      aliases: (Array.isArray(d.aliases) ? d.aliases : []).map((a) => String(a).trim().slice(0, 60)).filter(Boolean).slice(0, 20),
      directions: (Array.isArray(d.directions) ? d.directions : []).map((a) => String(a).trim().slice(0, 200)).filter(Boolean).slice(0, 10),
      landmark: d.landmark ? String(d.landmark).trim().slice(0, 120) : undefined,
    });
  }
  const landmarks = Array.isArray(input?.landmarks) ? input.landmarks.slice(0, 50) : [];
  const floorName = input?.floorName ? String(input.floorName).trim().slice(0, 100) : null;
  return { value: { floorNumber, floorName, departments: clean, landmarks } };
}

export async function saveFloor(organizationId, userId, input) {
  const { error, value } = validateFloor(input);
  if (error) return { error };
  const { rows } = await pool.query(
    `INSERT INTO hospital_floor_maps (hospital_id, floor_number, floor_name, departments, landmarks, updated_by)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)
     ON CONFLICT (hospital_id, floor_number) DO UPDATE SET
       floor_name = EXCLUDED.floor_name, departments = EXCLUDED.departments,
       landmarks = EXCLUDED.landmarks, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING floor_number, floor_name, departments, landmarks, updated_at`,
    [organizationId, value.floorNumber, value.floorName, JSON.stringify(value.departments), JSON.stringify(value.landmarks), userId || null]
  );
  return { floor: rows[0] };
}

export async function deleteFloor(organizationId, floorNumber) {
  const { rowCount } = await pool.query(
    `DELETE FROM hospital_floor_maps WHERE hospital_id = $1 AND floor_number = $2`,
    [organizationId, floorNumber]
  );
  return rowCount > 0;
}

export default { listFloors, findDestination, buildDirections, answerQuery, validateFloor, saveFloor, deleteFloor };
