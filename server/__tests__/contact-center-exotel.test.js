import { jest } from '@jest/globals';
import { ExotelProvider } from '../services/contact-center/exotel.js';
const config={credential_prefix:'VOICE_DEMO',number:'+918012345678'};
const env={VOICE_DEMO_SID:'demo_account',VOICE_DEMO_API_KEY:'key-marker',VOICE_DEMO_API_TOKEN:'token-marker'};
const payload={agentNumber:'+919876543210',to:'+919876543211',callbackUrl:'https://app.example.test/api/hooks',correlation:'local-call-id'};
describe('Exotel provider boundary',()=>{
  it('submits the documented form and requires a provider-issued call ID',async()=>{
    const fetcher=jest.fn(async()=>({ok:true,json:async()=>({Call:{Sid:'abc123abc123abc123',AccountSid:'demo_account'}})}));
    const p=new ExotelProvider(config,{env,fetcher});const call=await p.dial(payload);
    expect(call.Sid).toBe('abc123abc123abc123');
    const [url,options]=fetcher.mock.calls[0];expect(url).toBe('https://api.exotel.com/v1/Accounts/demo_account/Calls/connect');
    expect(options.body.get('From')).toBe(payload.agentNumber);expect(options.body.get('Record')).toBe('false');expect(options.body.get('StatusCallbackContentType')).toBe('application/json');
    expect(options.redirect).toBe('error');
  });
  it('fails closed without credentials',()=>expect(()=>new ExotelProvider(config,{env:{}})).toThrow());
  it('accepts only SIP destinations owned by the configured Exotel account',async()=>{
    const fetcher=jest.fn(async()=>({ok:true,json:async()=>({Call:{Sid:'abc123abc123abc123'}})}));const p=new ExotelProvider(config,{env,fetcher});
    await p.dial({...payload,agentNumber:'sip:agent@demo_account.voip.exotel.com'});
    await expect(p.dial({...payload,agentNumber:'sip:agent@foreign.voip.exotel.com'})).rejects.toMatchObject({code:'INVALID_PHONE'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rotates subscriber passwords through the separate subscriber-management credential',async()=>{
    const fetcher=jest.fn(async()=>({ok:true,json:async()=>({response:{status:'success'}})}));const p=new ExotelProvider(config,{env,fetcher});
    await p.rotateSubscriber('agent-one','synthetic-password','synthetic-account-token');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.exotel.com/v2/accounts/demo_account/subscribers/agent-one');
    expect(fetcher.mock.calls[0][1].method).toBe('PUT');expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({password:'synthetic-password'});
  });
  it('does not retry an ambiguous network failure',async()=>{
    const fetcher=jest.fn(async()=>{throw new Error('network failed');});const p=new ExotelProvider(config,{env,fetcher});
    await expect(p.dial(payload)).rejects.toMatchObject({code:'PROVIDER_OUTCOME_UNKNOWN'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects forged/mismatched provider responses',async()=>{
    const p=new ExotelProvider(config,{env,fetcher:async()=>({ok:true,json:async()=>({Call:{Sid:'abc123abc123abc123',AccountSid:'different'}})})});
    await expect(p.dial(payload)).rejects.toMatchObject({code:'PROVIDER_OUTCOME_UNKNOWN'});
  });
  it('requires call-detail responses to match the requested provider identifier',async()=>{
    const p=new ExotelProvider(config,{env,fetcher:async()=>({ok:true,json:async()=>({Call:{Sid:'other123other123other123'}})})});
    await expect(p.details('abc123abc123abc123')).rejects.toMatchObject({code:'PROVIDER_RECORD_MISMATCH'});
  });
  it('does not accept arbitrary provider URLs or callback credentials',async()=>{
    expect(()=>new ExotelProvider(config,{env:{...env,VOICE_DEMO_HOST:'localhost'}})).toThrow();
    const p=new ExotelProvider(config,{env});await expect(p.dial({...payload,callbackUrl:'https://user:pass@example.test/callback'})).rejects.toMatchObject({code:'INVALID_CALLBACK'});
  });
  it('distinguishes explicit rejection from an ambiguous provider failure',async()=>{
    const p=new ExotelProvider(config,{env,fetcher:async()=>({ok:false,status:401,json:async()=>({})})});
    await expect(p.dial(payload)).rejects.toMatchObject({code:'PROVIDER_REJECTED'});
  });
});
