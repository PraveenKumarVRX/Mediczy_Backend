import express from 'express';

import corporateAuthRouter from '../routes/corporate/auth.routes.js';
import corporateRouter from '../routes/corporate.route.js';

const ensureEnv = () => {
  // Smoke test convenience: only set a default secret if not provided.
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'smoke-test-secret';
    console.warn('⚠️  JWT_SECRET not set; using smoke-test-secret for this run only');
  }
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
  }
};

const jsonOrText = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await res.json();
  return await res.text();
};

const assert = (condition, message) => {
  if (!condition) {
    const err = new Error(message);
    err.name = 'AssertionError';
    throw err;
  }
};

async function main() {
  ensureEnv();

  const app = express();
  app.use(express.json());

  // Mount routes with the same prefixes used in production.
  app.use('/api/corporate/auth', corporateAuthRouter);
  app.use('/api/corporate', corporateRouter);

  // Basic health
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1) Login
    const loginRes = await fetch(`${base}/api/corporate/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'corporate@mediczy.com', password: 'Corporate123' }),
    });
    const loginBody = await jsonOrText(loginRes);
    assert(loginRes.ok, `Login failed (${loginRes.status}): ${JSON.stringify(loginBody)}`);
    assert(typeof loginBody?.token === 'string' && loginBody.token.length > 10, 'Login did not return a token');

    const token = loginBody.token;
    const authHeader = { Authorization: `Bearer ${token}` };

    // 2) Risk monitor export
    const exportRes = await fetch(`${base}/api/corporate/risk-monitor/export`, {
      method: 'GET',
      headers: authHeader,
    });
    const exportText = await exportRes.text();
    assert(exportRes.ok, `Risk monitor export failed (${exportRes.status}): ${exportText}`);
    assert(/employeeId,name,department,healthStatus,lastCheckup/.test(exportText.split('\n')[0] || ''), 'Risk monitor export CSV header mismatch');

    // 3) Generate report (Claims Summary)
    const genRes = await fetch(`${base}/api/corporate/reports/generate`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Claims Summary', period: 'Monthly', format: 'CSV' }),
    });
    const genBody = await jsonOrText(genRes);
    assert(genRes.status === 201, `Report generation failed (${genRes.status}): ${JSON.stringify(genBody)}`);
    const generatedId = genBody?.data?.report?.id;
    assert(typeof generatedId === 'string' && generatedId.length > 3, 'Generated report id missing');

    // 4) List reports
    const listRes = await fetch(`${base}/api/corporate/reports`, {
      method: 'GET',
      headers: authHeader,
    });
    const listBody = await jsonOrText(listRes);
    assert(listRes.ok, `Reports list failed (${listRes.status}): ${JSON.stringify(listBody)}`);

    // 5) Download generated report
    const dlRes = await fetch(`${base}/api/corporate/reports/${generatedId}/download`, {
      method: 'GET',
      headers: authHeader,
    });
    const dlText = await dlRes.text();
    assert(dlRes.ok, `Report download failed (${dlRes.status}): ${dlText}`);
    const contentDisposition = dlRes.headers.get('content-disposition') || '';
    assert(contentDisposition.includes(generatedId), 'Report download missing expected Content-Disposition filename');

    console.log('✅ Corporate portal smoke test passed');
    console.log(`   - Login OK, token issued`);
    console.log(`   - Risk monitor export OK (${exportText.length} bytes)`);
    console.log(`   - Reports generate/list/download OK (${generatedId})`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('❌ Corporate portal smoke test failed');
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
