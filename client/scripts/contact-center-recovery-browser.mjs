/** Production browser smoke: existing demo CRM staff, read-only UI, no calls/capture. */
import puppeteer from 'puppeteer';
import {SSMClient,GetParametersCommand} from '../../server/node_modules/@aws-sdk/client-ssm/dist-cjs/index.js';
import {Client} from '../../server/node_modules/pg/esm/index.mjs';
import jwt from '../../server/node_modules/jsonwebtoken/index.js';
import {postgresTls} from '../../server/db/postgres-tls.js';
import {writeFileSync} from 'node:fs';
const output=process.argv[2];if(!output)throw new Error('Private evidence path required');
const names=['POSTGRES_HOST','POSTGRES_DATABASE','POSTGRES_USER','POSTGRES_PASSWORD','JWT_SECRET'];const params=await new SSMClient({region:'ap-south-1'}).send(new GetParametersCommand({Names:names.map(k=>'/mediczy/prod/'+k),WithDecryption:true}));const env=Object.fromEntries(params.Parameters.map(p=>[p.Name.split('/').at(-1),p.Value]));
const db=new Client({host:env.POSTGRES_HOST,database:env.POSTGRES_DATABASE,user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:env.POSTGRES_HOST})});let staff;
try{await db.connect();staff=(await db.query(`SELECT u.id,u.role,u."isAdmin",u.tenant_id,u.metadata FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE t.id=11 AND t.metadata->>'demo'='true' AND u.status='active' AND u.metadata->>'crmRole'='business_head' AND (u."isTeam" OR u."isAdmin" OR u.role IN('team','admin') OR u.metadata->>'isCRM'='true' OR u.metadata->>'crmAccess'='true') ORDER BY u.id LIMIT 1`)).rows[0];}finally{await db.end();}
if(!staff)throw new Error('Existing active demo CRM Business Head required');
const token=jwt.sign({id:staff.id,userId:staff.id,role:staff.role,userType:'crm',isCRM:true,isAdmin:staff.isAdmin||false,tenantId:staff.tenant_id,crmRole:staff.metadata.crmRole,tokenType:'access'},env.JWT_SECRET,{expiresIn:600});
const base='https://app.mediqzy.com',callId='11111111-1111-4111-8111-111111111111';
const record={at:new Date().toISOString(),base,checks:[],productionMutations:0,callsPlaced:0,microphoneCapture:false,fixtureMutations:0};
const browser=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
let scenario='live',overview,detailReads=0,state='queued',expiredReads=0,refreshes=0,flowVersion=3;const writes=[];
const call={id:callId,provider:'livekit',provider_sid:'synthetic-recovery-room',destination:'SYNTHETIC RECOVERY CALL',state:'queued',agent_id:String(staff.id),started_at:new Date().toISOString()};
const flow={id:callId,name:'Synthetic routing',version:3,published:true,graph:{start:'end',nodes:[{id:'end',type:'end'}]}};
function fixture(){return {...overview,agents:[{user_id:String(staff.id),name:'Synthetic assigned staff',presence:'available',active_call_id:null}],calls:[{...call,state}],callbacks:[{id:callId,provider:'livekit',destination:'+919999999991',status:'open',attempts:0,due_at:new Date().toISOString()}],flows:[flow],queues:[]};}
try{
 const page=await browser.newPage();await page.setCacheEnabled(false);await page.setBypassServiceWorker(true);await page.setViewport({width:1280,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',async r=>{try{
  const u=new URL(r.url()),path=u.pathname,method=r.method();const respond=(status,payload)=>r.respond({status,contentType:'application/json',body:JSON.stringify(payload)});
  if(u.origin!==base&&!['data:','blob:'].includes(u.protocol))return await r.abort();
  if(path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method)){
   record.fixtureMutations++;if(scenario==='expired'&&path==='/api/crm/auth/refresh'){refreshes++;return await respond(200,{token,refreshToken:'synthetic-rotated'});}
   const body=JSON.parse(r.postData()||'{}');writes.push({path,body});
   if(scenario!=='live'&&path.endsWith('/flows'))return await respond(200,{...flow,version:++flowVersion});
   if(scenario!=='live'&&path.endsWith('/media/reconcile'))return await respond(200,{state:'ready',participants:[],requiresOperatorReview:false});
   if(scenario!=='live'&&path.includes('/callbacks/'))return await respond(200,{});
   return await respond(409,{error:'Production mutation blocked by verification harness'});
  }
  if(scenario!=='live'&&path.replace(/\/$/,'')==='/api/crm/contact-center'){
   if(scenario==='expired'&&expiredReads++===0)return await respond(401,{message:'Synthetic access expiry'});
   return await respond(200,fixture());
  }
  if(scenario!=='live'&&path===`/api/crm/contact-center/calls/${callId}`){detailReads++;return await respond(200,{call:{...call,state},events:[],transcripts:[],artifacts:[],recordings:[]});}
  await r.continue();
 }catch{try{await r.abort();}catch{}}});
 await page.evaluateOnNewDocument(({token,staff})=>{localStorage.clear();localStorage.setItem('crmToken',token);localStorage.setItem('crmRefreshToken','synthetic-refresh');localStorage.setItem('crmUserData',JSON.stringify({id:staff.id,crmRole:staff.metadata.crmRole,role:staff.role,isAdmin:staff.isAdmin,tenantId:staff.tenant_id}));},{token,staff});
 async function button(name){await page.evaluate(name=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name);if(!b)throw new Error('Control not found');b.click();},name);}
 async function check(name,fn){try{await fn();record.checks.push({name,passed:true});}catch(e){record.checks.push({name,passed:false,error:e.message});}}
 async function load(){await page.goto(base+'/crm/contact-center',{waitUntil:'networkidle2',timeout:45000});await page.waitForSelector('input[aria-label="Customer number"]');}
 await load();overview=await page.evaluate(async()=>{const r=await fetch('/api/crm/contact-center',{headers:{Authorization:'Bearer '+localStorage.getItem('crmToken')}});return r.json();});
 record.liveConfiguration={ownAgentAssigned:overview.agents.some(a=>String(a.user_id)===String(staff.id)),livekit:overview.capabilities.livekit,nativePstn:overview.capabilities.nativePstn,biometricsConfigured:overview.capabilities.biometricsConfigured};
 await check('Live readiness prevents unassigned staff from starting calls',async()=>{await button('Livekit');const guarded=await page.evaluate(()=>({disabled:[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Start browser voice session')?.disabled,message:document.body.innerText.includes('assign you under Settings')}));if(!record.liveConfiguration.ownAgentAssigned&&(!guarded.disabled||!guarded.message))throw new Error('Missing assignment guard');});
 await check('Live biometric capture stays disabled without model/storage configuration',async()=>{await button('Voice identity');if(!record.liveConfiguration.biometricsConfigured&&!await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>/^Request (enroll|verify) challenge$/.test(b.textContent.trim())).every(b=>b.disabled)))throw new Error('Capture guard missing');});
 scenario='fixture';await load();await button('Open');await page.waitForFunction(()=>document.body.innerText.includes('Call · SYNTHETIC RECOVERY CALL'));
 await check('Deployed bundle sends native status refresh to LiveKit',async()=>{await button('Refresh provider status');await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Refresh provider status').disabled);if(!writes.some(w=>w.path.endsWith('/media/reconcile'))||writes.some(w=>w.path.endsWith('/'+callId+'/reconcile')))throw new Error('Wrong transport');});
 await check('Opened detail refreshes to completed and enables wrap-up',async()=>{state='completed';await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Complete wrap-up'),{timeout:18000});if(detailReads<2)throw new Error('Detail was not polled');});
 await check('Existing flow publication retains identity over two versions',async()=>{await button('Routing');await button('Edit routing version');await button('Publish routing version');await page.waitForFunction(()=>document.body.innerText.includes('Call routing · version 4'));await button('Publish routing version');await page.waitForFunction(()=>document.body.innerText.includes('Call routing · version 5'));const flows=writes.filter(w=>w.path.endsWith('/flows'));if(flows.length!==2||flows.some(f=>f.body.id!==callId||f.body.graph.start!=='end'))throw new Error('Flow identity lost');});
 await check('Claimed native callback opens the native recipient control',async()=>{await button('Callbacks');await button('Take callback');await page.waitForSelector('input[aria-label="LiveKit phone number"]');if(!await page.evaluate(()=>document.querySelector('input[aria-label="LiveKit phone number"]').value==='+919999999991'))throw new Error('Callback recipient missing');});
 await check('Expired access renews once and recovers the deployed console',async()=>{scenario='expired';await load();if(refreshes!==1)throw new Error('Expected one renewal');if(await page.evaluate(()=>document.body.innerText.includes('Loading contact center')))throw new Error('Console stuck loading');});
 record.pageErrorCount=errors.length;record.passed=record.checks.every(c=>c.passed)&&errors.length===0;
}catch(e){record.passed=false;record.error=e.message;}finally{await browser.close();writeFileSync(output,JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record));if(!record.passed)process.exitCode=1;
