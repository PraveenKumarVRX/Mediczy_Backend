import { jest } from '@jest/globals';

// Chatwoot as the Team's WhatsApp desk for the Gupshup number (2026-11-22).

const poolQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: poolQuery, connect: jest.fn() } }));
const sendText = jest.fn();
const sendMedia = jest.fn();
jest.unstable_mockModule('../services/gupshup-whatsapp.service.js', () => ({ default: { sendText, sendMedia } }));
const scanOnly = jest.fn(async () => ({ clean: true }));
jest.unstable_mockModule('../services/minio-upload.service.js', () => ({ scanOnly }));
const handoff = { set: jest.fn(async () => ({})), clear: jest.fn(async () => true) };
jest.unstable_mockModule('../services/whatsapp-handoff.service.js', () => ({ setHandoffState: handoff.set, clearHandoffState: handoff.clear }));
const httpRequest = jest.fn();
jest.unstable_mockModule('../integrations/axios.js', () => ({ default: { request: httpRequest } }));
jest.unstable_mockModule('../integrations/twilio.js', () => ({ default: jest.fn() }));
jest.unstable_mockModule('../integrations/nodemailer.js', () => ({ default: { createTransport: jest.fn() } }));

const { dispatch, chatwootBridge, whatsappDesk } = await import('../services/chatwoot-bridge.service.js');
const { ChatwootService } = await import('../services/chatwoot.service.js');
const inbox = { provider: 'gupshup', channel: 'whatsapp', channel_address: '+918098998998' };
beforeEach(() => { poolQuery.mockReset(); sendText.mockReset(); sendMedia.mockReset(); httpRequest.mockReset(); scanOnly.mockClear(); handoff.set.mockClear(); handoff.clear.mockClear(); });

describe('agent replies go out through Gupshup, within WhatsApp\'s 24-hour window', () => {
  test('a reply within 24 hours of the member\'s last message is sent', async () => {
    poolQuery.mockResolvedValue({ rows: [{ at: new Date(Date.now() - 3600e3).toISOString() }] });
    sendText.mockResolvedValue({ messageId: 'gs-9' });
    await expect(dispatch({ inbox, to: '+919000000001', content: 'Hello from the team', bridgeConversationId: 5 })).resolves.toEqual({ id: 'gs-9' });
    expect(poolQuery.mock.calls[0][1]).toEqual([5]);
    expect(sendText).toHaveBeenCalledWith({ to: '+919000000001', body: 'Hello from the team' });
    // Sent once: a text-only reply went out twice after the attachment change (2026-11-22, 'Yes sir').
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendMedia).not.toHaveBeenCalled();
  });

  test('after 24 hours nothing is sent, and the agent is told why', async () => {
    poolQuery.mockResolvedValue({ rows: [{ at: new Date(Date.now() - 25 * 3600e3).toISOString() }] });
    await expect(dispatch({ inbox, to: '+919000000001', content: 'Late reply', bridgeConversationId: 5 }))
      .rejects.toMatchObject({ definitelyNotSent: true, publicMessage: expect.stringContaining('within 24 hours') });
    expect(sendText).not.toHaveBeenCalled();
  });

  test('a refusal from Gupshup is a definite non-delivery; a timeout is not', async () => {
    poolQuery.mockResolvedValue({ rows: [{ at: new Date().toISOString() }] });
    sendText.mockRejectedValueOnce(Object.assign(new Error('rejected'), { definitelyNotSent: true }));
    await expect(dispatch({ inbox, to: '+919000000001', content: 'x', bridgeConversationId: 5 })).rejects.toMatchObject({ definitelyNotSent: true });
    sendText.mockRejectedValueOnce(new Error('timeout'));
    await expect(dispatch({ inbox, to: '+919000000001', content: 'x', bridgeConversationId: 5 })).rejects.toMatchObject({ definitelyNotSent: false });
  });
});

