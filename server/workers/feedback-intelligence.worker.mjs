/**
 * Feedback Intelligence Worker
 * ============================
 * Standalone PM2 process that runs all Feedback Intelligence cron services
 * independently from the main API server process.
 *
 * This prevents heavy aggregation or LLM-based classification from blocking
 * API request handling during peak traffic.
 *
 * PM2 config: see ecosystem.config.js (name: 'feedback-intelligence')
 *
 * Services started:
 *   - FeedbackAggregatorService    (every 15 min)
 *   - SlaTrackerService            (every 5 min)
 *   - FeedbackRouterService        (every 30 min)
 *   - ClosedLoopNotifierService    (every 30 min)
 *   - PromptOptimizationExecutor   (daily 02:00 IST)
 *   - FeedbackDigestService        (weekly Monday 08:00 IST)
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

// ── Environment & path setup ──────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

// Load .env via dotenv if present
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.join(__dirname, '../../.env') });
} catch { /* no dotenv in prod — env vars injected by PM2 */ }

console.log('🚀 [feedback-intelligence worker] Starting...');
console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   PID: ${process.pid}`);

// ── Run all migrations before starting services ───────────────────────────────

console.log('🔧 Running Feedback Intelligence migrations...');

try {
  const { up: runUnifiedFeedback } = await import('../migrations/unified-feedback-signals.migration.js');
  await runUnifiedFeedback();
} catch (e) {
  console.warn('⚠️  unified-feedback-signals migration skipped:', e.message);
}

try {
  const { runTicketSlaMigration } = await import('../migrations/ticket-sla.migration.js');
  await runTicketSlaMigration();
} catch (e) {
  console.warn('⚠️  ticket-sla migration skipped:', e.message);
}

try {
  const { runAiPromptVersionsMigration } = await import('../migrations/ai-prompt-versions.migration.js');
  await runAiPromptVersionsMigration();
} catch (e) {
  console.warn('⚠️  ai-prompt-versions migration skipped:', e.message);
}

try {
  const { runAbExperimentsMigration } = await import('../migrations/ab-experiments.migration.js');
  await runAbExperimentsMigration();
} catch (e) {
  console.warn('⚠️  ab-experiments migration skipped:', e.message);
}

// ── Start services ────────────────────────────────────────────────────────────

console.log('📊 Starting Feedback Aggregator...');
const { default: feedbackAggregator } = await import('../services/feedback-aggregator.service.js');
feedbackAggregator.start();

console.log('⏱️  Starting SLA Tracker...');
const { default: slaTracker } = await import('../services/sla-tracker.service.js');
slaTracker.start();

console.log('🔀 Starting Feedback Router...');
const { default: feedbackRouter } = await import('../services/feedback-router.service.js');
feedbackRouter.start();

console.log('📬 Starting Closed-Loop Notifier...');
const { default: closedLoopNotifier } = await import('../services/closed-loop-notifier.service.js');
closedLoopNotifier.start();

console.log('🔬 Starting Prompt Optimization Executor...');
const { default: promptOptimizer } = await import('../services/prompt-optimization-executor.service.js');
promptOptimizer.start();

console.log('📧 Starting Feedback Digest...');
const { default: feedbackDigest } = await import('../services/feedback-digest.service.js');
feedbackDigest.start();

console.log('✅ [feedback-intelligence worker] All services started');

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`[feedback-intelligence worker] ${signal} received — shutting down`);
  feedbackAggregator.stop();
  slaTracker.stop();
  feedbackRouter.stop();
  closedLoopNotifier.stop();
  promptOptimizer.stop();
  feedbackDigest.stop();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Keep alive
setInterval(() => {}, 1 << 30);
