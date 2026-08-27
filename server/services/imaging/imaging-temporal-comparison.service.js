/**
 * Deterministic prior-study fact comparison (item 4, "deterministic clinical
 * reasoning" — the "Context: prior study" input the reviewer's diagram
 * names). imaging-prior-comparison.service.js's compareWithPriorStudies()
 * already exists, but its actual comparison content is an LLM narrative
 * generated from a prior report's free text — no real per-measurement
 * trend, despite the Evidence Graph (item 6) now persisting exactly the
 * structured data (structure name, volume_mm3, draft_id -> study_id) a real
 * comparison needs. This queries that real data instead of asking an LLM
 * to eyeball two report texts.
 *
 * Deliberately simple: match by exact structure name, most recent prior
 * draft only. No attempt at fuzzy/semantic structure matching — a
 * mismatch here would silently compare the wrong things, which is worse
 * than reporting nothing.
 */
import pool from '../../db/pgPool.js';

// >15% change from the prior measurement. An engineering judgment call for
// what counts as a real trend vs. measurement noise — not a clinically
// validated cutoff, same status as _ASYMMETRY_RATIO_THRESHOLD elsewhere in
// this pipeline. Documented as such, not presented as a clinical standard.
const CHANGE_RATIO_THRESHOLD = 1.15;

export async function compareFactsWithPriorStudy({ currentFacts, priorStudyId }) {
  if (!priorStudyId || !currentFacts?.length) return [];

  const { rows: priorFacts } = await pool.query(
    `SELECT ef.structure, ef.volume_mm3, ef.size_mm, ef.certainty, d.created_at
     FROM imaging_evidence_facts ef
     JOIN imaging_ai_report_drafts d ON d.id = ef.draft_id
     WHERE d.study_id = $1
     ORDER BY d.created_at DESC`,
    [priorStudyId],
  );
  if (!priorFacts.length) return [];

  // Keep only the most recent draft's value per structure (a study can have
  // multiple drafts; only the latest is the real "prior" comparison point).
  const priorByStructure = new Map();
  for (const pf of priorFacts) {
    if (!priorByStructure.has(pf.structure)) priorByStructure.set(pf.structure, pf);
  }

  const comparisons = [];
  for (const f of currentFacts) {
    const prior = priorByStructure.get(f.structure);
    if (!prior) continue;
    const currentValue = f.volume_mm3 ?? f.size_mm;
    const priorValue = prior.volume_mm3 ?? prior.size_mm;
    if (currentValue == null || priorValue == null || priorValue <= 0) continue;

    const ratio = currentValue / priorValue;
    let trend;
    if (ratio >= CHANGE_RATIO_THRESHOLD) trend = 'INCREASED';
    else if (ratio <= 1 / CHANGE_RATIO_THRESHOLD) trend = 'DECREASED';
    else trend = 'STABLE';

    comparisons.push({
      fact_id: f.fact_id,
      structure: f.structure,
      current_value: currentValue,
      prior_value: priorValue,
      ratio: Math.round(ratio * 100) / 100,
      trend,
      // A "stable" finding is only as trustworthy as its weaker
      // measurement — carry both certainties so the compiler/QA layer can
      // downgrade a trend claim built on an UNCERTAIN/ABSTAIN prior value.
      current_certainty: f.certainty,
      prior_certainty: prior.certainty,
    });
  }
  return comparisons;
}
