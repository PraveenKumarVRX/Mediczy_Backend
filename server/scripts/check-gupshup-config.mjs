// Read-only preflight. Run through the production SSM loader; never prints secret values.
import { isIP } from 'node:net';
import gupshup, { normalizeGupshupPhone, whatsappProvider } from '../services/gupshup-whatsapp.service.js';
const env = process.env;
const ips = String(env.GUPSHUP_WEBHOOK_ALLOWED_IPS || '').split(',').map(x => x.trim()).filter(Boolean);
let sourceMatches = false;
try { sourceMatches = normalizeGupshupPhone(env.GUPSHUP_SOURCE_NUMBER) === '918098998998'; } catch {}
const authConfigured = Boolean((env.GUPSHUP_WEBHOOK_SECRET?.length >= 32 || ips.length) &&
  (!env.GUPSHUP_WEBHOOK_SECRET || env.GUPSHUP_WEBHOOK_SECRET.length >= 32) && ips.every(ip => isIP(ip)));
const report = {
  provider: whatsappProvider(),
  senderConfigured: gupshup.configured,
  sourceMatchesRequestedNumber: sourceMatches,
  appNameConfigured: Boolean(env.GUPSHUP_APP_NAME),
  apiKeyConfigured: Boolean(env.GUPSHUP_API_KEY),
  webhookAuthConfigured: authConfigured,
  aiAutoReplyEnabled: env.WHATSAPP_AI_AUTO_REPLY === 'true',
  otpTemplateConfigured: Boolean(env.GUPSHUP_TEMPLATE_OTP && !env.GUPSHUP_TEMPLATE_OTP.startsWith('HX')),
  callbackPath: '/api/whatsapp-production/webhook/gupshup',
  liveDeliveryVerified: false,
};
console.log(JSON.stringify(report, null, 2));
if (!gupshup.configured || !sourceMatches || !authConfigured || report.provider !== 'gupshup') process.exitCode = 1;
