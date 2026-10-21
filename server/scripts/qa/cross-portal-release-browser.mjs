/** Real production browser reads. Every non-GET API request is blocked. */
import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';
import {writeFileSync} from 'node:fs';
import {postgresSequelize as db} from '../../db/postgres-sequelize.js';
const output=process.env.CROSS_PORTAL_BROWSER_OUTPUT;if(!output)throw new Error('CROSS_PORTAL_BROWSER_OUTPUT private path required');
const base='https://app.mediqzy.com';
const result={at:new Date().toISOString(),productionMutations:0,liveCalls:0,blockedMutations:0,checks:[],pageErrors:[]};
const [crm]=await db.query(`SELECT id,metadata FROM users WHERE status='active' AND metadata->>'crmRole' IN ('admin','business_head') AND (organization_uid IS NOT NULL OR tenant_id IS NOT NULL) ORDER BY (metadata->>'crmRole'='admin') DESC,id LIMIT 1`,{type:db.QueryTypes.SELECT});
await db.close();
const sign=(role,id)=>jwt.sign({id,userId:id,tokenType:'access',role,userType:role,...(role==='corporate'?{corporateId:id,organization_id:id}:{isCRM:true})},process.env.JWT_SECRET,{expiresIn:600});
const browser=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
async function pageFor(role,id){
 const context=await browser.createBrowserContext(),page=await context.newPage();
 await page.setCacheEnabled(false);await page.setBypassServiceWorker(true);await page.setViewport({width:1440,height:1000});
 page.on('pageerror',error=>result.pageErrors.push(error.message));
 await page.evaluateOnNewDocument(({role,id,token,crmRole})=>{
  localStorage.clear();sessionStorage.clear();localStorage.setItem('userType',role);localStorage.setItem(role+'Token',token);
  localStorage.setItem(role==='crm'?'crmUserData':'corporateData',JSON.stringify({id,role,crmRole,companyName:'Test Corporate Ltd',name:'Test Corporate Ltd'}));
 },{role,id,token:sign(role,id),crmRole:crm?.metadata?.crmRole||'sales_rep'});
 await page.setRequestInterception(true);page.on('request',async request=>{
  try{const url=new URL(request.url());
   if(url.origin!==base&&!['data:','blob:'].includes(url.protocol))return await request.abort();
   if(url.pathname.startsWith('/api/')&&request.method()!=='GET'){result.blockedMutations++;return await request.respond({status:409,contentType:'application/json',body:'{"message":"Read-only acceptance blocks writes"}'});}
   await request.continue();
  }catch{try{await request.abort();}catch{}}
 });return page;
}
try{
 const page=await pageFor('corporate',3);
 await page.goto(base+'/corporate/notifications',{waitUntil:'networkidle2',timeout:60000});
 await page.waitForFunction(()=>document.body.innerText.includes('Corporate Notifications'),{timeout:30000});
 result.checks.push({name:'HR notifications have one search input',passed:await page.$$eval('input[placeholder="Search notifications..."]',e=>e.length===1)});
 await page.goto(base+'/corporate/health-analysis',{waitUntil:'networkidle2',timeout:60000});
 await page.waitForFunction(()=>document.body.innerText.includes('Health Analysis Dashboard'),{timeout:30000});
 result.checks.push({name:'HR health analysis has no fixed improvement badges',passed:await page.evaluate(()=>!/(?:\+3%|\+5%|\+12%)/.test(document.body.innerText))});
 await page.goto(base+'/corporate/employees',{waitUntil:'networkidle2',timeout:60000});
 result.checks.push({name:'HR employee status filter is visible',passed:await page.evaluate(()=>[...document.querySelectorAll('[role=combobox]')].some(e=>/active/i.test(e.textContent)))});
 if(!crm)throw new Error('Existing CRM identity required');
 const voice=await pageFor('crm',crm.id);
 await voice.goto(base+'/crm/contact-center',{waitUntil:'networkidle2',timeout:60000});
 await voice.waitForFunction(()=>document.body.innerText.includes('Contact Center')||document.body.innerText.includes('Contact center'),{timeout:30000});
 const buttons=await voice.$$('button');let found=false;
 for(const button of buttons){if((await button.evaluate(e=>e.textContent)).trim()==='Settings'){await button.click();found=true;break;}}
 if(!found)throw new Error('Contact-center Settings tab not available for existing CRM user');
 await voice.waitForSelector('select[aria-label="Calling provider"]',{timeout:15000});
 const labels=await voice.$$eval('select[aria-label="Calling provider"] option',options=>options.map(e=>e.textContent));
 result.checks.push({name:'Contact-center provider selector lists all six providers',passed:['Exotel','TeleCMI','Zoom Phone','Airtel IQ','Twilio','Plivo'].every(label=>labels.includes(label))});
 await voice.select('select[aria-label="Calling provider"]','airtel_iq');
 result.checks.push({name:'Airtel setup explains required server connection',passed:await voice.evaluate(()=>document.body.innerText.includes('Calling stays unavailable until the server connection is configured'))});
 await voice.select('select[aria-label="Calling provider"]','zoom_phone');
 result.checks.push({name:'Zoom uses the explicit external phone path',passed:await voice.evaluate(()=>document.body.innerText.includes('Enable Zoom Phone launch')&&document.body.innerText.includes('licensed Zoom Phone'))});
 result.passed=result.checks.every(c=>c.passed)&&!result.pageErrors.length;
}catch(error){result.passed=false;result.error=error.message;}finally{await browser.close();writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
