/**
 * Catalogued third-party APIs (2026-11-14 survey), in one
 * place. Entries are honest about migration state:
 *
 *   managed: 'core'        calls go through integration.fetchJson()/call()
 *   managed: 'own-client'  a hardened client of its own (SmartCRM: mTLS,
 *                          per-tenant breakers); status reads its health
 *   managed: 'unmanaged'   still called directly from services/routes; the
 *                          entry gives visibility (configured? kill switch
 *                          name) until it is moved onto the core
 *
 * requiredEnv lists NAMES only; status() never reads out a value.
 * dataClass is the most sensitive data the vendor receives:
 *   phi = health information (diagnoses, prescriptions, reports, clinical text)
 *   pii = identity/contact data only (phone, email, address, payment refs)
 * Adding a vendor: add an entry here, then build its client on the core
 * (see integrations/google-places.js) — docs/architecture/API_CONTRACT_AND_INTEGRATIONS.md.
 */
import { defineIntegration } from './core/integration.js';
import { register } from './core/registry.js';
import { breakerStates } from '../services/smartcrm/partner-client.js';

function livekitHosts() {
  return [...new Set([process.env.LIVEKIT_URL, process.env.LIVEKIT_API_URL].filter(Boolean).flatMap(value => {
    try { const url = new URL(value); return ['https:', 'wss:'].includes(url.protocol) ? [url.hostname] : []; } catch { return []; }
  }))];
}

const add = (spec) => register(defineIntegration(spec));

// ── Managed by the core ─────────────────────────────────────────────────────
export const googlePlaces = add({
  id: 'google-places',
  name: 'Google Places & Geocoding',
  category: 'maps',
  dataClass: 'pii',
  requiredEnv: ['GOOGLE_PLACES_API_KEY'],
  allowedHosts: ['maps.googleapis.com'],
  timeoutMs: 4000,
  retry: { attempts: 1, backoffMs: 250 },
  notes: 'Address autocomplete, place details, geocoding. Never returns invented addresses in production.',
});

// ── Own hardened client ─────────────────────────────────────────────────────
add({
  id: 'smartcrm',
  name: 'SmartCRM partner API',
  category: 'insurance',
  dataClass: 'phi',
  managed: 'own-client',
  requiredEnv: ['SMARTCRM_INTEGRATION_ENABLED', 'SMARTCRM_PARTNER_BASE_URL', 'SMARTCRM_TLS_CA_FILE', 'SMARTCRM_TLS_CERT_FILE', 'SMARTCRM_TLS_KEY_FILE'],
  allowedHosts: ['smartcrm.internal.mediqzy.com'],
  notes: 'services/smartcrm/partner-client.js — private mTLS link, per-tenant breakers, kill switch SMARTCRM_INTEGRATION_ENABLED.',
  health: () => ({ tenantBreakers: breakerStates() }),
});

// ── Managed transports ─────────────────────────────────────────────────────
const vendors = [
  { id: 'abdm', name: 'ABDM gateway (ABHA, HIP/HIU, HPR)', category: 'government', dataClass: 'phi',
    requiredEnv: ['ABDM_CLIENT_ID', 'ABDM_CLIENT_SECRET'], allowedHosts: ['.abdm.gov.in'], notes: 'utils/circuit-breaker abdmCircuitBreaker' },
  { id: 'nhcx', name: 'NHCX claims exchange', category: 'insurance', dataClass: 'phi',
    requiredEnv: ['NHCX_CLIENT_ID', 'NHCX_CLIENT_SECRET'], allowedHosts: ['nhcx.abdm.gov.in'] },
  { id: 'whatsapp-cloud', name: 'WhatsApp Cloud API (Meta)', category: 'messaging', dataClass: 'phi',
    requiredEnv: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'], allowedHosts: ['graph.facebook.com'] },
  { id: 'twilio', name: 'Twilio SMS / WhatsApp', category: 'messaging', dataClass: 'phi',
    requiredEnv: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], allowedHosts: ['api.twilio.com', '.twilio.com'] },
  { id: 'gupshup', name: 'Gupshup OTP / WhatsApp', category: 'messaging', dataClass: 'pii',
    requiredEnv: ['GUPSHUP_API_KEY'], allowedHosts: ['.gupshup.io'] },
  { id: 'infobip', name: 'Infobip messaging', category: 'messaging', dataClass: 'pii',
    requiredEnv: ['INFOBIP_API_KEY', 'INFOBIP_BASE_URL'], allowedHosts: ['.infobip.com', '.api.infobip.com'] },
  { id: 'aws-ses', name: 'Amazon SES email', category: 'email', dataClass: 'phi',
    requiredEnv: [], allowedHosts: ['.amazonaws.com'], notes: 'Credentials from the instance role or SDK credential chain; sender identity is validated per message.' },
  { id: 'smtp', name: 'SMTP mailboxes (Team inboxes)', category: 'email', dataClass: 'phi',
    requiredEnv: [], notes: 'Per-mailbox configuration and credentials are validated by the SMTP transport; there is no global SMTP_HOST requirement.' },
  { id: 'razorpay', name: 'Razorpay payments', category: 'payments', dataClass: 'pii',
    requiredEnv: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'], allowedHosts: ['api.razorpay.com'] },
  { id: 'livekit', name: 'LiveKit video consultations', category: 'video', dataClass: 'phi',
    requiredEnv: ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'], requiredAnyEnv: [['LIVEKIT_URL', 'LIVEKIT_API_URL']], allowedHosts: livekitHosts },
  { id: 'firebase-fcm', name: 'Firebase Cloud Messaging push', category: 'push', dataClass: 'pii',
    requiredEnv: [], notes: 'Uses the initialized Firebase Admin app and its service-account or instance credentials.', allowedHosts: ['fcm.googleapis.com'] },
  { id: 'apple-signin', name: 'Sign in with Apple', category: 'identity', dataClass: 'pii',
    requiredEnv: [], notes: 'Public JWKS verification needs no client secret; token exchange validates its credentials in apple-signin.service.js.', allowedHosts: ['appleid.apple.com'] },
  { id: 'llm-groq', name: 'Groq LLM (via llm-provider cascade)', category: 'ai', dataClass: 'phi', timeoutMs: 120000,
    requiredEnv: ['GROQ_API_KEY'], allowedHosts: ['api.groq.com'], notes: 'services/ai-brain/llm-provider.js owns retries and fallback.' },
  { id: 'llm-openai', name: 'OpenAI (via llm-provider cascade, TTS)', category: 'ai', dataClass: 'phi', timeoutMs: 120000,
    requiredEnv: ['OPENAI_API_KEY'], allowedHosts: ['api.openai.com'] },
  { id: 'llm-sarvam', name: 'Sarvam AI (via llm-provider cascade)', category: 'ai', dataClass: 'phi', timeoutMs: 120000,
    requiredEnv: ['SARVAM_API_KEY'], allowedHosts: ['api.sarvam.ai'] },
  { id: 'isha', name: 'iSHA (sib) medical AI', category: 'ai', dataClass: 'phi', timeoutMs: 120000,
    requiredEnv: [], requiredAnyEnv: [['ISHA_INC_API_KEY', 'ISHA_AUTH_USERNAME']], allowedHosts: ['isha-inc.com', '.isha-inc.com'] },
  { id: 'elevenlabs', name: 'ElevenLabs text-to-speech', category: 'ai', dataClass: 'phi', timeoutMs: 120000,
    requiredEnv: ['ELEVENLABS_API_KEY'], allowedHosts: ['api.elevenlabs.io'] },
];
for (const spec of vendors) add({ ...spec, managed: 'core' });

export default { googlePlaces };
