/**
 * Denial management — insurance claim denials workflow.
 *
 * Refactored 2026-08-15 onto the `ClaimDenial` model (was raw `pool.query`
 * against a runtime-created table with no FK integrity — see
 * server/migrations/20260815-claim-denials-integrity.migration.js). Exported
 * function signatures are unchanged so existing callers
 * (server/routes/hospital/billing.route.js,
 * server/services/ai-brain/tools/module-tools.js) need no changes.
 */
import ClaimDenial from '../models/postgres/claimDenial.model.postgres.js';
import InsuranceClaim from '../models/postgres/insuranceClaim.model.postgres.js';
import { draftAppealLetter } from './insurance-ai-copilot.service.js';

export async function listDenials(hospitalId, { status, limit = 50 } = {}) {
  const where = { hospitalId };
  if (status) where.status = status;
  const rows = await ClaimDenial.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: Math.min(100, limit),
  });
  return rows.map((r) => r.toJSON());
}

export async function createDenial(hospitalId, data, actorId) {
  const denial = await ClaimDenial.create({
    hospitalId,
    organizationId: data.organizationId || hospitalId,
    claimId: data.claimId || null,
    claimNumber: data.claimNumber || null,
    patientId: data.patientId || null,
    denialCode: data.denialCode || null,
    denialReason: data.denialReason || null,
    deniedAmount: Number(data.deniedAmount) || 0,
    status: 'open',
  });

  if (data.claimId) {
    // Route through the same model/hook path the insurance-desk claims flow
    // uses elsewhere, so updatedAt/audit bookkeeping stays consistent instead
    // of a bare fire-and-forget UPDATE.
    await InsuranceClaim.update(
      { status: 'denied', lastModifiedBy: actorId || null },
      { where: { id: data.claimId } }
    ).catch(() => {});
  }

  return denial.toJSON();
}

/**
 * Drafts (and persists) an appeal letter for a denial. When the denial is
 * linked to a real claim, this now delegates to the same LLM-backed
 * draftAppealLetter() the insurance-desk AI co-pilot uses
 * (insurance-ai-copilot.service.js) instead of a hardcoded template — the two
 * previously-separate drafting paths are unified into the one that's real.
 * Falls back to a plain template only when there's no linked claim to draft
 * facts from (e.g. a denial recorded before any claim existed in the system).
 */
export async function draftAppeal(hospitalId, denialId, actorId) {
  const denial = await ClaimDenial.findOne({ where: { id: denialId, hospitalId } });
  if (!denial) throw new Error('Denial not found');

  let letter;
  if (denial.claimId) {
    const claim = await InsuranceClaim.findByPk(denial.claimId);
    if (claim) {
      const draft = await draftAppealLetter(claim, {
        rejectionReason: denial.denialReason || claim.rejectionReason,
        additionalContext: denial.denialCode ? `Denial code: ${denial.denialCode}` : undefined,
      });
      letter = `${draft.subject}\n\n${draft.body}`;
    }
  }

  if (!letter) {
    letter = `Appeal for claim ${denial.claimNumber || denialId}
Denial code: ${denial.denialCode || 'N/A'}
Reason cited: ${denial.denialReason || 'Not specified'}
Amount disputed: Rs. ${denial.deniedAmount}

We respectfully request reconsideration based on medical necessity and policy coverage.
Please find enclosed clinical documentation supporting this claim.`;
  }

  await denial.update({
    appealLetter: letter,
    status: 'appeal_drafted',
    appealedAt: new Date(),
    appealedBy: actorId || null,
  });

  return { denialId, appealLetter: letter };
}

export async function resolveDenial(hospitalId, denialId, { resolution, notes }, actorId) {
  const denial = await ClaimDenial.findOne({ where: { id: denialId, hospitalId } });
  if (!denial) throw new Error('Denial not found');

  await denial.update({
    status: resolution || 'resolved',
    resolutionNotes: notes || null,
    resolvedAt: new Date(),
  });
  return { success: true, denialId };
}

export default { listDenials, createDenial, draftAppeal, resolveDenial };
