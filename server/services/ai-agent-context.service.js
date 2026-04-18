/**
 * Mediqzy Multi-Agent Context Bridge
 * =====================================
 * Enables all AI agents (triage, Dr. iSHA, scribe, billing, insurance)
 * to share patient context within a single encounter session.
 *
 * Problem solved:
 *   Without this, each agent operates in isolation:
 *   - Triage agent doesn't know what Dr. iSHA already asked
 *   - Billing agent doesn't know the diagnosis to price correctly
 *   - Insurance bot repeats questions the scribe already captured
 *
 * Solution:
 *   A shared context store (agent_context_bridge table) keyed by
 *   patient_id + session_id. Each agent reads relevant slots and
 *   writes its outputs back. 24-hour TTL per session.
 *
 * Context slots:
 *   triage_context   — ESI level, red flags, urgency
 *   clinical_context — chief complaints, diagnoses, Dr. iSHA conversation
 *   billing_context  — procedure codes, estimates
 *   insurance_context — policy status, pre-auth ref
 *   his_context      — HIS score, risk tier
 *
 * Usage:
 *   const ctx = await agentContextBridge.getOrCreate(patientId, sessionId);
 *   await agentContextBridge.update(patientId, sessionId, 'triage_context', { esi: 3 });
 *   const triageData = await agentContextBridge.get(patientId, sessionId, 'triage_context');
 */

import pool from '../db/pgPool.js';
import { v4 as uuidv4 } from 'uuid';

// Context slot names (validated on write)
const VALID_SLOTS = ['triage_context', 'clinical_context', 'billing_context', 'insurance_context', 'his_context'];

class AgentContextBridge {

  /**
   * Get or create a session context for a patient encounter.
   * @param {number} patientId
   * @param {string} [sessionId] - If omitted, creates a new session
   * @param {string} [tenantId]
   */
  async getOrCreate(patientId, sessionId = null, tenantId = null) {
    const db = pool;

    // Try to find active session
    if (sessionId) {
      const { rows: [existing] } = await db.query(
        `SELECT * FROM agent_context_bridge WHERE patient_id = $1 AND session_id = $2 AND is_active = TRUE AND expires_at > NOW()`,
        [patientId, sessionId]
      );
      if (existing) return existing;
    }

    // Create new session
    const newSessionId = sessionId || uuidv4();
    const { rows: [created] } = await db.query(`
      INSERT INTO agent_context_bridge
        (patient_id, tenant_id, session_id, created_at, last_updated_at, expires_at)
      VALUES ($1, $2, $3, NOW(), NOW(), NOW() + INTERVAL '24 hours')
      ON CONFLICT (patient_id, session_id) DO UPDATE
        SET last_updated_at = NOW(), expires_at = NOW() + INTERVAL '24 hours', is_active = TRUE
      RETURNING *
    `, [patientId, tenantId || null, newSessionId]);

    return created;
  }

  /**
   * Update a specific context slot for a patient session.
   * Also updates shared state fields (active_complaints, diagnoses, etc.)
   * @param {number} patientId
   * @param {string} sessionId
   * @param {string} slot - One of VALID_SLOTS
   * @param {Object} data - Partial update (merged with existing slot data)
   */
  async update(patientId, sessionId, slot, data) {
    if (!VALID_SLOTS.includes(slot)) throw new Error(`Invalid context slot: ${slot}`);
    const db = pool;

    // Read current slot value
    const { rows: [current] } = await db.query(
      `SELECT ${slot}, active_complaints, active_diagnoses, active_medications FROM agent_context_bridge WHERE patient_id = $1 AND session_id = $2`,
      [patientId, sessionId]
    );
    if (!current) {
      await this.getOrCreate(patientId, sessionId);
    }
    const merged = { ...(current?.[slot] || {}), ...data };

    // Extract shared state from the slot data
    const patches = { last_updated_at: 'NOW()' };

    if (slot === 'triage_context' && data.esi_level) {
      patches.last_triage_esi = data.esi_level;
      patches.urgency_level   = data.esi_level <= 2 ? 'emergency' : data.esi_level === 3 ? 'urgent' : 'routine';
    }
    if (slot === 'clinical_context') {
      if (data.complaints) patches.active_complaints = data.complaints;
      if (data.diagnoses)  patches.active_diagnoses  = data.diagnoses;
      if (data.medications) patches.active_medications = data.medications;
      if (data.encounter_type) patches.encounter_type = `'${data.encounter_type}'`;
    }

    const setParts = [`${slot} = $3::jsonb`];
    const patchKeys = Object.keys(patches);
    for (const key of patchKeys) {
      if (key === 'last_updated_at') setParts.push(`${key} = NOW()`);
      else if (['active_complaints', 'active_diagnoses', 'active_medications'].includes(key)) {
        setParts.push(`${key} = $${setParts.length + 2}::text[]`);
      } else {
        setParts.push(`${key} = $${setParts.length + 2}`);
      }
    }

    await db.query(
      `UPDATE agent_context_bridge SET ${setParts.join(', ')} WHERE patient_id = $1 AND session_id = $2`,
      [patientId, sessionId, JSON.stringify(merged), ...Object.values(patches).filter(v => v !== 'NOW()')]
    );
  }