describe('the desk is silent until it is set up', () => {
  test('with the bridge disabled, mirroring does nothing and never throws', async () => {
    expect(chatwootBridge.enabled).toBe(false);
    await expect(whatsappDesk.inbound({ from: '+919000000001', body: 'hi', messageId: 'm1' })).resolves.toBeNull();
    await expect(whatsappDesk.botReply({ to: '+919000000001', text: 'hello' })).resolves.toBeNull();
    await expect(whatsappDesk.handoff({ to: '+919000000001', reason: 'x' })).resolves.toBeNull();
    await expect(whatsappDesk.enabled()).resolves.toBe(false);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('Chatwoot events hand the chat to the Team and back', () => {
  const account = { tenant_id: 7, account_id: 3, webhook_secret_env: 'S', api_token_env: 'T', enabled: true };
  const mapping = { id: 11, tenant_id: 7, channel: 'whatsapp', inbox_id: 4, enabled: true, customer_id: '+919000000001', crm_conversation_id: 21 };
  const make = (hooks) => {
    const client = { query: jest.fn(async (sql) => (sql.includes('INSERT INTO crm_chatwoot_jobs') ? { rows: [{ id: 1 }] } : { rows: [] })), release: jest.fn() };
    const db = {
      connect: async () => client,
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM crm_chatwoot_accounts')) return { rows: [account] };
        if (sql.includes('FROM crm_chatwoot_conversations')) return { rows: [mapping] };
        return { rows: [] };
      }),
    };
    const svc = new ChatwootService({ db, http: {}, dispatch: jest.fn(), env: { CHATWOOT_ENABLED: 'true', S: 'secret', T: 'token' }, hooks });
    svc.webhook = svc.webhook.bind(svc);
    return svc;
  };
  const signed = async (svc, payload) => {
    const { createHmac } = await import('node:crypto');
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac('sha256', 'secret').update(`${timestamp}.`).update(rawBody).digest('hex')}`;
    return svc.webhook({ payload, rawBody, timestamp, signature });
  };

  test('an agent\'s public reply queues delivery and calls onAgentReply', async () => {
    const hooks = { onAgentReply: jest.fn(async () => {}), onResolved: jest.fn(async () => {}) };
    const out = await signed(make(hooks), { event: 'message_created', account: { id: 3 }, conversation: { id: 99, inbox_id: 4 }, inbox: { id: 4 },
      id: 501, private: false, message_type: 'outgoing', sender: { type: 'user' }, content: 'Hi, Parinitha here' });
    expect(out).toEqual({ queued: true, duplicate: false });
    expect(hooks.onAgentReply).toHaveBeenCalledWith(mapping);
    expect(hooks.onResolved).not.toHaveBeenCalled();
  });

  test('the assistant\'s own mirrored messages are never sent again', async () => {
    const hooks = { onAgentReply: jest.fn(async () => {}) };
    const out = await signed(make(hooks), { event: 'message_created', account: { id: 3 }, conversation: { id: 99, inbox_id: 4 }, inbox: { id: 4 },
      id: 502, private: false, message_type: 'outgoing', sender: { type: 'user' }, content: '🤖 hello', content_attributes: { mediczy_bridge_job_id: '7' } });
    expect(out).toEqual({ ignored: true, reason: 'not_public_agent_reply' });
    expect(hooks.onAgentReply).not.toHaveBeenCalled();
  });

  test('resolving the conversation calls onResolved', async () => {
    const hooks = { onResolved: jest.fn(async () => {}) };
    await signed(make(hooks), { event: 'conversation_status_changed', account: { id: 3 }, id: 99, inbox_id: 4, status: 'resolved' });
    expect(hooks.onResolved).toHaveBeenCalledWith(mapping);
  });
});

describe('the bridge hooks for WhatsApp', () => {
  test('agent reply starts a hand-off, resolve ends it', async () => {
    await chatwootBridge.hooks.onAgentReply({ channel: 'whatsapp', customer_id: '+919000000001' });
    expect(handoff.set).toHaveBeenCalledWith('+919000000001', expect.objectContaining({ reason: 'agent_replied' }));
    await chatwootBridge.hooks.onResolved({ channel: 'whatsapp', customer_id: '+919000000001' });
    expect(handoff.clear).toHaveBeenCalledWith('+919000000001');
    await chatwootBridge.hooks.onResolved({ channel: 'email', customer_id: 'a@b.c' });
    expect(handoff.clear).toHaveBeenCalledTimes(1);
  });
});


describe('files: agent attachments go out on WhatsApp', () => {
  const pdf = { file_type: 'file', extension: 'pdf', file_size: 120000, data_url: 'https://chat.mediqzy.com/rails/active_storage/blobs/redirect/abc/Lab%20report.pdf' };
  const photo = { file_type: 'image', extension: 'jpg', file_size: 90000, data_url: 'https://chat.mediqzy.com/rails/active_storage/blobs/redirect/def/photo.jpg' };
  beforeEach(() => poolQuery.mockResolvedValue({ rows: [{ at: new Date().toISOString() }] }));

  test('a PDF goes as a document with its name, the text as its caption', async () => {
    sendMedia.mockResolvedValue({ messageId: 'gs-pdf' });
    await expect(dispatch({ inbox, to: '+919000000001', content: 'Your report', bridgeConversationId: 5, attachments: [pdf] })).resolves.toEqual({ id: 'gs-pdf' });
    expect(sendMedia).toHaveBeenCalledWith({ to: '+919000000001', mediaUrl: pdf.data_url, mediaType: 'file', caption: 'Your report', filename: 'Lab report.pdf' });
    expect(sendMedia).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
  });

  test("WhatsApp gets the file's own address, not Chatwoot's redirect; a redirect off Chatwoot is ignored", async () => {
    sendMedia.mockResolvedValue({ messageId: 'gs-r' });
    httpRequest.mockResolvedValueOnce({ status: 302, headers: { location: '/rails/active_storage/disk/zz/Lab%20report.pdf' } });
    await dispatch({ inbox, to: '+919000000001', content: '', bridgeConversationId: 5, attachments: [pdf] });
    expect(sendMedia.mock.calls[0][0].mediaUrl).toBe('https://chat.mediqzy.com/rails/active_storage/disk/zz/Lab%20report.pdf');
    expect(httpRequest.mock.calls[0][0]).toMatchObject({ method: 'HEAD', maxRedirects: 0 });
    httpRequest.mockResolvedValueOnce({ status: 302, headers: { location: 'https://elsewhere.example/x.pdf' } });
    await dispatch({ inbox, to: '+919000000001', content: '', bridgeConversationId: 5, attachments: [pdf] });
    expect(sendMedia.mock.calls[1][0].mediaUrl).toBe(pdf.data_url);
  });

  test('two files: the caption rides on the first only; a photo goes as an image', async () => {
    sendMedia.mockResolvedValue({ messageId: 'gs-x' });
    await dispatch({ inbox, to: '+919000000001', content: 'See these', bridgeConversationId: 5, attachments: [photo, pdf] });
    expect(sendMedia.mock.calls.map((c) => [c[0].mediaType, c[0].caption])).toEqual([['image', 'See these'], ['file', '']]);
  });

  test('a link that is not a Chatwoot file, or a file over 16 MB, is refused before anything is sent', async () => {
    await expect(dispatch({ inbox, to: '+919000000001', content: '', bridgeConversationId: 5, attachments: [{ ...pdf, data_url: 'https://evil.example/x.pdf' }] }))
      .rejects.toMatchObject({ definitelyNotSent: true });
    await expect(dispatch({ inbox, to: '+919000000001', content: '', bridgeConversationId: 5, attachments: [{ ...pdf, file_size: 17 * 1024 * 1024 }] }))
      .rejects.toMatchObject({ definitelyNotSent: true, publicMessage: expect.stringContaining('16 MB') });
    expect(sendMedia).not.toHaveBeenCalled();
  });

  test('if the second of two files fails, the agent is told only part arrived', async () => {
    sendMedia.mockResolvedValueOnce({ messageId: 'gs-1' }).mockRejectedValueOnce(new Error('timeout'));
    await expect(dispatch({ inbox, to: '+919000000001', content: 'x', bridgeConversationId: 5, attachments: [photo, pdf] }))
      .rejects.toMatchObject({ definitelyNotSent: false, publicMessage: expect.stringContaining('Only part') });
  });
});

test('an audio file goes with its text sent once, separately', async () => {
  poolQuery.mockResolvedValue({ rows: [{ at: new Date().toISOString() }] });
  sendText.mockResolvedValue({ messageId: 'gs-t' }); sendMedia.mockResolvedValue({ messageId: 'gs-a' });
  await dispatch({ inbox, to: '+919000000001', content: 'Listen to this', bridgeConversationId: 5,
    attachments: [{ file_type: 'audio', extension: 'ogg', file_size: 1000, data_url: 'https://chat.mediqzy.com/rails/active_storage/blobs/redirect/a/note.ogg' }] });
  expect(sendText).toHaveBeenCalledTimes(1);
  expect(sendMedia).toHaveBeenCalledTimes(1);
});

describe('files: a member\'s photo or document reaches Chatwoot, scanned', () => {
  const fetchFile = (att) => chatwootBridge.media.fetch(att);
  test('a clean PDF is passed on with a safe name', async () => {
    httpRequest.mockResolvedValue({ data: Buffer.from('%PDF-1.4 test'), headers: { 'content-type': 'application/pdf' } });
    const f = await fetchFile({ url: 'https://filemanager.gupshup.io/wa/abc', name: 'claim form?.pdf', contentType: 'application/pdf' });
    expect(f).toMatchObject({ contentType: 'application/pdf', filename: 'claim form_.pdf' });
    expect(scanOnly).toHaveBeenCalled();
    expect(httpRequest.mock.calls[0][0]).toMatchObject({ responseType: 'arraybuffer', maxContentLength: 16 * 1024 * 1024 });
  });
  test('an infected file, a file type we do not pass on, or an http link is refused with a reason for the agent', async () => {
    httpRequest.mockResolvedValue({ data: Buffer.from('x'), headers: { 'content-type': 'application/pdf' } });
    scanOnly.mockResolvedValueOnce({ clean: false });
    await expect(fetchFile({ url: 'https://filemanager.gupshup.io/wa/abc' })).rejects.toMatchObject({ publicMessage: expect.stringContaining('virus scan') });
    httpRequest.mockResolvedValue({ data: Buffer.from('MZ'), headers: { 'content-type': 'application/x-msdownload' } });
    await expect(fetchFile({ url: 'https://filemanager.gupshup.io/wa/abc' })).rejects.toMatchObject({ publicMessage: expect.stringContaining('not passed on') });
    await expect(fetchFile({ url: 'http://filemanager.gupshup.io/wa/abc' })).rejects.toMatchObject({ publicMessage: expect.stringContaining('not secure') });
  });
});
