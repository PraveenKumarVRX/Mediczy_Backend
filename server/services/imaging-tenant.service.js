/**
 * Typed imaging-tenant identity (see migrations/20260926000004-imaging-tenant-uids.migration.js).
 *
 * An imaging tenant is identified by a UID from the `imaging_tenants` registry, whose `kind` says which id space the
 * integer came from. A principal is mapped to a tenant ONLY through the registry:
 *   - an explicit `tenantUid` claim (server-minted, e.g. the PACS session cookie) → the registry row with that uid;
 *   - an explicit `tenantId` claim (server-minted, or the trusted bridge header) → the LAB with that id;
 *   - a LAB account (role 'lab', already validated against `labs` by authLab) → that lab;
 *   - anyone else (doctor, hospital staff, admin, patient…) → no tenant.
 * A lab id that does not exist in `labs` resolves to nothing, so an arbitrary integer can never mint a tenant.
 */
import pool from '../db/pgPool.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_TTL_MS = 60_000;
const cache = new Map();   // the (kind, id) <-> uid mapping is immutable, so caching is safe

const cached = (key) => { const hit = cache.get(key); return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.value : undefined; };
const remember = (key, value) => { cache.set(key, { value, at: Date.now() }); return value; };
export const _clearCache = () => cache.clear();

/** The registry row for a LAB id, created from `labs` on first use; null if no such lab exists. */
export async function ensureLabTenant(labId) {
  const id = Number(labId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const key = `lab:${id}`;
  const hit = cached(key);
  if (hit !== undefined) return hit;
  let { rows } = await pool.query(`SELECT uid, source_id FROM imaging_tenants WHERE kind = 'lab' AND source_id = $1`, [id]);
  if (!rows[0]) {
    await pool.query(
      `INSERT INTO imaging_tenants (kind, source_id, source_uid, note)
       SELECT 'lab', l.id, l.uid, 'created on first use' FROM labs l WHERE l.id = $1
       ON CONFLICT (kind, source_id) DO NOTHING`, [id]);
    ({ rows } = await pool.query(`SELECT uid, source_id FROM imaging_tenants WHERE kind = 'lab' AND source_id = $1`, [id]));
  }
  return remember(key, rows[0] ? { id: Number(rows[0].source_id), uid: rows[0].uid, kind: 'lab' } : null);
}

/** The registry row for a tenant UID; null if unknown or not a valid UUID. */
export async function tenantByUid(uid) {
  if (typeof uid !== 'string' || !UUID_RE.test(uid)) return null;
  const key = `uid:${uid.toLowerCase()}`;
  const hit = cached(key);
  if (hit !== undefined) return hit;
  const { rows } = await pool.query(`SELECT uid, kind, source_id FROM imaging_tenants WHERE uid = $1`, [uid]);
  return remember(key, rows[0] ? { id: Number(rows[0].source_id), uid: rows[0].uid, kind: rows[0].kind } : null);
}

/** Maps a principal (JWT claims / req.user) to { id, uid, kind } or null. Never falls back to the principal's own id. */
export async function resolveImagingTenant(principal = {}) {
  if (principal.tenantUid) {
    const t = await tenantByUid(String(principal.tenantUid));
    if (t) return t;
    return null;                                   // a presented-but-unknown UID is a refusal, not a fall-through
  }
  const explicit = Number(principal.tenantId);
  if (Number.isInteger(explicit) && explicit > 0) return ensureLabTenant(explicit);
  if ((principal.role || principal.userType) === 'lab') return ensureLabTenant(principal.id);
  return null;
}

export default { resolveImagingTenant, ensureLabTenant, tenantByUid, _clearCache };
