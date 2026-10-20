import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { up, harden, withMigrationOwner, TABLES as BASE_TABLES } from '../../migrations/20261020008000-contact-center.migration.js';
import {up as extend,TABLES as MEDIA_TABLES} from '../../migrations/20261020008100-contact-center-livekit.migration.js';
import {advancedChecks} from './contact-center-advanced-checks.mjs';
const TABLES=[...BASE_TABLES,...MEDIA_TABLES];
import { createContactCenterStore } from '../../services/contact-center/store.js';
import { createContactCenter } from '../../services/contact-center/service.js';

// This harness refuses production/default connections. Pass a private JSON file
// for a disposable PostgreSQL instance bound to loopback, never application env.
const file=process.argv[2];if(!file)throw new Error('Pass a disposable private connection JSON file');
const cfg=JSON.parse(await readFile(file,'utf8'));
if(cfg.database!=='contact_center_test'||!Number.isInteger(cfg.port)||!cfg.password)throw new Error('Only the disposable contact_center_test database is allowed');
const connection={host:'127.0.0.1',port:cfg.port,database:cfg.database,password:cfg.password};
const admin=new pg.Pool({...connection,user:'postgres'});let runtime;const checks=[];
async function check(name,fn){await fn();checks.push(name);}
async function rejectsCode(fn,code){await assert.rejects(fn,e=>e.code===code);}
try {
  assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name,'contact_center_test');
  if(process.argv.includes('--reset'))await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP ROLE IF EXISTS cc_test_runtime;');
  await admin.query("CREATE TABLE tenants(id integer PRIMARY KEY,unique_id text UNIQUE); CREATE TABLE users(id integer PRIMARY KEY,tenant_id integer,organization_id integer,status text);");
  const client=await admin.connect();try{await client.query('BEGIN');await up(client);await extend(client);await client.query('COMMIT');}finally{client.release();}
  await admin.query("INSERT INTO tenants VALUES(11,'HOSPITAL_11'),(22,'CLINIC_22'); INSERT INTO users VALUES(1,11,11,'active'),(2,11,11,'active'),(3,22,22,'active');");
  // Test-only generated password, safely quoted and never printed.
  await admin.query(`CREATE ROLE cc_test_runtime LOGIN PASSWORD '${cfg.password.replaceAll("'","''")}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO cc_test_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cc_test_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cc_test_runtime;`);
  const ddl=await admin.connect();try{await ddl.query('BEGIN');await withMigrationOwner(ddl,async()=>{await harden(ddl,'cc_test_runtime',TABLES);await up(ddl);await extend(ddl);await harden(ddl,'cc_test_runtime',TABLES);});await ddl.query('COMMIT');}catch(e){await ddl.query('ROLLBACK');throw e;}finally{ddl.release();}
  runtime=new pg.Pool({...connection,user:'cc_test_runtime',max:10});const tx=createContactCenterStore(runtime);
  await check('All contact-center tables use the separate NOLOGIN owner and forced RLS',async()=>{
    const {rows}=await admin.query("SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolname,r.rolcanlogin,r.rolsuper,r.rolbypassrls FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1)",[TABLES]);
    assert.equal(rows.length,TABLES.length);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&r.rolname==='mediqzy_voice_owner'&&!r.rolcanlogin&&!r.rolsuper&&!r.rolbypassrls));
    assert.equal((await runtime.query("SELECT pg_has_role(current_user,'mediqzy_voice_owner','MEMBER') AS member")).rows[0].member,false);
  });
  await check('Runtime cannot disable RLS or truncate audit events',async()=>{
    await assert.rejects(()=>runtime.query('ALTER TABLE cc_calls DISABLE ROW LEVEL SECURITY'),e=>e.code==='42501');
    await assert.rejects(()=>runtime.query('TRUNCATE cc_events'),e=>e.code==='42501');
  });
  let dialCount=0;const remote=new Map(),rotations=[];
  const providerFactory=()=>({sid:'test-account',rotateSubscriber:async(...values)=>rotations.push(values),dial:async()=>{const Sid=String(++dialCount).padStart(32,'a');remote.set(Sid,{Sid,Status:'queued'});return {Sid};},details:async id=>{if(!remote.has(id))throw new Error('Provider call missing');return remote.get(id);}});
  const storageCalls=[];const storage={assertConfigured(){},importExotel:async()=>storageCalls.push('import'),playback:async()=>{storageCalls.push('playback');return 'https://private.example.test/expiring';},remove:async()=>storageCalls.push('delete')};
  const env={VOICE_PUBLIC_BASE_URL:'https://app.example.test',VOICE_GATEWAY_EVENT_SECRET:'test-event-secret',VOICE_PROVIDER_BINDINGS:JSON.stringify({HOSPITAL_11:{credential_prefix:'VOICE_DEMO',number:'+918012345678',gateway_prefix:'VOICE_GATEWAY'},CLINIC_22:{credential_prefix:'VOICE_OTHER',number:'+918012345679'}})};
  env.VOICE_DEMO_WEBRTC_ACCOUNT_TOKEN='synthetic-test-token';env.VOICE_DEMO_WEBRTC_ACCOUNTS=JSON.stringify({1:{userName:'agent-one',domain:'test.exotel.com',sipdomain:'test.exotel.com',port:443}});
  let retrieved=[];
  const service=createContactCenter({tx,providerFactory,env,storage,embed:async()=>[1,...Array(767).fill(0)],llm:async(kind,segments,knowledge)=>{retrieved=knowledge;return {summary:'Synthetic test summary',actionItems:[],citations:[segments[0].segment_id],requiresHumanReview:true};}});
  const actor={id:1},uid='HOSPITAL_11',other='CLINIC_22';
  await service.configure(uid,actor,{credential_prefix:'VOICE_DEMO',number:'+918012345678',enabled:true,recording_enabled:true,retention_days:1,gateway_prefix:'VOICE_GATEWAY'});
  await service.configure(other,{id:3},{credential_prefix:'VOICE_OTHER',number:'+918012345679',enabled:true,recording_enabled:false,retention_days:1});
  await check('A tenant cannot select another organization provider credential reference',()=>rejectsCode(()=>service.configure(uid,actor,{credential_prefix:'VOICE_OTHER',number:'+918012345677',enabled:true,recording_enabled:false,retention_days:1}),'VOICE_BINDING_REQUIRED'));
  for(const id of [1,2])await service.saveAgent(uid,actor,{user_id:id,name:`Test Agent ${id}`,phone:`+91987654321${id}`,role:id===1?'supervisor':'agent',skills:['support'],languages:['en'],priority:1});
  await check('Agent identity is tenant-bound',()=>rejectsCode(()=>service.saveAgent(uid,actor,{user_id:3,name:'Other',phone:'+919876543213',role:'agent',skills:[],languages:[],priority:1}),'INVALID_AGENT'));
  await service.presence(uid,actor,'available');await service.presence(uid,{id:2},'available');
  const queue=await service.saveQueue(uid,actor,{name:'Appointments',skills:['support'],languages:['en'],wrap_seconds:0,timeout_seconds:120});
  const input={to:'+919999999991',record:false,consent:{status:'granted',source:'written',evidence:'Synthetic fixture consent only'}};
  let call;
  await check('Concurrent retries originate exactly one provider call',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>service.dial(uid,actor,input,'test-request-0001')));call=results[0];assert.equal(new Set(results.map(r=>r.id)).size,1);assert.equal(dialCount,1);
  });
  await check('An idempotency key cannot change recipient',()=>rejectsCode(()=>service.dial(uid,actor,{...input,to:'+919999999992'},'test-request-0001'),'IDEMPOTENCY_CONFLICT'));
  await check('A busy agent cannot place a second call',()=>rejectsCode(()=>service.dial(uid,actor,input,'test-request-0002'),'NO_AVAILABLE_AGENT'));
  await check('Other tenant cannot read call',()=>rejectsCode(()=>service.getCall(other,call.id),'CALL_NOT_FOUND'));
  await check('Pool does not retain tenant state',async()=>assert.equal((await runtime.query('SELECT * FROM cc_calls')).rowCount,0));
  await check('Database rejects a cross-tenant insert',()=>tx(uid,async c=>assert.rejects(()=>c.query("INSERT INTO cc_suppressions VALUES($1,$2,'test','1',now())",[other,'+919999999993']),e=>e.code==='42501')));
  await check('Agent active-call references are constrained to an existing call of the same tenant',()=>assert.rejects(()=>tx(uid,c=>c.query('UPDATE cc_agents SET active_call_id=$3 WHERE tenant_uid=$1 AND user_id=$2',[uid,'2','11111111-1111-1111-1111-111111111111'])),e=>e.code==='23503'));
  const sid=call.provider_sid||String(1).padStart(32,'a');remote.set(sid,{Sid:sid,Status:'in-progress',Duration:12});await service.reconcile(uid,sid);
  remote.set(sid,{Sid:sid,Status:'completed',Duration:60});await service.reconcile(uid,sid);
  await check('Duplicate provider event is skipped',async()=>assert.equal((await service.reconcile(uid,sid)).duplicate,true));
  remote.set(sid,{Sid:sid,Status:'queued',Duration:60});await service.reconcile(uid,sid);
  await check('Late callback cannot regress terminal state',async()=>assert.equal((await service.getCall(uid,call.id)).state,'completed'));
  await check('Event history is immutable',()=>tx(uid,async c=>assert.rejects(()=>c.query('DELETE FROM cc_events WHERE tenant_uid=$1',[uid]),e=>e.code==='42501')));
  await service.disposition(uid,actor,call.id,{disposition:'information_provided'});
  await check('Browser credentials are rotated only for the assigned account',async()=>{
    const session=await service.browserSession(uid,actor);assert.equal(session.userName,'agent-one');assert.equal(session.secret,rotations[0][1]);assert.equal(session.secret.length,43);assert.equal(session.accountToken,undefined);
    await rejectsCode(()=>service.browserSession(uid,{id:2}),'BROWSER_CALLING_NOT_CONFIGURED');
  });
  const headers=body=>{const timestamp=String(Date.now()),nonce='event_nonce_'+Math.random().toString(36).slice(2).padEnd(16,'0');return {timestamp,nonce,signature:createHmac('sha256',env.VOICE_GATEWAY_EVENT_SECRET).update(`${timestamp}.${nonce}.${JSON.stringify(body)}`).digest('hex')};};
  const segment={callId:call.id,type:'transcript',segment:{id:'segment-1',speaker:'caller',startMs:0,endMs:500,final:true,text:'Email demo@example.test, book a visit',revision:1}};
  const h=headers(segment);await service.ingest(uid,h,segment);
  await check('Signed event replay is rejected',()=>rejectsCode(()=>service.ingest(uid,h,segment),'EVENT_REPLAY'));
  await check('Transcripts are redacted before persistence',async()=>assert.equal((await service.callDetail(uid,call.id)).transcripts[0].text.includes('demo@example.test'),false));
  await check('Search remains tenant scoped',async()=>{assert.equal((await service.search(uid,'visit')).length,1);assert.equal((await service.search(other,'visit')).length,0);});
  await service.saveKnowledge(uid,actor,{title:'Appointment visit policy',body:'Book a visit through the approved hospital appointment desk.',published:true});
  await check('Summary jobs produce reviewable artifacts',async()=>{assert.equal((await service.runJobs(uid)).processed,1);assert.equal((await service.callDetail(uid,call.id)).artifacts.length,1);});
  await check('Copilot retrieval includes only published tenant knowledge',async()=>{
    assert.equal(retrieved.length,1);assert.ok(retrieved[0].id.startsWith('kb-'));
    assert.equal((await service.knowledge(other)).length,0);
  });
  await check('Vector indexing and semantic search obey tenant scope',async()=>{
    await service.indexCall(uid,call.id);assert.equal((await service.semanticSearch(uid,'appointments')).length,1);assert.equal((await service.semanticSearch(other,'appointments')).length,0);
  });
  await check('Unconsented recording import stays denied',()=>rejectsCode(()=>service.storeRecording(uid,actor,call.id),'RECORDING_NOT_PERMITTED'));
  await service.suppress(uid,actor,{phone:'+919999999994',reason:'Synthetic suppression'});
  await check('Suppressed destination cannot be dialed',()=>rejectsCode(()=>service.dial(uid,actor,{...input,to:'+919999999994'},'test-request-suppressed'),'SUPPRESSED'));
  await check('Queue assignment respects skills and excludes busy agents',async()=>{
    const results=await Promise.all([service.dial(uid,actor,{...input,queue_id:queue.id},'queue-request-0001'),service.dial(uid,actor,{...input,queue_id:queue.id,to:'+919999999995'},'queue-request-0002')]);
    assert.equal(new Set(results.map(c=>c.agent_id)).size,2);
  });
  await check('Missing gateway does not fake media success',async()=>{
    const active=(await service.overview(uid)).calls.find(c=>c.state==='queued');await rejectsCode(()=>service.mediaAction(uid,{id:Number(active.agent_id)},active.id,{action:'hold'}),'MEDIA_GATEWAY_NOT_CONFIGURED');
  });
  for(const active of (await service.overview(uid)).calls.filter(c=>c.state==='queued')){
    remote.set(active.provider_sid,{Sid:active.provider_sid,Status:'completed',Duration:42});await service.reconcile(uid,active.provider_sid);await service.disposition(uid,{id:Number(active.agent_id)},active.id,{disposition:'information_provided'});
  }
  const recorded=await service.dial(uid,actor,{...input,record:true},'recording-test-0001');
  remote.set(recorded.provider_sid,{Sid:recorded.provider_sid,Status:'completed',Duration:35,RecordingUrl:'https://recordings.exotel.com/synthetic.mp3'});await service.reconcile(uid,recorded.provider_sid);
  let recording;
  await check('A consented completed call imports one private recording',async()=>{
    recording=await service.storeRecording(uid,actor,recorded.id);await service.storeRecording(uid,actor,recorded.id);assert.equal(storageCalls.filter(c=>c==='import').length,1);
    const ended=await service.getCall(uid,recorded.id);assert.ok(Math.abs(Date.parse(recording.expires_at)-Date.parse(ended.ended_at)-86400000)<1000);
    assert.equal((await service.playback(uid,actor,recording.id)).expiresIn,120);await rejectsCode(()=>service.playback(other,{id:3},recording.id),'RECORDING_NOT_FOUND');
  });
  await tx(uid,async c=>{await c.query("UPDATE cc_calls SET ended_at=now()-interval '2 days' WHERE tenant_uid=$1 AND id=$2",[uid,recorded.id]);await c.query("UPDATE cc_recordings SET expires_at=now()-interval '1 day' WHERE tenant_uid=$1 AND id=$2",[uid,recording.id]);});
  await check('Retention deletes recording content and contact details',async()=>{
    assert.equal((await service.expireText(uid,actor)).expired,1);assert.equal((await service.expireRecordings(uid,actor)).deleted,1);assert.ok(storageCalls.includes('delete'));
    const value=await service.getCall(uid,recorded.id);assert.equal(value.destination,'[REDACTED]');assert.equal(value.consent.evidence,undefined);
    await rejectsCode(()=>service.playback(uid,actor,recording.id),'RECORDING_NOT_FOUND');await rejectsCode(()=>service.storeRecording(uid,actor,recorded.id),'CALL_CONTENT_EXPIRED');
  });
  await check('Delayed events cannot recreate expired call content',async()=>{
    const late={...segment,callId:recorded.id};await rejectsCode(()=>service.ingest(uid,headers(late),late),'CALL_CONTENT_EXPIRED');
    await rejectsCode(()=>service.artifact(uid,actor,recorded.id,'summary'),'CALL_CONTENT_EXPIRED');
  });
  await check('Verified inbound missed calls create one owned callback task',async()=>{
    const Sid='inbound'.padEnd(32,'b');remote.set(Sid,{Sid,Direction:'inbound',From:'09876543210',To:'+918012345678',Status:'no-answer',Duration:0});
    const result=await service.reconcile(uid,Sid);await service.reconcile(uid,Sid);const inbound=await service.getCall(uid,result.callId);assert.equal(inbound.direction,'inbound');assert.equal(inbound.destination,'+919876543210');
    const callbacks=(await service.overview(uid)).callbacks.filter(b=>b.call_id===inbound.id);assert.equal(callbacks.length,1);await service.callback(uid,actor,callbacks[0].id,{status:'in_progress'});
    assert.equal((await service.overview(uid)).callbacks.find(b=>b.id===callbacks[0].id).attempts,0);
    await rejectsCode(()=>service.callback(uid,{id:2},callbacks[0].id,{status:'in_progress'}),'CALLBACK_ALREADY_CLAIMED');
    await service.disposition(uid,actor,recorded.id,{disposition:'information_provided'});
    await rejectsCode(()=>service.dial(uid,actor,{...input,to:'+919999999990',callback_id:callbacks[0].id},'callback-invalid-0001'),'CALLBACK_SCOPE_MISMATCH');
    await service.dial(uid,actor,{...input,to:inbound.destination,callback_id:callbacks[0].id},'callback-valid-0001');
    await service.dial(uid,actor,{...input,to:inbound.destination,callback_id:callbacks[0].id},'callback-valid-0001');
    assert.equal((await service.overview(uid)).callbacks.find(b=>b.id===callbacks[0].id).attempts,1);
  });
  await advancedChecks({admin,runtime,tx,base:service,uid,other,actor,check});
  const result={database:'disposable PostgreSQL 16',passed:checks.length,checks,liveCalls:0,productionMutations:0};
  if(process.env.VOICE_QA_EVIDENCE){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.VOICE_QA_EVIDENCE,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify(result,null,2));
}finally{await runtime?.end();await admin.end();}
