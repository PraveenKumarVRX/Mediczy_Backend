import express from 'express';
import cors from 'cors';
import request from 'supertest';
import fs from 'fs';
import { CORS_ALLOWED_HEADERS, CORS_EXPOSED_HEADERS } from '../config/cors.config.js';

describe('CORS header lists', () => {
  const app = express();
  app.use(cors({ origin: true, allowedHeaders: CORS_ALLOWED_HEADERS, exposedHeaders: CORS_EXPOSED_HEADERS, credentials: true }));
  app.post('/x', (_req, res) => { res.set('Idempotent-Replayed', 'true'); res.json({ ok: true }); });

  it('lets a browser preflight the phlebotomy app headers', async () => {
    const res = await request(app).options('/x').set('Origin', 'https://app.mediqzy.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,idempotency-key,x-device-id,x-correlation-id,x-app-version');
    const allowed = String(res.headers['access-control-allow-headers']).toLowerCase();
    for (const h of ['idempotency-key', 'x-device-id', 'x-correlation-id', 'x-app-version', 'authorization']) expect(allowed).toContain(h);
  });

  it('exposes Idempotent-Replayed to JavaScript', async () => {
    const res = await request(app).post('/x').set('Origin', 'https://app.mediqzy.com');
    expect(res.headers['access-control-expose-headers']).toContain('Idempotent-Replayed');
  });

  it('is what app.js actually uses (no stale inline list)', () => {
    const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    expect(src).toContain('allowedHeaders: CORS_ALLOWED_HEADERS');
    expect(src).toContain("CORS_ALLOWED_HEADERS.join(', ')");
    expect(src).not.toMatch(/'Content-Type, Authorization, X-Requested-With, Accept, Origin'/);
  });
});
