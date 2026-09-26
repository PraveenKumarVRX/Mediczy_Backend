/**
 * Webhooks carry no JWT, so they must be registered BEFORE router.use(verifyHospitalToken). The gateway-refund webhook
 * was registered after it: every delivery got 401 "Authentication required" and no gateway refund could ever be
 * confirmed (found by the post-deploy smoke test — the handler-level unit tests could not see it).
 */
import { jest } from '@jest/globals';

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/hospital/billing.route.js');
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use('/api/hospital/billing', router);

describe('billing webhooks are reachable without a hospital JWT', () => {
  it.each(['/pgi/webhook', '/refunds/webhook'])('%s is answered by its own handler (never the auth middleware\'s 401)', async (path) => {
    const res = await request(app).post(`/api/hospital/billing${path}`).send({ event: 'x' });
    expect(res.status).not.toBe(401);
    expect([400, 503]).toContain(res.status);          // unsigned → 400, or 503 when the gateway secret is not configured
  });

  it('every other billing route still requires authentication', async () => {
    for (const [m, p] of [['get', '/refunds/pending'], ['get', '/stations'], ['post', '/pgi/confirm']]) {
      expect((await request(app)[m](`/api/hospital/billing${p}`)).status).toBe(401);
    }
  });

  it('static: no route registered after router.use(verifyHospitalToken) is a webhook', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../routes/hospital/billing.route.js', import.meta.url), 'utf8');
    const afterAuth = src.slice(src.indexOf('\nrouter.use(verifyHospitalToken);'));
    expect(afterAuth).not.toMatch(/router\.(post|get)\('[^']*webhook/);
  });
});
