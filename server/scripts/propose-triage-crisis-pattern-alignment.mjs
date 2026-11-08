#!/usr/bin/env node
/**
 * Propose aligning the emergency-triage psychiatric red flag with the broader
 * Phase 3 crisis patterns — for medical-director review, NOT for application.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * MED-MIND-001 Phase 3 built a shared crisis detector. The patient-facing
 * surfaces (health diary, instrument scoring) use its full pattern set. The
 * emergency triage service does NOT: it still matches only the four phrases it
 * has always matched, because its red-flag list is a governed SaMD artefact —
 * model card `ai-emergency-triage`, changeControlPlan: "Adding or changing any
 * phrase/pattern requires governanceService.proposeChange() and
 * medical-director sign-off — never applied autonomously" (CLAUDE.md §3).
 *
 * Broadening it would change which patients are triaged ESI-2 (emergent). That
 * is a clinical threshold change and a clinician's call, not a refactor's. So
 * this script files the proposal and stops. Nothing in the triage pathway
 * changes until a medical director approves it through
 * `POST /api/ai-governance/changes/:id/approve`, and even then the code change
 * is a separate, deliberate edit.
 *
 * USAGE
 *   node scripts/ssm-env-loader.mjs scripts/propose-triage-crisis-pattern-alignment.mjs
 *   node scripts/ssm-env-loader.mjs scripts/propose-triage-crisis-pattern-alignment.mjs --apply
 *
 * Without --apply it prints the proposal and writes nothing. proposeChange()
 * de-duplicates on (component, change_type, status='pending_review'), so a
 * second --apply will not file a duplicate.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  TRIAGE_PSYCHIATRIC_RED_FLAG,
  CRISIS_PATTERNS,
} from '../utils/crisis-detection.js';

/**
 * scripts/ssm-env-loader.mjs runs its target with `await import()` and does NOT
 * rewrite process.argv, so argv[1] is the loader and argv[2] is this file. The
 * usual `import.meta.url === pathToFileURL(process.argv[1]).href` guard never
 * fires under it and the script silently does nothing (MED-MIND-001 R-7).
 */
function invokedAsScript() {
  for (const candidate of [process.argv[1], process.argv[2]]) {
    if (!candidate) continue;
    try {
      if (pathToFileURL(path.resolve(process.cwd(), candidate)).href === import.meta.url) return true;
    } catch {
      /* not a path — ignore */
    }
  }
  return false;
}

/** Phrases the broader detector catches that triage currently does not. */
const COVERAGE_GAP_EXAMPLES = [
  'I am going to end my life tonight',
  'I wrote a suicide note',
  'I am going to overdose on my tablets',
  'I will hang myself',
  'goodbye forever everyone',
  'everyone would be better off without me',
  'I feel like a burden to my family',
  'there is no reason to live',
  'I feel completely hopeless',
  'khudkhushi kar lunga',
];

function buildProposal() {
  const missed = COVERAGE_GAP_EXAMPLES.filter((t) => !TRIAGE_PSYCHIATRIC_RED_FLAG.test(t));

  return {
    component: 'ai-emergency-triage',
    changeType: 'red_flag_pattern',
    description:
      'Align the ESI-2 psychiatric red flag with the MED-MIND-001 Phase 3 shared crisis patterns '
      + '(intent, plan, means, farewell, ideation, self-harm, hopelessness, burden), replacing the '
      + 'current four-phrase regex.',
    previousConfig: {
      source: 'utils/crisis-detection.js :: TRIAGE_PSYCHIATRIC_RED_FLAG',
      pattern: TRIAGE_PSYCHIATRIC_RED_FLAG.source,
      flags: TRIAGE_PSYCHIATRIC_RED_FLAG.flags,
      phraseCount: 4,
    },
    newConfig: {
      source: 'utils/crisis-detection.js :: CRISIS_PATTERNS',
      tiers: ['imminent', 'elevated'],
      patterns: CRISIS_PATTERNS.map((r) => ({
        level: r.level,
        category: r.category,
        pattern: r.pattern.source,
      })),
      patternCount: CRISIS_PATTERNS.length,
    },
    rationale:
      'The current pattern misses common phrasings of suicidal intent, including an explicit plan, a '
      + 'named means and a farewell message. '
      + `Of ${COVERAGE_GAP_EXAMPLES.length} real-world phrasings, the current regex matches `
      + `${COVERAGE_GAP_EXAMPLES.length - missed.length} and misses ${missed.length}: `
      + `${missed.map((m) => JSON.stringify(m)).join(', ')}. `
      + 'The broader set is already live on the non-clinical surfaces (health diary, instrument '
      + 'scoring), where it offers helplines rather than triage, so its false-positive behaviour can '
      + 'be observed before it is allowed to affect ESI assignment. '
      + 'TRADE-OFF FOR THE REVIEWER: the elevated tier (hopelessness, burden, "no reason to live") is '
      + 'deliberately permissive and would route more patients to ESI-2. The reviewer may wish to '
      + 'adopt only the "imminent" tier for triage and leave "elevated" to the patient-facing '
      + 'surfaces — that split is the likeliest correct outcome and needs no new code beyond a filter '
      + 'on rule.level.',
    riskAssessment: 'moderate',
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const proposal = buildProposal();

  console.log('── Proposed change (ai-emergency-triage / red_flag_pattern) ──────────────');
  console.log(`component       : ${proposal.component}`);
  console.log(`changeType      : ${proposal.changeType}`);
  console.log(`risk            : ${proposal.riskAssessment}`);
  console.log(`current phrases : ${proposal.previousConfig.pattern}`);
  console.log(`proposed rules  : ${proposal.newConfig.patternCount} patterns across `
    + `${proposal.newConfig.tiers.join(' + ')}`);
  console.log('');
  console.log('rationale:');
  console.log(proposal.rationale.replace(/(.{1,96})(\s|$)/g, '  $1\n'));

  if (!apply) {
    console.log('── DRY RUN — nothing written. Re-run with --apply to file it. ────────────');
    return;
  }

  const { default: governanceService } = await import('../services/ai-model-governance.service.js');
  const changeId = await governanceService.proposeChange(proposal);
  console.log(`── Filed as ai_model_change_log id=${changeId}, status=pending_review ─────`);
  console.log('   Review at: GET /api/ai-governance/changes/pending');
  console.log('   Approve  : POST /api/ai-governance/changes/' + changeId + '/approve');
  console.log('   NOTE: approval records the decision. Widening the pattern in code is a');
  console.log('         separate edit, to be made only after that approval.');

  const { default: pool } = await import('../db/pgPool.js');
  await pool.end();
}

if (invokedAsScript()) {
  main().catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  });
}

export { buildProposal };
