import pool from '../db/pgPool.js';
import emergencyTriageService from './ai-emergency-triage.service.js';
import drugInteractionChecker from './ai-drug-interaction.service.js';
import { normalizeTriageInput } from './multilingual-triage.service.js';
import { evaluate as evaluateText } from './ai-brain/evaluation-engine.js';

// These fixtures are authored for mediqzy's safety contract.  They deliberately
// contain only minimal phrases and expected invariants, not a copied clinical corpus.
export const MEDIQZY_GOLD_FIXTURES = [
  { key: 'triage-hi-chest-pain', workstream: 'WS-1', input: { symptoms: 'सीने में दर्द और पसीना', language: 'hi' }, expected: { esiAtMost: 1, category: 'cardiac', concept: 'chest pain' } },
  { key: 'triage-hi-breathing', workstream: 'WS-1', input: { symptoms: 'सांस लेने में दिक्कत', language: 'hi' }, expected: { esiAtMost: 2, category: 'respiratory', concept: 'difficulty breathing' } },
  { key: 'drug-contraindicated', workstream: 'WS-4', input: { medications: ['fluoxetine', 'selegiline'] }, expected: { severity: 'contraindicated' } },
  { key: 'soap-completeness', workstream: 'WS-2', input: { content: 'Subjective: cough. Objective: SpO2 94%. Assessment: viral URI. Plan: hydration and review in 48 hours.' }, expected: { minScore: 0.5 } },
];

async function runFixture(fixture) {
  try {
    if (fixture.key.startsWith('triage-')) {
      const normalized = normalizeTriageInput(fixture.input.symptoms, fixture.input.language);
      const result = await emergencyTriageService.triage({ symptoms: normalized.normalizedSymptoms, skipGovernancePersistence: true });
      const pass = result.esiLevel <= fixture.expected.esiAtMost
        && result.category === fixture.expected.category
        && normalized.concepts.some((concept) => concept.canonical === fixture.expected.concept);
      return { key: fixture.key, pass, evidence: { esiLevel: result.esiLevel, category: result.category, concepts: normalized.concepts } };
    }
    if (fixture.key === 'drug-contraindicated') {
      const result = drugInteractionChecker.quickCheck(fixture.input.medications);
      return { key: fixture.key, pass: result.severity === fixture.expected.severity, evidence: result };
    }
    const score = evaluateText({ content: fixture.input.content, latencyMs: 100, usage: { totalTokens: 80 } }, { cognitiveTier: 'standard', tokenEstimate: 50 });
    return { key: fixture.key, pass: score >= fixture.expected.minScore, evidence: { score } };
  } catch (error) {
    return { key: fixture.key, pass: false, error: error.message };
  }
}

export async function runAiGoldEvaluations({ suiteVersion = 'mediqzy-clean-room-v1', injectFailure = process.env.AI_EVAL_INJECT_FAILURE === '1' } = {}) {
  const results = [];
  for (const fixture of MEDIQZY_GOLD_FIXTURES) results.push(await runFixture(fixture));
  if (injectFailure) results[0] = { ...results[0], pass: false, error: 'Injected regression for CI gate' };
  const passedCount = results.filter((result) => result.pass).length;
  const score = results.length ? passedCount / results.length : 0;
  const passed = results.length > 0 && passedCount === results.length;
  if (process.env.AI_EVAL_SKIP_DB !== '1') {
    try {
      await pool.query(`
        INSERT INTO ai_gold_eval_runs (suite_version, passed, score, results)
        VALUES ($1, $2, $3, $4::jsonb)
      `, [suiteVersion, passed, score, JSON.stringify(results)]);
    } catch (error) {
      console.error('[AI Gold Eval] governance log unavailable:', error.message);
    }
  }
  return { suiteVersion, passed, score, results };
}

export default { runAiGoldEvaluations, MEDIQZY_GOLD_FIXTURES };
