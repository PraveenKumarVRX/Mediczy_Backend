/**
 * Prescribing-time safety service (WP-1.2).
 *
 *   evaluatePrescriptionSafety(input)   PURE: medications + the patient's allergies/medicines/conditions -> items.
 *   checkPrescriptionSafety(input)      loads that context (allergy status, approved drug classes, active medicines, problem
 *                                       list) under the patient's row-level-security context, then evaluates.
 *   prescriptionSafetyGate(...)         Express middleware placed in front of every prescription write path.
 *
 * Each item: { code, type, drug, severity: 'blocker'|'warning', message, evidence, overridable, requiresAcknowledgement }.
 *
 * Modes (per organization, table clinical_safety_settings; default SHADOW):
 *   shadow   compute and log every evaluation, never block. Used for the first weeks to measure alert volume and false
 *            positives with the clinical lead.
 *   enforce  a blocker returns HTTP 409 SAFETY_BLOCK unless the request carries
 *            safetyOverride { reason (>= 10 chars), acknowledgedCodes[] covering every blocker } from a clinical role;
 *            unknown allergy status needs acknowledgement (SAFETY_ACK_REQUIRED). Every override is logged.
 * If the service itself fails: issuing paths fail CLOSED in enforce mode (503), drafts fail open with a visible header.
 * No numeric threshold, class membership or interaction here is a model output: rules are deterministic, class membership
 * comes only from APPROVED knowledge-fabric rows. Not SaMD-AI; it is deterministic clinical decision support.
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import pool from '../db/pgPool.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import { getAllergyStatus } from './allergy.service.js';
import { loadApprovedClasses, resolveGenerics, classesOfGenerics, textNamesClass, normaliseDrugText, pregnancyCategoryOf } from './drug-class.service.js';
import { CRITICAL_INTERACTIONS, DRUG_CONDITION_INTERACTIONS } from './ai-drug-interaction.service.js';

const OVERRIDE_MIN_REASON = 10;
const NON_DRUG_ALLERGENS = new Set(['food', 'environmental', 'latex']);

const item = (code, type, drug, severity, message, evidence = null, extra = {}) => ({ code, type, drug, severity, message, evidence, overridable: true, requiresAcknowledgement: false, ...extra });

const medName = (m) => String(typeof m === 'string' ? m : (m?.name || m?.medicineName || m?.medicine || m?.drug || m?.drugName || m?.drug_name || '')).trim();

/** Parse a dose string into { value, unit } (first number + unit) or null. */
export function parseDose(text) {
  const m = String(text ?? '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(mcg|µg|mg|g|gm|ml|iu|units?)\b/);
  return m ? { value: Number(m[1]), unit: m[2] === 'gm' ? 'g' : m[2] === 'µg' ? 'mcg' : m[2] } : null;
}

/** Does this allergy (already known active) match a drug's generics/classes? Returns { kind, evidence } or null. */
export function matchAllergy(allergy, drug, classes) {
  if (NON_DRUG_ALLERGENS.has(allergy.allergen_type)) return null;
  const allergen = normaliseDrugText(allergy.allergen_name);
  if (!allergen || allergen.length < 3) return null;
  const allergenGenerics = resolveGenerics(allergy.allergen_name);
  const drugGenerics = drug.generics;

  // 1. the same substance (a generic or a brand that resolves to it)
  const word = new RegExp(`(^|[ +/-])${allergen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[ +/-])`);
  const sameSubstance = drugGenerics.some((g) => allergenGenerics.includes(g) || (allergen.length >= 4 && word.test(g)));
  if (sameSubstance) return { kind: 'exact', evidence: `${allergy.allergen_name} (recorded allergy) is the same substance as ${drug.name}` };

  // 2. the same class, from APPROVED class definitions (or the class recorded on the allergy itself)
  const allergyClasses = new Set([...classesOfGenerics([...allergenGenerics, allergen], classes), ...classes.filter((c) => textNamesClass(allergy.allergen_name, c)).map((c) => c.classKey), ...(allergy.drug_class ? [String(allergy.drug_class).toLowerCase()] : [])]);
  const shared = drug.classes.filter((c) => allergyClasses.has(c));
  if (shared.length) return { kind: 'class', evidence: `${drug.name} is in the ${shared[0]} class; the patient is allergic to ${allergy.allergen_name} (${[...allergyClasses][0] || shared[0]} class)` };

  // 3. cross-reaction between classes (approved definitions) -> a warning, not a block
  for (const a of allergyClasses) {
    const def = classes.find((c) => c.classKey === a);
    const cross = def?.crossReactsWith?.find((x) => drug.classes.includes(x));
    if (cross) return { kind: 'cross', evidence: `${drug.name} is in the ${cross} class, which can cross-react with a ${a} allergy (${allergy.allergen_name})` };
  }
  return null;
}

/** PURE. See the file header for the item shape. */
export function evaluatePrescriptionSafety({ medications = [], allergyStatus = 'unknown', allergies = [], classes = [], currentMedications = [], conditions = [], pregnant = false }) {
  const items = [];
  const drugs = medications.map((m) => ({ raw: m, name: medName(m), generics: resolveGenerics(medName(m)) })).filter((d) => d.name);
  // A medicine with no usable name cannot be checked at all. Passing it silently would look like coverage while checking
  // nothing (the pharmacy path carries only a medicineId that has to be resolved to a name), so it is a blocker.
  const unnamed = medications.length - drugs.length;
  if (unnamed > 0) items.push(item('DRUG_UNRESOLVED', 'system', null, 'blocker', `${unnamed} medicine(s) on this prescription have no name, so they could not be checked for allergies, interactions or duplicates.`, 'Medicine name missing or could not be resolved'));
  for (const d of drugs) d.classes = classesOfGenerics(d.generics, classes);
  const current = currentMedications.map((n) => ({ name: String(n), generics: resolveGenerics(String(n)) })).filter((d) => d.name);

  // ── allergies ──
  if (allergyStatus === 'lookup_failed') {
    items.push(item('ALLERGY_LOOKUP_FAILED', 'allergy', null, 'blocker', 'Allergy status could not be checked, so this prescription cannot be verified. Check the patient directly, then override with a reason.', 'The allergy lookup failed'));
  } else if (allergyStatus === 'unknown') {
    items.push(item('ALLERGY_STATUS_UNKNOWN', 'allergy', null, 'warning', 'No allergy status is recorded for this patient (unknown, not "none"). Ask the patient and record it, or acknowledge that you have checked.', 'No allergy or no-known-allergy record', { requiresAcknowledgement: true }));
  }
  for (const d of drugs) {
    for (const a of allergies) {
      const m = matchAllergy(a, d, classes);
      if (!m) continue;
      const sev = a.severity && a.severity !== 'UNKNOWN' ? ` (${String(a.severity).toLowerCase().replace('_', ' ')}${a.reaction_type ? `, ${a.reaction_type}` : ''})` : (a.reaction_type ? ` (${a.reaction_type})` : '');
      if (m.kind === 'cross') items.push(item('ALLERGY_CROSS_REACTION', 'allergy', d.name, 'warning', `Possible cross-reaction: ${m.evidence}${sev}.`, m.evidence));
      else items.push(item('ALLERGY_MATCH', 'allergy', d.name, 'blocker', `Documented allergy: ${m.evidence}${sev}.`, m.evidence));
    }
  }

  // ── interactions (pairs with at least one new drug) ──
  const seenPair = new Set();
  const hay = (d) => `${d.name.toLowerCase()} ${d.generics.join(' ')}`;
  const pairs = [];
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) pairs.push([drugs[i], drugs[j]]);
    for (const c of current) pairs.push([drugs[i], c]);
  }
  for (const [x, y] of pairs) {
    for (const rule of CRITICAL_INTERACTIONS) {
      const hx = hay(x); const hy = hay(y);
      if ((rule.drug1.test(hx) && rule.drug2.test(hy)) || (rule.drug1.test(hy) && rule.drug2.test(hx))) {
        const key = [x.name, y.name].sort().join('|') + rule.effect;
        if (seenPair.has(key)) continue; seenPair.add(key);
        items.push(item('INTERACTION', 'interaction', `${x.name} + ${y.name}`, rule.severity === 'contraindicated' ? 'blocker' : 'warning',
          `${rule.severity === 'contraindicated' ? 'Contraindicated combination' : `${rule.severity[0].toUpperCase()}${rule.severity.slice(1)} interaction`}: ${x.name} with ${y.name}. ${rule.effect}`, rule.effect, { severityLevel: rule.severity }));
      }
    }
  }

  // ── drug-condition ──
  const conditionTexts = conditions.map((c) => String(c));
  for (const d of drugs) {
    for (const rule of DRUG_CONDITION_INTERACTIONS) {
      if (!rule.drug.test(hay(d))) continue;
      const cond = conditionTexts.find((c) => rule.condition.test(c));
      if (cond) items.push(item('DRUG_CONDITION', 'drug-condition', d.name, rule.severity === 'contraindicated' ? 'blocker' : 'warning', `${d.name} with a recorded problem "${cond}": ${rule.effect}`, rule.effect, { severityLevel: rule.severity }));
    }
  }

  // ── duplicate therapy ──
  const actives = (d) => d.generics.filter((g) => g.length >= 4);
  for (let i = 0; i < drugs.length; i++) {
    const others = [...drugs.slice(i + 1), ...current];
    for (const o of others) {
      const shared = actives(drugs[i]).find((g) => actives(o).includes(g));
      if (shared) items.push(item('DUPLICATE_THERAPY', 'duplicate', drugs[i].name, 'blocker', `Duplicate therapy: ${drugs[i].name} and ${o.name} both contain ${shared}.`, `Shared active: ${shared}`));
    }
  }

  // ── pregnancy ──
  if (pregnant) {
    for (const d of drugs) {
      const cat = pregnancyCategoryOf(d.name);
      if (cat === 'X') items.push(item('PREGNANCY_CONTRAINDICATED', 'pregnancy', d.name, 'blocker', `${d.name} is pregnancy category X (contraindicated) and the patient is pregnant.`, 'Catalogue pregnancy category X'));
      else if (cat === 'D') items.push(item('PREGNANCY_CAUTION', 'pregnancy', d.name, 'warning', `${d.name} is pregnancy category D (evidence of fetal risk) and the patient is pregnant.`, 'Catalogue pregnancy category D'));
    }
  }

  // ── dose sanity (extreme values only) ──
  for (const d of drugs) {
    const dosageText = typeof d.raw === 'object' ? (d.raw.dosage || d.raw.dose || '') : '';
    if (typeof d.raw === 'object' && !String(dosageText).trim()) { items.push(item('DOSE_MISSING', 'dose', d.name, 'warning', `No dose recorded for ${d.name}.`)); continue; }
    const dose = parseDose(dosageText);
    if (!dose) continue;
    const mg = dose.unit === 'g' ? dose.value * 1000 : dose.unit === 'mcg' ? dose.value / 1000 : dose.unit === 'mg' ? dose.value : null;
    if (dose.value <= 0) items.push(item('DOSE_EXTREME', 'dose', d.name, 'blocker', `The dose "${dosageText}" for ${d.name} is not valid.`, 'Zero or negative dose'));
    else if (mg !== null && mg > 5000) items.push(item('DOSE_EXTREME', 'dose', d.name, 'blocker', `The single dose "${dosageText}" for ${d.name} is above 5 g and looks like an entry error.`, 'Single dose above 5000 mg'));
  }
  return items;
}

