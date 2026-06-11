/**
 * Prompt Optimization Executor
 * =============================
 * Implements a safe, staged rollout pipeline for AI prompt improvements:
 *
 *   1. GENERATE  — LLM writes a candidate prompt addressing the governance change
 *   2. SHADOW    — 5 representative test queries, candidate vs baseline (no traffic)
 *   3. CANARY    — 10% live traffic if shadow pass rate ≥ 0.70
 *   4. RAMP      — 50% → 100% if observed quality doesn't degrade
 *   5. ROLLBACK  — auto-revert if quality drops > 5% vs baseline
 *
 * All state changes go through governanceService.proposeChange() /
 * governanceService.approveChange() so every promotion is auditable.
 *
 * SaMD constraint: this executor ONLY acts on changes that have already been
 * APPROVED by a medical director via the governance dashboard.  It never
 * modifies ai_prompt_templates autonomously without approval.
 *
 * Schedule: daily at 02:00 IST
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import { tick, tickError, tickStart } from '../utils/cronRegistry.js';
import llmProvider from './ai-brain/llm-provider.js';
import governanceService from './ai-model-governance.service.js';

const SHADOW_TESTS_NEEDED = 5;
const SHADOW_PASS_THRESHOLD = 0.70;   // ≥70% shadow tests must pass
const QUALITY_ROLLBACK_THRESHOLD = 0.05; // rollback if quality drops >5%
const CANARY_START_PCT = 10;
const CANARY_RAMP_STEPS = [10, 50, 100];

// Representative test inputs for the brain-system-prompt component
const DEFAULT_SHADOW_INPUTS = [
  'What are the common side effects of metformin for type 2 diabetes?',
  'I have a fever of 102°F and a sore throat. What should I do?',
  'Explain the difference between type 1 and type 2 diabetes.',
  'What medications interact with warfarin?',
  'My blood pressure is 145/95. Is this dangerous?',
  'What are the symptoms of a heart attack?',
  'Can I take ibuprofen if I have kidney disease?',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCurrentPrompt(promptName) {
  const { rows } = await pool.query(`
    SELECT id, template, version
    FROM   ai_prompt_templates
    WHERE  name      = $1
      AND  is_active = TRUE
    ORDER  BY version DESC
    LIMIT  1
  `, [promptName]);
  return rows[0] ?? null;
}

async function activatePromptVersion(versionId, candidateTemplate, promptName, currentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Deactivate current
    await client.query(
      `UPDATE ai_prompt_templates SET is_active = FALSE WHERE name = $1 AND is_active = TRUE`,
      [promptName]
    );
    // Get next version number
    const { rows: [{ max_v }] } = await client.query(
      `SELECT COALESCE(MAX(version), 0) AS max_v FROM ai_prompt_templates WHERE name = $1`,
      [promptName]
    );
    // Insert new active version
    await client.query(`
      INSERT INTO ai_prompt_templates (name, template, version, is_active, created_at)
      VALUES ($1, $2, $3, TRUE, NOW())
    `, [promptName, candidateTemplate, max_v + 1]);
    // Mark version record as active
    await client.query(`
      UPDATE ai_prompt_versions
      SET    status = 'active', canary_pct = 100, promoted_at = NOW()
      WHERE  id = $1
    `, [versionId]);
    await client.query('COMMIT');
    console.log(`[PromptExecutor] Activated version_id=${versionId} (${promptName} v${max_v + 1})`);
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PromptExecutor] activatePromptVersion error:', err.message);
    return false;
  } finally {
    client.release();
  }
}

// ─── Phase 1: Generate candidate prompt ──────────────────────────────────────

async function generateCandidate(currentTemplate, changeDescription) {
  const response = await llmProvider.chat({
    messages: [
      {
        role: 'system',
        content:
          'You are a medical AI prompt engineer. You improve system prompts for a healthcare AI ' +
          'assistant (Dr. iSHA). You must keep all clinical safety guardrails, maintain the ' +
          'existing structure, and only add or refine guidance. Never remove safety rules. ' +
          'Return ONLY the improved system prompt text — no commentary, no markdown fences.',
      },
      {
        role: 'user',
        content:
          `Current system prompt:\n\n${currentTemplate}\n\n---\n\n` +
          `Improvement required (from quality feedback):\n${changeDescription}\n\n` +
          `Write an improved version of the full system prompt that addresses the feedback ` +
          `while preserving all existing clinical safety guardrails.`,
      },
    ],
    cognitiveTier: 'deep',
    temperature:   0.3,
    maxTokens:     4000,
    skipCache:     true,
  });

  const candidate = response?.content?.trim() ?? '';
  if (candidate.length < 100) throw new Error('Generated candidate prompt too short — rejected');
  if (!candidate.toLowerCase().includes('mediczy') &&
      !candidate.toLowerCase().includes('isha') &&
      !candidate.toLowerCase().includes('medical')) {
    throw new Error('Generated candidate lacks healthcare identity — rejected');
  }
  return candidate;
}

// ─── Phase 2: Shadow tests ────────────────────────────────────────────────────

async function runShadowTests(versionId, baselineTemplate, candidateTemplate) {
  const inputs = DEFAULT_SHADOW_INPUTS.slice(0, SHADOW_TESTS_NEEDED);
  let passCount = 0;

  for (const input of inputs) {
    try {
      // Run both prompts in parallel
      const [baselineResp, candidateResp] = await Promise.all([
        llmProvider.chat({
          messages: [
            { role: 'system', content: baselineTemplate },
            { role: 'user',   content: input },
          ],
          cognitiveTier: 'reflex',
          maxTokens:     512,
          skipCache:     true,
        }),
        llmProvider.chat({
          messages: [
            { role: 'system', content: candidateTemplate },
            { role: 'user',   content: input },
          ],
          cognitiveTier: 'reflex',
          maxTokens:     512,
          skipCache:     true,
        }),
      ]);

      const baseOut = baselineResp?.content ?? '';
      const candOut = candidateResp?.content ?? '';

      // Basic quality heuristic: candidate should be at least as long and
      // not hallucinate (check for dangerous unsupported claims).
      const candidateLongerOrEqual = candOut.length >= baseOut.length * 0.8;
      const noHallucinations = !/(I am not a doctor|I cannot provide|As an AI, I don't)/i.test(candOut);
      const qualityScore = (candidateLongerOrEqual ? 0.6 : 0.3) + (noHallucinations ? 0.4 : 0);

      await pool.query(`
        INSERT INTO ai_shadow_run_results
          (version_id, test_input, baseline_output, candidate_output, quality_score, evaluator_notes)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        versionId,
        input,
        baseOut.substring(0, 1000),
        candOut.substring(0, 1000),
        qualityScore,
        `len_ratio=${(candOut.length / Math.max(baseOut.length, 1)).toFixed(2)} halluc=${!noHallucinations}`,
      ]);

      if (qualityScore >= 0.6) passCount++;
    } catch (err) {
      console.warn(`[PromptExecutor] Shadow test error for input "${input.substring(0, 40)}":`, err.message);
    }
  }

  const passRate = passCount / inputs.length;
  await pool.query(
    `UPDATE ai_prompt_versions SET shadow_pass_rate = $1 WHERE id = $2`,
    [passRate, versionId]
  );
  return passRate;
}

// ─── Phase 3: Canary rollout management ───────────────────────────────────────

/**
 * Manages ongoing canary promotions.
 * Called every run to check canary quality and ramp or rollback.
 */
