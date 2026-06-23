#!/usr/bin/env node
/** Imaging platform API smoke — phases A-D endpoints */
const BASE = process.env.MEDICZY_BASE_URL || 'https://mediqzy.com';
const LAB_EMAIL = process.env.LAB_EMAIL;
const LAB_PASSWORD = process.env.LAB_PASSWORD;

let failed = 0;
const pass = (n, d = '') => { console.log('✓', n, d); };
const fail = (n, d = '') => { console.log('✗', n, d); failed += 1; };

async function labLogin() {
  if (!LAB_EMAIL) return null;
  const res = await fetch(`${BASE}/api/lab/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LAB_EMAIL, password: LAB_PASSWORD }),
  });
  const body = await res.json();
  return body.token || null;
}

async function main() {
  console.log(`Imaging platform smoke — ${BASE}\n`);
  const token = await labLogin();
  if (!token) {
    console.log('Skip lab platform tests (set LAB_EMAIL + LAB_PASSWORD)');
    process.exit(0);
  }
  const auth = { Authorization: `Bearer ${token}` };

  const analytics = await fetch(`${BASE}/api/imaging/platform/analytics`, { headers: auth });
  analytics.ok ? pass('analytics', String(analytics.status)) : fail('analytics', String(analytics.status));

  const alerts = await fetch(`${BASE}/api/imaging/platform/alerts/critical`, { headers: auth });
  alerts.ok ? pass('critical-alerts', String(alerts.status)) : fail('critical-alerts', String(alerts.status));

  const wf = await fetch(`${BASE}/api/imaging/platform/workflow/queue`, { headers: auth });
  wf.ok ? pass('workflow-queue', String(wf.status)) : fail('workflow-queue', String(wf.status));

  const triageUrl = process.env.IMAGING_TRIAGE_URL || 'http://127.0.0.1:8010';
  try {
    const th = await fetch(`${triageUrl}/health`);
    th.ok ? pass('triage-health', triageUrl) : fail('triage-health', String(th.status));
  } catch (e) {
    fail('triage-health', e.message);
  }

  console.log(failed ? `\nFAILED ${failed}` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
