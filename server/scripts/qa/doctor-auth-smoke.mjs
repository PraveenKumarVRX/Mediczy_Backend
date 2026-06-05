#!/usr/bin/env node

/**
 * Doctor auth contract smoke test
 *
 * Validates the deployed auth API contract without requiring real doctor credentials.
 * Usage:
 *   BASE_URL=https://app.mediqzy.com node scripts/qa/doctor-auth-smoke.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'https://app.mediqzy.com').replace(/\/$/, '');

function ok(label, detail) {
  console.log(`PASS  ${label}${detail ? ` - ${detail}` : ''}`);
}

function fail(label, detail) {
  console.error(`FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
}

async function request(path, init = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { url, res, body };
}

let failures = 0;

async function run() {
  console.log(`Running doctor auth smoke against ${BASE_URL}`);

  const status = await request('/api/auth/doctor/oauth/status');
  if (status.res.ok && status.body?.google && status.body?.facebook) {
    ok('OAuth status endpoint', `google=${status.body.google.enabled} facebook=${status.body.facebook.enabled}`);
  } else {
    failures += 1;
    fail('OAuth status endpoint', `HTTP ${status.res.status}`);
  }

  if (Array.isArray(status.body?.mobileRedirectSchemes) && status.body.mobileRedirectSchemes.length > 0) {
    ok('Mobile redirect schemes published', status.body.mobileRedirectSchemes.join(','));
  } else {
    failures += 1;
    fail('Mobile redirect schemes published', 'missing mobileRedirectSchemes array');
  }

  const refreshMissing = await request('/api/doctors/refresh', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (refreshMissing.res.status === 400 && refreshMissing.body?.errorCode === 'REFRESH_TOKEN_REQUIRED') {
    ok('Refresh missing token contract', 'REFRESH_TOKEN_REQUIRED');
  } else {
    failures += 1;
    fail('Refresh missing token contract', `HTTP ${refreshMissing.res.status} body=${JSON.stringify(refreshMissing.body)}`);
  }

  const bootstrapMissing = await request('/api/doctors/session/bootstrap', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (bootstrapMissing.res.status === 400 && bootstrapMissing.body?.errorCode === 'REFRESH_TOKEN_REQUIRED') {
    ok('Bootstrap missing token contract', 'REFRESH_TOKEN_REQUIRED');
  } else {
    failures += 1;
    fail('Bootstrap missing token contract', `HTTP ${bootstrapMissing.res.status} body=${JSON.stringify(bootstrapMissing.body)}`);
  }

  if (failures > 0) {
    console.error(`\nSmoke test failed with ${failures} issue(s).`);
    process.exitCode = 1;
    return;
  }

  console.log('\nSmoke test passed. Doctor auth contracts look healthy.');
}

run().catch((error) => {
  console.error('Smoke test crashed:', error);
  process.exitCode = 1;
});
