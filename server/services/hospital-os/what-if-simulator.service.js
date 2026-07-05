/**
 * Hospital OS — clinical what-if simulator (treatment / discharge / medication scenarios)
 */
import llmProvider from '../ai-brain/llm-provider.js';
import { getPatientTwin } from './patient-twin.service.js';
import { up as migrate } from '../../migrations/hospital-os-2035.migration.js';
import pool from '../../db/pgPool.js';

export async function simulateClinicalScenario({
  patientId,
  organizationId,
  scenario,
  proposedChange,
  userId,
  tenantId = 'default',
}) {
  await migrate();
  const twin = await getPatientTwin(patientId, organizationId, tenantId);

  const systemPrompt = `You are a clinical decision support simulator for hospital physicians.
Analyze the proposed change against the patient context. Output JSON only:
{
  "summary": "brief clinical summary",
  "expectedBenefits": ["..."],
  "risks": ["..."],
  "evidenceLevel": "A|B|C|expert_opinion",
  "guidelineNotes": ["..."],
  "confidence": 0.0-1.0,
  "recommendation": "proceed|modify|defer|not_recommended",
  "disclaimer": "Assistive simulation only — physician must decide"
}
Never prescribe autonomously. Flag missing data.`;

  const userPrompt = `SCENARIO: ${scenario}
PROPOSED CHANGE: ${proposedChange}
PATIENT TWIN:
${JSON.stringify(twin.attributes, null, 2)}`;

  const llm = await llmProvider.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 1200,
    responseFormat: { type: 'json_object' },
    skipCache: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(llm.content || '{}');
  } catch {
    parsed = { summary: llm.content, recommendation: 'modify', confidence: 0.3 };
  }

  const { rows } = await pool.query(
    `INSERT INTO hospital_os_simulations (tenant_id, simulation_type, scenario_key, input_params, results, created_by)
     VALUES ($1, 'clinical_whatif', $2, $3::jsonb, $4::jsonb, $5) RETURNING id`,
    [
      tenantId,
      scenario,
      JSON.stringify({ patientId, proposedChange }),
      JSON.stringify({ ...parsed, provider: llm.provider, model: llm.model }),
      userId || null,
    ]
  );

  return {
    simulationId: rows[0].id,
    patientId,
    scenario,
    proposedChange,
    ...parsed,
    provider: llm.provider,
    tier: 'T1',
    requiresPhysicianReview: true,
  };
}

export default { simulateClinicalScenario };
