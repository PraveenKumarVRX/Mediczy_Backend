/**
 * Entity references by UID (CLAUDE.md entity-UID rule; owner decision 2026-11-20 to move the app
 * API to UIDs). A reference to an entity — a lab, corporate, doctor, hospital, member — may be
 * sent as its 6-character UID (preferred) or, for now, the table's numeric id. A UID is resolved
 * through entity_registry and must belong to the table the endpoint expects, so a corporate's UID
 * can never be read as a lab's id (the tenants/corporates id 49 collision).
 *
 * Record ids (an appointment, an order, an invoice) are not entities and stay numeric.
 */
import pool from '../db/pgPool.js';

export const UID_RE = /^[A-Z][A-Z0-9]{5}$/;
export const looksLikeUid = (value) => typeof value === 'string' && UID_RE.test(value.trim().toUpperCase());

/**
 * Resolve an entity reference to the numeric id of `table`.
 * @returns {Promise<{id:number}|{status:number, code:string, message:string}>}
 */
export async function resolveEntityRef(value, table, db = pool) {
  const raw = String(value ?? '').trim();
  if (/^\d+$/.test(raw)) return { id: Number(raw) }; // legacy numeric id, private to `table`
  if (!looksLikeUid(raw)) return { status: 400, code: 'INVALID_ENTITY_REF', message: 'Send the 6-character ID (or the numeric id)' };
  const { rows: [entry] } = await db.query(
    'SELECT source_table, source_id, retired_at FROM entity_registry WHERE uid = $1', [raw.toUpperCase()]);
  if (!entry || entry.retired_at) return { status: 404, code: 'ENTITY_NOT_FOUND', message: 'Not found' };
  if (entry.source_table !== table) return { status: 400, code: 'WRONG_ENTITY_KIND', message: 'That ID belongs to a different kind of record' };
  return { id: Number(entry.source_id) };
}

/** router.param handler: replaces a UID in the path with the numeric id of `table`. */
export const entityParam = (table) => async (req, res, next, value, name) => {
  try {
    const ref = await resolveEntityRef(value, table);
    if (ref.status) return res.status(ref.status).json({ success: false, code: ref.code, message: ref.message });
    req.params[name] = String(ref.id);
    req.entityRefs = { ...(req.entityRefs || {}), [table]: ref.id };
    return next();
  } catch (error) {
    return next(error);
  }
};
