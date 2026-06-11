#!/usr/bin/env node
/**
 * Register the "Clinical-Output Gate Wrapper" change in the SaMD governance
 * review queue (medical-director approval required before enforcement).
 *
 * This does NOT change any model/prompt/threshold — it only files a
 * pending_review change record per CLAUDE.md governance. See
 * docs/ai/proposals/CLINICAL_OUTPUT_GATE_WRAPPER.md.
 *
 * Usage:
 *   node server/scripts/propose-clinical-gate-wrapper.mjs
 * Requires DB env (same as the server).
 */

import governanceService from '../services/ai-model-governance.service.js';

async function main() {
  const changeId = await governanceService.proposeChange({
    component: 'clinical-output-gate-wrapper',
    changeType: 'routing_update',
    description:
      'Route all clinical AI outputs (brain orchestrator, multi-agent, medical-ai chat/triage, CDSS, scribe) ' +
      'through a single quality-gate + interpretability + PHI-redaction wrapper at the API boundary. ' +
      'Rollout behind CLINICAL_GATE_WRAPPER flag: shadow (log-only) → enforce.',
    previousConfig: {
      gatedClinicalPaths: ['ai-emergency-triage', 'ai-drug-interaction', 'ai-health-risk-cron'],
      ungatedClinicalPaths: [
        'ai-brain/orchestrator', 'ai-brain/multi-agent-orchestrator',
        'medical-ai.route /consult', 'medical-ai.route /emergency-triage',
        'medicalAI.service', 'cdss.service', 'scribe checkScribeOutput (unused)',
      ],
      mode: 'per-service-optional',
    },
    newConfig: {
      wrapper: 'clinical-output-gate-wrapper',
      enforcedPaths: 'all-clinical',
      flag: 'CLINICAL_GATE_WRAPPER',
      rollout: ['shadow', 'enforce'],
    },
    rationale:
      'Audit found clinical conversational paths bypass quality gates, confidence/interpretability, ' +
      'and gate logging, creating inconsistent SaMD enforcement and audit blind spots. A boundary ' +
      'wrapper makes gates + interpretability + PHI redaction cross-cutting rather than per-service optional.',
    riskAssessment: 'high',
  });

  console.log(`Filed governance proposal. changeId=${changeId} (status=pending_review)`);
  console.log('Review at: GET /api/ai-governance/changes/pending');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to file governance proposal:', err?.message || err);
    process.exit(1);
  });
