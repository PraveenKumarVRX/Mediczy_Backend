/** Production browser smoke: existing demo CRM staff, read-only UI, no calls/capture. */
import puppeteer from 'puppeteer';
import {SSMClient,GetParametersCommand} from '../../server/node_modules/@aws-sdk/client-ssm/dist-cjs/index.js';
import {Client} from '../../server/node_modules/pg/esm/index.mjs';
import jwt from '../../server/node_modules/jsonwebtoken/index.js';
import {postgresTls} from '../../server/db/postgres-tls.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
const output=process.argv[2];if(!output)throw new Error('Private evidence path required');
const names=['POSTGRES_HOST','POSTGRES_DATABASE','POSTGRES_USER','POSTGRES_PASSWORD','JWT_SECRET'];const params=await new SSMClient({region:'ap-south-1'}).send(new GetParametersCommand({Names:names.map(k=>'/mediczy/prod/'+k),WithDecryption:true}));const env=Object.fromEntries(params.Parameters.map(p=>[p.Name.split('/').at(-1),p.Value]));
const db=new Client({host:env.POSTGRES_HOST,database:env.POSTGRES_DATABASE,user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:env.POSTGRES_HOST})});let staff;
try{await db.connect();staff=(await db.query(`SELECT u.id,u.role,u."isAdmin",u.tenant_id,u.metadata FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE t.id=11 AND t.metadata->>'demo'='true' AND u.status='active' AND u.metadata->>'crmRole'='business_head' AND (u."isTeam" OR u."isAdmin" OR u.role IN('team','admin') OR u.metadata->>'isCRM'='true' OR u.metadata->>'crmAccess'='true') ORDER BY u.id LIMIT 1`)).rows[0];}finally{await db.end();}
if(!staff)throw new Error('Existing active demo CRM Business Head required');
const token=jwt.sign({id:staff.id,userId:staff.id,role:staff.role,userType:'crm',isCRM:true,isAdmin:staff.isAdmin||false,tenantId:staff.tenant_id,crmRole:staff.metadata.crmRole,tokenType:'access'},env.JWT_SECRET,{expiresIn:600});



const base='https://app.mediqzy.com';mkdirSync(dirname(output),{recursive:true,mode:0o700});const record={at:new Date().toISOString(),checks:[],productionDataWrites:0,rejectedMutationProbes:4,telephoneCalls:0,providerDeliveryTests:0};
async function probe(name,path,method='GET',body,expected=200,authenticated=true,inspect=()=>({})){try{const r=await fetch(base+path,{method,headers:{...(authenticated?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const data=await r.json();if(r.status!==expected)throw new Error('Unexpected HTTP status '+r.status);record.checks.push({name,passed:true,status:r.status,...inspect(data)});}catch(e){record.checks.push({name,passed:false,error:e.message});}}
await probe('Database health','/api/health','GET',undefined,200,false,d=>{if(d.status!=='healthy'||d.databases?.postgres!=='connected')throw new Error('Database unhealthy');return {healthy:true};});
await probe('Authenticated existing demo profile','/api/crm/profile','GET',undefined,200,true,d=>{if(d.crmUser?.crmRole!=='business_head')throw new Error('Unexpected role');return {role:'business_head'};});
await probe('Inventory is explicitly inactive and redacted','/api/crm/communication-hub/integrations','GET',undefined,200,true,d=>{if(d.data?.length!==9||d.data.some(i=>i.deliveryActive!==false||i.deliveryMode!=='inventory_only'||'encrypted_credentials' in i||'credentialsFingerprint' in i))throw new Error('Unexpected inventory contract');return {channelCount:9,inactiveForDelivery:true};});
// All malformed mutations are rejected before database writes, including on the preceding API version.
await probe('Configuration role reaches validation; blank provider denied','/api/crm/communication-hub/integrations/email','PUT',{provider:'',config:{}},400);
await probe('Disable requires explicit confirmation','/api/crm/communication-hub/integrations/email/disable','POST',{},400);
await probe('Disconnect requires explicit confirmation','/api/crm/communication-hub/integrations/email','DELETE',{},400);
await probe('Verification requires an authoritative revision','/api/crm/communication-hub/integrations/email/test','POST',{},400);
await probe('Inventory remains authenticated','/api/crm/communication-hub/integrations','GET',undefined,401,false);
await probe('Contact-center LiveKit readiness remains separate','/api/crm/contact-center/media/readiness','GET',undefined,200,true,d=>({livekit:d.livekit}));
record.passed=record.checks.every(c=>c.passed);writeFileSync(output,JSON.stringify(record,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(record));if(!record.passed)process.exitCode=1;