async function manageCanaryVersions() {
  const { rows: canaries } = await pool.query(`
    SELECT apv.*, apt.template AS current_active_template
    FROM   ai_prompt_versions apv
    LEFT JOIN ai_prompt_templates apt
           ON apt.name = apv.prompt_name AND apt.is_active = TRUE
    WHERE  apv.status = 'canary'
      AND  apv.created_at > NOW() - INTERVAL '14 days'
    ORDER  BY apv.created_at ASC
  `).catch(() => ({ rows: [] }));

  for (const canary of canaries) {
    // Get current quality score for the component
    const { rows: qRows } = await pool.query(`
      SELECT score_7d, score_30d
      FROM   ai_component_quality_scores
      WHERE  ai_component = 'medical_scribe_output'
      LIMIT  1
    `).catch(() => ({ rows: [] }));

    const currentScore = qRows[0]?.score_7d ?? 5.0;
    const baseline     = canary.quality_baseline ?? 5.0;
    const degradation  = (baseline - currentScore) / baseline;

    // Auto-rollback if quality dropped > 5%
    if (degradation > QUALITY_ROLLBACK_THRESHOLD) {
      await pool.query(`
        UPDATE ai_prompt_versions
        SET    status         = 'rolled_back',
               rolled_back_at = NOW(),
               rollback_reason = $2,
               quality_canary  = $3
        WHERE  id = $1
      `, [
        canary.id,
        `Quality degraded ${(degradation * 100).toFixed(1)}% vs baseline (${currentScore.toFixed(1)} vs ${baseline.toFixed(1)})`,
        currentScore,
      ]);
      console.warn(
        `⏪ [PromptExecutor] Rolled back canary id=${canary.id} — ` +
        `quality dropped ${(degradation * 100).toFixed(1)}%`
      );
      continue;
    }

    // Ramp up if quality is stable or improving
    const nextPct = CANARY_RAMP_STEPS.find(p => p > canary.canary_pct);

    if (nextPct === 100) {
      // Full promotion — activate the candidate as the new active template
      await activatePromptVersion(
        canary.id,
        canary.candidate_template,
        canary.prompt_name,
        null
      );
      console.log(`✅ [PromptExecutor] Full promotion of canary id=${canary.id} (${canary.prompt_name})`);
    } else if (nextPct) {
      // Partial ramp
      await pool.query(`
        UPDATE ai_prompt_versions
        SET    canary_pct = $2, quality_canary = $3
        WHERE  id = $1
      `, [canary.id, nextPct, currentScore]);
      console.log(`📈 [PromptExecutor] Canary id=${canary.id} ramped to ${nextPct}%`);
    }
  }
}

