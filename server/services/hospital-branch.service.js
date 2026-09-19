/**
 * Hospital Branch Service — Multi-Branch Architecture (Phase 1)
 * =================================================================
 * Patient/staff identity stays organization-level; this service only
 * manages branches themselves, staff-to-branch assignment, and
 * branch-scoped tariff overrides. See migrations/multi-branch-architecture.migration.js
 * for the phased rollout plan.
 */

import pool from '../db/pgPool.js';

class HospitalBranchService {
  async createBranch({ organizationId, name, address, isMain = false }) {
    const { rows } = await pool.query(
      `INSERT INTO hospital_branch (organization_id, name, address, is_main)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, name) DO UPDATE SET address = EXCLUDED.address
       RETURNING *`,
      [organizationId, name, address, isMain]
    );
    return rows[0];
  }

  /** Ensures a tenant has at least one branch — auto-creates "Main" if none exist. Idempotent. */
  async ensureMainBranch(organizationId) {
    const { rows } = await pool.query(
      `SELECT * FROM hospital_branch WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [organizationId]
    );
    if (rows[0]) return rows[0];
    return this.createBranch({ organizationId, name: 'Main', address: null, isMain: true });
  }

  async listBranches(organizationId) {
    const { rows } = await pool.query(
      `SELECT * FROM hospital_branch WHERE organization_id = $1 AND is_active = true ORDER BY is_main DESC, name`,
      [organizationId]
    );
    return rows;
  }

  async assignStaffToBranch({ userId, branchId, role }) {
    const { rows } = await pool.query(
      `INSERT INTO staff_branch_assignment (user_id, branch_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role, is_active = true
       RETURNING *`,
      [userId, branchId, role]
    );
    return rows[0];
  }

  /**
   * All branches (and role at each) a staff member is assigned to.
   * When organizationId is given, only branches of that organization are
   * returned (staff_branch_assignment has no org column, so scope via the join).
   */
  async listStaffBranches(userId, organizationId = null) {
    const params = [userId];
    let orgClause = '';
    if (organizationId != null) {
      params.push(organizationId);
      orgClause = ' AND hb.organization_id = $2';
    }
    const { rows } = await pool.query(
      `SELECT sba.role, hb.* FROM staff_branch_assignment sba
       JOIN hospital_branch hb ON hb.id = sba.branch_id
       WHERE sba.user_id = $1 AND sba.is_active = true${orgClause}
       ORDER BY hb.name`,
      params
    );
    return rows;
  }

  async setTariffOverride({ branchId, chargeMasterId, overridePrice, effectiveDate = null }) {
    const { rows } = await pool.query(
      `INSERT INTO charge_master_branch_override (branch_id, charge_master_id, override_price, effective_date)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE))
       ON CONFLICT (branch_id, charge_master_id) DO UPDATE SET override_price = EXCLUDED.override_price, effective_date = EXCLUDED.effective_date
       RETURNING *`,
      [branchId, chargeMasterId, overridePrice, effectiveDate]
    );
    return rows[0];
  }

  /** Resolves the effective price: branch override if one exists, else the base charge_master price. */
  async resolveTariff({ branchId, chargeMasterId, basePrice }) {
    if (!branchId) return basePrice;
    const { rows } = await pool.query(
      `SELECT override_price FROM charge_master_branch_override WHERE branch_id = $1 AND charge_master_id = $2`,
      [branchId, chargeMasterId]
    );
    return rows[0] ? Number(rows[0].override_price) : basePrice;
  }

  /**
   * Validates a client-supplied branch id against the caller's organization.
   * Returns the numeric id when it belongs to the org, otherwise null — never
   * trusts the value blindly (also null when the branch tables are absent).
   */
  async resolveBranchId(branchId, organizationId) {
    const id = parseInt(branchId, 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    const { rows } = await pool.query(
      `SELECT id FROM hospital_branch WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    ).catch(() => ({ rows: [] }));
    return rows[0]?.id ?? null;
  }

  /** Cross-branch encounter summary for a patient — feeds the "Also seen at:" banner. Counts only, not full records. */
  async getPatientBranchSummary(patientId, organizationId) {
    // Encounters = appointments + queue check-ins tagged with a branch. Each source
    // is queried independently so a missing column / RLS on one never hides the other.
    // NOTE: appointments.patientId is camelCase (Sequelize model), queue uses patient_id.
    const sources = [
      `SELECT a.branch_id, COUNT(*)::int AS cnt FROM appointments a
        WHERE a."patientId" = $1 AND a.branch_id IS NOT NULL GROUP BY a.branch_id`,
      `SELECT q.branch_id, COUNT(*)::int AS cnt FROM hospital_queue_entries q
        WHERE q.patient_id = $1 AND q.branch_id IS NOT NULL GROUP BY q.branch_id`,
    ];
    const counts = new Map();
    for (const sql of sources) {
      const { rows } = await pool.query(sql, [patientId]).catch(() => ({ rows: [] })); // branch_id may not exist / be backfilled yet
      for (const r of rows) counts.set(r.branch_id, (counts.get(r.branch_id) || 0) + r.cnt);
    }
    if (counts.size === 0) return [];
    // Branch-scoped org filter: only branches of the caller's organization are ever returned.
    const { rows: branches } = await pool.query(
      `SELECT id AS branch_id, name FROM hospital_branch WHERE organization_id = $1 AND id = ANY($2::int[])`,
      [organizationId, [...counts.keys()]]
    ).catch(() => ({ rows: [] }));
    const rows = branches
      .map((b) => ({ branch_id: b.branch_id, name: b.name, visit_count: counts.get(b.branch_id) }))
      .sort((x, y) => y.visit_count - x.visit_count);
    return rows;
  }
}

export default new HospitalBranchService();
