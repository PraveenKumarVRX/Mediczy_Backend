import pool from '../db/pgPool.js';
import drugInteractionChecker from './ai-drug-interaction.service.js';

/**
 * Prescription sign-off gate.  Deterministic checks are always executed first;
 * the existing interaction service may add long-tail LLM findings afterwards.
 */
export async function evaluatePrescriptionSignoff({ medications = [], patientId = null, actorId = null, acknowledgement = false, acknowledgementReason = null, tenantUid = 'legacy' } = {}) {
  // Run the complete deterministic layer first so patient allergies and
  // condition rules are evaluated even when a pairwise rule already blocks.
  const deterministic = await drugInteractionChecker.checkInteractions({ medications, patientId, useLLM: false });
  const deterministicContraindicated = (deterministic.interactions || []).some((interaction) => interaction.severity === 'contraindicated');
  // Long-tail analysis is useful only when the deterministic layer has not
  // already found a hard stop; a hard stop must remain fast and unambiguous.
  const result = deterministicContraindicated || medications.length < 2
    ? { ...deterministic, deterministic: true }
    : await drugInteractionChecker.checkInteractions({ medications, patientId, useLLM: true });
  const contraindicated = (result.interactions || []).filter((interaction) => interaction.severity === 'contraindicated');
  const major = (result.interactions || []).filter((interaction) => interaction.severity === 'major');
  let status = contraindicated.length ? 'blocked' : 'allowed';
  if (contraindicated.length && acknowledgement === true && String(acknowledgementReason || '').trim().length >= 10) {
    status = 'acknowledged';
  }
  const payload = {
    patientId,
    actorId,
    medications,
    interactions: result.interactions || [],
    status,
    acknowledgementReason: acknowledgementReason || null,
  };
  try {
    await pool.query(`
      INSERT INTO drug_safety_signoffs (tenant_uid, patient_id, actor_id, medications, interactions, status, acknowledgement_reason)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
    `, [tenantUid, patientId, actorId, JSON.stringify(medications), JSON.stringify(result.interactions || []), status, acknowledgementReason || null]);
  } catch (error) {
    // The API remains usable during a migration window, but never silently
    // treats a contraindication as cleared.
    console.error('[PrescriptionSafetyGate] audit insert failed:', error.message);
  }
  return {
    allowed: status !== 'blocked',
    status,
    requiresAcknowledgement: contraindicated.length > 0,
    contraindicated,
    major,
    interactions: result.interactions || [],
    qualityGate: result.qualityGate || null,
    audit: payload,
  };
}

export default { evaluatePrescriptionSignoff };
