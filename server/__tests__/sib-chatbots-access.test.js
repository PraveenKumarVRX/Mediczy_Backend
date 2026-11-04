import { jest, beforeAll, beforeEach, describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const processMessage = jest.fn();
jest.unstable_mockModule('../services/medical-channel-chat.service.js', () => ({ channelChat: jest.fn() }));
jest.unstable_mockModule('../services/unified-conversation.service.js', () => ({ default: { processMessage } }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: async () => ({ rows: [] }) } }));
jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
  authUser: (req, res, next) => {
    if (!req.headers['x-test-role']) return res.sendStatus(401);
    req.user = { id: 7 }; req.userRole = req.headers['x-test-role']; next();
  },
  requireRole: allowed => (req, res, next) => {
    if (!(Array.isArray(allowed) ? allowed : [allowed]).includes(req.userRole)) return res.sendStatus(403);
    next();
  },
}));
let app;
beforeAll(async () => { app = express().use(express.json()).use((await import('../routes/sib-chatbots.route.js')).default); });
beforeEach(() => { processMessage.mockReset(); processMessage.mockResolvedValue({ response: 'General education' }); });

describe('actual admin chatbot route access boundary', () => {
  it('does not expose bot operations to anonymous or patient callers', async () => {
    expect((await request(app).post('/health-bot/chat').send({ message: 'hello' })).status).toBe(401);
    expect((await request(app).post('/health-bot/chat').set('x-test-role', 'user').send({ message: 'hello' })).status).toBe(403);
    expect(processMessage).not.toHaveBeenCalled();
  });
  it('rejects unvalidated patient identity/context even for admins', async () => {
    for (const body of [{ patientData: { id: 99 } }, { patientId: 99 }, { userId: 99 }, { patientInfo: { id: 99 } }]) {
      expect((await request(app).post('/health-bot/chat').set('x-test-role', 'admin').send({ message: 'hello', ...body })).status).toBe(403);
    }
    expect(processMessage).not.toHaveBeenCalled();
  });
  it('scopes generic team chat to the authenticated actor', async () => {
    expect((await request(app).post('/health-bot/chat').set('x-test-role', 'team').send({ message: 'hello', conversationId: 'shared' })).status).toBe(200);
    expect(processMessage.mock.calls[0][0]).toMatchObject({ sessionId: 'admin:team:7:shared', identifier: 'admin-chat:7' });
  });
});
