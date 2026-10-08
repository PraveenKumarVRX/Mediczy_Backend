import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const post = jest.fn();
const twilioSend = jest.fn();
jest.unstable_mockModule('axios', () => ({ default: { post } }));
jest.unstable_mockModule('twilio', () => ({ default: () => ({ messages: { create: twilioSend } }) }));
const { GupshupWhatsAppService, normalizeGupshupPhone } = await import('../services/gupshup-whatsapp.service.js');
const { createGupshupWebhook, normalizeGupshupEvent, gupshupJobId } = await import('../services/gupshup-webhook.service.js');
const config = { apiKey: 'test-secret-do-not-return', appName: 'MediqzyTest', sourceNumber: '918098998998' };
const env = { WHATSAPP_PROVIDER: 'gupshup', GUPSHUP_APP_NAME: config.appName,
  GUPSHUP_SOURCE_NUMBER: config.sourceNumber, GUPSHUP_WEBHOOK_SECRET: 'test-webhook-secret-32-characters-long' };
const sender = new GupshupWhatsAppService({ http: { post }, config });
const inbound = { app: config.appName, version: 2, type: 'message', timestamp: Date.now(), payload: {
  id: 'wamid-example', source: '919000000001', type: 'text', payload: { text: 'hello' }, sender: { name: 'Test' } } };
const savedEnv = { ...process.env };
afterAll(() => { for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]; Object.assign(process.env, savedEnv); });
beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: { status: 'submitted', messageId: 'gs-message-1' } });
  twilioSend.mockReset().mockResolvedValue({ sid: 'SM-test', status: 'queued' });
});

