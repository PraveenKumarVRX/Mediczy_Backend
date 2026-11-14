import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
const post = jest.fn(), create = jest.fn();
jest.unstable_mockModule('../integrations/axios.js', () => ({ default: { post }, createVendorAxios: () => ({ post }) }));
jest.unstable_mockModule('../integrations/twilio.js', () => ({ default: () => ({ messages: { create } }) }));
const { sendTwilioWhatsApp, sendMetaWhatsApp, sendInfobipWhatsApp } = await import('../integrations/messaging.js');
beforeEach(() => { jest.clearAllMocks(); });
describe('real message acknowledgements', () => {
  it('returns Twilio’s actual SID without returning credentials or inventing an ID', async () => {
    create.mockResolvedValue({ sid: 'SM-real', status: 'queued' });
    const result = await sendTwilioWhatsApp({ to: '+919000000001', content: 'test' }, { accountSid: 'account', authToken: 'private-token', phoneNumberId: '+919000000002' });
    expect(result).toMatchObject({ messageSid: 'SM-real', status: 'queued' });
    expect(create).toHaveBeenCalledWith({ from: 'whatsapp:+919000000002', to: 'whatsapp:+919000000001', body: 'test' });
    expect(JSON.stringify(result)).not.toContain('private-token');
  });
  it('requires a confirmed Meta message ID', async () => {
    post.mockResolvedValueOnce({ data: { messages: [{ id: 'wamid-real' }] } });
    const settings = { accessToken: 'secret', phoneNumberId: '123456' };
    expect((await sendMetaWhatsApp({ to: '+919000000001', content: 'test' }, settings)).messageId).toBe('wamid-real');
    expect(post.mock.calls[0][1]).toEqual({ messaging_product: 'whatsapp', to: '919000000001', type: 'text', text: { body: 'test' } });
    post.mockResolvedValueOnce({ data: {} });
    await expect(sendMetaWhatsApp({ to: '+919000000001', content: 'test' }, settings)).rejects.toMatchObject({ code: 'INTEGRATION_BAD_RESPONSE' });
  });
  it('submits Infobip text and refuses rejected provider status', async () => {
    const settings = { apiKey: 'secret', sender: '919000000002', baseUrl: 'https://test.api.infobip.com' };
    post.mockResolvedValueOnce({ data: { messageId: 'ib-real', status: { groupId: 1 } } });
    expect((await sendInfobipWhatsApp({ to: '+919000000001', content: 'test' }, settings)).messageId).toBe('ib-real');
    expect(post.mock.calls[0][0]).toBe('https://test.api.infobip.com/whatsapp/1/message/text');
    post.mockResolvedValueOnce({ data: { messageId: 'ib-rejected', status: { groupId: 5 } } });
    await expect(sendInfobipWhatsApp({ to: '+919000000001', content: 'test' }, settings)).rejects.toMatchObject({ code: 'INTEGRATION_BAD_RESPONSE' });
  });
  it('does not submit an empty template variable', async () => {
    await expect(sendMetaWhatsApp({ to: '+919000000001', type: 'template', templateName: 'appointment', templateParams: [''] }, { accessToken: 'secret', phoneNumberId: '123456' })).rejects.toMatchObject({ code: 'INTEGRATION_REJECTED' });
    expect(post).not.toHaveBeenCalled();
  });
});
