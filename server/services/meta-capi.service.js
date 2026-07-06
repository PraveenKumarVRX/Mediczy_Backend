/**
 * Meta Conversions API (CAPI) — server-side event tracking for ad attribution.
 * Sends Lead / CompleteRegistration / Purchase events when CRM leads progress.
 */

import crypto from 'crypto';
import axios from 'axios';

const PIXEL_ID = process.env.FB_PIXEL_ID || '';
const ACCESS_TOKEN = process.env.FB_CAPI_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || '';
const API_VERSION = process.env.FB_GRAPH_API_VERSION || 'v19.0';
const TEST_EVENT_CODE = process.env.FB_CAPI_TEST_EVENT_CODE || '';

function sha256Normalize(value, type = 'generic') {
  if (!value) return null;
  let normalized = String(value).trim().toLowerCase();
  if (type === 'phone') {
    normalized = normalized.replace(/\D/g, '');
    if (normalized.length === 10) normalized = `91${normalized}`;
  }
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function buildUserData({ email, phone, name, city, country = 'in' } = {}) {
  const userData = {};
  const em = sha256Normalize(email, 'email');
  const ph = sha256Normalize(phone, 'phone');
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (name) {
    const parts = String(name).trim().split(/\s+/);
    const fn = sha256Normalize(parts[0], 'email');
    const ln = parts.length > 1 ? sha256Normalize(parts.slice(1).join(' '), 'email') : null;
    if (fn) userData.fn = [fn];
    if (ln) userData.ln = [ln];
  }
  if (city) userData.ct = [sha256Normalize(city, 'email')];
  userData.country = [sha256Normalize(country, 'email')];
  return userData;
}

async function sendEvent({ eventName, lead, customData = {}, eventId = null }) {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return { sent: false, reason: 'not_configured' };
  }

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      event_id: eventId || `crm-lead-${lead?.id || 'unknown'}-${eventName}-${Date.now()}`,
      user_data: buildUserData({
        email: lead?.email,
        phone: lead?.phone,
        name: lead?.name,
        city: lead?.custom_fields?.city,
      }),
      custom_data: {
        lead_id: lead?.id,
        source: lead?.source,
        status: lead?.status,
        score: lead?.score,
        ...customData,
      },
    }],
    access_token: ACCESS_TOKEN,
  };

  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;
    const { data } = await axios.post(url, payload, { timeout: 8000 });
    console.info('[Meta CAPI] Event sent', { eventName, leadId: lead?.id, eventsReceived: data?.events_received });
    return { sent: true, data };
  } catch (err) {
    console.warn('[Meta CAPI] Event failed (non-fatal):', err.response?.data?.error?.message || err.message);
    return { sent: false, reason: err.message };
  }
}

export async function sendLeadEvent(lead, customData = {}) {
  return sendEvent({ eventName: 'Lead', lead, customData });
}

export async function sendQualifiedEvent(lead, customData = {}) {
  return sendEvent({ eventName: 'CompleteRegistration', lead, customData });
}

export async function sendConversionEvent(lead, dealValue = 0, customData = {}) {
  return sendEvent({
    eventName: 'Purchase',
    lead,
    customData: { value: dealValue, currency: 'INR', ...customData },
  });
}

export default { sendLeadEvent, sendQualifiedEvent, sendConversionEvent };
