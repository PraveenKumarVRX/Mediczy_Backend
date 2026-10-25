import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {validateDedicatedEnvironment,dedicatedBoundary} from '../installations/crm/runtime-boundary.js';
import {ReportOutbox} from '../installations/crm/report-outbox.mjs';
const env={RELEASE_SHA:'test-release',CRM_PUBLIC_ORIGIN:'https://medstar.example',CRM_TENANT_UID:'H98VG4',CRM_TENANT_ID:'70',CRM_V2_DEFAULT_TENANT_ID:'70',JWT_SECRET:'x'.repeat(64),CRM_CREDENTIAL_ENCRYPTION_KEY:'a'.repeat(64),POSTGRES_HOST:'db',POSTGRES_DATABASE:'medstar_crm',POSTGRES_USER:'medstar_app',POSTGRES_PASSWORD:'separate-secret',REDIS_HOST:'redis',REDIS_PASSWORD:'separate-redis'};
test('dedicated startup refuses implicit scope and central AWS credentials',()=>{
 assert.equal(validateDedicatedEnvironment(env).tenantUid,'H98VG4');
 for(const override of [{CRM_TENANT_UID:''},{CRM_V2_DEFAULT_TENANT_ID:'7'},{JWT_SECRET:'short'},{SSM_PARAM_PATH:'/mediczy/prod'},{AWS_ACCESS_KEY_ID:'central-key'},{POSTGRES_HOST:''}])assert.throws(()=>validateDedicatedEnvironment({...env,...override}));
});
test('host and tenant boundaries fail closed and unrelated APIs stay unmounted',()=>{
 const boundary=dedicatedBoundary(validateDedicatedEnvironment(env));
 for(const[host,path,header,expected]of [['wrong.example','/api/crm/leads',null,421],['medstar.example','/api/crm/leads','999',403],['medstar.example','/api/admin/users',null,404],['medstar.example','/api/crm/leads','70',200]]){
  let status=200;const req={path,get:key=>key.toLowerCase()==='host'?host:key==='X-Tenant-ID'?header:undefined};const res={status:s=>{status=s;return res;},json:()=>{}};boundary(req,res,()=>{});assert.equal(status,expected);
 }
});
test('outage retains the exact report identity for retry; acknowledged reports are removed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'medstar-outbox-'));const now=new Date().toISOString();const report={eventId:randomUUID(),observedAt:now,day:now.slice(0,10),release:'test-release',health:'healthy',metrics:{}};
 try{
  let online=false;const delivered=[];const box=new ReportOutbox(dir,async value=>{if(!online)throw Error('offline');delivered.push(value);});
  await box.enqueue(report);await box.enqueue(report);assert.equal((await readdir(dir)).length,1);
  await assert.rejects(box.drain());const persisted=JSON.parse(await readFile(join(dir,(await readdir(dir))[0]),'utf8'));assert.equal(persisted.eventId,report.eventId);
  online=true;await box.drain();assert.equal(delivered[0].eventId,report.eventId);assert.equal((await readdir(dir)).length,0);
  await assert.rejects(box.enqueue({...report,patientName:'must-never-leave-the-tenant'}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
