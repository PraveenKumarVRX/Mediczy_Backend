import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockChat = jest.fn();
const mockListModules = jest.fn(() => [
  { id: 'billing', label: 'Revenue Copilot', agent: 'insurance', samd: false },
  { id: 'clinical', label: 'Clinical Copilot', agent: 'clinical', samd: true },
]);

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (_req, _res, next) => next(),
}));

jest.unstable_mockModule('../middleware/hospitalContext.middleware.js', () => ({
  hospitalContextFromToken: (req, _res, next) => {
    req.hospitalId = 7;
    req.userId = 99;
    req.user = { id: 99, hospital_id: 7, role: 'hospital_admin' };
    next();
  },
}));

jest.unstable_mockModule('../services/module-copilot.service.js', () => ({
  default: {
    chat: mockChat,
    listModules: mockListModules,
    getModuleConfig: (id) => ({ label: id, samd: id === 'clinical' }),
    MODULE_COPILOTS: {},
  },
}));

let app;

beforeAll(async () => {
  const router = (await import('../routes/module-copilot.route.js')).default;
  app = express();
  app.use(express.json());
  app.use('/api/v3/module-copilot', router);
});

beforeEach(() => {
  mockChat.mockReset();
  mockChat.mockResolvedValue({
    response: 'AR aging: ₹1,24,000 due across 18 open invoices.',
    agentsUsed: ['insurance'],
    moduleId: 'billing',
    copilotLabel: 'Revenue Copilot',
    samd: false,
    latencyMs: 120,
    totalTokens: 45,
  });
});

describe('Module Copilot API', () => {
  it('GET /modules returns registry', async () => {
    const res = await request(app).get('/api/v3/module-copilot/modules');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.modules)).toBe(true);
    expect(res.body.modules.length).toBeGreaterThan(0);
  });

  it('POST /chat requires moduleId', async () => {
    const res = await request(app)
      .post('/api/v3/module-copilot/chat')
      .send({ message: 'Show AR aging' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/moduleId/i);
  });

  it('POST /chat requires message', async () => {
    const res = await request(app)
      .post('/api/v3/module-copilot/chat')
      .send({ moduleId: 'billing' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/message/i);
  });

  it('POST /chat returns copilot response for billing module', async () => {
    const res = await request(app)
      .post('/api/v3/module-copilot/chat')
      .set('Authorization', 'Bearer test-token')
      .send({
        moduleId: 'billing',
        message: 'Show AR aging summary',
        context: { screen: 'Hospital Billing' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.response).toContain('AR aging');
    expect(res.body.moduleId).toBe('billing');
    expect(res.body.copilotLabel).toBe('Revenue Copilot');
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: 'billing',
        message: 'Show AR aging summary',
      })
    );
  });

  it('POST /chat marks clinical copilot as SaMD', async () => {
    mockChat.mockResolvedValueOnce({
      response: 'Differential: consider ACS, GERD, musculoskeletal pain.',
      agentsUsed: ['clinical'],
      moduleId: 'clinical',
      copilotLabel: 'Clinical Copilot',
      samd: true,
      latencyMs: 200,
      totalTokens: 80,
    });

    const res = await request(app)
      .post('/api/v3/module-copilot/chat')
      .set('Authorization', 'Bearer test-token')
      .send({ moduleId: 'clinical', message: 'Draft differential for chest pain' });

    expect(res.status).toBe(200);
    expect(res.body.samd).toBe(true);
    expect(res.body.agentsUsed).toContain('clinical');
  });

  it('POST /chat surfaces orchestrator errors', async () => {
    mockChat.mockRejectedValueOnce(new Error('Agent timeout'));
    const res = await request(app)
      .post('/api/v3/module-copilot/chat')
      .set('Authorization', 'Bearer test-token')
      .send({ moduleId: 'billing', message: 'test' });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/timeout/i);
  });
});