export const splitItems = (items) => ({ blockers: items.filter((i) => i.severity === 'blocker'), warnings: items.filter((i) => i.severity === 'warning') });

/** Loads the context under the patient's own RLS context. */
async function loadContext(patientId, organizationId) {
  const userId = Number(patientId);
  return sequelize.transaction(async (transaction) => {
    await setRlsContext(transaction, { orgId: organizationId || 0, userId, isPlatformAdmin: false });
    const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
    const meds = await q(`SELECT drug_name FROM patient_medications WHERE user_id = :userId AND upper(status) = 'ACTIVE'`, { userId });
    const orders = await q(`SELECT drug_name FROM medication_orders WHERE patient_id = :userId AND lower(order_status::text) = 'active'`, { userId });
    const conds = await q(`SELECT condition_name FROM patient_conditions WHERE user_id = :userId AND upper(status) IN ('ACTIVE','MONITORING')`, { userId });
    return {
      currentMedications: [...new Set([...meds.map((m) => m.drug_name), ...orders.map((m) => m.drug_name)].filter(Boolean))],
      conditions: conds.map((c) => c.condition_name).filter(Boolean),
    };
  });
}

export async function checkPrescriptionSafety({ patientId, organizationId = null, medications = [], pregnant }) {
  const started = Date.now();
  let status = { status: 'unknown', allergies: [] };
  try { status = await getAllergyStatus(patientId, organizationId); } catch (e) { console.error('[safety] allergy lookup failed:', e.message); status = { status: 'lookup_failed', allergies: [] }; }
  let classes = [];
  try { classes = await loadApprovedClasses(); } catch (e) { console.error('[safety] drug-class load failed:', e.message); }
  let ctx = { currentMedications: [], conditions: [] }; let contextIncomplete = false;
  try { ctx = await loadContext(patientId, organizationId); } catch (e) { console.error('[safety] context load failed:', e.message); contextIncomplete = true; }
  const isPregnant = pregnant ?? ctx.conditions.some((c) => /pregnan/i.test(c));
  const items = evaluatePrescriptionSafety({ medications, allergyStatus: status.status, allergies: status.allergies, classes, currentMedications: ctx.currentMedications, conditions: ctx.conditions, pregnant: isPregnant });
  if (contextIncomplete) items.push(item('CONTEXT_INCOMPLETE', 'system', null, 'warning', 'Current medicines and problems could not be loaded, so interaction and duplicate checks may be incomplete.'));
  const { blockers, warnings } = splitItems(items);
  return {
    blockers, warnings, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started,
    allergyStatus: status.status,
    sources: { allergies: status.allergies.length, approvedDrugClasses: classes.length, currentMedications: ctx.currentMedications.length, problems: ctx.conditions.length },
  };
}

