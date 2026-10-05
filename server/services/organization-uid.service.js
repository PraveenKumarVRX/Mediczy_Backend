/**
 * Resolve and record the UID of the organisation a user belongs to.
 *
 * users.organization_id is ambiguous (a TENANTS id for some users, a CORPORATES id for others, and
 * the two tables share 11 integer values), so who a user belongs to is recorded in
 * users.organization_uid: the entity UID of the organisation, resolvable through entity_registry.
 *   - a corporate-portal user belongs to a CORPORATE (kind `corporate`);
 *   - a hospital / clinic / lab / pharmacy user belongs to that TENANT.
 * `hr_staff` exists in both the hospital HRMS module and the corporate wellness portal, so the role
 * cannot say which; the kind of the organisation does.
 *
 * Everything here degrades to "no uid" when the column does not exist (a database the entity UID
 * migration has not been applied to), so callers keep their previous behaviour there.
 *
 * The query function is injected so the logic is testable without a database.
 */
import { QueryTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';

const isUndefinedColumn = (err) => (err?.original?.code || err?.parent?.code || err?.code) === '42703';

export function createOrganizationUidService({ query }) {
  let columnKnown = false;
  let lastMiss = 0;

  /** True when users.organization_uid exists. A hit is cached for good; a miss is re-checked every 60s. */
  async function hasColumn() {
    if (columnKnown) return true;
    if (Date.now() - lastMiss < 60_000) return false;
    const rows = await query(
      "SELECT 1 AS x FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'organization_uid'", {});
    if (rows.length) { columnKnown = true; return true; }
    lastMiss = Date.now();
    return false;
  }

  /** The UID of a corporates row, or null. */
  async function corporateUid(corporateId) {
    if (!corporateId) return null;
    const r = await query('SELECT unique_id FROM corporates WHERE id = :id', { id: Number(corporateId) });
    return r[0]?.unique_id || null;
  }

  /** The UID of the single Active corporate linked to a tenant; null when there is none or more than one. */
  async function corporateUidForTenant(tenantId) {
    if (!tenantId) return null;
    const r = await query("SELECT unique_id FROM corporates WHERE tenant_id = :t AND status ILIKE 'active'", { t: Number(tenantId) });
    return r.length === 1 ? r[0].unique_id : null;
  }

  /** The UID of a tenants row, or null. */
  async function tenantUid(tenantId) {
    if (!tenantId) return null;
    const r = await query('SELECT unique_id FROM tenants WHERE id = :id', { id: Number(tenantId) });
    return r[0]?.unique_id || null;
  }

  /** users.organization_uid for a user, or null (including when the column is missing). */
  async function userOrganizationUid(userId) {
    if (!(await hasColumn())) return null;
    const r = await query('SELECT organization_uid FROM users WHERE id = :id', { id: Number(userId) });
    return r[0]?.organization_uid || null;
  }

  /**
   * Record a user's organisation. This is the AUTHORITATIVE write: the users trigger derives a uid for
   * every insert from organization_id, which is a best guess when that integer is ambiguous, and the
   * service that knows which organisation it means (a corporate, by its own row) overrides it here.
   * A no-op when the value already matches. Returns true when a row changed. A missing column is not
   * an error for the caller; a uid of the wrong kind for the user's role is refused by the trigger.
   */
  async function setUserOrganizationUid(userId, uid) {
    if (!uid) return false;
    try {
      if (!(await hasColumn())) return false;
      const r = await query(
        'UPDATE users SET organization_uid = :uid WHERE id = :id AND organization_uid IS DISTINCT FROM :uid RETURNING id',
        { uid, id: Number(userId) });
      return r.length > 0;
    } catch (err) {
      if (isUndefinedColumn(err)) return false;
      throw err;
    }
  }

  /**
   * Does this user belong to this corporate? By uid when both sides have one; by the legacy integer
   * only when the user has no uid yet, so an un-backfilled user keeps working.
   */
  async function userBelongsToCorporate(user, corporateId) {
    const corpUid = await corporateUid(corporateId);
    const userUid = await userOrganizationUid(user.id);
    if (corpUid && userUid) return userUid === corpUid;
    return Number(user.organization_id) === Number(corporateId);
  }

  return { hasColumn, corporateUid, corporateUidForTenant, tenantUid, userOrganizationUid,
           setUserOrganizationUid, userBelongsToCorporate };
}

const defaultQuery = (sql, replacements) =>
  postgresSequelize.query(sql, { replacements, type: QueryTypes.SELECT }).then((rows) => rows);

// RETURNING statements come back from a SELECT-typed query as rows, which is what the helper expects.
export default createOrganizationUidService({ query: defaultQuery });
