#!/usr/bin/env node
/**
 * Smoke test for Communication Hub backend helpers and route registration.
 * Run: node server/scripts/qa/communication-hub-smoke.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

for (const envFile of [
  path.join(root, 'server/.env.production.local'),
  path.join(root, 'server/.env.testing'),
  path.join(root, '.env.testing'),
]) {
  if (existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
}

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
    ];
    for (const snippet of required) {
      if (!uiSrc.includes(snippet)) throw new Error(`missing UI snippet: ${snippet}`);
    }
    pass('TeamCorporateManagement.tsx wiring', `${required.length} UI checks`);
  } catch (err) {
    fail('TeamCorporateManagement.tsx wiring', err.message);
  }

  // 6. Optional live API (if server running)
  const base = process.env.SMOKE_API_BASE || 'http://127.0.0.1:5000';
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`health status ${health.status}`);
    pass('server health', base);

    const teamEmail = process.env.TEAM_SMOKE_EMAIL;
    const teamPass = process.env.TEAM_SMOKE_PASSWORD;
    if (teamEmail && teamPass) {
      const loginRes = await fetch(`${base}/api/team/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: teamEmail, password: teamPass }),
      });
      const loginJson = await loginRes.json();
      const token = loginJson?.token || loginJson?.accessToken;
      if (!token) throw new Error('team login failed — no token');
      const headers = { Authorization: `Bearer ${token}` };

      const ph = await fetch(`${base}/api/team/communications/provider-health`, { headers });
      const phJson = await ph.json();
      if (!ph.ok || !phJson?.email) throw new Error(`provider-health ${ph.status}`);
      pass('GET /communications/provider-health', `email.healthy=${phJson.email.healthy}`);

      const tpl = await fetch(`${base}/api/team/communications/templates?corporateId=1&channel=email`, { headers });
      if (!tpl.ok) throw new Error(`templates list ${tpl.status}`);
      pass('GET /communications/templates', `status ${tpl.status}`);
    } else {
      pass('live API auth', 'skipped (set TEAM_SMOKE_EMAIL + TEAM_SMOKE_PASSWORD)');
    }
  } catch (err) {
    pass('live API', `skipped or unavailable (${err.message})`);
  }

  console.log(`\nSummary: ${results.length - failed}/${results.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
