/** TeleCMI CHUB click-to-call. Real, verified endpoint/fields (doc.telecmi.com/chub/docs/click-to-call-admin).
 * CHUB dials through a TeleCMI user_id (an agent/extension inside their account), not a raw phone
 * number — there is currently no agent configured (VOICE_TELECMI_PROVIDER_USER_ID unset), so dial()
 * fails clearly rather than guessing one. No confirmed CDR-by-call-id API exists for CHUB-only
 * accounts, so details() relies entirely on whatever the webhook receiver has stored. */
import axios from '../../integrations/axios.js';
import { cache } from '../../db/redis.js';

export async function dial({ agentNumber, to, correlation }) {
  const userId = process.env.VOICE_TELECMI_PROVIDER_USER_ID;
  const secret = process.env.VOICE_TELECMI_PROVIDER_SECRET;
  if (!userId || !secret) { const e = new Error('No TeleCMI agent configured yet (VOICE_TELECMI_PROVIDER_USER_ID)'); e.rejected = true; throw e; }
  const digits = String(to).replace(/\D/g, '');
  const response = await axios.post('https://rest.telecmi.com/v2/webrtc/click2call', {
    user_id: userId, secret, to: Number(digits), webrtc: true,
  }, { timeout: 15000, validateStatus: () => true });
  if (response.status === 200 && response.data?.code === 200 && response.data?.request_id) {
    return { Sid: response.data.request_id, Status: 'initiated', Direction: 'outbound', To: to, From: agentNumber, CustomField: correlation };
  }
  const error = new Error(response.data?.msg || `TeleCMI click2call failed (HTTP ${response.status})`);
  error.rejected = [400, 404, 407].includes(response.status);
  throw error;
}

export async function details({ callId }) {
  const stored = await cache.get(`voice:telecmi:${callId}`).catch(() => null);
  if (stored) return stored;
  const error = new Error('No webhook status received yet for this TeleCMI call');
  throw error;
}

/** Confirmed, real endpoint (doc.telecmi.com/chub/docs/out-answered): a time-windowed export of
 * answered outbound calls, with recording filenames. NOT a lookup-by-call-id — its `cmiuid` field's
 * relationship to click2call's `request_id` is undocumented and unverified against real traffic, so
 * this cannot be used as a reliable dial()<->CDR correlation yet. Useful on its own for recording
 * sync and reporting, which is the explicit next use case (not wired into details() for that reason). */
export async function fetchRecentAnsweredOutbound({ startDate, endDate, page = 1, limit = 20 } = {}) {
  const appid = Number(process.env.VOICE_TELECMI_PROVIDER_APPID);
  const secret = process.env.VOICE_TELECMI_PROVIDER_SECRET;
  if (!appid || !secret) { const e = new Error('TeleCMI app credentials are not configured'); e.rejected = true; throw e; }
  const response = await axios.post('https://rest.telecmi.com/v2/out_answered', {
    appid, secret, ...(startDate ? { start_date: startDate } : {}), ...(endDate ? { end_date: endDate } : {}),
    page, limit: Math.min(limit, 20),
  }, { timeout: 15000, validateStatus: () => true });
  if (response.status !== 200 || response.data?.code !== 200) {
    const error = new Error(response.data?.msg || `TeleCMI out_answered failed (HTTP ${response.status})`);
    error.rejected = [400, 404].includes(response.status);
    throw error;
  }
  return { count: response.data.count, records: response.data.cdr || [] };
}

/** Confirmed, real endpoint (doc.telecmi.com/chub/docs/play-record): streams the recording audio
 * directly (not a JSON response with a URL) for a filename returned by fetchRecentAnsweredOutbound. */
export async function downloadRecording(filename) {
  const appid = Number(process.env.VOICE_TELECMI_PROVIDER_APPID);
  const secret = process.env.VOICE_TELECMI_PROVIDER_SECRET;
  if (!appid || !secret) { const e = new Error('TeleCMI app credentials are not configured'); e.rejected = true; throw e; }
  const response = await axios.get('https://rest.telecmi.com/v2/play', {
    params: { appid, secret, file: filename }, responseType: 'stream', timeout: 30000, validateStatus: () => true,
  });
  if (response.status !== 200) { const e = new Error(`TeleCMI recording download failed (HTTP ${response.status})`); e.rejected = [404, 407].includes(response.status); throw e; }
  return response.data; // a readable stream — caller pipes it to storage or the HTTP response
}
