#!/usr/bin/env node
/**
 * SCM module smoke test
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:8888 node scripts/qa/scm-smoke.mjs
 *   BASE_URL=https://app.mediqzy.com SCM_EMAIL=scm@example.com SCM_PASSWORD=secret node scripts/qa/scm-smoke.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8888').replace(/\/$/, '');
const SCM_EMAIL = process.env.SCM_EMAIL || '';
const SCM_PASSWORD = process.env.SCM_PASSWORD || '';

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
  console.log(`Running SCM smoke against ${BASE_URL}`);

  const unauth = await request('/api/scm/overview');
  if (unauth.res.status === 401) {
    ok('Overview requires auth', '401 without token');
  } else {
    failures += 1;
    fail('Overview requires auth', `expected 401, got ${unauth.res.status}`);
  }

  const badLogin = await request('/api/scm/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'invalid@example.com', password: 'wrong' }),
  });
  if (badLogin.res.status === 401 || badLogin.res.status === 400) {
    ok('Login rejects invalid credentials', `HTTP ${badLogin.res.status}`);
  } else {
    failures += 1;
    fail('Login rejects invalid credentials', `HTTP ${badLogin.res.status}`);
  }

  if (SCM_EMAIL && SCM_PASSWORD) {
    const login = await request('/api/scm/login', {
      method: 'POST',
      body: JSON.stringify({ email: SCM_EMAIL, password: SCM_PASSWORD }),
    });
    const token = login.body?.token || login.body?.data?.token;
    if (!login.res.ok || !token) {
      failures += 1;
      fail('SCM login', `HTTP ${login.res.status}`);
    } else {
      ok('SCM login', SCM_EMAIL);

      const overview = await request('/api/scm/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (overview.res.ok && overview.body?.data && typeof overview.body.data.active_items === 'number') {
        ok('SCM overview', `active_items=${overview.body.data.active_items}`);
      } else {
        failures += 1;
        fail('SCM overview', `HTTP ${overview.res.status}`);
      }
    }
  } else {
    console.log('SKIP  Authenticated overview (set SCM_EMAIL + SCM_PASSWORD to enable)');
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll SCM smoke checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
