/**
 * Clinical Knowledge Fabric Service
 * ===================================
 * Structured, per-specialty/department clinical knowledge (red flags,
 * referral criteria, monitoring reminders, documentation prompts) for
 * consumption by cdss.service.js and the doctor-copilot clinical path.
 *
 * Governance (per CLAUDE.md SaMD rules): rules are authored as 'draft'
 * and MUST pass through governanceService.proposeChange() / approveChange()
 * before status flips to 'approved'. getApplicableKnowledge() only ever
 * returns 'approved' rows — draft/under_review content never reaches a
 * clinical workflow. This mirrors the existing pattern in
 * ai-drug-interaction.service.js (qualityGates + interpretabilityService)
 * and is registered as its own model card for governance tracking.
 */

import pool from '../db/pgPool.js';
import governanceService from './ai-model-governance.service.js';

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

class ClinicalKnowledgeFabricService {
  /** List all registered clinical domains (specialties/departments). */
  async listDomains() {
    const { rows } = await pool.query(
      `SELECT domain_key, label, parent_specialty, description FROM clinical_knowledge_domains ORDER BY label`
    );
    return rows;
  }

  /** Register a new domain (specialty/department) if it doesn't already exist. */
  async registerDomain({ domainKey, label, parentSpecialty = null, description = null }) {
    const { rows } = await pool.query(
      `INSERT INTO clinical_knowledge_domains (domain_key, label, parent_specialty, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (domain_key) DO UPDATE SET label = EXCLUDED.label
       RETURNING *`,
      [domainKey, label, parentSpecialty, description]
    );
    return rows[0];
  }

  /**
   * Add a new rule. Always inserted as status='draft' — never live until
   * proposeForApproval() + approveRule() complete the governance flow.
   */
  async addRule({ domainKey, ruleType, title, conditionText, recommendationText, evidenceSource, confidenceLevel = 'illustrative', createdBy = 'unknown' }) {
    const { rows } = await pool.query(
      `INSERT INTO clinical_knowledge_rules
         (domain_key, rule_type, title, condition_text, recommendation_text, evidence_source, confidence_level, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
       RETURNING *`,
      [domainKey, ruleType, title, conditionText, recommendationText, evidenceSource, confidenceLevel, createdBy]
    );
    return rows[0];
  }

