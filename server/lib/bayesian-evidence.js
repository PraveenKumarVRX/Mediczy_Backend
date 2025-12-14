const SECTION_GROUPS = {
  demographics: ['demographics'],
  lifestyle: ['lifestyle', 'substance'],
  metabolic: ['physical', 'medical', 'examination'],
  mental: ['mental'],
  family: ['family'],
  occupational: ['occupational']
};

const EVIDENCE_LABELS = {
  demographics: 'Age & Baseline Factors',
  lifestyle: 'Lifestyle & Substance Use',
  metabolic: 'Clinical & Metabolic Load',
  mental: 'Mental Health Stability',
  family: 'Family History',
  occupational: 'Occupational Exposure'
};

const clampRatio = (value) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const classifyEvidenceState = (ratio) => {
  if (ratio <= 0.33) return 'protective';
  if (ratio <= 0.66) return 'neutral';
  return 'adverse';
};

const aggregateSections = (sectionIds = [], breakdownLookup = new Map()) => {
  return sectionIds.reduce(
    (acc, id) => {
      const section = breakdownLookup.get(id);
      if (!section) return acc;
      return {
        score: acc.score + (section.weightedScore || 0),
        max: acc.max + (section.maxScore || 0)
      };
    },
    { score: 0, max: 0 }
  );
};

export const buildBayesianEvidence = (sectionBreakdown = []) => {
  const lookup = new Map(sectionBreakdown.map((entry) => [entry.id, entry]));

  return Object.entries(SECTION_GROUPS)
    .map(([node, sections]) => {
      const aggregation = aggregateSections(sections, lookup);
      const ratio = aggregation.max === 0 ? 0 : clampRatio(aggregation.score / aggregation.max);
      return {
        node,
        label: EVIDENCE_LABELS[node] || node,
        sections,
        ratio,
        state: classifyEvidenceState(ratio)
      };
    })
    .filter((entry) => entry.sections.length > 0);
};

export const deriveEvidenceStates = (sectionBreakdown = []) => {
  const evidence = buildBayesianEvidence(sectionBreakdown);
  const states = evidence.reduce((acc, entry) => {
    acc[entry.node] = entry.state;
    return acc;
  }, {});
  return { evidence, states };
};
