/** Tata Teleservices (Smartflo) click-to-call. Real, verified endpoint/fields
 * (docs.smartflo.tatatelebusiness.com/reference/v1click_to_call-1). Async-only: the API call
 * just confirms acceptance (ref_id); real status comes via Smartflo's webhook, which the vendor's
 * own docs do not describe any signature-verification method for — see the webhook route for how
 * that gap is mitigated (a URL-embedded token, not real authentication). No confirmed REST
 * lookup-by-call-id exists either, so details() relies entirely on stored webhook deliveries. */
import axios from '../../integrations/axios.js';
import { cache } from '../../db/redis.js';

export async function dial({ agentNumber, to, correlation }) {
  const token = process.env.VOICE_TATA_PROVIDER_TOKEN;
  const callerId = process.env.VOICE_TATA_PROVIDER_CALLER_ID;
  if (!token) { const e = new Error('No Tata Smartflo API token configured yet (VOICE_TATA_PROVIDER_TOKEN)'); e.rejected = true; throw e; }
  const response = await axios.post('https://api-smartflo.tatateleservices.com/v1/click_to_call', {
    agent_number: agentNumber, destination_number: to, ...(callerId ? { caller_id: callerId } : {}), async: 1,
    ...(correlation ? { custom_identifier: String(correlation).slice(0, 512) } : {}),
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true });
  if (response.status === 200 && response.data?.success && response.data?.ref_id) {
    return { Sid: response.data.ref_id, Status: 'initiated', Direction: 'outbound', To: to, From: agentNumber, CustomField: correlation };
  }
  const error = new Error(response.data?.message || `Tata click_to_call failed (HTTP ${response.status})`);
  error.rejected = response.status === 400;
  throw error;
}

export async function details({ callId }) {
  const stored = await cache.get(`voice:tata:${callId}`).catch(() => null);
  if (stored) return stored;
  const error = new Error('No webhook status received yet for this Tata call');
  throw error;
}