  /** List rules for a domain. Defaults to approved-only (safe for clinical consumption). */
  async listRulesForDomain(domainKey, { onlyApproved = true, ruleType = null } = {}) {
    const conditions = ['domain_key = $1'];
    const params = [domainKey];
    if (onlyApproved) {
      conditions.push(`status = 'approved'`);
    }
    if (ruleType) {
      params.push(ruleType);
      conditions.push(`rule_type = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT * FROM clinical_knowledge_rules WHERE ${conditions.join(' AND ')} ORDER BY rule_type, title`,
      params
    );
    return rows;
  }

  /** List all rules pending governance review, across all domains. */
  /**
   * Called when a governance change is decided from the AI Governance dashboard: keeps the rule that
   * owns that change in step, so approving the change there also makes the rule live (and rejecting
   * it retires the rule). Returns null when the change does not belong to an under_review rule.
   */
  async syncRuleWithChange(changeId, decision, decidedBy, notes = '') {
    const { rows } = await pool.query(
      `SELECT id FROM clinical_knowledge_rules WHERE governance_change_id = $1 AND status = 'under_review'`,
      [changeId]
    );
    if (!rows[0]) return null;
    return decision === 'approved'
      ? this.approveRule(rows[0].id, decidedBy, notes)
      : this.rejectRule(rows[0].id, decidedBy, notes || 'Rejected on the governance dashboard');
  }

  async listPendingReview() {
    const { rows } = await pool.query(
      `SELECT * FROM clinical_knowledge_rules WHERE status IN ('draft', 'under_review') ORDER BY domain_key, created_at`
    );
    return rows;
  }

  /**
   * Move a draft rule into the governance change-control queue.
   * Logs to ai_model_change_log via the shared governance service — the
   * same table/workflow every other AI-adjacent change in this platform uses.
   *
   * Only 'draft' rules may be proposed. (A rejected rule is terminal: the
   * author files a corrected rule as a new draft rather than resurrecting
   * a rejected one, keeping each rule's audit trail a single review.)
   *
   * Each rule gets its OWN change-log entry (dedupe: false): proposeChange()'s
   * default component+changeType de-duplication would otherwise hand every rule
   * proposed while another is pending the first rule's change id.
   */
  async proposeForApproval(ruleId, proposedBy = 'unknown') {
    // Atomically claim draft -> under_review so two concurrent proposals can't both file a change.
    const { rows: claimed } = await pool.query(
      `UPDATE clinical_knowledge_rules
       SET status = 'under_review', updated_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [ruleId]
    );
    const rule = claimed[0];
    if (!rule) {
      const { rows } = await pool.query(`SELECT status FROM clinical_knowledge_rules WHERE id = $1`, [ruleId]);
      if (!rows[0]) throw httpError(404, `Rule ${ruleId} not found`);
      throw httpError(409, `Rule ${ruleId} cannot be proposed: only draft rules can be proposed (currently: ${rows[0].status})`);
    }

    let changeId;
    try {
      changeId = await governanceService.proposeChange({
        component: 'clinical-knowledge-fabric',
        changeType: 'feature_addition',
        description: `New clinical knowledge rule #${rule.id}: [${rule.domain_key}] ${rule.title}`,
        previousConfig: null,
        newConfig: {
          ruleId: rule.id,
          domainKey: rule.domain_key,
          ruleType: rule.rule_type,
          title: rule.title,
          conditionText: rule.condition_text,
          recommendationText: rule.recommendation_text,
          evidenceSource: rule.evidence_source,
        },
        rationale: `Proposed by ${proposedBy} for inclusion in the ${rule.domain_key} knowledge fabric.`,
        riskAssessment: 'high', // clinical content — always routed as high-risk regardless of confidenceLevel
        dedupe: false,          // one change entry per rule — never share a change id between rules
      });
      await pool.query(
        `UPDATE clinical_knowledge_rules SET governance_change_id = $1, updated_at = NOW() WHERE id = $2`,
        [changeId, ruleId]
      );
    } catch (err) {
      // Roll the claim back so the rule isn't stuck under_review with no change to approve.
      await pool.query(
        `UPDATE clinical_knowledge_rules SET status = 'draft', governance_change_id = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'under_review'`,
        [ruleId]
      ).catch(() => {});
      throw err;
    }
    return { ruleId, changeId, status: 'under_review' };
  }

  /**
   * Run `work(client, rule)` with the rule row locked (SELECT ... FOR UPDATE) after verifying it is
   * currently under_review with a governance change attached. Serialises concurrent approve/reject
   * of the same rule so the rule and its governance change can't diverge.
   */
  async _withUnderReviewRule(ruleId, action, work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT * FROM clinical_knowledge_rules WHERE id = $1 FOR UPDATE`, [ruleId]);
      const rule = rows[0];
      if (!rule) throw httpError(404, `Rule ${ruleId} not found`);
      if (rule.status === 'draft') {
        throw httpError(409, `Rule ${ruleId} cannot be ${action}: it has not been proposed for approval yet`);
      }
      if (rule.status !== 'under_review') {
        throw httpError(409, `Rule ${ruleId} cannot be ${action}: only rules under review can be ${action} (currently: ${rule.status})`);
      }
      if (!rule.governance_change_id) {
        throw httpError(409, `Rule ${ruleId} is under review but has no governance change attached`);
      }
      const result = await work(client, rule);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Medical-director approval. Flips the rule to 'approved' ONLY after the
   * shared governance service records the approval of THIS rule's own change
   * — this is the sole path by which a rule becomes visible to
   * getApplicableKnowledge(). Only under_review rules can be approved.
   */
  async approveRule(ruleId, approvedBy, notes = '') {
    return this._withUnderReviewRule(ruleId, 'approved', async (client, rule) => {
      // The governance dashboard can decide the same change first. Follow the change's real state
      // instead of failing: pending -> approve it now; already approved -> just record it on the rule
      // (attributing the reviewer who actually approved it); rejected -> the rule cannot go live.
      const { rows: chg } = await client.query('SELECT status, approved_by FROM ai_model_change_log WHERE id = $1', [rule.governance_change_id]);
      if (!chg[0]) throw httpError(404, `Governance change ${rule.governance_change_id} for this rule was not found`);
      if (chg[0].status === 'pending_review') {
        await governanceService.approveChange(rule.governance_change_id, approvedBy, notes);
      } else if (chg[0].status === 'approved') {
        approvedBy = chg[0].approved_by || approvedBy;
      } else {
        throw httpError(409, `Governance change is '${chg[0].status}', so this rule cannot be approved`);
      }
      const { rows } = await client.query(
        `UPDATE clinical_knowledge_rules
         SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [approvedBy, ruleId]
      );
      return rows[0];
    });
  }

  /**
   * Reject a rule under review. Also closes its governance change (previously the
   * change stayed pending_review forever). Only under_review rules can be rejected.
   */
  async rejectRule(ruleId, reviewedBy, notes = '') {
    return this._withUnderReviewRule(ruleId, 'rejected', async (client, rule) => {
      const { rows: chg } = await client.query('SELECT status, approved_by FROM ai_model_change_log WHERE id = $1', [rule.governance_change_id]);
      if (chg[0]?.status === 'pending_review') {
        await governanceService.rejectChange(rule.governance_change_id, reviewedBy, notes || 'Rejected by reviewer');
      } else if (chg[0]?.status === 'approved') {
        throw httpError(409, 'Governance change was already approved, so this rule cannot be rejected here');
      } // already rejected on the dashboard: just record it on the rule
      const { rows } = await client.query(
        `UPDATE clinical_knowledge_rules
         SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reviewedBy, ruleId]
      );
      return rows[0];
    });
  }

  /**
   * The consumption point for cdss.service.js / doctor-copilot: only ever
   * returns approved rules, optionally filtered by rule type, for a given
   * specialty domain. Nothing draft/under_review is ever returned here.
   */
  async getApplicableKnowledge({ specialty, ruleType = null }) {
    if (!specialty) return [];
    const params = [specialty];
    let query = `
      SELECT ckr.rule_type, ckr.title, ckr.condition_text, ckr.recommendation_text, ckr.evidence_source
      FROM clinical_knowledge_rules ckr
      JOIN clinical_knowledge_domains ckd ON ckd.domain_key = ckr.domain_key
      WHERE ckr.status = 'approved'
        AND (ckr.domain_key = $1 OR ckd.parent_specialty = $1)
    `;
    if (ruleType) {
      params.push(ruleType);
      query += ` AND ckr.rule_type = $${params.length}`;
    }
    query += ` ORDER BY ckr.rule_type, ckr.title`;
    const { rows } = await pool.query(query, params);
    return rows;
  }
}

export default new ClinicalKnowledgeFabricService();