  /**
   * Get a specific slot, or the full context record.
   */
  async get(patientId, sessionId, slot = null) {
    const { rows: [ctx] } = await pool.query(
      `SELECT * FROM agent_context_bridge WHERE patient_id = $1 AND session_id = $2 AND is_active = TRUE`,
      [patientId, sessionId]
    );
    if (!ctx) return null;
    if (slot) return ctx[slot] || {};
    return ctx;
  }

  /**
   * Get the most recent active session for a patient (for API calls that don't pass sessionId).
   */
  async getLatestSession(patientId) {
    const { rows: [ctx] } = await pool.query(
      `SELECT * FROM agent_context_bridge WHERE patient_id = $1 AND is_active = TRUE AND expires_at > NOW() ORDER BY last_updated_at DESC LIMIT 1`,
      [patientId]
    );
    return ctx || null;
  }

  /**
   * Build a unified summary of all context for use in LLM system prompts.
   * This is what makes agents "aware" of each other's work.
   */
  async buildContextSummary(patientId, sessionId) {
    const ctx = await this.get(patientId, sessionId);
    if (!ctx) return 'No active encounter context.';

    const parts = [];

    if (ctx.urgency_level && ctx.urgency_level !== 'routine') {
      parts.push(`⚡ Urgency: ${ctx.urgency_level.toUpperCase()} (ESI ${ctx.last_triage_esi})`);
    }
    if (ctx.active_complaints?.length) {
      parts.push(`📋 Chief complaints: ${ctx.active_complaints.join(', ')}`);
    }
    if (ctx.active_diagnoses?.length) {
      parts.push(`🏥 Working diagnoses: ${ctx.active_diagnoses.join(', ')}`);
    }
    if (ctx.active_medications?.length) {
      parts.push(`💊 Current medications: ${ctx.active_medications.join(', ')}`);
    }
    if (ctx.his_context?.his_score) {
      parts.push(`🧬 HIS score: ${ctx.his_context.his_score}/100 (${ctx.his_context.risk_tier})`);
    }
    if (ctx.insurance_context?.preauth_ref) {
      parts.push(`📄 Pre-auth: ${ctx.insurance_context.preauth_ref} — ${ctx.insurance_context.decision}`);
    }
    if (ctx.triage_context?.red_flags?.length) {
      parts.push(`🚨 Red flags: ${ctx.triage_context.red_flags.join(', ')}`);
    }

    return parts.length > 0 ? `Current encounter context:\n${parts.join('\n')}` : 'Encounter in progress.';
  }

  /**
   * Close a session (encounter ended).
   */
  async closeSession(patientId, sessionId) {
    await pool.query(
      `UPDATE agent_context_bridge SET is_active = FALSE WHERE patient_id = $1 AND session_id = $2`,
      [patientId, sessionId]
    );
  }

  /**
   * Cleanup expired sessions (called by maintenance cron).
   */
  async cleanupExpired() {
    const { rowCount } = await pool.query(
      `DELETE FROM agent_context_bridge WHERE expires_at < NOW() AND is_active = FALSE`
    );
    console.log(`[AgentCtx] Cleaned up ${rowCount} expired sessions`);
    return rowCount;
  }
}

const agentContextBridge = new AgentContextBridge();
export default agentContextBridge;
