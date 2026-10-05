/**
 * Which corporate does a corporate-portal user belong to, and may they sign in on this host?
 *
 * Resolved through UIDs, never by comparing integers.
 *
 * Background. `users.organization_id` held a TENANTS id for some corporate users and a CORPORATES id
 * for others, and the two tables share integer values (11 of them). Id 49 is Madras Medical Mission
 * Chennai in `tenants` and Ninjacart in `corporates`, so the old gate
 * (`hrUser.organization_id !== req.tenant.id`) rejected a Ninjacart HR user on ninjacart.mediqzy.com
 * and admitted her on madras-medical-mission-chennai.mediqzy.com. Dairy Day has two `corporates`
 * rows pointing at tenant 57, and the old scope query ORed integer conditions into a `findOne`, so
 * which of them a user landed on was not deterministic.
 *
 * `hr_staff` is also a role in the HOSPITAL HRMS module (hr.mediczy belongs to Smart Hospital).
 * The role string cannot say which world a user is in; the KIND of their organisation does. A
 * corporate-portal user must therefore belong to a registry entry of kind `corporate`: anything
 * else is refused rather than guessed.
 *
 * Dependencies are injected so the logic is testable without a database.
 */

const REASONS = Object.freeze({
  NO_UID: 'NO_ORGANIZATION_UID',
  UNKNOWN_UID: 'ORGANIZATION_UID_NOT_REGISTERED',
  NOT_CORPORATE: 'ORGANIZATION_IS_NOT_A_CORPORATE',
  CORPORATE_MISSING: 'CORPORATE_ROW_MISSING',
  WRONG_TENANT: 'WRONG_TENANT_SUBDOMAIN',
});

/**
 * @param {object} deps
 * @param {(sql: string, replacements: object) => Promise<object[]>} deps.query  raw SELECT helper
 * @param {(id: number) => Promise<object|null>} deps.findCorporateById
 * @param {object} user       the signed-in corporate-portal user
 * @param {object|null} reqTenant  req.tenant when the request arrived on a tenant subdomain
 * @returns {Promise<{ok: true, mode: 'uid', corporate: object, organizationUid: string}
 *                 | {ok: false, mode: 'legacy'|'uid', reason: string}>}
 *   mode 'legacy' means the user has no organization_uid yet (or the column does not exist); the
 *   caller keeps its previous integer-based behaviour for that user.
 */
export async function resolveCorporateScope({ query, findCorporateById }, user, reqTenant = null) {
  let organizationUid = null;
  try {
    const rows = await query('SELECT organization_uid FROM users WHERE id = :id', { id: user.id });
    organizationUid = rows?.[0]?.organization_uid || null;
  } catch (err) {
    // 42703 undefined_column: the entity UID migration has not been applied yet. Not an error for
    // the caller -- it simply has no uid to use, so it stays on the legacy path.
    if (err?.original?.code === '42703' || err?.code === '42703' || /organization_uid/.test(String(err?.message))) {
      return { ok: false, mode: 'legacy', reason: REASONS.NO_UID };
    }
    throw err;
  }
  if (!organizationUid) return { ok: false, mode: 'legacy', reason: REASONS.NO_UID };

  const reg = (await query(
    'SELECT kind, source_table, source_id FROM entity_registry WHERE uid = :uid AND retired_at IS NULL',
    { uid: organizationUid },
  ))?.[0];
  if (!reg) return { ok: false, mode: 'uid', reason: REASONS.UNKNOWN_UID };

  // The kind decides the module. A corporate-portal user attached to a hospital (or anything else)
  // is a misconfiguration to refuse, not a hospital HRMS user to let through.
  if (reg.kind !== 'corporate' || reg.source_table !== 'corporates') {
    return { ok: false, mode: 'uid', reason: REASONS.NOT_CORPORATE };
  }

  const corporate = await findCorporateById(Number(reg.source_id));
  if (!corporate) return { ok: false, mode: 'uid', reason: REASONS.CORPORATE_MISSING };

  // Subdomain isolation, by uid: the corporate's tenant must be the tenant this host resolves to.
  if (reqTenant) {
    const corpRow = (await query('SELECT tenant_uid FROM corporates WHERE id = :id', { id: corporate.id }))?.[0];
    const hostRow = (await query('SELECT unique_id FROM tenants WHERE id = :id', { id: reqTenant.id }))?.[0];
    if (!corpRow?.tenant_uid || !hostRow?.unique_id || corpRow.tenant_uid !== hostRow.unique_id) {
      return { ok: false, mode: 'uid', reason: REASONS.WRONG_TENANT };
    }
  }
  return { ok: true, mode: 'uid', corporate, organizationUid };
}

export { REASONS as CORPORATE_SCOPE_REASONS };
export default { resolveCorporateScope, CORPORATE_SCOPE_REASONS: REASONS };
