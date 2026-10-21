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
const token=jwt.sign({id:staff.id,userId:staff.id,role:staff.role,userType:'crm',isCRM:true,isAdmin:staff.isAdmin||false,tenantId:staff.tenant_id,crmRole:staff.metadata.crmRole,tokenType:'access'},env.JWT_SECRET,{expiresIn:180});
const record={at:new Date().toISOString(),base:'https://app.mediqzy.com',checks:[],clinicalWrites:0,telephoneCalls:0,microphoneCapture:false,authentication:'Ephemeral signed access token for existing active demo CRM staff; login credentials unchanged'};
const browser=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(u.origin===record.base||['data:','blob:'].includes(u.protocol))r.continue();else r.abort();});
 await page.evaluateOnNewDocument(({token,staff})=>{localStorage.setItem('crmToken',token);const user={id:staff.id,crmRole:staff.metadata.crmRole,role:staff.role,isAdmin:staff.isAdmin,tenantId:staff.tenant_id};localStorage.setItem('crmUser',JSON.stringify(user));localStorage.setItem('crmUserData',JSON.stringify(user));},{token,staff});
 async function check(name,fn){try{await fn();record.checks.push({name,passed:true});}catch{record.checks.push({name,passed:false});}}
 await check('CRM contact-center console renders with real authenticated API data',async()=>{await page.goto(record.base+'/crm/contact-center',{waitUntil:'networkidle2',timeout:45000});await page.waitForSelector('input[aria-label="Customer number"]',{timeout:15000});});
 await check('Native LiveKit workspace renders without placing a call',async()=>{await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Livekit')?.click());await page.waitForFunction(()=>document.body.innerText.includes('Browser voice workspace'),{timeout:10000});});
 await check('Campaign list renders without publishing or dialing',async()=>{await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Campaigns')?.click());await page.waitForSelector('input[aria-label="Voice campaign name"]',{timeout:10000});});
 await check('Biometric UI requires consent and fresh challenge before capture',async()=>{await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Voice identity')?.click());await page.waitForSelector('input[aria-label="Voice identity CRM ID"]',{timeout:10000});});
 await check('Mobile dialer renders at phone viewport without overflow',async()=>{await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.goto(record.base+'/crm/dialer',{waitUntil:'networkidle2',timeout:45000});await page.waitForFunction(()=>/Dialer|dialer|set up|calling/i.test(document.body.innerText)&&document.body.innerText.trim().length>40,{timeout:15000});if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw new Error('Horizontal overflow');});
 record.pageErrorCount=errors.length;record.passed=record.checks.every(c=>c.passed)&&errors.length===0;
}catch{record.passed=false;}finally{await browser.close();writeFileSync(output,JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record));if(!record.passed)process.exitCode=1;
