/**
 * Imaging tenant identity.
 *
 * An imaging tenant is a LAB, identified by its entity uid (`labs.unique_id`, six characters, prefix L). The imaging tables
 * carry that uid in `lab_uid` next to the integer lab id, and every tenant predicate matches both. A principal is mapped to a
 * tenant ONLY through the `labs` table:
 *   - an explicit `labUid` claim (server-minted, e.g. the PACS session cookie) → the lab with that uid (a retired uid resolves
 *     to its replacement);
 *   - an explicit `tenantId` claim (server-minted, or the trusted bridge header) → the LAB with that id;
 *   - a LAB account (role 'lab', already validated against `labs` by authLab) → that lab;
 *   - anyone else (doctor, hospital staff, admin, patient…) → no tenant.
 * A lab id or uid that does not exist in `labs` resolves to nothing, so an arbitrary integer can never mint a tenant.
 *
 * Legacy: until 2026-10-07 the key was the lab's UUID (`labs.uid`, carried as `tenantUid`, with an `imaging_tenants` registry
 * and a UUID `tenant_uid` column on the imaging tables). PACS cookies live one hour, so a UUID `tenantUid` claim is still
 * accepted and mapped to the same lab; remove LEGACY_UUID_CLAIM after 2026-10-09 (docs/architecture/IMAGING_TENANT_UID_CONTRACT.md).
 */
import pool from '../db/pgPool.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAB_UID_RE = /^[A-Z0-9]{6}$/;
const CACHE_TTL_MS = 60_000;
const cache = new Map();   // an (id) <-> uid pairing is immutable except through a re-issue, which keeps the old uid resolving

const cached = (key) => { const hit = cache.get(key); return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.value : undefined; };
const remember = (key, value) => { cache.set(key, { value, at: Date.now() }); return value; };
export const _clearCache = () => cache.clear();

const asTenant = (row) => (row ? { id: Number(row.id), uid: row.unique_id, kind: 'lab' } : null);

/** The lab with this id, or null if no such lab (or it has no uid yet). */
export async function ensureLabTenant(labId) {
  const id = Number(labId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const key = `lab:${id}`;
  const hit = cached(key);
  if (hit !== undefined) return hit;
  const { rows } = await pool.query('SELECT id, unique_id FROM labs WHERE id = $1 AND unique_id IS NOT NULL', [id]);
  return remember(key, asTenant(rows[0]));
}

/** The lab for a uid: its current uid, a retired uid (via resolve_entity_uid), or a legacy UUID. null if unknown or malformed. */
export async function tenantByUid(uid) {
  if (typeof uid !== 'string') return null;
  const key = `uid:${uid}`;
  const hit = cached(key);
  if (hit !== undefined) return hit;
  let found = null;
  if (LAB_UID_RE.test(uid)) {
    ({ rows: [found] } = await pool.query('SELECT id, unique_id FROM labs WHERE unique_id = $1', [uid]));
    if (!found) {
      try {
        ({ rows: [found] } = await pool.query('SELECT id, unique_id FROM labs WHERE unique_id = resolve_entity_uid($1)', [uid]));
      } catch (err) {
        if (err?.code !== '42883' && err?.code !== '42P01') throw err;   // no alias support yet: not found
      }
    }
  } else if (UUID_RE.test(uid)) {   // LEGACY_UUID_CLAIM
    ({ rows: [found] } = await pool.query('SELECT id, unique_id FROM labs WHERE uid = $1::uuid AND unique_id IS NOT NULL', [uid]));
  }
  return remember(key, asTenant(found));
}

/** Maps a principal (JWT claims / req.user) to { id, uid, kind } or null. Never falls back to the principal's own id. */
export async function resolveImagingTenant(principal = {}) {
  const claimed = principal.labUid || principal.tenantUid;   // tenantUid = LEGACY_UUID_CLAIM
  if (claimed) {
    const t = await tenantByUid(String(claimed));
    if (t) return t;
    return null;                                   // a presented-but-unknown uid is a refusal, not a fall-through
  }
  const explicit = Number(principal.tenantId);
  if (Number.isInteger(explicit) && explicit > 0) return ensureLabTenant(explicit);
  if ((principal.role || principal.userType) === 'lab') return ensureLabTenant(principal.id);
  return null;
}

export default { resolveImagingTenant, ensureLabTenant, tenantByUid, _clearCache };