// ── settings + audit log ──────────────────────────────────────────────────────
// Organization 0 is the settings row for clinicians who practise outside any organization.
const orgKey = (o) => Number(o) || 0;
const modeCache = new Map();
export async function getSafetyMode(organizationId) {
  organizationId = orgKey(organizationId);
  const hit = modeCache.get(organizationId);
  if (hit && Date.now() - hit.at < 30000) return hit.mode;
  let mode = 'shadow';
  try { const { rows } = await pool.query(`SELECT mode FROM clinical_safety_settings WHERE organization_id = $1`, [organizationId]); if (rows[0]) mode = rows[0].mode; } catch { /* table absent: shadow */ }
  modeCache.set(organizationId, { mode, at: Date.now() });
  return mode;
}
export async function setSafetyMode(organizationId, mode, updatedBy = null) {
  if (!['shadow', 'enforce'].includes(mode)) throw new Error("mode must be 'shadow' or 'enforce'");
  organizationId = orgKey(organizationId);
  await pool.query(`INSERT INTO clinical_safety_settings (organization_id, mode, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
    ON CONFLICT (organization_id) DO UPDATE SET mode = EXCLUDED.mode, updated_by = EXCLUDED.updated_by, updated_at = NOW()`, [organizationId, mode, updatedBy]);
  modeCache.delete(organizationId);
  return { organizationId, mode };
}

