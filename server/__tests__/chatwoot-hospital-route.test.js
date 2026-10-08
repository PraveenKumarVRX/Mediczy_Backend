import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const status = jest.fn(async (tenantId) => ({ state: 'configured', tenantId }));
const checkHealth = jest.fn(async (tenantId) => ({ state: 'healthy', tenantId }));
jest.unstable_mockModule('../services/chatwoot-bridge.service.js', () => ({ chatwootBridge: { status, checkHealth } }));
const { default: router } = await import('../routes/hospital-chatwoot.route.js');
const app = express();
app.use('/api/hospital/communication/chatwoot', router);
const token = jwt.sign({ id: 19, role: 'hospital_admin', tenant_id: 7 }, JWT_CONFIG.SECRET, { expiresIn: '5m' });

beforeEach(() => { status.mockClear(); checkHealth.mockClear(); });

describe('hospital Chatwoot workspace access', () => {
  it('requires a hospital session', async () => {
    expect((await request(app).get('/api/hospital/communication/chatwoot')).status).toBe(401);
    expect(status).not.toHaveBeenCalled();
  });
  it('uses verified tenant claims instead of a tenant supplied in the query', async () => {
    const response = await request(app).get('/api/hospital/communication/chatwoot?tenantId=999')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(status).toHaveBeenCalledWith(7);
    expect(response.body.data.tenantId).toBe(7);
  });
  it('checks only the authenticated hospital account', async () => {
    const response = await request(app).get('/api/hospital/communication/chatwoot/health')
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', '999');
    expect(response.status).toBe(200);
    expect(checkHealth).toHaveBeenCalledWith(7);
  });
  it('rejects accounts without hospital role or tenant context', async () => {
    for (const claims of [{ id: 19, role: 'user', tenant_id: 7 }, { id: 19, role: 'hospital_admin' }]) {
      const invalid = jwt.sign(claims, JWT_CONFIG.SECRET, { expiresIn: '5m' });
      expect((await request(app).get('/api/hospital/communication/chatwoot').set('Authorization', `Bearer ${invalid}`)).status).toBe(403);
    }
    expect(status).not.toHaveBeenCalled();
  });
});
