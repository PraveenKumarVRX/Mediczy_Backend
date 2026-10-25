import { test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
process.env.JWT_SECRET = 'mobile-isolation-unit-test-only';
const { JWT_CONFIG } = await import('../config/auth.config.js');
const { createAuthPhlebotomist } = await import('../middleware/authPhlebotomist.middleware.js');
function appFor(ownerUid) {
  const app = express();
  app.use((req, _res, next) => { req.mobileTenant = { config: { apps: [{ product: 'phlebo', ownerUid }] } }; next(); });
  app.use(createAuthPhlebotomist({ phlebotomistService: { loadPrincipal: async () => ({ principal: { uid: 'F00001', memberships: [{ ownerUid: 'L00001' }, { ownerUid: 'L00002' }] } }) } }));
  app.get('/tasks', (req, res) => res.json(req.phleb)); return app;
}
const access = () => jwt.sign({ id: 'F00001', role: 'phlebotomist', aud: 'mediczy-phlebotomy', tokenType: 'access' }, JWT_CONFIG.SECRET);
test('authenticated multi-lab worker is scoped to the selected tenant collection owner', async () => {
  const result = await request(appFor('L00001')).get('/tasks').set('Authorization', `Bearer ${access()}`);
  expect(result.status).toBe(200); expect(result.body.memberships).toEqual([{ ownerUid: 'L00001' }]);
});
test('valid worker token cannot access an unassigned owner or missing owner binding', async () => {
  for (const owner of ['L00003', undefined]) expect((await request(appFor(owner)).get('/tasks').set('Authorization', `Bearer ${access()}`)).status).toBe(403);
});
