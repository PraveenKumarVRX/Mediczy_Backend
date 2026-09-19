/**
 * Corporate Account Layer Service (Module 24 completion)
 * ==========================================================
 * MoU versioning, rate-card history, SPOC assignment, account-level credit
 * ledger, and per-category employee consent grants. See
 * migrations/corporate-account-layer.migration.js for schema.
 *
 * Note: consent grants default to NOT granted — an employer never sees any
 * category of data until the employee explicitly opts in, and every grant
 * is timestamped for audit.
 */

import pool from '../db/pgPool.js';

class CorporateAccountService {
  /**
   * Ownership check for every corporate-scoped operation: does corporate
   * `corporateId` belong to organization `orgId` (corporates.tenant_id)?
   *
   * Legacy rows with tenant_id IS NULL are deliberately treated as NOT
   * accessible - for reads as well as mutations. A NULL row belongs to no org,
   * so allowing any org to touch it would re-open the cross-tenant hole this
   * check exists to close. Such rows must be claimed (tenant_id backfilled) by
   * an administrator before a hospital can manage them here.
   */
  async assertCorporateInOrg(corporateId, orgId) {
    const cid = Number(corporateId);
    const oid = Number(orgId);
    if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(oid)) return false;
    const { rows } = await pool.query(
      `SELECT 1 FROM corporates WHERE id = $1 AND tenant_id = $2`,
      [cid, oid]
    );
    return rows.length > 0;
  }

  // ── MoU ──────────────────────────────────────────────────────────
  async addMouVersion({ corporateId, terms, documentUrl, effectiveDate, renewalDate, createdBy }) {
    const { rows: existing } = await pool.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version FROM corporate_mou WHERE corporate_id = $1`,
      [corporateId]
    );
    const nextVersion = Number(existing[0].max_version) + 1;
    await pool.query(
      `UPDATE corporate_mou SET status = 'superseded' WHERE corporate_id = $1 AND status = 'active'`,
      [corporateId]
    );
    const { rows } = await pool.query(
      `INSERT INTO corporate_mou (corporate_id, version, terms, document_url, effective_date, renewal_date, status, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, 'active', $7)
       RETURNING *`,
      [corporateId, nextVersion, terms || {}, documentUrl, effectiveDate, renewalDate, createdBy]
    );
    return rows[0];
  }

  async getMouHistory(corporateId) {
    const { rows } = await pool.query(
      `SELECT * FROM corporate_mou WHERE corporate_id = $1 ORDER BY version DESC`,
      [corporateId]
    );
    return rows;
  }

  // ── Rate card ────────────────────────────────────────────────────
  async addRateCardVersion({ corporateId, rateCard, effectiveDate, createdBy }) {
    const { rows: existing } = await pool.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version FROM corporate_rate_card_version WHERE corporate_id = $1`,
      [corporateId]
    );
    const nextVersion = Number(existing[0].max_version) + 1;
    const { rows } = await pool.query(
      `INSERT INTO corporate_rate_card_version (corporate_id, version, rate_card, effective_date, created_by)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
       RETURNING *`,
      [corporateId, nextVersion, rateCard || {}, effectiveDate, createdBy]
    );
    return rows[0];
  }

  /** The rate card in effect as of a given date (defaults to today). */
  async getEffectiveRateCard(corporateId, asOfDate = null) {
    const { rows } = await pool.query(
      `SELECT * FROM corporate_rate_card_version
       WHERE corporate_id = $1 AND effective_date <= COALESCE($2, CURRENT_DATE)
       ORDER BY effective_date DESC, version DESC
       LIMIT 1`,
      [corporateId, asOfDate]
    );
    return rows[0] || null;
  }

  // ── SPOC ─────────────────────────────────────────────────────────
  async assignSpoc(corporateId, staffUserId) {
    const { rows } = await pool.query(
      `INSERT INTO corporate_account_spoc (corporate_id, staff_user_id)
       VALUES ($1, $2)
       ON CONFLICT (corporate_id) DO UPDATE SET staff_user_id = EXCLUDED.staff_user_id, assigned_at = NOW()
       RETURNING *`,
      [corporateId, staffUserId]
    );
    return rows[0];
  }

  async getSpoc(corporateId) {
    const { rows } = await pool.query(`SELECT * FROM corporate_account_spoc WHERE corporate_id = $1`, [corporateId]);
    return rows[0] || null;
  }

  // ── Credit ledger ────────────────────────────────────────────────
  async setCreditLimit(corporateId, creditLimit) {
    const { rows } = await pool.query(
      `INSERT INTO corporate_account_credit_ledger (corporate_id, credit_limit)
       VALUES ($1, $2)
       ON CONFLICT (corporate_id) DO UPDATE SET credit_limit = EXCLUDED.credit_limit, updated_at = NOW()
       RETURNING *`,
      [corporateId, creditLimit]
    );
    return rows[0];
  }

  /** Adds a charge to the running balance (positive = owed by corporate, negative = payment received). */
  async adjustBalance(corporateId, amount) {
    const { rows } = await pool.query(
      `UPDATE corporate_account_credit_ledger
       SET current_balance = current_balance + $2, updated_at = NOW()
       WHERE corporate_id = $1
       RETURNING *`,
      [corporateId, amount]
    );
    if (!rows.length) throw new Error(`No credit ledger found for corporate ${corporateId} — call setCreditLimit() first`);
    return rows[0];
  }

  async getCreditStatus(corporateId) {
    const { rows } = await pool.query(`SELECT * FROM corporate_account_credit_ledger WHERE corporate_id = $1`, [corporateId]);
    if (!rows[0]) return null;
    const { credit_limit, current_balance } = rows[0];
    return { ...rows[0], availableCredit: Number(credit_limit) - Number(current_balance), overLimit: Number(current_balance) > Number(credit_limit) };
  }

  // ── Consent grants (opt-in only, employee-controlled) ──────────────
  async setConsentGrant({ employeeUserId, corporateId, dataCategory, granted }) {
    const { rows } = await pool.query(
      `INSERT INTO corporate_consent_grant (employee_user_id, corporate_id, data_category, granted, granted_at, revoked_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, CASE WHEN $4 THEN NULL ELSE NOW() END)
       ON CONFLICT (employee_user_id, corporate_id, data_category)
       DO UPDATE SET granted = EXCLUDED.granted,
                     granted_at = CASE WHEN EXCLUDED.granted THEN NOW() ELSE corporate_consent_grant.granted_at END,
                     revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE NOW() END
       RETURNING *`,
      [employeeUserId, corporateId, dataCategory, granted]
    );
    return rows[0];
  }

  /** What an employer is currently allowed to see for a given employee. Defaults closed. */
  async getGrantedCategories(employeeUserId, corporateId) {
    const { rows } = await pool.query(
      `SELECT data_category FROM corporate_consent_grant
       WHERE employee_user_id = $1 AND corporate_id = $2 AND granted = true`,
      [employeeUserId, corporateId]
    );
    return rows.map(r => r.data_category);
  }
}

export default new CorporateAccountService();