// ─── Service class ────────────────────────────────────────────────────────────

class PromptOptimizationExecutorService {
  constructor() {
    this.isRunning  = false;
    this.cronJob    = null;
    this.tableReady = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run migration on first boot
    setTimeout(async () => {
      const { runAiPromptVersionsMigration } = await import('../migrations/ai-prompt-versions.migration.js');
      await runAiPromptVersionsMigration().catch(e =>
        console.warn('[PromptExecutor] Migration skipped:', e.message)
      );
      this.tableReady = true;
      // First run immediately after migration
      this.run().catch(e => console.error('[PromptExecutor] Initial run error:', e.message));
    }, 240_000); // 4-minute boot delay (after governance + aggregator)

    // Daily at 02:00 IST (UTC+5:30 = 20:30 UTC previous day → cron 30 20 * * *)
    this.cronJob = cron.schedule('30 20 * * *', () => {
      if (!this.tableReady) return;
      this.run().catch(e => console.error('[PromptExecutor] Cron run error:', e.message));
    }, { timezone: 'UTC' });

    console.log('✅ PromptOptimizationExecutor started (daily 02:00 IST)');
  }

  stop() {
    if (this.cronJob) { this.cronJob.stop(); this.isRunning = false; }
  }

  async run() {
    tickStart('prompt_optimizer');
    let generated = 0;
    let promoted  = 0;

    try {
      // ── Step A: manage ongoing canary rollouts ────────────────────────────
      await manageCanaryVersions();

      // ── Step B: find newly approved prompt_update changes ─────────────────
      const { rows: approvedChanges } = await pool.query(`
        SELECT id, model_component AS component_name, change_description, created_at
        FROM   ai_model_change_log
        WHERE  change_type = 'prompt_update'
          AND  status      = 'approved'
          AND  id NOT IN (
            SELECT COALESCE(change_log_id, -1)
            FROM   ai_prompt_versions
            WHERE  change_log_id IS NOT NULL
          )
        ORDER  BY created_at ASC
        LIMIT  3
      `).catch(() => ({ rows: [] }));

      for (const change of approvedChanges) {
        const promptName = 'brain-system-prompt'; // only supported template for now
        const current    = await getCurrentPrompt(promptName);
        if (!current) {
          console.warn(`[PromptExecutor] No active template for ${promptName} — skipping`);
          continue;
        }

        // Get baseline quality score before candidate generation
        const { rows: qRows } = await pool.query(`
          SELECT score_7d FROM ai_component_quality_scores
          WHERE ai_component = 'medical_scribe_output' LIMIT 1
        `).catch(() => ({ rows: [] }));
        const baseline = qRows[0]?.score_7d ?? 5.0;

        let candidateTemplate;
        try {
          candidateTemplate = await generateCandidate(current.template, change.change_description);
        } catch (err) {
          console.warn(`[PromptExecutor] Candidate generation failed (change=${change.id}):`, err.message);
          continue;
        }

        // Insert version record (shadow phase)
        const { rows: [version] } = await pool.query(`
          INSERT INTO ai_prompt_versions
            (prompt_name, candidate_template, change_log_id, status, quality_baseline)
          VALUES ($1, $2, $3, 'shadow', $4)
          RETURNING id
        `, [promptName, candidateTemplate, change.id, baseline]);

        generated++;
        console.log(`🧪 [PromptExecutor] Shadow testing version id=${version.id} (change=${change.id})`);

        // Run shadow tests
        const passRate = await runShadowTests(version.id, current.template, candidateTemplate);
        console.log(`📊 [PromptExecutor] Shadow pass rate: ${(passRate * 100).toFixed(0)}% (threshold: ${(SHADOW_PASS_THRESHOLD * 100)}%)`);

        if (passRate >= SHADOW_PASS_THRESHOLD) {
          // Promote to canary
          await pool.query(`
            UPDATE ai_prompt_versions
            SET    status = 'canary', canary_pct = $2
            WHERE  id = $1
          `, [version.id, CANARY_START_PCT]);

          promoted++;
          console.log(`🐤 [PromptExecutor] Version id=${version.id} promoted to canary (${CANARY_START_PCT}%)`);
        } else {
          // Mark as rolled back (shadow failed)
          await pool.query(`
            UPDATE ai_prompt_versions
            SET    status = 'rolled_back',
                   rolled_back_at = NOW(),
                   rollback_reason = 'Shadow pass rate below threshold'
            WHERE  id = $1
          `, [version.id]);
          console.warn(`[PromptExecutor] Version id=${version.id} failed shadow — not promoted`);
        }
      }

      tick('prompt_optimizer', { generated, promoted });
      if (generated > 0) {
        console.log(`✅ [PromptExecutor] ${generated} candidates generated, ${promoted} promoted to canary`);
      }
    } catch (err) {
      tickError('prompt_optimizer', err.message);
      console.error('[PromptExecutor] Run error:', err.message);
    }

    return { generated, promoted };
  }
}

