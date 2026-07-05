/**
 * HealthOS Stage 3 — Global knowledge network (cross-hospital similar cases)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function publishGlobalCase({ organizationId, sourceOrgNetworkId, presentationSummary, finalDiagnosis, outcome, lessonsLearned, keywords }) {
  await ensure();
  const caseNumber = `GLOBAL-${Date.now().toString(36).toUpperCase()}`;
  const { rows } = await pool.query(
    `INSERT INTO healthos_global_cases
      (organization_id, source_org_network_id, case_number, presentation_summary, final_diagnosis, outcome, lessons_learned, keywords, shareable, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW()) RETURNING *`,
    [organizationId, sourceOrgNetworkId, caseNumber, presentationSummary, finalDiagnosis, outcome, lessonsLearned, keywords || []]
  );
  return rows[0];
}

export async function searchGlobalCases(presentationHint, limit = 5) {
  await ensure();
  const terms = String(presentationHint || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 8);
  const { rows } = await pool.query(
    `SELECT * FROM healthos_global_cases WHERE shareable = true ORDER BY closed_at DESC NULLS LAST LIMIT 100`
  );
  const scored = rows.map((c) => {
    const text = `${c.presentation_summary || ''} ${c.final_diagnosis || ''} ${(c.keywords || []).join(' ')}`.toLowerCase();
    const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
    return { ...c, matchScore: score };
  }).filter((c) => c.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);
  return { matches: scored.slice(0, limit), totalShareable: rows.length };
}

export default { publishGlobalCase, searchGlobalCases };
