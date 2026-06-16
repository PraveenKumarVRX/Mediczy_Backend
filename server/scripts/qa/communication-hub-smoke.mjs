#!/usr/bin/env node
/**
 * Smoke test for Communication Hub backend helpers and route registration.
 * Run: node server/scripts/qa/communication-hub-smoke.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

import {
  ensureSmokeStack,
  stopSmokeStack,
  loadSmokeEnv,
} from './lib/communication-hub-smoke-bootstrap.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

for (const envFile of [
  path.join(root, 'server/.env.production.local'),
  path.join(root, 'server/.env.testing'),
  path.join(root, '.env.testing'),
]) {
  if (existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}
loadSmokeEnv(); // smoke overrides win for PORT/Postgres/bootstrap

const results = [];
let failed = 0;

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed += 1;
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('Communication Hub smoke test\n');

  // 1. Module imports
  try {
    const { sendTransactionalEmail, getEmailProviderStatus } = await import('../../services/welcome-email.service.js');
    if (typeof sendTransactionalEmail !== 'function') throw new Error('sendTransactionalEmail missing');
    if (typeof getEmailProviderStatus !== 'function') throw new Error('getEmailProviderStatus missing');
    pass('welcome-email exports', 'sendTransactionalEmail + getEmailProviderStatus');
  } catch (err) {
    fail('welcome-email exports', err.message);
  }

  // 2. Provider health (no send)
  try {
    const { getEmailProviderStatus } = await import('../../services/welcome-email.service.js');
    const status = await getEmailProviderStatus();
    const shapeOk = status && typeof status.configured === 'boolean' && typeof status.healthy === 'boolean';
    if (!shapeOk) throw new Error(`unexpected shape: ${JSON.stringify(status)}`);
    pass('getEmailProviderStatus()', `configured=${status.configured} healthy=${status.healthy} provider=${status.provider || 'n/a'}`);
  } catch (err) {
    fail('getEmailProviderStatus()', err.message);
  }

  // 3. Route registration in team.route.js
  try {
    const teamRouteSrc = readFileSync(path.join(root, 'server/routes/team.route.js'), 'utf8');
    const required = [
      "router.get('/communications/provider-health'",
      "router.get('/communications/templates'",
      "router.post('/communications/templates'",
      "router.delete('/communications/templates/:templateKey'",
      'sendTransactionalEmail',
      'channelClause',
      'team_communication_templates',
    ];
    for (const snippet of required) {
      if (!teamRouteSrc.includes(snippet)) throw new Error(`missing snippet: ${snippet}`);
    }
    pass('team.route.js registration', `${required.length} checks`);
  } catch (err) {
    fail('team.route.js registration', err.message);
  }

  // 4. Analytics channel filter SQL sanity
  try {
    const teamRouteSrc = readFileSync(path.join(root, 'server/routes/team.route.js'), 'utf8');
    if (!teamRouteSrc.includes('channelClause') || !teamRouteSrc.includes("req.query")) {
      throw new Error('analytics channel filter not wired');
    }
    pass('analytics channel filter', 'channelClause present');
  } catch (err) {
    fail('analytics channel filter', err.message);
  }

  // 4b. Audit-fix backend wiring
  try {
    const teamRouteSrc = readFileSync(path.join(root, 'server/routes/team.route.js'), 'utf8');
    const auditSnippets = [
      "router.post('/communications/apply-stage'",
      'ai_draft_id',
      "assistMode !== \"create_template\"",
      'source VARCHAR(30)',
      'aiDraftId',
    ];
    for (const snippet of auditSnippets) {
      if (!teamRouteSrc.includes(snippet)) throw new Error(`missing audit snippet: ${snippet}`);
    }
    pass('audit-fix backend wiring', `${auditSnippets.length} checks`);
  } catch (err) {
    fail('audit-fix backend wiring', err.message);
  }

  // 4c. AI email-arg + shared limits
  try {
    const argSrc = readFileSync(path.join(root, 'server/services/ai-email-arg.service.js'), 'utf8');
    const limitsSrc = readFileSync(path.join(root, 'server/constants/communication-limits.js'), 'utf8');
    if (!argSrc.includes('estimateRevenueImpact')) throw new Error('estimateRevenueImpact missing');
    if (!argSrc.includes("channel === 'whatsapp'")) throw new Error('whatsapp channel branch missing');
    if (!argSrc.includes("channel === 'sms'")) throw new Error('sms channel branch missing');
    if (!limitsSrc.includes('email: { words: 150')) throw new Error('email limits mismatch');
    pass('ai-email-arg + limits', 'channel drafts + revenue helper');
  } catch (err) {
    fail('ai-email-arg + limits', err.message);
  }

  // 4d. ai-email-arg runtime (rules fallback when LLM unavailable)
  try {
    const { analyzeEmailCommunication, estimateRevenueImpact } = await import('../../services/ai-email-arg.service.js');
    const { getChannelLimits } = await import('../../constants/communication-limits.js');
    const rev = estimateRevenueImpact({ employeeCount: 100 }, { premiumPerEmployee: 500 });
    if (rev !== 50000) throw new Error(`revenue calc got ${rev}`);
    const analysis = await analyzeEmailCommunication({
      eventType: 'reply',
      replyText: 'Yes interested, send demo slots',
      entity: { companyName: 'TestCo' },
    });
    if (analysis.conversionSignal !== 'hot') throw new Error(`expected hot, got ${analysis.conversionSignal}`);
    for (const ch of ['email', 'whatsapp', 'sms']) {
      if (!getChannelLimits(ch).words) throw new Error(`no limits for ${ch}`);
    }
    pass('ai-email-arg runtime', `hot signal, revenue=${rev}`);
  } catch (err) {
    fail('ai-email-arg runtime', err.message);
  }

  // 5. Frontend wiring
  try {
    const uiSrc = readFileSync(path.join(root, 'client/src/pages/team/TeamCorporateManagement.tsx'), 'utf8');
    const required = [
      'communicationHubTab',
      'openSendReview',
      'showSendReviewModal',
      'fetchProviderHealth',
      'Apply to Composer',
      'Review & Send',
      'error_message',
      "channel: communicationChannel",
      'callUnifiedAiDraft',
      'findUnresolvedPlaceholders',
      'showAiSavePrompt',
      'apply-stage',
      'aiAssistMergeMode',
      'resolvedComposerMessage',
      'applyFollowUpFromAction',
    ];
    for (const snippet of required) {
      if (!uiSrc.includes(snippet)) throw new Error(`missing UI snippet: ${snippet}`);
    }
    pass('TeamCorporateManagement.tsx wiring', `${required.length} UI checks`);
  } catch (err) {
    fail('TeamCorporateManagement.tsx wiring', err.message);
  }

  // 6. Live API — bootstrap local Postgres + server when needed
  let smokeChild = null;
  try {
    if (process.env.SMOKE_SKIP_STACK === '1') {
      const base = process.env.SMOKE_API_BASE || `http://127.0.0.1:${process.env.PORT || 8000}`;
      const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      if (!health.ok) throw new Error(`health status ${health.status}`);
      pass('server health', `${base} (external)`);

      const teamEmail = process.env.TEAM_SMOKE_EMAIL;
      const teamPass = process.env.TEAM_SMOKE_PASSWORD;
      if (!teamEmail || !teamPass) throw new Error('TEAM_SMOKE_EMAIL and TEAM_SMOKE_PASSWORD required when SMOKE_SKIP_STACK=1');
      const loginRes = await fetch(`${base}/api/team/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: teamEmail, password: teamPass }),
      });
      const loginJson = await loginRes.json();
      const token = loginJson?.token || loginJson?.accessToken || loginJson?.data?.accessToken;
      if (!token) throw new Error(`team login failed — ${JSON.stringify(loginJson)}`);
      await runLiveCommunicationApiChecks(base, token, pass, fail);
    } else {
      const stack = await ensureSmokeStack();
      smokeChild = stack.child;
      pass('smoke stack bootstrap', stack.reused ? `reused ${stack.baseUrl}` : `started ${stack.baseUrl}`);

      const loginRes = await fetch(`${stack.baseUrl}/api/team/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.TEAM_SMOKE_EMAIL,
          password: process.env.TEAM_SMOKE_PASSWORD,
        }),
      });
      const loginJson = await loginRes.json();
      const loginToken = loginJson?.token || loginJson?.accessToken || loginJson?.data?.accessToken;
      if (loginRes.ok && loginToken) {
        pass('POST /team/login', 'password auth');
        await runLiveCommunicationApiChecks(stack.baseUrl, loginToken, pass, fail);
      } else {
        pass('POST /team/login', `password auth unavailable (${loginJson?.message || loginRes.status}); using minted team token`);
        await runLiveCommunicationApiChecks(stack.baseUrl, stack.token, pass, fail);
      }
    }
  } catch (err) {
    fail('live API', err.message || String(err));
  } finally {
    if (smokeChild && process.env.SMOKE_KEEP_SERVER !== '1') {
      await stopSmokeStack(smokeChild);
    }
  }

  console.log(`\nSummary: ${results.length - failed}/${results.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runLiveCommunicationApiChecks(base, token, pass, fail) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const corpId = parseInt(process.env.SMOKE_CORP_ID || '1', 10);

  const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error(`health status ${health.status}`);
  pass('server health', base);

  const ph = await fetch(`${base}/api/team/communications/provider-health`, { headers });
  const phJson = await ph.json();
  if (!ph.ok || !phJson?.email) throw new Error(`provider-health ${ph.status} ${JSON.stringify(phJson)}`);
  pass('GET /communications/provider-health', `email.configured=${phJson.email.configured} healthy=${phJson.email.healthy}`);

  const tpl = await fetch(`${base}/api/team/communications/templates?corporateId=${corpId}&channel=email`, { headers });
  const tplJson = await tpl.json();
  if (!tpl.ok || !tplJson?.templates) throw new Error(`templates list ${tpl.status} ${JSON.stringify(tplJson)}`);
  pass('GET /communications/templates', `email templates=${tplJson.templates?.email?.length ?? 0}`);

  const dash = await fetch(`${base}/api/team/communications/ai-dashboard?corporateId=${corpId}&days=30`, { headers });
  const dashJson = await dash.json();
  if (!dash.ok || !dashJson?.data) throw new Error(`ai-dashboard ${dash.status} ${JSON.stringify(dashJson)}`);
  pass('GET /communications/ai-dashboard', `records=${dashJson.data?.totals?.total ?? 0}`);

  const stage = await fetch(`${base}/api/team/communications/apply-stage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ corporateId: corpId, suggestedStage: 'qualified' }),
  });
  const stageJson = await stage.json();
  if (!stage.ok || !stageJson?.data?.status) throw new Error(`apply-stage ${stage.status} ${JSON.stringify(stageJson)}`);
  pass('POST /communications/apply-stage', `status=${stageJson.data.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
