import { jest, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const sendText = jest.fn();
const ai = jest.fn();
const enqueue = jest.fn();
const identityRequest = jest.fn();
const identityVerify = jest.fn();
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
jest.unstable_mockModule('../db/redis.js', () => ({ connectRedis: jest.fn(), cache: { get: async () => null, set: async () => {}, setNX: async () => 'OK', del: async () => {} } }));
jest.unstable_mockModule('../config/logger.js', () => ({ default: { info() {}, warn() {}, error() {} } }));
jest.unstable_mockModule('../services/autoTicketService.js', () => ({ detectServiceIntent: () => null, createAutoTicket: jest.fn() }));
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: async () => ({ rows: [] }) } }));
jest.unstable_mockModule('../services/crm-inbound-bridge.service.js', () => ({ bridgeInboundWhatsAppToCrm: async () => {} }));
jest.unstable_mockModule('../services/chatwoot-bridge.service.js', () => ({ handleChatwootTwilioInbound: jest.fn() }));
jest.unstable_mockModule('../services/whatsapp-identity.service.js', () => ({
  default: {
    getSession: async () => null,
    requestLink: identityRequest,
    verifyLink: identityVerify,
  },
  genericLinkMessage: 'If this WhatsApp number is linked to a Mediczy account, I’ll send a verification code here.'
}));
jest.unstable_mockModule('../utils/chatStorage.js', () => ({ chatRooms: { has: async () => true },
  messages: { push: async () => {}, get: async () => [], set: async () => {} } }));
const { default: router, handleIncomingWhatsApp, isAnswerFeedbackQuery, isGeneralHealthUpdateQuery, hasInternalContextMarker } = await import('../routes/whatsapp-production.route.js');
const reqFor = text => ({ whatsappProvider: 'gupshup', body: { From: 'whatsapp:+919000000001', To: 'whatsapp:+918098998998', Body: text, MessageSid: 'wa-test', ProfileName: 'Test' } });
const response = () => ({ status: jest.fn().mockReturnThis(), type: jest.fn().mockReturnThis(), end: jest.fn(), send: jest.fn() });
beforeEach(() => {
  sendText.mockReset().mockResolvedValue({ sid: 'gs-1', status: 'submitted' });
  enqueue.mockReset().mockResolvedValue(undefined);
  identityRequest.mockReset().mockResolvedValue({ success: true, message: 'If this WhatsApp number is linked to a Mediczy account, I’ll send a verification code here.' });
  identityVerify.mockReset().mockResolvedValue({ success: false, message: 'That verification code is invalid or expired.' });
});
it('recognizes broad health-update requests without treating them as symptoms', () => {
  expect(isGeneralHealthUpdateQuery('Hi any updates on my health')).toBe(true);
  expect(isGeneralHealthUpdateQuery('Any updates on my headache?')).toBe(false);
  expect(isGeneralHealthUpdateQuery('I have a headache')).toBe(false);
});
it('recognizes feedback about an irrelevant answer', () => {
  expect(isAnswerFeedbackQuery('Why r u sending irrelevant answers')).toBe(true);
  expect(isAnswerFeedbackQuery('I have a headache')).toBe(false);
});
it('detects internal retrieval markers before they can reach WhatsApp', () => {
  expect(hasInternalContextMarker('[PATIENT CONTEXT]\n- unrelated record')).toBe(true);
  expect(hasInternalContextMarker('Your latest report is ready.')).toBe(false);
});
it('answers a broad health-update request with a record-selection prompt', async () => {
  await handleIncomingWhatsApp(reqFor('Hi any updates on my health'), response());
  expect(sendText).toHaveBeenCalledWith(expect.objectContaining({
    body: expect.stringContaining('appointments, prescriptions, reports')
  }));
});
it('requires WhatsApp identity linking before personal records are discussed', async () => {
  await handleIncomingWhatsApp(reqFor('show my medical history'), response());
  expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('Reply `VERIFY`') }));
  expect(ai).not.toHaveBeenCalled();
});
it('handles the WhatsApp verification command before AI processing', async () => {
  await handleIncomingWhatsApp(reqFor('VERIFY'), response());
  expect(identityRequest).toHaveBeenCalledWith('+919000000001');
  expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('verification code') }));
  expect(ai).not.toHaveBeenCalled();
});
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
  const postProbe = await request(app).post('/api/whatsapp-production/webhook/gupshup').send({});
  expect(postProbe.status).toBe(200); expect(postProbe.text).toBe('');
  expect(enqueue).not.toHaveBeenCalled();
});
it('acknowledges a non-message v2 setup probe while Gupshup is not active', async () => {
  const app = express(); app.use(express.json()); app.use('/api/whatsapp-production', router);
  const previousProvider = (await import('../services/whatsapp-production.service.js')).default.provider;
  (await import('../services/whatsapp-production.service.js')).default.provider = 'twilio';
  try {
    const result = await request(app).post('/api/whatsapp-production/webhook/gupshup').send({
      app: 'TestApp', version: 2, type: 'user-event', payload: { type: 'sandbox-start' },
    });
    expect(result.status).toBe(200); expect(result.text).toBe('');
    expect(enqueue).not.toHaveBeenCalled();
  } finally {
    (await import('../services/whatsapp-production.service.js')).default.provider = previousProvider;
  }
});
it('acknowledges a non-message v2 setup probe while Gupshup is active', async () => {
  const app = express(); app.use(express.json()); app.use('/api/whatsapp-production', router);
  const result = await request(app).post('/api/whatsapp-production/webhook/gupshup').send({
    app: 'TestApp', version: 2, type: 'user-event', payload: { type: 'sandbox-start' },
  });
  expect(result.status).toBe(200); expect(result.text).toBe('');
  expect(enqueue).not.toHaveBeenCalled();
});
it('acknowledges a dashboard metadata probe while Gupshup is not active', async () => {
  const app = express(); app.use(express.json()); app.use('/api/whatsapp-production', router);
  const previousProvider = (await import('../services/whatsapp-production.service.js')).default.provider;
  (await import('../services/whatsapp-production.service.js')).default.provider = 'twilio';
  try {
    const result = await request(app).post('/api/whatsapp-production/webhook/gupshup').send({ url: 'https://example.invalid' });
    expect(result.status).toBe(200); expect(result.text).toBe('');
    expect(enqueue).not.toHaveBeenCalled();
  } finally {
    (await import('../services/whatsapp-production.service.js')).default.provider = previousProvider;
  }
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
it('accepts the configured Gupshup subscription header name', async () => {
  const app = express(); app.use(express.json()); app.use('/api/whatsapp-production', router);
  const previousHeader = process.env.GUPSHUP_WEBHOOK_HEADER_NAME;
  process.env.GUPSHUP_WEBHOOK_HEADER_NAME = 'sk_test-webhook-header';
  try {
    const result = await request(app).post('/api/whatsapp-production/webhook/gupshup')
      .set('sk_test-webhook-header', process.env.GUPSHUP_WEBHOOK_SECRET)
      .send({ app: 'TestApp', version: 2, type: 'message', payload: { id: 'wa-custom-header', source: '919000000001', type: 'text', payload: { text: 'hi' } } });
    expect(result.status).toBe(200); expect(result.text).toBe('');
  } finally {
    if (previousHeader === undefined) delete process.env.GUPSHUP_WEBHOOK_HEADER_NAME;
    else process.env.GUPSHUP_WEBHOOK_HEADER_NAME = previousHeader;
  }
});
