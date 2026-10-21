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
const token=jwt.sign({id:staff.id,userId:staff.id,role:staff.role,userType:'crm',isCRM:true,isAdmin:staff.isAdmin||false,tenantId:staff.tenant_id,crmRole:staff.metadata.crmRole,tokenType:'access'},env.JWT_SECRET,{expiresIn:180});
const base=process.env.CONTACT_THEME_BASE||'https://app.mediqzy.com';if(!['https://app.mediqzy.com','http://127.0.0.1:4173'].includes(base))throw new Error('Approved live or local preview base required');
mkdirSync(dirname(output),{recursive:true,mode:0o700});
const record={at:new Date().toISOString(),base,checks:[],screenshots:[],productionMutations:0,microphoneCapture:false,fixture:'Synthetic calls/callbacks/routing/knowledge/campaigns; every API request intercepted',contrastScope:'Visible enabled solid-background text and form values in contact workspace; gradient header and disabled controls excluded',pageErrors:[]};
const callId='11111111-1111-4111-8111-111111111111';const fixture={providerConfigured:false,config:null,agents:[],queues:[],calls:[{id:callId,destination:'Synthetic example call',provider:'livekit',provider_sid:'synthetic-room',state:'completed',started_at:'2026-10-21T05:00:00Z',agent_id:String(staff.id)}],callbacks:[{id:callId,destination:'+919999999991',provider:'livekit',status:'open',attempts:0,due_at:'2026-10-21T05:00:00Z'}],flows:[{id:callId,name:'Synthetic reception',version:1,published:true,graph:{start:'welcome',nodes:[{id:'welcome',type:'greeting',text:'Welcome to the hospital',next:'end'},{id:'end',type:'end'}]}}],metrics:{total:1,active:0,provider_duration_seconds:60},capabilities:{livekit:true,browserMedia:false,nativePstn:false,voiceProcessing:true,voiceBot:true,biometricsConfigured:false}};
const browser=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.setCacheEnabled(false);await page.setBypassServiceWorker(true);page.on('pageerror',e=>record.pageErrors.push(e.message));
 await page.setRequestInterception(true);page.on('request',async r=>{try{const u=new URL(r.url());if(u.origin!==base&&!['data:','blob:'].includes(u.protocol))return await r.abort();if(u.pathname.startsWith('/api/')){let payload={};if(r.method()!=='GET')return await r.respond({status:409,contentType:'application/json',body:JSON.stringify({error:'Visual verification blocks production mutations'})});if(u.pathname.replace(/\/$/,'')==='/api/crm/contact-center')payload=fixture;else if(u.pathname.endsWith('/calls/'+callId))payload={call:fixture.calls[0],recordings:[],events:[],transcripts:[{segment_id:'synthetic',speaker:'Hospital team',text:'Synthetic transcript for visual verification.'}],artifacts:[{kind:'summary',content:{summary:'Synthetic reviewed conversation preview.',actionItems:['Example follow-up task']}}]};else if(u.pathname.endsWith('/knowledge'))payload=[{id:callId,title:'Synthetic hospital information',body:'Example approved reception information for visual verification.'}];else if(u.pathname.endsWith('/voice-campaigns'))payload=[{id:callId,name:'Synthetic follow-up',status:'draft',completed:0,recipients:1,unknown:0}];else payload=[];return await r.respond({status:200,contentType:'application/json',body:JSON.stringify(payload)});}await r.continue();}catch{try{await r.abort();}catch{}}});
 await page.evaluateOnNewDocument(({token,staff})=>{localStorage.setItem('crmToken',token);localStorage.setItem('crmUserData',JSON.stringify({id:staff.id,crmRole:staff.metadata.crmRole,role:staff.role,isAdmin:staff.isAdmin,tenantId:staff.tenant_id}));},{token,staff});
 async function click(name){await page.evaluate(name=>{const b=[...document.querySelectorAll('.contact-center-theme button')].find(b=>b.textContent.trim()===name);if(!b)throw new Error('Control missing: '+name);b.click();},name);}
 async function capture(name){
  await new Promise(r=>setTimeout(r,350));
  const result=await page.evaluate(()=>{
   const root=document.querySelector('.contact-center-theme');if(!root)return {passed:false,error:'Theme scope missing'};
   const rgba=s=>{const n=s.match(/[\d.]+/g)?.map(Number)||[0,0,0];return [n[0],n[1],n[2],n[3]??1];};
   const over=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
   function background(el){let chain=[],bg=[255,255,255],gradient=false;for(let e=el;e;e=e.parentElement)chain.unshift(e);for(const e of chain){const s=getComputedStyle(e);bg=over(rgba(s.backgroundColor),bg);if(s.backgroundImage!=='none')gradient=true;}return {bg,gradient};}
   const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
   const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[disabled],[aria-hidden="true"]');let tested=0,min=100,gradientSkipped=0;const failures=[];
   function measure(e,text,color){if(!text.trim()||!visible(e))return;const {bg,gradient}=background(e);if(gradient){gradientSkipped++;return;}const fg=over(rgba(color||getComputedStyle(e).color),bg),contrast=ratio(fg,bg);min=Math.min(min,contrast);tested++;if(contrast<4.5)failures.push({text:text.trim().slice(0,65),contrast:Number(contrast.toFixed(2)),color:getComputedStyle(e).color,background:bg});}
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode,e=node.parentElement;if(e&&!['STYLE','SCRIPT','OPTION'].includes(e.tagName))measure(e,node.textContent||'');}
   for(const e of root.querySelectorAll('input:not([type=checkbox]),textarea,select')){if(!visible(e))continue;measure(e,e.value||e.placeholder||e.getAttribute('aria-label')||'Form control',e.value?undefined:getComputedStyle(e,'::placeholder').color);}
   const logo=root.querySelector('img[alt="Mediqzy logo"]');const brand=Boolean(logo?.complete&&logo?.naturalWidth&&root.textContent.includes('Mediqzy'));
   const panels=[...root.querySelectorAll('section')].filter(e=>e.getClientRects().length);const themedPanels=panels.every(e=>{const bg=rgba(getComputedStyle(e).backgroundColor);return bg[3]===1&&Math.max(...bg.slice(0,3))<90;});
   return {passed:failures.length===0&&brand&&themedPanels&&document.documentElement.scrollWidth<=innerWidth+1,testedTextNodes:tested,minimumContrast:Number(min.toFixed(2)),gradientSkipped,failures,brandVisible:brand,themedPanels,noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth+1};
  });
  const filename=name+'.png';await page.screenshot({path:join(dirname(output),filename),fullPage:true});record.screenshots.push(filename);record.checks.push({name,...result});
 }
 await page.goto(base+'/crm/contact-center',{waitUntil:'networkidle2',timeout:60000});
 for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  await page.setViewport({width:viewport.width,height:viewport.height});
  for(const mode of ['light','dark']){
   await page.evaluate(mode=>localStorage.setItem('vite-ui-theme',mode),mode);await page.goto(base+'/crm/contact-center',{waitUntil:'networkidle2',timeout:60000});await page.waitForSelector('.contact-center-theme input[aria-label="Customer number"]');
   await page.evaluate(mode=>{document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(mode);},mode);
   for(const [tab,heading] of [['Calls','New call'],['Livekit','Browser voice workspace'],['Callbacks','Callback queue'],['Search','Search redacted transcripts'],['Routing','Call routing'],['Knowledge','Approved hospital knowledge'],['Campaigns','Voice campaigns'],['Voice identity','Consented voice identity'],['Settings','Exotel connection']]){
    await click(tab);await page.waitForFunction(heading=>[...document.querySelectorAll('.contact-center-theme h2')].some(h=>h.textContent.startsWith(heading)&&h.getClientRects().length>0),{},heading);await capture(`${viewport.name}-${mode}-${tab.toLowerCase().replaceAll(' ','-')}`);
   }
   await click('Calls');await click('Open');await page.waitForFunction(()=>[...document.querySelectorAll('h2')].some(h=>h.textContent==='Call · Synthetic example call'));await capture(`${viewport.name}-${mode}-call-detail`);
  }
 }
 await page.goto(base+'/contact-center/join',{waitUntil:'networkidle2'});await page.waitForSelector('.contact-center-theme');await capture('mobile-guest-join');
 record.passed=record.checks.length===41&&record.checks.every(c=>c.passed)&&record.pageErrors.length===0;
}catch(e){record.passed=false;record.error=e.message;}finally{await browser.close();writeFileSync(output,JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify({passed:record.passed,checks:record.checks.length,failed:record.checks.filter(c=>!c.passed),pageErrors:record.pageErrors,error:record.error}));if(!record.passed)process.exitCode=1;
