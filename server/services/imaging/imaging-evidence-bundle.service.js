/**
 * Evidence Bundle (P2 of CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md)
 * — the exact contract named in the roadmap:
 *
 *   { study_context, anatomy, findings, measurements, comparisons,
 *     knowledge_evidence, guidelines, uncertainties, prohibited_inferences }
 *
 * Not a new network service (no POST /clinical-evidence/build endpoint) —
 * everything runs in-process today, and standing up a separate HTTP
 * boundary for data that's already computed in the same request would be
 * exactly the premature microservice-on-day-1 mistake the master
 * architecture doc's own §42 warns against. This is the same data
 * (imaging-report-compiler.service.js's Clinical Fact Model,
 * imaging-knowledge-router.service.js's routing decision, the retrieved KB
 * rows, the matched clinical rules) reshaped into the roadmap's named
 * contract — a real, versioned, stable shape other consumers (a future
 * Fact Checker, a FHIR mapper, an external API) can depend on, instead of
 * reaching into the compiler's internal object shape directly.
 */

/** Every finding/comparison whose certainty isn't a confident POSITIVE
 * belongs in `uncertainties` — the roadmap's own explicit field for facts
 * the pipeline could not confidently assert either way. */
const CONFIDENT_STATES = new Set(['POSITIVE', 'NEGATIVE']);

export function buildEvidenceBundle({ clinicalFactModel, routingDecision, knowledgeRows = [], matchedRules = [], realGuidelines = [] }) {
  const anatomy = (routingDecision?.anatomy || []).map((id) => ({ anatomy_id: id }));

  const findings = clinicalFactModel.narrative_items.map((n) => ({
    finding_id: n.fact_id,
    label: n.label,
    present: n.present,
    severity: n.severity,
    evidence_type: 'metadata',
  })).concat(
    (routingDecision?.findings || []).map((label, idx) => ({
      finding_id: `RF-${idx + 1}`,
      label,
      present: true,
      severity: 'medium',
      evidence_type: 'pixel_analysis',
    })),
  );

  const measurements = clinicalFactModel.findings.map((f) => ({
    fact_id: f.fact_id,
    structure: f.structure,
    kind: f.kind,
    value: f.volume_mm3 ?? f.size_mm,
    unit: f.volume_mm3 != null ? 'mm3' : (f.size_mm != null ? 'mm' : null),
    certainty: f.certainty,
    confidence: f.confidence,
    evidence_type: 'pixel_analysis',
  }));

  const comparisons = clinicalFactModel.comparisons.map((c) => ({
    comparison_id: c.comparison_id,
    type: c.type,
    subject: c.base_structure,
    left: c.left,
    right: c.right,
    ratio: c.ratio,
    asymmetric: c.asymmetric,
  }));

  const knowledge_evidence = knowledgeRows.map((r) => ({
    kb_id: r.canonical_id,
    kind: r.kind,
    preferred_name: r.preferred_name,
    source_title: r.source_title,
    source_url: r.source_url,
    source_type: r.source_type,
    retrieved_at: r.retrieved_at,
    // Real when hybridRetrieveKnowledge ran (item 7's merged_score); absent
    // for the plain tag-match path — never fabricated as 1.0.
    retrieval_score: r.merged_score ?? null,
  }));

  // P8 — a matched pathway may have a real, versioned guideline object
  // (imaging-guidelines.service.js) — used when one exists; falls back to
  // the rule's own informal "See knowledge base ..." pointer when it
  // doesn't, rather than fabricating a citation for pathways with no
  // precisely-matching real guideline (see that service's own docstring).
  const guidelines = matchedRules.map((r) => {
    const real = realGuidelines.filter((g) => g.pathway === r.pathway);
    if (real.length) {
      return real.map((g) => ({
        pathway: r.pathway, rule_id: r.ruleId, guideline_id: g.guideline_id, title: g.title,
        organization: g.organization, version: g.version, publication_date: g.publication_date,
        review_status: g.review_status, source_url: g.source_url, summary: g.summary,
      }));
    }
    return r.guideline ? [{ pathway: r.pathway, rule_id: r.ruleId, reference: r.guideline }] : [];
  }).flat();

  const uncertainties = [
    ...clinicalFactModel.findings
      .filter((f) => !CONFIDENT_STATES.has(f.certainty))
      .map((f) => ({ subject: f.structure, certainty: f.certainty, reason: f.certainty_reason })),
    ...clinicalFactModel.impression
      .filter((s) => !CONFIDENT_STATES.has(s.certainty))
      .map((s) => ({ subject: s.subject, certainty: s.certainty, statement_type: s.statement_type })),
  ];

  const prohibited_inferences = matchedRules.flatMap((r) =>
    (r.prohibitedInferences || []).map((term) => ({ pathway: r.pathway, rule_id: r.ruleId, term })),
  );

  return {
    study_context: {
      modality: clinicalFactModel.study.modality,
      body_region: clinicalFactModel.study.body_region,
      analysis_status: clinicalFactModel.analysis_status?.status || null,
    },
    anatomy,
    findings,
    measurements,
    comparisons,
    knowledge_evidence,
    guidelines,
    uncertainties,
    prohibited_inferences,
  };
}
