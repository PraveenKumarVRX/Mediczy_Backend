import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import twilio from 'twilio';

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(), connect: jest.fn() } }));
const { chatwootBridge, handleChatwootTwilioInbound } = await import('../services/chatwoot-bridge.service.js');
const { default: router } = await import('../routes/chatwoot-webhook.route.js');

const envKeys = ['CHATWOOT_ENABLED', 'CHANNEL_TEST_ACCOUNT_SID', 'CHANNEL_TEST_AUTH_TOKEN'];
const original = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const inbox = { id: 1, tenant_id: 1, channel: 'whatsapp', inbox_id: 201, enabled: true,
  account_enabled: true, credentials_prefix: 'CHANNEL_TEST', inbound_webhook_url: 'https://api.example.com/api/chatwoot/channels/twilio' };
const body = { AccountSid: 'AC-test-account', From: 'whatsapp:+919000000001', To: 'whatsapp:+919876543210',
  Body: 'Customer message', MessageSid: 'SM-test-message', NumMedia: '0' };
const signature = (params) => twilio.getExpectedTwilioSignature('test-auth-token', inbox.inbound_webhook_url, params);

beforeEach(() => {
  process.env.CHATWOOT_ENABLED = 'true';
  process.env.CHANNEL_TEST_ACCOUNT_SID = 'AC-test-account';
  process.env.CHANNEL_TEST_AUTH_TOKEN = 'test-auth-token';
  jest.spyOn(chatwootBridge, 'findInbox').mockResolvedValue(inbox);
  jest.spyOn(chatwootBridge, 'enqueueInbound').mockResolvedValue({ queued: true });
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const key of envKeys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
});

describe('tenant Twilio Chatwoot bridge', () => {
  it('validates the tenant callback signature and selects the receiving inbox', async () => {
    const result = await handleChatwootTwilioInbound({ body, get: () => signature(body) });
    expect(result).toEqual({ handled: true, queued: true });
    expect(chatwootBridge.findInbox).toHaveBeenCalledWith('whatsapp', body.To);
    expect(chatwootBridge.enqueueInbound).toHaveBeenCalledWith(expect.objectContaining({ inbox, customerId: body.From,
      content: body.Body, externalId: body.MessageSid }));
  });
  it('rejects a forged or wrong-account callback before storing customer messages', async () => {
    await expect(handleChatwootTwilioInbound({ body, get: () => 'forged' })).rejects.toMatchObject({ statusCode: 403 });
    const wrongAccount = { ...body, AccountSid: 'AC-wrong-tenant' };
    await expect(handleChatwootTwilioInbound({ body: wrongAccount, get: () => signature(wrongAccount) })).rejects.toMatchObject({ statusCode: 403 });
    expect(chatwootBridge.enqueueInbound).not.toHaveBeenCalled();
  });
  it('allows legacy handling for unconfigured recipients and globally disabled bridge', async () => {
    chatwootBridge.findInbox.mockResolvedValueOnce(null);
    expect(await handleChatwootTwilioInbound({ body })).toEqual({ handled: false });
    process.env.CHATWOOT_ENABLED = 'false';
    expect(await handleChatwootTwilioInbound({ body })).toEqual({ handled: false });
    expect(chatwootBridge.enqueueInbound).not.toHaveBeenCalled();
  });
  it('acknowledges signed ingress with empty TwiML and rejects unsigned ingress', async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use('/api/chatwoot', router);
    const accepted = await request(app).post('/api/chatwoot/channels/twilio')
      .set('x-twilio-signature', signature(body)).type('form').send(body);
    expect(accepted.status).toBe(200);
    expect(accepted.text).toBe('<Response></Response>');
    const rejected = await request(app).post('/api/chatwoot/channels/twilio').type('form').send(body);
    expect(rejected.status).toBe(403);
  });
  it('records a notice for media without publishing protected provider URLs', async () => {
    const media = { ...body, Body: '', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/protected-media' };
    await handleChatwootTwilioInbound({ body: media, get: () => signature(media) });
    const stored = chatwootBridge.enqueueInbound.mock.calls[0][0].content;
    expect(stored).toContain('1 media attachment');
    expect(stored).not.toContain(media.MediaUrl0);
  });
});
