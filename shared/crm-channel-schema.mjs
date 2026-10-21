// Shared inventory form contract. These records never activate delivery adapters.
const field = (key, label, type = 'text', secret = false, required = false) => ({ key, label, type, secret, required });
const secret = (key, label) => field(key, label, 'text', true);
const sender = [field('fromEmail', 'From email', 'email', false, true), field('fromName', 'From name')];
const twilio = [field('accountSid', 'Account SID', 'text', false, true), secret('authToken', 'Auth token'), field('fromNumber', 'Sender number', 'tel', false, true)];
export const CRM_CHANNEL_DEFINITIONS = [
  { id: 'email', label: 'Email', group: 'Messaging', providers: {
    smtp: { label: 'SMTP', fields: [...sender, field('smtpHost', 'SMTP host', 'text', false, true), field('smtpPort', 'SMTP port', 'number', false, true), field('username', 'SMTP username'), secret('password', 'SMTP password')] },
    sendgrid: { label: 'SendGrid', fields: [...sender, secret('apiKey', 'API key')] },
    ses: { label: 'Amazon SES', fields: [...sender, field('region', 'AWS region', 'text', false, true), field('accessKeyId', 'Access key ID'), secret('secretAccessKey', 'Secret access key')] },
  } },
  { id: 'whatsapp', label: 'WhatsApp', group: 'Messaging', providers: {
    meta: { label: 'Meta', fields: [field('phoneNumberId', 'Phone number ID', 'text', false, true), field('businessAccountId', 'Business account ID'), field('senderNumber', 'Sender number', 'tel'), secret('accessToken', 'Access token')] },
    twilio: { label: 'Twilio', fields: twilio },
    gupshup: { label: 'Gupshup', fields: [field('appName', 'App name', 'text', false, true), field('senderNumber', 'Sender number', 'tel', false, true), secret('apiKey', 'API key')] },
  } },
  { id: 'sms', label: 'SMS', group: 'Messaging', providers: {
    msg91: { label: 'MSG91', fields: [field('senderId', 'Sender ID', 'text', false, true), field('flowId', 'Flow ID'), secret('apiKey', 'Auth key')] },
    twilio: { label: 'Twilio', fields: twilio },
    textlocal: { label: 'Textlocal', fields: [field('senderId', 'Sender ID', 'text', false, true), secret('apiKey', 'API key')] },
    custom: { label: 'Custom inventory', fields: [field('senderId', 'Sender ID', 'text', false, true), field('apiUrl', 'Provider API URL', 'url', false, true), secret('apiKey', 'API key')] },
  } },
  { id: 'calls', label: 'Calls', group: 'Voice', managed: true, providers: {} },
  { id: 'facebook', label: 'Facebook', group: 'Social', providers: { meta: { label: 'Meta', fields: [field('pageId', 'Page ID', 'text', false, true), secret('accessToken', 'Page access token')] } } },
  { id: 'instagram', label: 'Instagram', group: 'Social', providers: { meta: { label: 'Meta', fields: [field('accountId', 'Business account ID', 'text', false, true), secret('accessToken', 'Access token')] } } },
  { id: 'linkedin', label: 'LinkedIn', group: 'Social', providers: { linkedin: { label: 'LinkedIn', fields: [field('organizationId', 'Organization ID', 'text', false, true), secret('accessToken', 'Access token')] } } },
  { id: 'google_ads', label: 'Google Ads', group: 'Social', providers: { google_ads: { label: 'Google Ads', fields: [field('customerId', 'Customer ID', 'text', false, true), field('managerId', 'Manager ID'), field('clientId', 'OAuth client ID', 'text', false, true), secret('clientSecret', 'Client secret'), secret('refreshToken', 'Refresh token'), secret('developerToken', 'Developer token')] } } },
  { id: 'youtube', label: 'YouTube', group: 'Social', providers: { google: { label: 'Google', fields: [field('channelId', 'Channel ID', 'text', false, true), secret('accessToken', 'Access token')] } } },
];
export const CRM_CHANNELS = CRM_CHANNEL_DEFINITIONS.map(definition => definition.id);
export function channelDefinition(channel) { return CRM_CHANNEL_DEFINITIONS.find(definition => definition.id === channel); }
export function providerDefinition(channel, provider) { const providers = channelDefinition(channel)?.providers; return providers && Object.prototype.hasOwnProperty.call(providers, provider) ? providers[provider] : undefined; }

export function configurationErrors(channel, provider, config) {
  const definition = providerDefinition(channel, provider);
  if (!definition) return { provider: 'Choose a supported provider for this channel.' };
  const errors = {};
  for (const f of definition.fields.filter(f => !f.secret)) {
    const raw = config[f.key];
    if (raw != null && typeof raw !== 'string' && !(f.type === 'number' && typeof raw === 'number' && Number.isFinite(raw))) { errors[f.key] = `${f.label} must be text.`; continue; }
    const value = String(raw ?? '').trim();
    if (f.required && !value) errors[f.key] = `${f.label} is required.`;
    if (!value) continue;
    if (value.length > 1000) errors[f.key] = `${f.label} is too long.`;
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[f.key] = 'Enter a valid email address.';
    if (f.type === 'number' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) errors[f.key] = 'Enter a port from 1 to 65535.';
    if (f.type === 'tel' && !/^\+[1-9]\d{7,14}$/.test(value)) errors[f.key] = 'Use an international number, for example +919876543210.';
    if (f.type === 'url') { try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); } catch { errors[f.key] = 'Enter an HTTPS URL without embedded credentials.'; } }
    if (f.key === 'smtpHost' && !/^[a-zA-Z0-9.-]+$/.test(value)) errors[f.key] = 'Enter a hostname without a protocol or path.';
  }
  return errors;
}
