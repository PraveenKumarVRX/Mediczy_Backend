import http, { createVendorAxios } from './axios.js';
const infobip = createVendorAxios('infobip');
import twilio from './twilio.js';
import { IntegrationError } from './core/integration.js';

const invalid = message => new IntegrationError('INTEGRATION_REJECTED', message, { status: 400 });
const badResponse = () => new IntegrationError('INTEGRATION_BAD_RESPONSE', 'The provider did not confirm message submission.', { status: 502 });
const destination = value => {
  const phone = String(value || '').replace(/^whatsapp:/i, '').replace(/[\s()+-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw invalid('An international destination number is required.');
  return phone;
};
const text = value => {
  if (typeof value !== 'string' || !value.trim()) throw invalid('Message text is required.');
  return value;
};
const parameters = values => (values || []).map(value => ({ type: 'text', text: text(String(value ?? '')) }));

export async function sendTwilioWhatsApp(message, settings) {
  const client = twilio(settings.accountSid, settings.authToken);
  const payload = { from: `whatsapp:+${destination(settings.phoneNumberId || settings.phoneNumber)}`, to: `whatsapp:+${destination(message.to)}` };
  if (message.type === 'template') {
    if (!message.contentSid) throw invalid('An approved Twilio Content SID is required.');
    payload.contentSid = message.contentSid;
    payload.contentVariables = JSON.stringify(Object.fromEntries(parameters(message.templateParams).map((param, index) => [String(index + 1), param.text])));
  } else if (!message.type || message.type === 'text') payload.body = text(message.content);
  else throw invalid('This Twilio sender supports text and approved templates only.');
  const result = await client.messages.create(payload);
  if (!result.sid) throw badResponse();
  return { sid: result.sid, messageSid: result.sid, status: result.status, provider: 'twilio' };
}

export async function sendMetaWhatsApp(message, settings) {
  if (!settings.accessToken) throw invalid('WhatsApp access token is required.');
  if (!/^\d+$/.test(String(settings.phoneNumberId || ''))) throw invalid('A WhatsApp phone number ID is required.');
  const version = process.env.WHATSAPP_API_VERSION || 'v22.0';
  if (!/^v\d+\.\d+$/.test(version)) throw invalid('Invalid WhatsApp API version.');
  const payload = { messaging_product: 'whatsapp', to: destination(message.to), type: message.type || 'text' };
  if (payload.type === 'text') payload.text = { body: text(message.content) };
  else if (payload.type === 'template') {
    payload.template = { name: text(message.templateName), language: { code: message.language || 'en' },
      components: [{ type: 'body', parameters: parameters(message.templateParams) }] };
  } else throw invalid('This Meta sender supports text and approved templates only.');
  const { data } = await http.post(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`, payload,
    { headers: { Authorization: `Bearer ${settings.accessToken}` } });
  const messageId = data?.messages?.[0]?.id;
  if (!messageId) throw badResponse();
  return { messageId, sid: messageId, status: 'submitted', provider: 'facebook' };
}

export async function sendInfobipWhatsApp(message, settings) {
  if (!settings.apiKey) throw invalid('Infobip API key is required.');
  if (message.type && message.type !== 'text') throw invalid('This Infobip sender supports text only.');
  const base = String(settings.baseUrl || 'https://api.infobip.com').replace(/\/$/, '');
  const { data } = await infobip.post(`${base}/whatsapp/1/message/text`, {
    from: destination(settings.sender), to: destination(message.to), content: { text: text(message.content) },
  }, { headers: { Authorization: `App ${settings.apiKey}` } });
  if (!data?.messageId || ![1, 3].includes(Number(data.status?.groupId))) throw badResponse();
  return { messageId: data.messageId, sid: data.messageId, status: 'submitted', provider: 'infobip' };
}
