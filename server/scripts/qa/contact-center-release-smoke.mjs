/** Read-only production release checks. Never places calls or writes clinical records. */
import {SSMClient,GetParametersCommand} from '@aws-sdk/client-ssm';
import {Client} from 'pg';
import jwt from 'jsonwebtoken';
import {writeFileSync} from 'node:fs';
import {postgresTls} from '../../db/postgres-tls.js';
import {TABLES as CORE} from '../../migrations/20261020008000-contact-center.migration.js';
import {TABLES as MEDIA} from '../../migrations/20261020008100-contact-center-livekit.migration.js';
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
if(!args.includes('--evidence'))throw new Error('An evidence output path is required');
const base=args.includes('--base')?arg('--base'):'https://app.mediqzy.com';
if(!['https://app.mediqzy.com','http://127.0.0.1:8888'].includes(base))throw new Error('Use the approved production base');
const record={at:new Date().toISOString(),base,checks:[],clinicalWrites:0,telephoneCalls:0,authenticationMethod:'Ephemeral signed access token for existing active demo CRM staff; no role or account changes'};
async function check(name,fn){try{const info=await fn();record.checks.push({name,passed:true,...info});}catch(e){record.checks.push({name,passed:false,code:e.code||'CHECK_FAILED'});}}
function requireValue(condition){if(!condition)throw new Error('Check failed');}
const names=['POSTGRES_HOST','POSTGRES_DATABASE','POSTGRES_USER','POSTGRES_PASSWORD','JWT_SECRET'];
const params=await new SSMClient({region:'ap-south-1'}).send(new GetParametersCommand({Names:names.map(n=>'/mediczy/prod/'+n),WithDecryption:true}));
const env=Object.fromEntries(params.Parameters.map(p=>[p.Name.split('/').at(-1),p.Value]));
if(names.some(n=>!env[n])||env.POSTGRES_DATABASE!=='mediczy_prod'||env.POSTGRES_USER!=='mediczy_helper')throw new Error('Approved runtime configuration required');
const db=new Client({host:env.POSTGRES_HOST,database:env.POSTGRES_DATABASE,user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:env.POSTGRES_HOST}),connectionTimeoutMillis:10000,application_name:'contact-center-release-readonly-smoke'});
async function request(path,{token,body,method='GET',headers={}}={}){const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});const value=await r.json().catch(()=>null);return {status:r.status,value};}
try{
 await db.connect();await db.query("BEGIN READ ONLY;SET LOCAL statement_timeout='10s'");
 await check('Critical database health',async()=>{const {status,value}=await request('/api/health');requireValue(status===200&&value.status==='healthy'&&value.databases.postgres==='connected'&&value.databases.postgresSequelize==='connected');return {status};});
 await check('All 22 voice tables have forced RLS and separate NOLOGIN ownership',async()=>{const {rows}=await db.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname,r.rolcanlogin,r.rolbypassrls FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1)",[[...CORE,...MEDIA]]);requireValue(rows.length===22&&rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&r.rolname==='mediqzy_voice_owner'&&!r.rolcanlogin&&!r.rolbypassrls));return {tables:rows.length};});
 await check('Runtime cannot own voice tables or truncate audit history',async()=>{const {rows:[r]}=await db.query("SELECT pg_has_role(current_user,'mediqzy_voice_owner','MEMBER') AS member,has_table_privilege(current_user,'cc_events','TRUNCATE') AS truncate");requireValue(!r.member&&!r.truncate);});
 await check('Unscoped runtime cannot read contact-center calls',async()=>requireValue(Number((await db.query('SELECT count(*) AS n FROM cc_calls')).rows[0].n)===0));
 for(const path of ['/api/crm/contact-center','/api/crm/contact-center/media/readiness','/api/crm/contact-center/voice-campaigns','/api/field/attendance/today','/api/v1/nursing/worklist'])await check('Unauthenticated denial '+path,async()=>{const {status}=await request(path);requireValue([401,403].includes(status));return {status};});
 await check('Unsigned LiveKit webhook denied',async()=>{const {status}=await request('/api/contact-center/hooks/livekit/HOSPITAL_QA',{method:'POST',body:{id:'release-unsigned-test',event:'room_finished',room:{name:'nonexistent-release-test'}}});requireValue([401,403].includes(status));return {status};});
 await check('Invalid single-use guest invitation denied',async()=>{const {status}=await request('/api/contact-center/hooks/guest/HOSPITAL_QA',{method:'POST',body:{callId:'11111111-1111-4111-8111-111111111111',invite:'a'.repeat(43),consent:false}});requireValue([403,404].includes(status));return {status};});
 const candidate=(await db.query(`SELECT u.id,u.role,u."isAdmin",u.tenant_id,u.metadata,t.unique_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE t.id=11 AND u.status='active' AND (u.metadata->>'crmRole') IN ('business_head','telecaller') AND (u."isTeam" OR u."isAdmin" OR u.role IN('team','admin') OR u.metadata->>'isCRM'='true' OR u.metadata->>'crmAccess'='true') ORDER BY CASE WHEN u.metadata->>'crmRole'='business_head' THEN 0 ELSE 1 END,u.id LIMIT 1`)).rows[0];
 if(candidate){const token=jwt.sign({id:candidate.id,userId:candidate.id,role:candidate.role,userType:'crm',isCRM:true,isAdmin:candidate.isAdmin||false,tenantId:candidate.tenant_id,crmRole:candidate.metadata.crmRole,tokenType:'access'},env.JWT_SECRET,{expiresIn:180});
  for(const path of ['/api/crm/contact-center','/api/crm/contact-center/media/readiness',...(candidate.metadata.crmRole==='business_head'?['/api/crm/contact-center/voice-campaigns']:[])])await check('Authenticated demo CRM read '+path,async()=>{const {status,value}=await request(path,{token});requireValue(status===200&&value!=null);return {status,...(path.endsWith('readiness')?{livekit:value.livekit}:{})};});
 }else record.authenticatedCrmSkipped='No existing approved active demo CRM user';
 await db.query('ROLLBACK');
}catch(e){record.checks.push({name:'Runtime database connection and read-only scope',passed:false,code:e.code||'DATABASE_SMOKE_FAILED'});}
finally{await db.end();record.passed=record.checks.every(c=>c.passed);writeFileSync(arg('--evidence'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record));if(!record.passed)process.exitCode=1;
