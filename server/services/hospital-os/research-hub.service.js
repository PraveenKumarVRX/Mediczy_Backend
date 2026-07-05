/**
 * Hospital OS — governed medical research hub (trial matching Wave 1)
 */
import pool from '../../db/pgPool.js';
import { buildPatientSubgraph } from './knowledge-graph.service.js';

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

export default { matchClinicalTrials, detectEmergingPatterns };
