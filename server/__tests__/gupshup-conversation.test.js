import { jest, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const sendText = jest.fn();
const ai = jest.fn();
const enqueue = jest.fn();
const userContext = { isKnownUser: false, user: null, appointments: {}, prescriptions: {}, summary: '' };
process.env.WHATSAPP_AI_AUTO_REPLY = 'true';
process.env.WHATSAPP_PROVIDER = 'gupshup';
process.env.GUPSHUP_APP_NAME = 'TestApp';
process.env.GUPSHUP_SOURCE_NUMBER = '918098998998';
process.env.GUPSHUP_WEBHOOK_SECRET = 'test-secret-with-at-least-32-characters';
jest.unstable_mockModule('../services/gupshup-whatsapp.service.js', () => ({ default: { sendText },
  normalizeGupshupPhone: x => String(x).replace(/^whatsapp:/, '').replace(/\D/g, ''),
  statusKey: x => `status-${x}` }));
jest.unstable_mockModule('../services/gupshup-inbound-queue.service.js', () => ({ enqueueGupshupInbound: enqueue,
  recordGupshupStatus: jest.fn(), startGupshupInboundWorker: jest.fn() }));
jest.unstable_mockModule('../services/whatsapp-production.service.js', () => ({ default: { provider: 'gupshup', sendSessionMessage: jest.fn() } }));
jest.unstable_mockModule('../services/unified-conversation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/whatsapp-user-context.service.js', () => ({ default: { getFullUserContext: async () => userContext } }));
jest.unstable_mockModule('../services/support-chat-provider.service.js', () => ({ default: { postTicketNote: async () => ({}) } }));
jest.unstable_mockModule('../services/n8n.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/whatsapp-sib-brain.service.js', () => ({ default: { processMessage: ai } }));
jest.unstable_mockModule('../db/redis.js', () => ({ cache: { get: async () => null, set: async () => {}, del: async () => {} } }));
jest.unstable_mockModule('../config/logger.js', () => ({ default: { info() {}, warn() {}, error() {} } }));
jest.unstable_mockModule('../services/autoTicketService.js', () => ({ detectServiceIntent: () => null, createAutoTicket: jest.fn() }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: async () => ({ rows: [] }) } }));
jest.unstable_mockModule('../services/crm-inbound-bridge.service.js', () => ({ bridgeInboundWhatsAppToCrm: async () => {} }));
jest.unstable_mockModule('../services/chatwoot-bridge.service.js', () => ({ handleChatwootTwilioInbound: jest.fn() }));
jest.unstable_mockModule('../utils/chatStorage.js', () => ({ chatRooms: { has: async () => true },
  messages: { push: async () => {}, get: async () => [], set: async () => {} } }));
const { default: router, handleIncomingWhatsApp } = await import('../routes/whatsapp-production.route.js');
const reqFor = text => ({ whatsappProvider: 'gupshup', body: { From: 'whatsapp:+919000000001', To: 'whatsapp:+918098998998', Body: text, MessageSid: 'wa-test', ProfileName: 'Test' } });
const response = () => ({ status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), end: jest.fn(), send: jest.fn() });
beforeEach(() => { sendText.mockReset().mockResolvedValue({ sid: 'gs-1', status: 'submitted' }); enqueue.mockReset().mockResolvedValue(undefined); });
it('sends a legacy static greeting through Gupshup instead of returning TwiML', async () => {
  const res = response();
  await handleIncomingWhatsApp(reqFor('hi'), res);
  expect(sendText).toHaveBeenCalledTimes(1);
  expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: 'whatsapp:+919000000001', body: expect.any(String) }));
  expect(res.end).toHaveBeenCalled(); expect(res.send).not.toHaveBeenCalled();
});
it('propagates uncertain reply failure rather than sending a second fallback', async () => {
  sendText.mockRejectedValueOnce(new Error('Delivery outcome unknown'));
  await expect(handleIncomingWhatsApp(reqFor('hi'), response())).rejects.toThrow('Delivery outcome unknown');
  expect(sendText).toHaveBeenCalledTimes(1);
});
it('does not let Twilio-shaped payloads bypass Gupshup authentication on the old URL', async () => {
  const app = express(); app.use(express.json()); app.use('/api/whatsapp-production', router);
  const result = await request(app).post('/api/whatsapp-production/webhook').send(reqFor('hi').body);
  expect(result.status).toBe(403); expect(sendText).not.toHaveBeenCalled();
});
it('answers Gupshup dashboard URL validation probes without processing an event', async () => {
  const app = express(); app.use(express.json()); app.use('/api/whatsapp-production', router);
  for (const method of ['get', 'head']) {
    const result = await request(app)[method]('/api/whatsapp-production/webhook/gupshup');
    expect(result.status).toBe(200);
    if (method === 'get') expect(result.text).toBe('');
  }
  expect(enqueue).not.toHaveBeenCalled();
});
it('queues a signed Gupshup event through the legacy URL as well as the explicit URL', async () => {
  const app = express(); app.use(express.json()); app.use('/api/whatsapp-production', router);
  for (const path of ['/webhook', '/webhook/gupshup']) {
    const r = await request(app).post(`/api/whatsapp-production${path}`).set('x-gupshup-webhook-secret', process.env.GUPSHUP_WEBHOOK_SECRET)
      .send({ app: 'TestApp', version: 2, type: 'message', payload: { id: 'wa-test', source: '919000000001', type: 'text', payload: { text: 'hi' } } });
    expect(r.status).toBe(200); expect(r.text).toBe('');
  }
  expect(enqueue).toHaveBeenCalledTimes(2); expect(sendText).not.toHaveBeenCalled();
});