export async function reconciliationRequired(organizationId) {
  try {
    const { rows } = await pool.query('SELECT reconciliation_required FROM clinical_safety_settings WHERE organization_id = $1', [organizationId]);
    return rows[0] ? rows[0].reconciliation_required !== false : true;
  } catch {
    return true;
  }
}

export async function setReconciliationRequired(organizationId, required, updatedBy = null) {
  await pool.query(
    `INSERT INTO clinical_safety_settings (organization_id, mode, reconciliation_required, updated_by, updated_at)
     VALUES ($1,'shadow',$2,$3,NOW())
     ON CONFLICT (organization_id) DO UPDATE SET reconciliation_required = EXCLUDED.reconciliation_required, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [organizationId, !!required, updatedBy]
  );
  return { organizationId, reconciliationRequired: !!required };
}

export async function logSafetyEvaluation(args) { return logEvaluation(args); }
async function logEvaluation({ organizationId, patientId, actorId, source, mode, outcome, blockers = [], warnings = [], overrideReason = null, acknowledged = null, allergyStatus = null, latencyMs = null }) {
  try {
    await pool.query(`INSERT INTO prescription_safety_log (organization_id, patient_id, actor_id, source, mode, outcome, blockers, warnings, override_reason, acknowledged, allergy_status, latency_ms)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12)`,
      [orgKey(organizationId), patientId, actorId, source, mode, outcome, JSON.stringify(blockers.map(({ code, drug, message }) => ({ code, drug, message }))), JSON.stringify(warnings.map(({ code, drug, message }) => ({ code, drug, message }))), overrideReason, acknowledged ? JSON.stringify(acknowledged) : null, allergyStatus, latencyMs]);
  } catch (e) { console.error('[safety] log failed:', e.message); }
}

/** Dashboard for the medical director: alert volume, override ratio, top codes. */
export async function safetyDashboard(organizationId, days = 30) {
  const since = `NOW() - ($2 || ' days')::interval`;
  organizationId = orgKey(organizationId);
  const p = [organizationId, String(Math.min(Math.max(Number(days) || 30, 1), 365))];
  const totals = (await pool.query(`SELECT outcome, mode, count(*)::int AS n FROM prescription_safety_log WHERE organization_id = $1 AND created_at > ${since} GROUP BY 1, 2`, p)).rows;
  const top = (await pool.query(`SELECT b->>'code' AS code, count(*)::int AS n FROM prescription_safety_log l, LATERAL jsonb_array_elements(l.blockers || l.warnings) b WHERE l.organization_id = $1 AND l.created_at > ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p)).rows;
  const sum = (f) => totals.filter(f).reduce((s, r) => s + r.n, 0);
  const evaluated = sum(() => true); const blocked = sum((r) => r.outcome === 'blocked'); const overridden = sum((r) => r.outcome === 'overridden');
  return { days: Number(p[1]), mode: await getSafetyMode(organizationId), evaluated, clean: sum((r) => r.outcome === 'clean'), withWarnings: sum((r) => r.outcome === 'warnings'), blocked, overridden, errors: sum((r) => r.outcome === 'error'),
    overrideRatio: blocked + overridden ? overridden / (blocked + overridden) : 0, topCodes: top };
}