describe('real Gupshup transport', () => {
  it('submits URL-encoded text with provider credentials only in the header', async () => {
    const result = await sender.sendText({ to: '9000000001', body: 'Hello & welcome' });
    const [url, encoded, options] = post.mock.calls[0];
    expect(url).toBe('https://api.gupshup.io/wa/api/v1/msg');
    const form = new URLSearchParams(encoded);
    expect(form.get('source')).toBe('918098998998');
    expect(form.get('destination')).toBe('919000000001');
    expect(form.get('src.name')).toBe('MediqzyTest');
    expect(JSON.parse(form.get('message'))).toEqual({ type: 'text', text: 'Hello & welcome' });
    expect(options.headers.apikey).toBe(config.apiKey);
    expect(options.timeout).toBe(10000);
    expect(result.status).toBe('submitted');
    expect(result.sid).toBe('gs-message-1');
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });
  it('uses the separate template API and ordered parameters', async () => {
    await sender.sendTemplate({ to: '+919000000001', templateId: 'approved-template-id', params: ['A', 123456] });
    expect(post.mock.calls[0][0]).toBe('https://api.gupshup.io/wa/api/v1/template/msg');
    expect(JSON.parse(new URLSearchParams(post.mock.calls[0][1]).get('template')))
      .toEqual({ id: 'approved-template-id', params: ['A', '123456'] });
  });
  it('rejects Twilio templates and incomplete configuration without an HTTP request', async () => {
    expect(() => sender.sendTemplate({ to: '9000000001', templateId: 'HXold-template' })).toThrow(/Twilio/);
    await expect(new GupshupWhatsAppService({ config: {} }).sendText({ to: '9000000001', body: 'hello' })).rejects.toThrow(/configured/);
    expect(post).not.toHaveBeenCalled();
  });
  it('does not fabricate success when the provider rejects a payload', async () => {
    post.mockResolvedValueOnce({ data: { status: 'error', message: 'rejected' } });
    await expect(sender.sendText({ to: '9000000001', body: 'hello' })).rejects.toMatchObject({ code: 'GUPSHUP_INVALID_RESPONSE' });
  });
  it('redacts HTTP errors and never automatically retries an uncertain send', async () => {
    post.mockRejectedValueOnce({ message: 'secret body', config: { headers: { apikey: config.apiKey } } });
    const err = await sender.sendText({ to: '9000000001', body: 'private' }).catch(e => e);
    expect(err.code).toBe('GUPSHUP_DELIVERY_UNCERTAIN');
    expect(JSON.stringify(err)).not.toContain(config.apiKey);
    expect(err.cause).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('distinguishes an explicit provider rejection from a timeout', async () => {
    post.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(sender.sendText({ to: '9000000001', body: 'hello' })).rejects.toMatchObject({ definitelyNotSent: true, status: 401 });
  });
  it('normalizes the migrated number and refuses malformed numbers', () => {
    expect(normalizeGupshupPhone('whatsapp:+91 8098998998')).toBe('918098998998');
    expect(() => normalizeGupshupPhone('8098bad998')).toThrow();
  });
  it('encodes document media with the appropriate provider schema', async () => {
    await sender.sendMedia({ to: '9000000001', mediaUrl: 'https://example.com/report.pdf', caption: 'Report' });
    expect(JSON.parse(new URLSearchParams(post.mock.calls[0][1]).get('message')))
      .toEqual({ type: 'file', url: 'https://example.com/report.pdf', filename: 'report.pdf', caption: 'Report' });
  });
});

describe('Gupshup webhook boundary', () => {
  let enqueue, saveStatus, app;
  beforeEach(() => {
    enqueue = jest.fn().mockResolvedValue(undefined); saveStatus = jest.fn().mockResolvedValue(undefined);
    app = express(); app.use(express.json());
    app.post('/webhook', createGupshupWebhook({ enqueue, saveStatus, env }));
  });
  const send = (app, body) => request(app).post('/webhook').set('x-gupshup-webhook-secret', env.GUPSHUP_WEBHOOK_SECRET).send(body);
  it('authenticates, normalizes and durably enqueues before returning an empty ACK', async () => {
    const response = await send(app, inbound);
    expect(response.status).toBe(200); expect(response.text).toBe('');
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'message', message: expect.objectContaining({ From: 'whatsapp:+919000000001', To: 'whatsapp:+918098998998', Body: 'hello' }) }));
  });
  it('refuses unsigned requests without side effects', async () => {
    expect((await request(app).post('/webhook').send(inbound)).status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled(); expect(saveStatus).not.toHaveBeenCalled();
  });
  it('fails closed when authentication is unconfigured', async () => {
    const isolated = express(); isolated.use(express.json());
    isolated.post('/webhook', createGupshupWebhook({ enqueue, saveStatus, env: { ...env, GUPSHUP_WEBHOOK_SECRET: '' } }));
    expect((await send(isolated, inbound)).status).toBe(503);
  });
  it('rejects the wrong app and receiving number', async () => {
    expect((await send(app, { ...inbound, app: 'AnotherTenant' })).status).toBe(403);
    expect((await send(app, { ...inbound, phone: '919000000099' })).status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('rejects Meta-format callbacks when the dashboard is configured for v2', async () => {
    expect((await send(app, { ...inbound, version: 3 })).status).toBe(422);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('returns retryable failure instead of acknowledging a lost queue write', async () => {
    enqueue.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await send(app, inbound)).status).toBe(503);
  });
  it('routes delivery events to status storage, never to the conversation bot', async () => {
    const response = await send(app, { ...inbound, type: 'message-event', payload: { id: 'wa-id', gsId: 'gs-id', type: 'delivered' } });
    expect(response.status).toBe(200);
    expect(saveStatus).toHaveBeenCalledWith(expect.objectContaining({ sid: 'gs-id', status: 'delivered' }));
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('normalizes interactive replies and identifies unsupported media without fetching URLs', () => {
    const button = normalizeGupshupEvent({ ...inbound, payload: { ...inbound.payload, type: 'button_reply', payload: { title: 'Confirm' } } }, env);
    expect(button.message.Body).toBe('Confirm');
    const media = normalizeGupshupEvent({ ...inbound, payload: { ...inbound.payload, type: 'image', payload: { url: 'http://127.0.0.1/private' } } }, env);
    expect(media.unsupportedMedia).toBe(true); expect(JSON.stringify(media)).not.toContain('127.0.0.1');
  });
  it('uses a stable app-scoped callback deduplication ID', () => {
    const event = normalizeGupshupEvent(inbound, env);
    expect(gupshupJobId(event)).toBe(gupshupJobId({ ...event }));
    expect(gupshupJobId(event)).not.toBe(gupshupJobId({ ...event, app: 'another-app' }));
  });
  it('acknowledges authenticated system events without generating replies', async () => {
    expect((await send(app, { ...inbound, type: 'user-event' })).status).toBe(200);
    expect(enqueue).not.toHaveBeenCalled(); expect(saveStatus).not.toHaveBeenCalled();
  });
});

describe('production sender provider migration', () => {
  let service;
  beforeEach(async () => {
    Object.assign(process.env, env, { GUPSHUP_API_KEY: config.apiKey, GUPSHUP_TEMPLATE_OTP: 'gup-otp',
      GUPSHUP_TEMPLATE_APPOINTMENT_CONFIRMATION: 'gup-appointment', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'test' });
    jest.resetModules();
    service = (await import('../services/whatsapp-production.service.js')).default;
  });
  it('routes session replies to Gupshup even when Twilio credentials remain', async () => {
    await service.sendSessionMessage({ to: '9000000001', body: 'hello' });
    expect(service.configured).toBe(true); expect(post).toHaveBeenCalledTimes(1); expect(twilioSend).not.toHaveBeenCalled();
  });
  it('sends OTP through an approved Gupshup template', async () => {
    await service.sendOTP({ to: '9000000001', otp: '123456' });
    expect(JSON.parse(new URLSearchParams(post.mock.calls[0][1]).get('template'))).toEqual({ id: 'gup-otp', params: ['123456'] });
  });
  it('preserves appointment variable order', async () => {
    await service.sendAppointmentConfirmation({ to: '9000000001', patientName: 'Patient', doctorName: 'Doctor', date: '2026-10-08', time: '10:00', location: 'Clinic' });
    expect(JSON.parse(new URLSearchParams(post.mock.calls[0][1]).get('template')).params).toEqual(['Patient', 'Doctor', '2026-10-08', '10:00', 'Clinic']);
  });
  it('does not fall back to Twilio or unapproved freeform notifications when a template is missing', async () => {
    delete process.env.GUPSHUP_TEMPLATE_OTP;
    await expect(service.sendOTP({ to: '9000000001', otp: '123456' })).rejects.toThrow(/template/);
    expect(post).not.toHaveBeenCalled(); expect(twilioSend).not.toHaveBeenCalled();
  });
  it('continues supporting Twilio when explicitly selected', async () => {
    process.env.WHATSAPP_PROVIDER = 'twilio';
    service.fromNumber = 'whatsapp:+14155550000';
    await service.sendOTP({ to: '+919000000001', otp: '123456' });
    expect(twilioSend).toHaveBeenCalledTimes(1); expect(post).not.toHaveBeenCalled();
  });
});
