/**
 * Green Channel Service — corporate fast-track for the OPD queue
 * ===============================================================
 * Administrative only: the priority bonus in hospital-queue.service.js never
 * applies when a clinical triage level is present, so it can only tie-break
 * routine/scheduled entries. See migrations/green-channel.migration.js for
 * the display-mode semantics. Every lookup here fails open: a problem in this
 * service must never block a patient check-in.
 */

import pool from '../db/pgPool.js';

export const DISPLAY_MODES = ['quiet', 'staff_badge', 'separate_lane'];

class GreenChannelService {
  async getConfig(organizationId) {
    const { rows } = await pool.query(
      `SELECT display_mode FROM green_channel_config WHERE organization_id = $1`,
      [organizationId]
    );
    return { organizationId, displayMode: rows[0]?.display_mode || 'quiet' };
  }

  async setDisplayMode(organizationId, displayMode, updatedBy) {
    if (!DISPLAY_MODES.includes(displayMode)) throw new Error(`displayMode must be one of: ${DISPLAY_MODES.join(', ')}`);
    await pool.query(
      `INSERT INTO green_channel_config (organization_id, display_mode, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (organization_id) DO UPDATE SET display_mode = EXCLUDED.display_mode, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [organizationId, displayMode, updatedBy || null]
    );
    return this.getConfig(organizationId);
  }

  // Only callable for a corporate owned by organizationId (corporates.tenant_id;
  // legacy NULL rows are not owned by anyone). Returns undefined when the
  // corporate is not the org's, and writes nothing in that case.
  async setCorporateEnabled(organizationId, corporateId, enabled, updatedBy) {
    const { rows } = await pool.query(
      `INSERT INTO corporate_green_channel (corporate_id, enabled, updated_by, updated_at)
       SELECT c.id, $2, $3, NOW() FROM corporates c WHERE c.id = $1 AND c.tenant_id = $4
       ON CONFLICT (corporate_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [corporateId, Boolean(enabled), updatedBy || null, organizationId]
    );
    return rows[0];
  }

  async listCorporates(organizationId) {
    const { rows } = await pool.query(
      `SELECT c.id, c."companyName", COALESCE(g.enabled, false) AS enabled
       FROM corporates c
       LEFT JOIN corporate_green_channel g ON g.corporate_id = c.id
       WHERE c.tenant_id = $1
       ORDER BY c."companyName"`,
      [organizationId]
    );
    return rows;
  }

  /**
   * Is this patient an active member of a corporate account that has the
   * green channel enabled? Returns null when not eligible (or on any error).
   */
  async resolveForPatient({ organizationId, patientId }) {
    if (!patientId) return null;
    try {
      const { rows } = await pool.query(
        `SELECT c.id AS corporate_id, c."companyName"
         FROM user_associations ua
         JOIN corporates c ON c.id = ua."entityId"
         JOIN corporate_green_channel g ON g.corporate_id = c.id AND g.enabled = true
         WHERE ua."userId" = $1
           AND ua."entityType" = 'corporate'
           AND ua.status = 'active'
           AND c.tenant_id = $2
         LIMIT 1`,
        [patientId, organizationId]
      );
      if (!rows[0]) return null;
      const { displayMode } = await this.getConfig(organizationId);
      return { corporateId: rows[0].corporate_id, corporateName: rows[0].companyName, displayMode };
    } catch (e) {
      console.warn('[GreenChannel] resolve failed, treating as not eligible:', e.message);
      return null;
    }
  }

  async logApplication({ organizationId, queueEntryId, corporateId, bonusApplied, displayMode }) {
    try {
      await pool.query(
        `INSERT INTO green_channel_application_log (organization_id, queue_entry_id, corporate_id, bonus_applied, display_mode)
         VALUES ($1, $2, $3, $4, $5)`,
        [organizationId, queueEntryId, corporateId, bonusApplied, displayMode]
      );
    } catch (e) {
      console.warn('[GreenChannel] audit log failed:', e.message);
    }
  }

  /** Aggregate for the fairness review the design doc calls for. */
  async getImpactSummary(organizationId, days = 30) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS applications, COUNT(DISTINCT corporate_id)::int AS corporates
       FROM green_channel_application_log
       WHERE organization_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval`,
      [organizationId, days]
    );
    return rows[0];
  }
}

export default new GreenChannelService();
