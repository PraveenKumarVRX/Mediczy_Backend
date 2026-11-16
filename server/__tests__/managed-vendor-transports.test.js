import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import { defineIntegration } from '../integrations/core/integration.js';
import { get, statusAll } from '../integrations/core/registry.js';
import { createManagedFetch, manageAxios } from '../integrations/transport.js';
import { manageMailTransport } from '../integrations/nodemailer.js';
import { manageMessaging } from '../integrations/fcm.js';

const savedEnv = { ...process.env };
beforeEach(() => { for (const id of ['twilio','gupshup','llm-openai','smtp','firebase-fcm','google-places']) get(id)._reset(); });
afterEach(() => { process.env = { ...savedEnv }; jest.useRealTimers(); });

describe('HTTP and SDK migration', () => {
  it('marks all surveyed vendors as controlled, retaining SmartCRM’s own client', () => {
    expect(statusAll().summary).toMatchObject({ total: 21, managedByCore: 20, ownClient: 1, unmanaged: 0 });
  });
  it('does not call fetch when a vendor is disabled', async () => {
    process.env.INTEGRATION_TWILIO_ENABLED = 'false';
    const network = jest.fn();
    await expect(createManagedFetch(network)('https://api.twilio.com/messages')).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
    expect(network).not.toHaveBeenCalled();
  });
  it('validates configuration before outbound calls', async () => {
    delete process.env.OPENAI_API_KEY;
    const network = jest.fn();
    await expect(createManagedFetch(network)('https://api.openai.com/v1/chat/completions')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' });
    expect(network).not.toHaveBeenCalled();
  });
  it('preserves binary responses, caller abort signals, and rejects redirects', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const controller = new AbortController();
    const response = new Response(new Uint8Array([0,1,255]));
    const network = jest.fn(async (_url, options) => { expect(options.redirect).toBe('error'); controller.abort(); expect(options.signal.aborted).toBe(true); return response; });
    const actual = await createManagedFetch(network)('https://api.openai.com/v1/audio/speech', { method: 'POST', signal: controller.signal });
    expect(new Uint8Array(await actual.arrayBuffer())).toEqual(new Uint8Array([0,1,255]));
  });
  it('preserves a 4xx response but records a failure without opening the circuit', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'test'; process.env.TWILIO_AUTH_TOKEN = 'test';
    const network = jest.fn(async () => new Response('{}', { status: 400 }));
    const response = await createManagedFetch(network)('https://api.twilio.com/messages');
    expect(response.status).toBe(400);
    expect(get('twilio').status()).toMatchObject({ circuit: 'CLOSED', metrics: { failed: 1, ok: 0 } });
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('rejects an unapproved configured vendor origin rather than bypassing the layer', async () => {
    process.env.ABDM_BASE_URL = 'https://attacker.invalid';
    const network = jest.fn();
    await expect(createManagedFetch(network)('https://attacker.invalid/gateway')).rejects.toMatchObject({ code: 'INTEGRATION_HOST_NOT_ALLOWED' });
    expect(network).not.toHaveBeenCalled();
  });
  it('enforces deadlines even if an SDK ignores its abort signal, without retrying a send', async () => {
    const integration = defineIntegration({ id: 'slow-sdk', name: 'Slow SDK', category: 'push', dataClass: 'pii', timeoutMs: 10, retry: { attempts: 3 } });
    const send = jest.fn(() => new Promise(() => {}));
    await expect(integration.call(send)).rejects.toMatchObject({ code: 'INTEGRATION_TIMEOUT' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('retains Axios form bodies, credentials, response data and zero redirects', async () => {
    const adapter = jest.fn(async config => { expect(config.maxRedirects).toBe(0); expect(config.data).toBe('to=123&body=hello'); expect(config.signal).toBeDefined();
      return { data: { messageId: 'sent' }, status: 200, statusText: 'OK', config, headers: {} }; });
    const http = manageAxios(axios.create({ adapter }), axios);
    const response = await http.post('https://api.gupshup.io/wa/api/v1/msg', 'to=123&body=hello', { headers: { apikey: 'mailbox-specific', 'Content-Type': 'application/x-www-form-urlencoded' } });
    expect(response.data.messageId).toBe('sent'); expect(adapter).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(get('gupshup').status())).not.toContain('mailbox-specific');
  });
  it('refuses Axios SDK calls before I/O when disabled', async () => {
    process.env.INTEGRATION_GUPSHUP_ENABLED = 'false';
    const adapter = jest.fn(); const http = manageAxios(axios.create({ adapter }), axios);
    await expect(http.post('https://api.gupshup.io/msg')).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' }); expect(adapter).not.toHaveBeenCalled();
  });
  it('preserves vendor-specific Axios errors for application classification', async () => {
    const error = { response: { status: 400, data: { error: 'rejected' } } };
    const http = manageAxios(axios.create({ adapter: async () => { throw error; } }), axios);
    await expect(http.post('https://api.gupshup.io/msg', {}, { headers: { apikey: 'test' } })).rejects.toBe(error);
    expect(get('gupshup').status().circuit).toBe('CLOSED');
  });
  it('guards SMTP promises and callbacks using per-mailbox configuration', async () => {
    const sendMail = jest.fn(async () => ({ messageId: 'smtp-1' }));
    const smtp = manageMailTransport({ sendMail });
    expect(await smtp.sendMail({ to: 'test@example.org' })).toEqual({ messageId: 'smtp-1' });
    await new Promise((resolve, reject) => smtp.sendMail({}, (error, result) => { if (error) return reject(error); expect(result.messageId).toBe('smtp-1'); resolve(); }));
    process.env.INTEGRATION_SMTP_ENABLED = 'false';
    await expect(smtp.sendMail({})).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
  it('guards FCM without changing results or retrying a message', async () => {
    const send = jest.fn(async () => 'fcm-id'); const client = manageMessaging({ send });
    expect(await client.send({ token: 'private-device' })).toBe('fcm-id');
    process.env.INTEGRATION_FIREBASE_FCM_ENABLED = 'false';
    await expect(client.send({})).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(get('firebase-fcm').status())).not.toContain('private-device');
  });
});

describe('real SDK adapter boundaries (no network)', () => {
  it('guards Twilio’s actual SDK request while preserving its message result', async () => {
    const { default: twilio } = await import('../integrations/twilio.js');
    const network = jest.fn(async () => ({ statusCode: 201, body: JSON.stringify({ sid: 'SM-test', status: 'queued' }) }));
    const client = twilio('AC' + 'a'.repeat(32), 'test-token', { httpClient: { request: network } });
    expect((await client.messages.create({ from: '+10000000000', to: '+10000000001', body: 'test' })).sid).toBe('SM-test');
    process.env.INTEGRATION_TWILIO_ENABLED = 'false';
    await expect(client.messages.create({ from: '+10000000000', to: '+10000000001', body: 'test' })).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('guards Razorpay’s actual SDK and preserves its normalized refusal shape', async () => {
    const { default: Razorpay } = await import('../integrations/razorpay.js');
    const client = new Razorpay({ key_id: 'test-key', key_secret: 'test-secret' });
    const network = jest.fn(async config => ({ status: 200, statusText: 'OK', headers: {}, config, data: { id: 'order_1' } }));
    client.api.rq.defaults.adapter = network;
    expect((await client.orders.fetch('order_1')).id).toBe('order_1');
    process.env.INTEGRATION_RAZORPAY_ENABLED = 'false';
    await expect(client.orders.fetch('order_1')).rejects.toMatchObject({ statusCode: 503, error: { code: 'INTEGRATION_DISABLED' } });
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('guards LiveKit with a configured endpoint and bounds the SDK timeout', async () => {
    process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'key'; process.env.LIVEKIT_API_SECRET = 'secret';
    const original = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'test', created_at: '123' })));
    try {
      const { RoomServiceClient } = await import('../integrations/livekit.js');
      const client = new RoomServiceClient('https://test.livekit.cloud', 'key', 'secret');
      expect(client.rpc.requestTimeout).toBe(8);
      expect(await client.createRoom({ name: 'test' })).toMatchObject({ name: 'test' });
      expect(original.mock.calls[0][1].redirect).toBe('error');
      process.env.INTEGRATION_LIVEKIT_ENABLED = 'false';
      await expect(client.createRoom({ name: 'test' })).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
      expect(original).toHaveBeenCalledTimes(1);
    } finally { original.mockRestore(); }
  });
  it('guards SES before the SDK sends, preserving results and abort support', async () => {
    const sdk = await import('@aws-sdk/client-sesv2');
    const original = jest.spyOn(sdk.SESv2Client.prototype, 'send').mockResolvedValue({ MessageId: 'ses-1' });
    const { SESv2Client, SendEmailCommand } = await import('../integrations/ses.js');
    const client = new SESv2Client({ region: 'ap-south-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
    try {
      expect(await client.send(new SendEmailCommand({}))).toEqual({ MessageId: 'ses-1' });
      expect(original.mock.calls[0][1].abortSignal).toBeDefined();
      process.env.INTEGRATION_AWS_SES_ENABLED = 'false';
      await expect(client.send(new SendEmailCommand({}))).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED' });
      expect(original).toHaveBeenCalledTimes(1);
    } finally { original.mockRestore(); client.destroy(); }
  });
});
