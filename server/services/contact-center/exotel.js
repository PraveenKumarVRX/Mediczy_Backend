import { fail, phone } from './policy.js';

/** Exotel v1: agent-first two-number calling, with server-side call-detail reconciliation. */
export class ExotelProvider {
  constructor(config, { env = process.env, fetcher = fetch } = {}) {
    this.config = config; this.fetcher = fetcher;
    if (!/^VOICE_[A-Z0-9_]{3,60}$/.test(config.credential_prefix || '')) throw fail(503, 'VOICE_NOT_CONFIGURED', 'Voice credential reference is missing');
    const prefix = config.credential_prefix;
    this.sid = env[`${prefix}_SID`]; this.key = env[`${prefix}_API_KEY`]; this.token = env[`${prefix}_API_TOKEN`];
    this.host = env[`${prefix}_HOST`] || 'api.exotel.com';
    if (!['api.exotel.com', 'api.in.exotel.com'].includes(this.host) || !/^[A-Za-z0-9_-]+$/.test(this.sid || '') || !this.key || !this.token) throw fail(503, 'VOICE_NOT_CONFIGURED', 'Exotel credentials are not configured');
  }
  async request(path, options = {}) {
    let response;
    try {
      response = await this.fetcher(`https://${this.host}/v1/Accounts/${this.sid}/Calls/${path}`, {
        ...options, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${Buffer.from(`${this.key}:${this.token}`).toString('base64')}`, Accept: 'application/json', ...options.headers },
      });
    } catch { throw fail(502, 'PROVIDER_OUTCOME_UNKNOWN', 'Provider outcome is unknown; reconcile before attempting another call'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw fail(502, response.status >= 500 ? 'PROVIDER_OUTCOME_UNKNOWN' : 'PROVIDER_REJECTED', 'Exotel rejected the request');
    const call = data?.Call;
    if (!/^[A-Za-z0-9]{16,64}$/.test(call?.Sid||'') || (call.AccountSid && call.AccountSid !== this.sid)) throw fail(502, 'PROVIDER_OUTCOME_UNKNOWN', 'Invalid provider response');
    return call;
  }
  async dial({ agentNumber, to, callbackUrl, correlation, record = false }) {
    const sip=typeof agentNumber==='string'&&/^sip:[a-zA-Z0-9_.-]+@/.test(agentNumber)&&agentNumber.endsWith(`@${this.sid}.voip.exotel.com`);
    if(!sip)phone(agentNumber);
    phone(to); phone(this.config.number);
    const cb = new URL(callbackUrl);
    if (cb.protocol !== 'https:' || cb.username || cb.password || correlation.length > 128) throw fail(503, 'INVALID_CALLBACK', 'A public HTTPS callback is required');
    const body = new URLSearchParams({ From: agentNumber, To: to, CallerId: this.config.number,
      CallType: 'trans', TimeLimit: '3600', TimeOut: '45', Record: String(record), RecordingChannels: 'dual',
      CustomField: correlation, StatusCallback: callbackUrl, StatusCallbackContentType: 'application/json',
      'StatusCallbackEvents[0]': 'answered', 'StatusCallbackEvents[1]': 'terminal' });
    return this.request('connect', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  }
  async details(id) {
    if (!/^[A-Za-z0-9]{16,64}$/.test(id || '')) throw fail(400, 'INVALID_CALL_SID', 'Invalid provider call identifier');
    const call=await this.request(`${id}.json`);
    if(call.Sid!==id)throw fail(502,'PROVIDER_RECORD_MISMATCH','Provider returned a different call record');
    return call;
  }
  async rotateSubscriber(username,password,accountToken) {
    if(!/^[a-zA-Z0-9_.-]{1,64}$/.test(username)||!accountToken)throw fail(503,'BROWSER_CALLING_NOT_CONFIGURED','WebRTC subscriber management is not configured');
    const response=await this.fetcher(`https://${this.host}/v2/accounts/${this.sid}/subscribers/${encodeURIComponent(username)}`,{
      method:'PUT',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',Authorization:`Basic ${Buffer.from(`${this.sid}:${accountToken}`).toString('base64')}`},body:JSON.stringify({password}),
    }).catch(()=>{throw fail(502,'SUBSCRIBER_UPDATE_FAILED','Could not prepare the browser phone');});
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.response?.status!=='success')throw fail(502,'SUBSCRIBER_UPDATE_FAILED','Could not prepare the browser phone');
  }
}
