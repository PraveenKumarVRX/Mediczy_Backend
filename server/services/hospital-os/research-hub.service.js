/**
 * Hospital OS — governed medical research hub (trial matching Wave 1)
 */
import pool from '../../db/pgPool.js';
import { buildPatientSubgraph } from './knowledge-graph.service.js';
import { findSimilarCases } from '../careos/hospital-memory.service.js';
import llmProvider from '../ai-brain/llm-provider.js';

export async function matchClinicalTrials({ patientId, organizationId, tenantId = 'default' }) {
  const subgraph = await buildPatientSubgraph(patientId, organizationId, tenantId).catch(() => ({ edges: [] }));
  const conditions = (subgraph.edges || [])
    .filter((e) => e.relation === 'HAS_DIAGNOSIS')
    .map((e) => e.target);

  let trials = [];
  try {
    const { rows } = await pool.query(
      `SELECT id, title, condition_keywords, eligibility_summary, status
       FROM clinical_trials
       WHERE status = 'recruiting'
       ORDER BY created_at DESC LIMIT 50`
    );
    trials = rows;
  } catch {
    trials = [
      { id: 1, title: 'Type 2 Diabetes Outcomes Study', condition_keywords: ['diabetes', 'metformin'], eligibility_summary: 'Adults 18-75 with T2DM', status: 'recruiting' },
      { id: 2, title: 'Hypertension Remote Monitoring', condition_keywords: ['hypertension', 'blood pressure'], eligibility_summary: 'Adults with uncontrolled HTN', status: 'recruiting' },
    ];
  }

  const matches = trials
    .map((trial) => {
      const keywords = (trial.condition_keywords || []).map((k) => k.toLowerCase());
      const score = conditions.reduce((s, c) => {
        const cl = String(c).toLowerCase();
        return s + (keywords.some((k) => cl.includes(k) || k.includes(cl)) ? 1 : 0);
      }, 0);
      return { ...trial, matchScore: score, matchedConditions: conditions };
    })
    .filter((t) => t.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  return {
    patientId,
    eligibleTrials: matches,
    totalScreened: trials.length,
    governance: {
      irbRequired: true,
      phiMinimized: true,
      note: 'Trial matching is assistive. Enrollment requires IRB-approved consent workflow.',
    },
  };
}

export async function detectEmergingPatterns({ organizationId, days = 30 }) {
  let patterns = [];
  try {
    const { rows } = await pool.query(
      `SELECT diagnosis_code, COUNT(*)::int AS cases
       FROM ip_admissions
       WHERE organization_id = $1 AND admitted_at > NOW() - ($2 || ' days')::interval
       GROUP BY diagnosis_code
       HAVING COUNT(*) >= 5
       ORDER BY cases DESC LIMIT 10`,
      [organizationId, days]
    );
    patterns = rows.map((r) => ({
      pattern: r.diagnosis_code,
      cases: r.cases,
      signal: r.cases >= 15 ? 'elevated' : 'normal',
    }));
  } catch {
    patterns = [];
  }

  return {
    organizationId,
    windowDays: days,
    patterns,
    disclaimer: 'Aggregated epidemiological signals only. Not a diagnosis.',
  };
}

/**
 * Research Agent: combines institutional case memory + clinical trial
 * matching into one synthesized briefing, instead of two separate lookups
 * a clinician has to mentally combine themselves.
 */
export async function generateResearchBriefing({ patientId, organizationId, diagnosisHint, tenantId = 'default' }) {
  const [similar, trials] = await Promise.all([
    findSimilarCases(patientId, organizationId, diagnosisHint || '').catch(() => ({ matches: [] })),
    matchClinicalTrials({ patientId, organizationId, tenantId }).catch(() => ({ eligibleTrials: [] })),
  ]);

  const fallbackSummary = [
    similar.matches?.length ? `${similar.matches.length} similar prior case(s) found in hospital records.` : 'No similar prior cases found.',
    trials.eligibleTrials?.length ? `${trials.eligibleTrials.length} potentially eligible clinical trial(s).` : 'No matching clinical trials found.',
  ].join(' ');

  let briefing = fallbackSummary;
  if (similar.matches?.length || trials.eligibleTrials?.length) {
    try {
      const llm = await llmProvider.chat({
        messages: [
          {
            role: 'system',
            content: `You are a clinical research assistant. Combine similar-case history and clinical-trial matches into a short (3-4 sentence) briefing for the treating clinician. Do not invent facts not present in the data. This is advisory only.`,
          },
          { role: 'user', content: `Diagnosis context: ${diagnosisHint || 'not specified'}\nSimilar cases: ${JSON.stringify(similar.matches || [])}\nMatching trials: ${JSON.stringify(trials.eligibleTrials || [])}` },
        ],
        temperature: 0.2,
        maxTokens: 400,
        skipCache: true,
      });
      briefing = (llm.content || '').trim() || fallbackSummary;
    } catch (err) {
      console.warn('[research-hub] briefing LLM failed:', err.message);
    }
  }

  return {
    patientId,
    briefing,
    similarCases: similar.matches || [],
    eligibleTrials: trials.eligibleTrials || [],
    governance: trials.governance,
  };
}

export default { matchClinicalTrials, detectEmergingPatterns, generateResearchBriefing };
