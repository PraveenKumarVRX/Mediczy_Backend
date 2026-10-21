import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {ExotelProvider} from './exotel.js';
import {fail,phone,tenant} from './policy.js';
import {contactCenterProvider} from '../../../shared/contact-center-providers.mjs';
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const equal=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

/** Enterprise connectors normalize vendor APIs; keys and endpoint URLs remain server-side. */
export class VoiceConnectorProvider {
  constructor(config,{env=process.env,fetcher=fetch}={}) {
    this.config=config;this.fetcher=fetcher;this.provider=config.provider;
    const p=config.credential_prefix;
    this.account=env[`${p}_CONNECTOR_ACCOUNT`];this.secret=env[`${p}_CONNECTOR_SECRET`];
    try{this.url=new URL(env[`${p}_CONNECTOR_URL`]);}catch{throw fail(503,'VOICE_NOT_CONFIGURED','The approved provider connector is not configured');}
    if(this.url.protocol!=='https:'||this.url.username||this.url.password||this.url.search||this.url.hash||!this.account||!this.secret||this.secret.length<32)throw fail(503,'VOICE_NOT_CONFIGURED','The approved provider connector is not configured');
    tenant(config.tenant_uid);phone(config.number);
  }
  async request(operation,payload) {
    const timestamp=String(Date.now()),nonce=randomUUID();
    const body=JSON.stringify({version:1,provider:this.provider,account:this.account,tenantUid:this.config.tenant_uid,number:this.config.number,operation,...payload});
    const signature=createHmac('sha256',this.secret).update(`${timestamp}.${nonce}.${body}`).digest('hex');
    let response;try{response=await this.fetcher(this.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Voice-Timestamp':timestamp,'X-Voice-Nonce':nonce,'X-Voice-Signature':signature},body});}catch{throw fail(502,'PROVIDER_OUTCOME_UNKNOWN','Provider outcome is unknown; reconcile before another call');}
    const raw=await response.text();
    const expected=createHmac('sha256',this.secret).update(`${timestamp}.${nonce}.${raw}`).digest('hex');
    if(raw.length>65536||!equal(response.headers.get('X-Voice-Signature'),expected))throw fail(502,'PROVIDER_OUTCOME_UNKNOWN','Provider connector response could not be verified');
    let data;try{data=JSON.parse(raw);}catch{throw fail(502,'PROVIDER_OUTCOME_UNKNOWN','Provider connector returned an invalid response');}
    if(data.provider!==this.provider||data.account!==this.account||data.tenantUid!==this.config.tenant_uid)throw fail(502,'PROVIDER_RECORD_MISMATCH','Provider connector account does not match');
    if(!response.ok)throw fail(502,response.status<500&&data.rejected===true?'PROVIDER_REJECTED':'PROVIDER_OUTCOME_UNKNOWN','Provider connector could not complete the request');
    const call=data.call;
    if(!identifier(call?.Sid))throw fail(502,'PROVIDER_OUTCOME_UNKNOWN','Provider connector did not return a valid call identifier');
    // Return only fields understood by reconciliation; never forward upstream credentials.
    return Object.fromEntries(['Sid','Status','Duration','DateUpdated','CustomField','Direction','From','To','PhoneNumberSid'].filter(k=>call[k]!==undefined).map(k=>[k,call[k]]));
  }
  async dial(input){phone(input.agentNumber);phone(input.to);return this.request('dial',{agentNumber:input.agentNumber,to:input.to,correlation:input.correlation,record:Boolean(input.record),callbackUrl:input.callbackUrl});}
  async details(id){if(!identifier(id))throw fail(400,'INVALID_CALL_SID','Invalid provider call identifier');const call=await this.request('details',{callId:id});if(call.Sid!==id)throw fail(502,'PROVIDER_RECORD_MISMATCH','Provider returned a different call record');return call;}
}
export function createVoiceProvider(config,options={}) {
  const provider=contactCenterProvider(config?.provider);
  if(!provider)throw fail(400,'UNSUPPORTED_PROVIDER','Choose a supported calling provider');
  if(provider.id==='exotel')return new ExotelProvider(config,options);
  if(provider.mode==='connector')return new VoiceConnectorProvider(config,options);
  throw fail(409,'EXTERNAL_PHONE_REQUIRED','Use the signed-in Zoom Phone app to place this call');
}