// ── gate middleware ───────────────────────────────────────────────────────────
export const orgOfRequest = (req) => Number(req.hospitalOrgId ?? req.user?.organization_id ?? req.doctor?.organization_id ?? req.doctor?.organizationId ?? req.user?.tenant_id ?? req.tenantId ?? 0) || null;
const actorOfRequest = (req) => Number(req.doctor?.id ?? req.user?.id ?? req.userId ?? 0) || null;
const CLINICAL_ROLES = new Set(['doctor', 'nurse', 'hospital_admin', 'medical_director', 'admin', 'super_admin', 'consultant', 'pharmacist']);
const isClinical = (req) => Boolean(req.doctor) || CLINICAL_ROLES.has(String(req.user?.role ?? req.userRole ?? '').toLowerCase());

/**
 * Wraps a prescription write path.
 *   extract(req) -> { patientId, medications, pregnant? } | null   (null = nothing to check on this request)
 *   { issuing }  -> only an issuing path can be blocked in enforce mode, and it fails CLOSED if the service itself errors.
 *                   Draft paths (create/update) evaluate and log so the writer sees alerts, but are never blocked.
 */
export const prescriptionSafetyGate = (source, extract, { issuing = false } = {}) => async (req, res, next) => {
  let ctx = null; let extractFailed = false;
  try { ctx = await extract(req); } catch (e) { extractFailed = true; console.error(`[safety:${source}] extract failed:`, e.message); }
  const organizationId = orgOfRequest(req); const actorId = actorOfRequest(req);
  if (extractFailed) {
    // Could not even work out WHAT is being prescribed. On an issuing path in enforce mode that must fail closed, exactly
    // like a failed check — silently skipping the gate would let the prescription through unchecked.
    const failMode = await getSafetyMode(organizationId);
    await logEvaluation({ organizationId, patientId: null, actorId, source, mode: failMode, outcome: 'error' });
    if (failMode === 'enforce' && issuing) return res.status(503).json({ success: false, code: 'SAFETY_UNAVAILABLE', message: 'The safety check could not be completed, so this prescription cannot be issued right now. Try again, or contact IT.' });
    res.setHeader('X-Safety-Check', 'unavailable');
    return next();
  }
  if (!ctx || !ctx.patientId || !Array.isArray(ctx.medications) || ctx.medications.length === 0) return next();
  const mode = await getSafetyMode(organizationId);
  let result;
  try {
    result = await checkPrescriptionSafety({ patientId: ctx.patientId, organizationId, medications: ctx.medications, pregnant: ctx.pregnant });
  } catch (e) {
    console.error(`[safety:${source}] check failed:`, e.message);
    await logEvaluation({ organizationId, patientId: Number(ctx.patientId) || null, actorId, source, mode, outcome: 'error' });
    if (mode === 'enforce' && issuing) return res.status(503).json({ success: false, code: 'SAFETY_UNAVAILABLE', message: 'The safety check could not be completed, so this prescription cannot be issued right now. Try again, or contact IT.' });
    res.setHeader('X-Safety-Check', 'unavailable');
    return next();
  }
  const { blockers, warnings } = result;
  const base = { organizationId, patientId: Number(ctx.patientId), actorId, source, mode, blockers, warnings, allergyStatus: result.allergyStatus, latencyMs: result.latencyMs };
  req.safetyCheck = result;
  res.setHeader('X-Safety-Mode', mode);
  if (mode === 'shadow') {
    await logEvaluation({ ...base, outcome: blockers.length ? 'blocked' : warnings.length ? 'warnings' : 'clean' });
    if (blockers.length) res.setHeader('X-Safety-Shadow-Blockers', String(blockers.length));
    return next();
  }

  // enforce. A draft is a working document: it is evaluated and logged so the writer sees the alerts (dry-run endpoint,
  // response headers), but only paths that ISSUE a prescription can be blocked.
  if (!issuing) {
    await logEvaluation({ ...base, outcome: blockers.length || warnings.length ? 'warnings' : 'clean' });
    if (blockers.length) res.setHeader('X-Safety-Blockers', String(blockers.length));
    return next();
  }
  const ov = req.body?.safetyOverride || {};
  const ack = new Set(Array.isArray(ov.acknowledgedCodes) ? ov.acknowledgedCodes.map(String) : []);
  const pendingAck = warnings.filter((w) => w.requiresAcknowledgement && !ack.has(w.code));
  if (blockers.length) {
    const reason = String(ov.reason ?? '').trim();
    const covered = blockers.every((b) => ack.has(b.code));
    if (!(reason.length >= OVERRIDE_MIN_REASON && covered && isClinical(req))) {
      await logEvaluation({ ...base, outcome: 'blocked' });
      return res.status(409).json({ success: false, code: 'SAFETY_BLOCK', message: 'This prescription has safety blockers. Review them, or override with a reason.', blockers, warnings, overrideRequires: { reasonMinLength: OVERRIDE_MIN_REASON, acknowledgedCodes: [...new Set(blockers.map((b) => b.code))] } });
    }
    await logEvaluation({ ...base, outcome: 'overridden', overrideReason: reason, acknowledged: [...ack] });
    return next();
  }
  if (pendingAck.length) {
    await logEvaluation({ ...base, outcome: 'blocked' });
    return res.status(409).json({ success: false, code: 'SAFETY_ACK_REQUIRED', message: 'Please acknowledge the warnings below to continue.', blockers: [], warnings, requiresAcknowledgement: pendingAck.map((w) => w.code) });
  }
  await logEvaluation({ ...base, outcome: warnings.length ? 'warnings' : 'clean', acknowledged: ack.size ? [...ack] : null });
  return next();
};
