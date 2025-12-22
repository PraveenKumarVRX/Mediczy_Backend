import express from 'express';

import labAuthRouter from '../routes/lab/auth.routes.js';

const ensureEnv = () => {
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
  app.use('/api/lab', labAuthRouter);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1) Login
    const loginRes = await fetch(`${base}/api/lab/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lab@mediczy.com', password: 'Lab123' }),
    });
    const loginBody = await jsonOrText(loginRes);
    assert(loginRes.ok, `Login failed (${loginRes.status}): ${JSON.stringify(loginBody)}`);
    assert(typeof loginBody?.token === 'string' && loginBody.token.length > 10, 'Login did not return a token');

    const token = loginBody.token;

    // 2) Verify
    const verifyRes = await fetch(`${base}/api/lab/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const verifyBody = await jsonOrText(verifyRes);
    assert(verifyRes.ok, `Verify failed (${verifyRes.status}): ${JSON.stringify(verifyBody)}`);
    assert(verifyBody?.success === true, 'Verify did not return success');
    assert(verifyBody?.lab?.role === 'lab', 'Verify payload missing role=lab');

    console.log('✅ Lab portal auth smoke test passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('❌ Lab portal auth smoke test failed');
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
