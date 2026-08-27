/**
 * Clinical Reasoning Engine (item 5) — deterministic rules over the compiled
 * Clinical Fact Model (imaging-report-compiler.service.js), evaluated
 * BEFORE the LLM renders anything. Same declarative convention as this
 * codebase's other rule engines (lab-rule-engine.service.js).
 *
 * A matched rule routes to a "pathway": a real, bounded set of differential
 * considerations plus an explicit list of conclusions the pipeline is NOT
 * allowed to draw from this evidence alone (e.g. ventricular asymmetry
 * alone cannot support "hydrocephalus" — that needs periventricular signal
 * or sulcal-effacement evidence this pipeline doesn't measure).
 *
 * Only two rules exist because only two real evidence patterns exist in
 * this pipeline today (mri_unest_adapter.py's bilateral ventricle
 * comparison, mri_brats_adapter.py's tumor-subregion flag) — adding rules
 * for pathologies nothing here actually detects would be exactly the kind
 * of fabricated coverage this whole session has been built against.
 *
 * differentials come from imaging-knowledge-base.service.js's SEED_ROWS
 * (item 8) — imported, not duplicated, so the rule's differentials and the
 * KB row's differentials can't silently drift apart.
 */
import { SEED_ROWS as KB_SEED_ROWS } from './imaging-knowledge-base.service.js';

function kbDifferentials(canonicalId) {
  return KB_SEED_ROWS.find((r) => r.canonicalId === canonicalId)?.differentials || [];
}

export const RULES = [
  {
    id: 'MRI-BRAIN-VENT-001',
    name: 'Lateral ventricle asymmetry',
    // Returns the triggering comparison_id(s), not just a boolean — the
    // Evidence Graph (imaging-evidence-graph.service.js) needs a real link
    // from a matched rule back to the specific comparison that triggered
    // it, not just "some rule matched somewhere in this draft".
    match: (model) =>
      model.comparisons.filter((c) => c.base_structure === 'lateral_ventricle' && c.asymmetric).map((c) => c.comparison_id),
    pathway: 'ventricular_asymmetry',
    differentials: kbDifferentials('PATH-BRAIN-VENTRICULAR-ASYMMETRY'),
    // These require evidence this pipeline does not currently measure
    // (periventricular signal, sulcal effacement, a co-located mass
    // finding) — a volume-ratio comparison alone cannot support them.
    prohibitedInferences: ['hydrocephalus', 'mass effect', 'obstruction', 'obstructive'],
    guideline: 'See knowledge base PATH-BRAIN-VENTRICULAR-ASYMMETRY',
  },
  {
    id: 'MRI-BRAIN-TUMOR-001',
    name: 'BraTS tumor subregion flagged',
    match: (model) =>
      model.findings.filter((f) => f.kind === 'lesion' && String(f.structure).includes('tumor') && f.certainty !== 'NEGATIVE').map((f) => f.fact_id),
    pathway: 'tumor_flag',
    differentials: kbDifferentials('PATH-BRAIN-TUMOR-BRATS-SUBREGIONS'),
    // Subregion segmentation alone cannot grade or type a tumor, or
    // determine malignancy — that needs histology/further imaging this
    // pipeline has no access to.
    prohibitedInferences: ['grade', 'malignant', 'malignancy', 'benign', 'glioblastoma', 'stage'],
    guideline: 'See knowledge base PATH-BRAIN-TUMOR-BRATS-SUBREGIONS',
  },
];

const PEDIATRIC_AGE_CUTOFF = 18;

/** Resolves a rule's triggeredBy ids (a mix of comparison_ids and fact_ids
 * depending on the rule) down to the underlying fact_ids — needed to check
 * which temporal-comparison entries (keyed by fact_id) are actually
 * relevant to this specific match. */
function resolveToFactIds(triggeredBy, model) {
  const factIds = new Set();
  for (const id of triggeredBy) {
    if (id.startsWith('F-') || id.startsWith('N-')) {
      factIds.add(id);
      continue;
    }
    const comp = model.comparisons.find((c) => c.comparison_id === id);
    if (comp) {
      factIds.add(comp.left.fact_id);
      factIds.add(comp.right.fact_id);
    }
  }
  return factIds;
}

/**
 * Evaluate every rule against a compiled Clinical Fact Model, now with real
 * patient context (item 4 — the reviewer's diagram named "Context: age /
 * symptoms / mass effect / prior study" as a reasoning input the pipeline
 * was computing but never using). `ageYears` is the same real value
 * fetch_patient_age_years() already computes for the applicability gate;
 * `temporalComparisons` is imaging-temporal-comparison.service.js's real
 * Evidence-Graph-backed prior/current delta, not an LLM guess.
 *
 * Both produce contextNotes attached to the matched rule — framing
 * information for the report, never a claim the context alone proves
 * (a STABLE trend is "more supportive of a benign variant", never "is
 * benign" — that determination stays the radiologist's).
 */
export function evaluateClinicalRules(model, context = {}) {
  const { ageYears = null, temporalComparisons = [] } = context;
  const matched = [];
  for (const rule of RULES) {
    const triggeredBy = rule.match(model);
    if (triggeredBy && triggeredBy.length) {
      const contextNotes = [];

      if (ageYears != null && ageYears < PEDIATRIC_AGE_CUTOFF) {
        contextNotes.push(
          `Patient age ~${ageYears}y (pediatric) — this segmentation model's own documentation states no ` +
          `validated training population, so measurement reliability for a pediatric patient is unverified, ` +
          `not confirmed safe or unsafe.`,
        );
      }

      const relevantFactIds = resolveToFactIds(triggeredBy, model);
      for (const t of temporalComparisons) {
        if (!relevantFactIds.has(t.fact_id)) continue;
        const structureLabel = t.structure.replace(/_/g, ' ');
        contextNotes.push(
          `Prior study comparison: ${structureLabel} was ${t.prior_value} (now ${t.current_value}), ` +
          `ratio ${t.ratio}x, trend=${t.trend}. A STABLE trend across studies is more supportive of a benign ` +
          `or developmental variant; an INCREASED trend warrants closer attention — this is contextual framing, ` +
          `not a diagnosis, and the prior value's own certainty was ${t.prior_certainty || 'not recorded'}.`,
        );
      }

      matched.push({
        ruleId: rule.id,
        name: rule.name,
        pathway: rule.pathway,
        differentials: rule.differentials,
        prohibitedInferences: rule.prohibitedInferences,
        guideline: rule.guideline,
        triggeredBy, // comparison_id(s) or fact_id(s), depending on the rule
        contextNotes,
      });
    }
  }
  return matched;
}

export function formatClinicalRulesForPrompt(matchedRules) {
  if (!matchedRules.length) return '';
  const lines = ['', 'CLINICAL REASONING PATHWAYS (deterministic — matched before you were called):'];
  for (const r of matchedRules) {
    lines.push(
      `- Pathway "${r.pathway}" (${r.ruleId}): differentials to consider — ${r.differentials.join(', ')}. ` +
      `DO NOT conclude or state any of the following — ${r.prohibitedInferences.join(', ')} — this evidence alone does not support them.`,
    );
    for (const note of r.contextNotes || []) {
      lines.push(`  CONTEXT: ${note}`);
    }
  }
  return lines.join('\n');
}
