#!/usr/bin/env node
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,chmodSync} from 'node:fs';import {resolve,join} from 'node:path';
const base=process.env.NURSING_LIVE_BASE_URL,dir=resolve(process.env.NURSING_DEMO_EVIDENCE_DIR||'');
if(!base||new URL(base).protocol!=='https:'||!process.env.NURSING_DEMO_EVIDENCE_DIR)throw new Error('Explicit HTTPS demo URL and private evidence directory required');
const demo=JSON.parse(readFileSync(join(dir,'demo-provisioning.json'))),[account]=JSON.parse(readFileSync(join(dir,'demo-access.private.json')));assert.equal(demo.simulationOnly,true);
const browser=await puppeteer.launch({headless:true,executablePath:process.env.NURSING_CHROMIUM_PATH||'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const record={at:new Date().toISOString(),baseUrl:base,simulationOnly:true,clinicalAcceptance:false,status:'failed',checks:[]};
try{
 const page=await browser.newPage();await page.setViewport({width:1024,height:768});
 await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin||['data:','blob:'].includes(u.protocol))r.continue();else r.abort();});
 await page.goto(base+'/nurse/login',{waitUntil:'networkidle2',timeout:30000});await page.waitForSelector('input[type="email"]');
 await page.type('input[type="email"]',account.email);await page.type('input[type="password"]',account.password);await page.click('button[type="submit"]');
 await page.waitForSelector('#nursing-patient',{timeout:30000});const options=await page.$eval('#nursing-patient',e=>Array.from(e.options).map(o=>o.value).filter(Boolean));assert.deepEqual(options,[String(demo.admissionId)]);
 record.checks.push('Real nurse login renders only the dedicated synthetic admission');
 await page.select('#nursing-patient',String(demo.admissionId));await page.waitForSelector('#nursing-observationText');
 const saved=page.waitForResponse(r=>r.url().includes('/v1/echart/entry')&&r.request().method()==='POST'&&r.status()===201,{timeout:30000});
 const text=`SIMULATION ONLY - live browser autosave verification ${new Date().toISOString()}; no actual patient observation.`;
 await page.type('#nursing-observationText',text,{delay:2});const response=await saved;const body=await response.json();record.draftEntryId=body.data.id;
 await page.waitForFunction(()=>document.body.innerText.includes('Draft saved on the server'),{timeout:30000});record.checks.push('Actual tablet form autosaves a labeled synthetic draft to the live API');
 for(const [width,height] of [[768,1024],[1024,768]]){await page.setViewport({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
 record.checks.push('Authenticated ward fits portrait and landscape tablet viewports');
 const image=join(dir,'demo-ward-tablet.png');await page.screenshot({path:image,fullPage:true});chmodSync(image,0o600);
 await page.reload({waitUntil:'networkidle2'});await page.waitForFunction(text=>document.body.innerText.includes(text),{timeout:30000},text);record.checks.push('Saved synthetic note remains visible after a real page reload');
 record.status='passed';
}catch(error){record.error=error.message;process.exitCode=1;}
finally{await browser.close();writeFileSync(join(dir,'demo-live-browser-walkthrough.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record,null,2));
