/**
 * Knowledge Router (P4 of CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md)
 * — a dedicated, inspectable stage between "what evidence exists" and "what
 * knowledge to retrieve for it".
 *
 * This reasoning previously lived inline inside
 * imaging-knowledge-base.service.js's retrieval functions (a private
 * extractTags() helper) — real logic, but coupled to retrieval and not
 * independently testable, loggable, or reusable by anything else (a future
 * Fact Checker needs the same "what is this evidence about" answer without
 * needing to run a retrieval query to get it). This extracts that decision
 * into its own named stage, run once, consumed by retrieval and by
 * provenance.
 *
 * Deliberately scoped to what the pipeline actually produces evidence for
 * (ventricles, BraTS tumor subregions) — same discipline as every other
 * piece of real content in this codebase, not a general-purpose anatomy
 * classifier that would silently misroute anatomy it was never built to
 * recognize.
 */

const ANATOMY_TAG_RULES = [
  { match: (name) => name.includes('ventricle'), tag: 'lateral_ventricle', anatomy: 'lateral_ventricle' },
  { match: (name) => name.includes('regionpair'), tag: 'regionpair', anatomy: null },
  { match: (name) => name.includes('whole_tumor'), tag: 'whole_tumor', anatomy: 'brain_parenchyma' },
  { match: (name) => name.includes('tumor_core'), tag: 'tumor_core', anatomy: 'brain_parenchyma' },
  { match: (name) => name.includes('enhancing_tumor'), tag: 'enhancing_tumor', anatomy: 'brain_parenchyma' },
  { match: (name) => name.includes('tumor'), tag: 'tumor', anatomy: 'brain_parenchyma' },
];

/**
 * Derives a routing decision from evidence, before any retrieval runs.
 * `measurements`/`findings` are the same raw arrays every other consumer in
 * this pipeline already uses; `comparisons` is the compiler's own
 * deterministic bilateral-comparison output (imaging-report-compiler.service.js)
 * when available — passing it lets the router name a real derived finding
 * ("lateral_ventricle_asymmetry") instead of only raw anatomy tags.
 */
export function routeEvidence({ modality, bodyRegion, measurements = [], findings = [], comparisons = [] } = {}) {
  const anatomySet = new Set();
  const knowledgeDomains = new Set();
  const findingLabels = new Set();

  for (const m of [...measurements, ...findings]) {
    const name = String(m.structure || m.lesion || m.label || '').toLowerCase();
    for (const rule of ANATOMY_TAG_RULES) {
      if (rule.match(name)) {
        knowledgeDomains.add(rule.tag);
        if (rule.anatomy) anatomySet.add(rule.anatomy);
      }
    }
  }

  for (const c of comparisons) {
    if (c.asymmetric) {
      findingLabels.add(`${c.base_structure}_asymmetry`);
      knowledgeDomains.add(c.base_structure);
    }
  }

  return {
    modality: modality || null,
    bodyRegion: bodyRegion || null,
    anatomy: [...anatomySet],
    findings: [...findingLabels],
    measurementCount: measurements.length,
    comparisonCount: comparisons.length,
    knowledgeDomains: [...knowledgeDomains],
  };
}
