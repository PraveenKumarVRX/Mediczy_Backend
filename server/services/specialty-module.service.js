/**
 * Specialty Clinical Modules service
 * Upgrade Plan Track B, Phase B5.
 *
 * Order sets, documentation templates, and CDS rules go through a
 * mandatory draft -> pending_review -> approved workflow; nothing reaches
 * a clinician-facing "live" query (getLive*) until a named reviewer at
 * the hospital has approved it via approve(), which requires their own
 * reviewerCredential. Seed content (see migrations/specialty-module
 * .migration.js) is drawn from published guidelines to give the hospital's
 * clinical staff a real starting point to customize — it is authored
 * content, not reviewed content, until that approval step happens.
 */
import pool from '../db/pgPool.js';

const REVIEWABLE_STATUSES = ['draft', 'pending_review', 'approved', 'retired'];

function assertStatus(status) {
  if (!REVIEWABLE_STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
}

// ── Generic CRUD + review workflow, parameterized by table ─────────────────

// Fields a caller can never set directly — status/review columns are only
// ever changed by submitForReview()/approve()/retire() below, never by a
// client-supplied field name at draft-creation time.
const PROTECTED_FIELDS = new Set([
  'id', 'specialty', 'organization_id', 'status', 'created_by',
  'reviewed_by', 'reviewer_credential', 'reviewed_at', 'created_at', 'updated_at',
]);

async function createDraft(table, { specialty, organizationId = null, createdBy, ...fields }) {
  if (!specialty) throw new Error('specialty is required');
  if (!createdBy) throw new Error('createdBy is required');

  const safeFields = Object.fromEntries(Object.entries(fields).filter(([key]) => !PROTECTED_FIELDS.has(key)));

  const columns = ['specialty', 'organization_id', 'created_by', 'status', ...Object.keys(safeFields)];
  const values = [specialty, organizationId, createdBy, 'draft', ...Object.values(safeFields)];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

async function listByStatus(table, { specialty, status, organizationId } = {}) {
  const clauses = [];
  const values = [];
  const push = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };

  if (specialty) push('specialty = ?', specialty);
  if (status) push('status = ?', status);
  if (organizationId) push('organization_id = ?', organizationId);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM ${table} ${where} ORDER BY created_at DESC`, values);
  return rows;
}

// submitForReview / approve / reject / retire are separate, explicit steps
// — a draft can never become 'approved' in one call, and every transition
// records who did it.
async function submitForReview(table, id) {
  const { rows } = await pool.query(
    `UPDATE ${table} SET status = 'pending_review', updated_at = NOW() WHERE id = $1 AND status = 'draft' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Not found, or not in draft status');
  return rows[0];
}

async function approve(table, id, { reviewedBy, reviewerCredential }) {
  if (!reviewedBy) throw new Error('reviewedBy is required');
  if (!reviewerCredential?.trim()) {
    throw new Error('reviewerCredential is required — record who is asserting clinical review (e.g. "Dr. X, MD Cardiology, Reg# ...")');
  }
  const { rows } = await pool.query(
    `UPDATE ${table}
     SET status = 'approved', reviewed_by = $2, reviewer_credential = $3, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status IN ('draft', 'pending_review')
     RETURNING *`,
    [id, reviewedBy, reviewerCredential]
  );
  if (!rows[0]) throw new Error('Not found, or not eligible for approval');
  return rows[0];
}

async function retire(table, id, { retiredBy }) {
  const { rows } = await pool.query(
    `UPDATE ${table} SET status = 'retired', updated_at = NOW() WHERE id = $1 AND status = 'approved' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Not found, or not approved');
  return rows[0];
}

async function getLive(table, { specialty, organizationId } = {}) {
  return listByStatus(table, { specialty, status: 'approved', organizationId });
}

// ── Order sets ───────────────────────────────────────────────────────────
export const createOrderSetDraft = (args) => createDraft('specialty_order_sets', args);
export const listOrderSets = (args) => listByStatus('specialty_order_sets', args);
export const submitOrderSetForReview = (id) => submitForReview('specialty_order_sets', id);
export const approveOrderSet = (id, args) => approve('specialty_order_sets', id, args);
export const retireOrderSet = (id, args) => retire('specialty_order_sets', id, args);
export const getLiveOrderSets = (args) => getLive('specialty_order_sets', args);

// ── Documentation templates ─────────────────────────────────────────────
export const createDocTemplateDraft = (args) => createDraft('specialty_documentation_templates', args);
export const listDocTemplates = (args) => listByStatus('specialty_documentation_templates', args);
export const submitDocTemplateForReview = (id) => submitForReview('specialty_documentation_templates', id);
export const approveDocTemplate = (id, args) => approve('specialty_documentation_templates', id, args);
export const retireDocTemplate = (id, args) => retire('specialty_documentation_templates', id, args);
export const getLiveDocTemplates = (args) => getLive('specialty_documentation_templates', args);

// ── Prescription templates ──────────────────────────────────────────────
// Specialty-wise prescription layout: pre-printed patient health
// information, standard precautions, and diagram references (see
// migrations/specialty-prescriptions-expansion.migration.js for what
// diagramType actually means — it identifies a diagram for the frontend
// to render/print, not an image this service generates or stores).
export const createPrescriptionTemplateDraft = (args) => createDraft('specialty_prescription_templates', args);
export const listPrescriptionTemplates = (args) => listByStatus('specialty_prescription_templates', args);
export const submitPrescriptionTemplateForReview = (id) => submitForReview('specialty_prescription_templates', id);
export const approvePrescriptionTemplate = (id, args) => approve('specialty_prescription_templates', id, args);
export const retirePrescriptionTemplate = (id, args) => retire('specialty_prescription_templates', id, args);
export const getLivePrescriptionTemplates = (args) => getLive('specialty_prescription_templates', args);

// ── CDS rules ────────────────────────────────────────────────────────────
export const createCdsRuleDraft = (args) => createDraft('specialty_cds_rules', args);
export const listCdsRules = (args) => listByStatus('specialty_cds_rules', args);
export const submitCdsRuleForReview = (id) => submitForReview('specialty_cds_rules', id);
export const approveCdsRule = (id, args) => approve('specialty_cds_rules', id, args);
export const retireCdsRule = (id, args) => retire('specialty_cds_rules', id, args);
export const getLiveCdsRules = (args) => getLive('specialty_cds_rules', args);

/**
 * Evaluate only APPROVED CDS rules against structured patient facts.
 * Deterministic condition matching — no LLM, no clinical inference of its
 * own. trigger_condition shape: { field, operator, value } where operator
 * is one of eq|neq|gt|gte|lt|lte|contains, evaluated against facts[field].
 */
export async function evaluateCdsRules({ specialty, organizationId, facts = {} }) {
  const rules = await getLive('specialty_cds_rules', { specialty, organizationId });
  const triggered = [];

  for (const rule of rules) {
    const cond = rule.trigger_condition;
    if (!cond?.field || !(cond.field in facts)) continue;
    const factValue = facts[cond.field];
    const target = cond.value;
    let matched = false;
    switch (cond.operator) {
      case 'eq': matched = factValue === target; break;
      case 'neq': matched = factValue !== target; break;
      case 'gt': matched = Number(factValue) > Number(target); break;
      case 'gte': matched = Number(factValue) >= Number(target); break;
      case 'lt': matched = Number(factValue) < Number(target); break;
      case 'lte': matched = Number(factValue) <= Number(target); break;
      case 'contains': matched = String(factValue).includes(String(target)); break;
      default: matched = false;
    }
    if (matched) {
      triggered.push({
        ruleId: rule.id,
        name: rule.name,
        recommendation: rule.recommendation,
        evidenceReference: rule.evidence_reference,
        severity: rule.severity,
        reviewedBy: rule.reviewer_credential,
      });
    }
  }

  return { specialty, evaluated: rules.length, triggered };
}

export default {
  createOrderSetDraft, listOrderSets, submitOrderSetForReview, approveOrderSet, retireOrderSet, getLiveOrderSets,
  createDocTemplateDraft, listDocTemplates, submitDocTemplateForReview, approveDocTemplate, retireDocTemplate, getLiveDocTemplates,
  createCdsRuleDraft, listCdsRules, submitCdsRuleForReview, approveCdsRule, retireCdsRule, getLiveCdsRules,
  createPrescriptionTemplateDraft, listPrescriptionTemplates, submitPrescriptionTemplateForReview,
  approvePrescriptionTemplate, retirePrescriptionTemplate, getLivePrescriptionTemplates,
  evaluateCdsRules,
};
