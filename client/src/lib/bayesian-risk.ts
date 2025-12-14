import { RiskCategoryId, SectionBreakdown } from './health-risk';

export type EvidenceNode =
  | 'demographics'
  | 'lifestyle'
  | 'metabolic'
  | 'mental'
  | 'family'
  | 'occupational';

export type EvidenceState = 'protective' | 'neutral' | 'adverse';
export type PosteriorState = 'low' | 'elevated' | 'critical';

export interface BayesianEvidence {
  node: EvidenceNode;
  label: string;
  sections: RiskCategoryId[];
  ratio: number;
  state: EvidenceState;
}

export interface BayesianRiskResult {
  posterior: Record<PosteriorState, number>;
  prediction: PosteriorState;
  confidence: number;
  summary: string;
  recommendedAction: string;
  estimatedScore: number;
  alerts: BayesianEvidence[];
  evidence: BayesianEvidence[];
}

const SECTION_GROUPS: Record<EvidenceNode, RiskCategoryId[]> = {
  demographics: ['demographics'],
  lifestyle: ['lifestyle', 'substance'],
  metabolic: ['physical', 'medical', 'examination'],
  mental: ['mental'],
  family: ['family'],
  occupational: ['occupational'],
};

const EVIDENCE_LABELS: Record<EvidenceNode, string> = {
  demographics: 'Age & Baseline Factors',
  lifestyle: 'Lifestyle & Substance Use',
  metabolic: 'Clinical & Metabolic Load',
  mental: 'Mental Health Stability',
  family: 'Family History',
  occupational: 'Occupational Exposure',
};

const PRIOR: Record<PosteriorState, number> = {
  low: 0.48,
  elevated: 0.35,
  critical: 0.17,
};

const RISK_LIKELIHOODS: Record<
  EvidenceNode,
  Record<EvidenceState, Record<PosteriorState, number>>
> = {
  demographics: {
    protective: { low: 0.82, elevated: 0.15, critical: 0.03 },
    neutral: { low: 0.5, elevated: 0.35, critical: 0.15 },
    adverse: { low: 0.18, elevated: 0.44, critical: 0.38 },
  },
  lifestyle: {
    protective: { low: 0.78, elevated: 0.2, critical: 0.02 },
    neutral: { low: 0.45, elevated: 0.4, critical: 0.15 },
    adverse: { low: 0.12, elevated: 0.46, critical: 0.42 },
  },
  metabolic: {
    protective: { low: 0.74, elevated: 0.22, critical: 0.04 },
    neutral: { low: 0.35, elevated: 0.45, critical: 0.2 },
    adverse: { low: 0.08, elevated: 0.37, critical: 0.55 },
  },
  mental: {
    protective: { low: 0.7, elevated: 0.24, critical: 0.06 },
    neutral: { low: 0.4, elevated: 0.44, critical: 0.16 },
    adverse: { low: 0.16, elevated: 0.46, critical: 0.38 },
  },
  family: {
    protective: { low: 0.68, elevated: 0.24, critical: 0.08 },
    neutral: { low: 0.45, elevated: 0.4, critical: 0.15 },
    adverse: { low: 0.22, elevated: 0.43, critical: 0.35 },
  },
  occupational: {
    protective: { low: 0.72, elevated: 0.22, critical: 0.06 },
    neutral: { low: 0.48, elevated: 0.37, critical: 0.15 },
    adverse: { low: 0.2, elevated: 0.45, critical: 0.35 },
  },
};

const STATE_LABELS: Record<PosteriorState, string> = {
  low: 'Low Risk',
  elevated: 'Elevated Risk',
  critical: 'Critical Risk',
};

const ACTION_LABELS: Record<PosteriorState, string> = {
  low: 'Maintain current care cadence with quarterly nudges.',
  elevated: 'Recommend a clinician review and monthly coaching touch-points.',
  critical: 'Fast-track to care team escalation with immediate intervention.',
};

const SCORE_ESTIMATES: Record<PosteriorState, number> = {
  low: 40,
  elevated: 95,
  critical: 160,
};

const clampRatio = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const classifyEvidenceState = (ratio: number): EvidenceState => {
  if (ratio <= 0.33) return 'protective';
  if (ratio <= 0.66) return 'neutral';
  return 'adverse';
};

const aggregateSections = (
  targetIds: RiskCategoryId[],
  breakdown: SectionBreakdown[]
) => {
  return targetIds.reduce(
    (acc, id) => {
      const section = breakdown.find((entry) => entry.id === id);
      if (!section) return acc;
      return {
        score: acc.score + section.weightedScore,
        max: acc.max + section.maxScore,
      };
    },
    { score: 0, max: 0 }
  );
};

export const buildBayesianEvidence = (
  breakdown: SectionBreakdown[]
): BayesianEvidence[] => {
  return (Object.keys(SECTION_GROUPS) as EvidenceNode[])
    .map((node) => {
      const aggregation = aggregateSections(SECTION_GROUPS[node], breakdown);
      const ratio = aggregation.max === 0 ? 0 : clampRatio(aggregation.score / aggregation.max);
      return {
        node,
        label: EVIDENCE_LABELS[node],
        sections: SECTION_GROUPS[node],
        ratio,
        state: classifyEvidenceState(ratio),
      } satisfies BayesianEvidence;
    })
    .filter((item) => item.sections.length > 0);
};

export const computeBayesianRisk = (
  breakdown: SectionBreakdown[]
): BayesianRiskResult => {
  const evidence = buildBayesianEvidence(breakdown);
  let posterior: Record<PosteriorState, number> = { ...PRIOR };

  evidence.forEach((item) => {
    const likelihood = RISK_LIKELIHOODS[item.node][item.state];
    posterior = {
      low: posterior.low * likelihood.low,
      elevated: posterior.elevated * likelihood.elevated,
      critical: posterior.critical * likelihood.critical,
    };
  });

  const normalization = posterior.low + posterior.elevated + posterior.critical;
  if (normalization === 0) {
    posterior = { ...PRIOR };
  } else {
    posterior = {
      low: posterior.low / normalization,
      elevated: posterior.elevated / normalization,
      critical: posterior.critical / normalization,
    };
  }

  const ordered = (Object.keys(posterior) as PosteriorState[])
    .map((state) => ({ state, probability: posterior[state] }))
    .sort((a, b) => b.probability - a.probability);

  const prediction = ordered[0]?.state ?? 'low';
  const runnerUp = ordered[1]?.probability ?? 0;
  const confidence = Math.max(0, (ordered[0]?.probability ?? 0) - runnerUp);

  const summary = `Posterior mass concentrates ${
    (ordered[0]?.probability ?? 0) >= 0.6 ? 'strongly' : 'moderately'
  } around ${STATE_LABELS[prediction].toLowerCase()}.`;

  const alerts = evidence.filter((item) => item.state === 'adverse');

  const estimatedScore =
    posterior.low * SCORE_ESTIMATES.low +
    posterior.elevated * SCORE_ESTIMATES.elevated +
    posterior.critical * SCORE_ESTIMATES.critical;

  return {
    posterior,
    prediction,
    confidence,
    summary,
    recommendedAction: ACTION_LABELS[prediction],
    estimatedScore,
    alerts,
    evidence,
  };
};
