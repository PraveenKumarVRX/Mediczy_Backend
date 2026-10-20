import { createHmac } from 'node:crypto';
import { phone, tenant, stateAfter, selectAgent, validateFlow, routeFlow, verifyGateway } from '../services/contact-center/policy.js';

const graph={start:'hours',nodes:[
  {id:'hours',type:'hours',timezone:'Asia/Kolkata',days:[1,2,3,4,5],open:'09:00',close:'17:00',inside:'menu',outside:'closed',holidays:['2026-10-21']},
  {id:'menu',type:'menu',options:{1:'queue'},timeout:'closed'},
  {id:'queue',type:'queue',queueId:'00000000-0000-4000-8000-000000000001'},
  {id:'closed',type:'end'},
]};
describe('contact-center control policy',()=>{
  it.each(['1','',null,'+91 9876543210','https://example.test'])('rejects non-E.164 destinations (%p)',p=>expect(()=>phone(p)).toThrow());
  it.each([null,'1','../../tenant','with space'])('rejects ambiguous/malformed tenant scope (%p)',t=>expect(()=>tenant(t)).toThrow());
  it('accepts unambiguous scope and E.164 phone',()=>{expect(tenant('HOSPITAL_11')).toBe('HOSPITAL_11');expect(phone('+919876543210')).toBe('+919876543210');});
  it('does not regress calls when callbacks arrive out of order',()=>{expect(stateAfter('answered','ringing')).toBe('answered');expect(stateAfter('completed','in-progress')).toBe('completed');expect(stateAfter('queued','busy')).toBe('busy');});
  it.each(['completed','failed','busy','no-answer','canceled'])('keeps terminal state %s absorbing',s=>expect(stateAfter(s,'ringing')).toBe(s));
  it('selects only eligible available agents',()=>{
    const a={user_id:'1',presence:'available',skills:['billing'],languages:['hi'],priority:1};
    expect(selectAgent([a,{...a,user_id:'2',active_call_id:'active',priority:99},{...a,user_id:'3',skills:[],priority:100}],{skills:['billing'],languages:['hi']}).user_id).toBe('1');
    expect(selectAgent([{...a,wrap_until:new Date(Date.now()+60000).toISOString()}],{})).toBeNull();
  });
  it('routes hours in the hospital timezone and respects holidays',()=>{
    expect(routeFlow(graph,{now:new Date('2026-10-20T04:00:00Z')}).next).toBe('menu');
    expect(routeFlow(graph,{now:new Date('2026-10-21T04:00:00Z')}).next).toBe('closed');
    expect(routeFlow(graph,{nodeId:'menu',digit:'9'}).next).toBe('closed');
  });
  it('rejects loops, missing fallbacks and unreachable nodes',()=>{
    for(const nodes of [[{id:'a',type:'greeting',next:'a'}],[{id:'a',type:'menu',options:{1:'b'}},{id:'b',type:'end'}],[{id:'a',type:'end'},{id:'b',type:'end'}]])expect(()=>validateFlow({start:'a',nodes})).toThrow();
  });
  it('binds signed service events to their content and short validity window',()=>{
    const timestamp=String(Date.now()),nonce='1234567890abcdef',body={callId:'example'},secret='test-secret';
    const signature=createHmac('sha256',secret).update(`${timestamp}.${nonce}.${JSON.stringify(body)}`).digest('hex');
    expect(()=>verifyGateway({timestamp,nonce,body,secret,signature})).not.toThrow();
    expect(()=>verifyGateway({timestamp,nonce,body:{callId:'different'},secret,signature})).toThrow();
    expect(()=>verifyGateway({timestamp,nonce,body,secret,signature,now:Number(timestamp)+121000})).toThrow();
  });
});