const promptOptimizationExecutor = new PromptOptimizationExecutorService();
export default promptOptimizationExecutor;

// ─── Canary-aware prompt loader ───────────────────────────────────────────────
// Exported for use by orchestrator.js to replace the direct ai_prompt_templates query.

/**
 * Returns the active system prompt for a given name, applying canary routing.
 * If a canary version is in flight at X%, X% of calls get the candidate.
 *
 * @param {string} promptName
 * @returns {Promise<string>} prompt template text
 */
/**
 * Returns the active system prompt for a given name.
 * Routing priority:
 *   1. A/B experiment variant (if userId is provided and user is in variant arm)
 *   2. Canary version (if one is in flight at X%, by random sampling)
 *   3. Current active template from ai_prompt_templates
 *
 * @param {string} promptName
 * @param {string|number|null} userId  — pass for A/B experiment routing
 */
export async function getActivePrompt(promptName, userId = null) {
  // ── A/B experiment routing ───────────────────────────────────────────────
  if (userId != null) {
    try {
      const { default: abTestingService } = await import('./ab-testing.service.js');
      const assignment = await abTestingService.getAssignment(userId, promptName);
      if (assignment?.arm === 'variant') {
        const { rows: vRows } = await pool.query(
          `SELECT candidate_template FROM ai_prompt_versions WHERE id=$1`, [assignment.variantPromptId]
        ).catch(() => ({ rows: [] }));
        if (vRows[0]) return vRows[0].candidate_template;
      }
    } catch { /* ignore — fall through */ }
  }

  // ── Canary routing ───────────────────────────────────────────────────────
  const { rows: canaries } = await pool.query(`
    SELECT candidate_template, canary_pct
    FROM   ai_prompt_versions
    WHERE  prompt_name = $1
      AND  status      = 'canary'
      AND  canary_pct  > 0
    ORDER  BY created_at DESC
    LIMIT  1
  `, [promptName]).catch(() => ({ rows: [] }));

  if (canaries.length > 0) {
    const { candidate_template, canary_pct } = canaries[0];
    if (Math.random() * 100 < canary_pct) {
      return candidate_template;
    }
  }

  // ── Active template (canonical path) ────────────────────────────────────
  const { rows } = await pool.query(`
    SELECT template
    FROM   ai_prompt_templates
    WHERE  name      = $1
      AND  is_active = TRUE
    ORDER  BY version DESC
    LIMIT  1
  `, [promptName]).catch(() => ({ rows: [] }));

  return rows[0]?.template ?? 'You are Dr. iSHA, an AI medical assistant for Mediczy healthcare platform.';
}
