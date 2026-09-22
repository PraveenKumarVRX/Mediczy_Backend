/**
 * Medicine reconciliation at admission / transfer / discharge (WP-1.2).
 * A reconciliation lists the patient's home medicines and one decision per medicine (continue / stop / change / hold).
 * It can only be signed once every item has a decision. The "reconciliation required before discharge" gate is a
 * per-organization switch (organization setting), off by default.
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { AllergyError } from './allergy.service.js';

const TYPES = ['admit', 'transfer', 'discharge'];
const ACTIONS = ['continue', 'stop', 'change', 'hold'];

async function inOrgContext(organizationId, userId, work) {
  if (!organizationId) throw new AllergyError('An organization is required for reconciliation', 400);
  return sequelize.transaction(async (transaction) => {
    await setRlsContext(transaction, { orgId: organizationId, userId: userId || 0, isPlatformAdmin: false });
    const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
    return work({ q });
  });
}

export async function startReconciliation({ organizationId, patientId, admissionId = null, type, items = [], createdBy = null }) {
  if (!TYPES.includes(type)) throw new AllergyError(`type must be one of: ${TYPES.join(', ')}`);
  if (!Number.isInteger(Number(patientId))) throw new AllergyError('patientId is required');
  return inOrgContext(organizationId, createdBy, async ({ q }) => {
    const [rec] = await q(`INSERT INTO med_reconciliation (organization_id, patient_id, admission_id, type, created_by) VALUES (:org,:pid,:adm,:type,:by) RETURNING *`,
      { org: organizationId, pid: Number(patientId), adm: admissionId, type, by: createdBy });
    for (const it of items) await addItemTx(q, rec, it);
    return { ...rec, items: await q(`SELECT * FROM med_reconciliation_item WHERE reconciliation_id = :id ORDER BY id`, { id: rec.id }) };
  });
}

async function addItemTx(q, rec, it) {
  const name = String(it.homeMedicine ?? it.name ?? '').trim();
  if (!name) throw new AllergyError('homeMedicine is required for each item');
  if (it.action != null && !ACTIONS.includes(it.action)) throw new AllergyError(`action must be one of: ${ACTIONS.join(', ')}`);
  const [row] = await q(`INSERT INTO med_reconciliation_item (reconciliation_id, organization_id, home_medicine, drug_code, dose, route, frequency, action, reason)
    VALUES (:rid,:org,:name,:code,:dose,:route,:freq,:action,:reason) RETURNING *`,
    { rid: rec.id, org: rec.organization_id, name: name.slice(0, 250), code: it.drugCode ?? null, dose: it.dose ?? null, route: it.route ?? null, freq: it.frequency ?? null, action: it.action ?? null, reason: it.reason ?? null });
  return row;
}

export async function getReconciliation({ organizationId, id, userId = null }) {
  return inOrgContext(organizationId, userId, async ({ q }) => {
    const [rec] = await q(`SELECT * FROM med_reconciliation WHERE id = :id`, { id });
    if (!rec) return null;
    return { ...rec, items: await q(`SELECT * FROM med_reconciliation_item WHERE reconciliation_id = :id ORDER BY id`, { id }) };
  });
}

export async function listForPatient({ organizationId, patientId, userId = null }) {
  return inOrgContext(organizationId, userId, ({ q }) => q(`SELECT * FROM med_reconciliation WHERE patient_id = :pid ORDER BY created_at DESC`, { pid: Number(patientId) }));
}

export async function decideItem({ organizationId, id, itemId, action, reason = null, resultingOrderId = null, userId = null }) {
  if (!ACTIONS.includes(action)) throw new AllergyError(`action must be one of: ${ACTIONS.join(', ')}`);
  if (['stop', 'change', 'hold'].includes(action) && !String(reason ?? '').trim()) throw new AllergyError('A reason is required to stop, change or hold a home medicine');
  return inOrgContext(organizationId, userId, async ({ q }) => {
    const [rec] = await q(`SELECT status FROM med_reconciliation WHERE id = :id`, { id });
    if (!rec) throw new AllergyError('Reconciliation not found', 404, 'NOT_FOUND');
    if (rec.status !== 'draft') throw new AllergyError(`A ${rec.status} reconciliation cannot be changed`, 409, 'NOT_DRAFT');
    const [row] = await q(`UPDATE med_reconciliation_item SET action = :action, reason = :reason, resulting_order_id = COALESCE(:oid, resulting_order_id) WHERE id = :itemId AND reconciliation_id = :id RETURNING *`,
      { action, reason, oid: resultingOrderId, itemId, id });
    if (!row) throw new AllergyError('Item not found', 404, 'NOT_FOUND');
    return row;
  });
}

export async function addItem({ organizationId, id, item, userId = null }) {
  return inOrgContext(organizationId, userId, async ({ q }) => {
    const [rec] = await q(`SELECT * FROM med_reconciliation WHERE id = :id`, { id });
    if (!rec) throw new AllergyError('Reconciliation not found', 404, 'NOT_FOUND');
    if (rec.status !== 'draft') throw new AllergyError(`A ${rec.status} reconciliation cannot be changed`, 409, 'NOT_DRAFT');
    return addItemTx(q, rec, item);
  });
}

export async function signReconciliation({ organizationId, id, signedBy }) {
  return inOrgContext(organizationId, signedBy, async ({ q }) => {
    const [rec] = await q(`SELECT * FROM med_reconciliation WHERE id = :id FOR UPDATE`, { id });
    if (!rec) throw new AllergyError('Reconciliation not found', 404, 'NOT_FOUND');
    if (rec.status !== 'draft') throw new AllergyError(`Already ${rec.status}`, 409, 'NOT_DRAFT');
    const undecided = await q(`SELECT id, home_medicine FROM med_reconciliation_item WHERE reconciliation_id = :id AND action IS NULL`, { id });
    if (undecided.length) throw new AllergyError(`Every home medicine needs a decision before signing (${undecided.length} outstanding)`, 409, 'UNDECIDED_ITEMS');
    const [row] = await q(`UPDATE med_reconciliation SET status = 'signed', signed_by = :by, signed_at = NOW() WHERE id = :id RETURNING *`, { id, by: signedBy });
    return row;
  });
}

/** True when the patient's admission has a signed reconciliation of the given type (used by the discharge gate). */
export async function hasSignedReconciliation({ organizationId, patientId, admissionId = null, type = 'discharge' }) {
  return inOrgContext(organizationId, 0, async ({ q }) => {
    const rows = await q(`SELECT 1 FROM med_reconciliation WHERE patient_id = :pid AND type = :type AND status = 'signed' AND (:adm::int IS NULL OR admission_id = :adm) LIMIT 1`,
      { pid: Number(patientId), type, adm: admissionId });
    return rows.length > 0;
  });
}
