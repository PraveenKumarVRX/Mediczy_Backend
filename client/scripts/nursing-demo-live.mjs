#!/usr/bin/env node
// Real API walkthrough restricted to the provisioned synthetic admission. Never a clinical sign-off.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';
const base=process.env.NURSING_LIVE_BASE_URL,dir=resolve(process.env.NURSING_DEMO_EVIDENCE_DIR||'');
if(!base||new URL(base).protocol!=='https:'||!process.env.NURSING_DEMO_EVIDENCE_DIR)throw new Error('Explicit HTTPS base URL and private demo evidence directory required');
const demo=JSON.parse(readFileSync(join(dir,'demo-provisioning.json'))),accounts=JSON.parse(readFileSync(join(dir,'demo-access.private.json')));
assert.equal(demo.simulationOnly,true);assert.equal(demo.tenantId,11);assert.equal(demo.hospitalId,4);
const record={at:new Date().toISOString(),baseUrl:base,hospitalId:demo.hospitalId,tenantId:demo.tenantId,admissionId:demo.admissionId,simulationOnly:true,clinicalAcceptance:false,status:'failed',checks:[]};
const run=async(name,fn)=>{await fn();record.checks.push({name,status:'passed'});};
const request=async(path,{token,method='GET',payload,key,expected=200}={})=>{
 const r=await fetch(base+'/api'+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(payload?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:payload?JSON.stringify(payload):undefined});
 const body=await r.json();if(r.status!==expected)throw new Error(`${method} ${path}: HTTP ${r.status}; ${body.code||body.message||'request failed'}`);return body.data??body;
};
const key=name=>`demo-${name}-${randomUUID()}`;
try{
 let day,incoming;
 await run('two demo nurses authenticate with tenant-bound tokens',async()=>{
  day=await request('/nurse/login',{method:'POST',payload:accounts[0]});incoming=await request('/nurse/login',{method:'POST',payload:accounts[1]});
  for(const auth of [day,incoming]){const claims=JSON.parse(Buffer.from(auth.token.split('.')[1],'base64url'));assert.equal(Number(claims.tenant_id),demo.tenantId);}
 });
 const token=day.token,admissionId=demo.admissionId;
 await run('assigned live worklist contains only the dedicated synthetic admission',async()=>{const patients=await request('/v1/nursing/patients',{token});assert.equal(patients.length,1);assert.equal(Number(patients[0].id),admissionId);});
 await run('demo nurse is denied an ordinary hospital admission',async()=>{const r=await request('/v1/echart/flowsheet/1',{token,expected:403});assert.equal(r.code,'SIMULATION_ONLY_ACCOUNT');});
 let note;
 await run('synthetic note saves, reauthenticates and signs through live APIs',async()=>{
  note=await request('/v1/echart/entry',{token,method:'POST',expected:201,key:key('note'),payload:{admissionId,entryType:'note',observationText:'SIMULATION ONLY - technical nursing walkthrough; no actual patient assessment or care.'}});
  const proof=await request('/v1/nursing/verification',{token,method:'POST',payload:{admissionId,purpose:'note.sign',targetId:note.id,password:accounts[0].password}});
  note=await request(`/v1/echart/entries/${note.id}/sign`,{token,method:'POST',payload:{version:note.version,verificationToken:proof.token}});assert.ok(note.signed_at);
 });
 await run('signed synthetic note cannot be overwritten',async()=>{await request(`/v1/echart/entries/${note.id}`,{token,method:'PATCH',expected:409,payload:{version:note.version,observationText:'SIMULATION ONLY - forbidden overwrite test'}});});
 await run('synthetic vital entry uses the canonical scorer',async()=>{const vital=await request('/v1/echart/entry',{token,method:'POST',expected:201,key:key('vitals'),payload:{admissionId,entryType:'vitals',bpSystolic:120,bpDiastolic:80,heartRate:72,spo2:98,respiratoryRate:16,temperature:37,consciousness:'A',onOxygen:false,observationText:'SIMULATION ONLY - generated normal-value fixture, not a clinical measurement.'}});assert.ok(vital.vital_record_id);assert.equal(vital.entry_data.news2.score,0);});
 await run('synthetic fluid timeout retry replays one saved entry',async()=>{const idempotency=key('fluid'),payload={admissionId,entryType:'io',ioType:'intake',ioVolumeMl:150,ioDescription:'SIMULATION ONLY - water-volume fixture'};const a=await request('/v1/echart/entry',{token,method:'POST',expected:201,key:idempotency,payload}),b=await request('/v1/echart/entry',{token,method:'POST',expected:201,key:idempotency,payload});assert.equal(a.id,b.id);});
 await run('synthetic care goal and evaluation persist with versions',async()=>{let goal=await request('/v1/nursing/goals',{token,method:'POST',expected:201,key:key('goal'),payload:{admissionId,problem:'SIMULATION ONLY - training problem',goal:'SIMULATION ONLY - demonstrate goal evaluation',intervention:'SIMULATION ONLY - training task'}});goal=await request(`/v1/nursing/goals/${goal.id}/evaluations`,{token,method:'POST',expected:201,payload:{version:goal.version,status:'met',note:'SIMULATION ONLY - software walkthrough completed; no clinical outcome claimed.'}});assert.equal(goal.status,'met');});
 await run('synthetic handover is sent and acknowledged by the second demo nurse',async()=>{const sbar={[admissionId]:{situation:'SIMULATION ONLY - synthetic admission',background:'SIMULATION ONLY - no actual patient history',assessment:'SIMULATION ONLY - no actual clinical assessment',recommendation:'SIMULATION ONLY - demonstrate acknowledgment'}};let h=await request('/v1/nursing/handovers',{token,method:'POST',expected:201,key:key('handover'),payload:{wardId:demo.wardId,shiftName:'SIMULATION ONLY walkthrough',receiverId:demo.nurses[1].id,sbar}});h=await request(`/v1/nursing/handovers/${h.id}/send`,{token,method:'POST',payload:{version:h.version,receiverId:demo.nurses[1].id,sbar}});h=await request(`/v1/nursing/handovers/${h.id}/accept`,{token:incoming.token,method:'POST',payload:{version:h.version}});assert.equal(h.status,'accepted');});
 await run('synthetic export contains signed provenance',async()=>{const bundle=await request(`/v1/nursing/admissions/${admissionId}/export`,{token});assert.equal(bundle.resourceType,'Bundle');assert.ok(bundle.entry.some(e=>e.resource.resourceType==='Provenance'));});
 record.status='passed';
}catch(error){record.error=error.message;process.exitCode=1;}
finally{writeFileSync(join(dir,'demo-live-api-walkthrough.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record,null,2));
