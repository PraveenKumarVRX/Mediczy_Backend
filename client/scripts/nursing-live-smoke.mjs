import puppeteer from 'puppeteer';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const base=process.env.NURSING_LIVE_BASE_URL;
if(!base||new URL(base).protocol!=='https:'||!process.env.NURSING_LIVE_EVIDENCE_DIR)throw new Error('Explicit HTTPS NURSING_LIVE_BASE_URL and private NURSING_LIVE_EVIDENCE_DIR are required');
const dir=resolve(process.env.NURSING_LIVE_EVIDENCE_DIR);mkdirSync(dir,{recursive:true,mode:0o700});
const browser=await puppeteer.launch({headless:true,executablePath:process.env.NURSING_CHROMIUM_PATH||'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const record={baseUrl:base,patientDataAccessed:false,clinicalWritesPerformed:false,checks:[]};
try{
 const page=await browser.newPage();await page.setViewport({width:1024,height:768});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin||['data:','blob:'].includes(u.protocol))r.continue();else r.abort();});
 for(const route of ['/nurse/login','/nurse/ward','/hospital/nursing/administration']){
  const navigation=[];const observe=r=>{if(r.request().isNavigationRequest())navigation.push(r.status());};page.on('response',observe);await page.goto(record.baseUrl+route,{waitUntil:'networkidle2',timeout:30000});page.off('response',observe);const status=navigation.at(-1)||null;
  const state=await page.evaluate(()=>({password:document.querySelectorAll('input[type="password"]').length,text:document.body.innerText.trim().length,scroll:document.documentElement.scrollWidth<=innerWidth+1}));
  const passed=state.password>0&&state.text>50&&state.scroll;
  record.checks.push({route,documentNavigationStatus:status,loginRequired:true,passwordInputPresent:state.password>0,noHorizontalOverflow:state.scroll,passed});
 }
 record.pageErrors=errors;record.status=record.checks.every(c=>c.passed)&&errors.length===0?'passed':'failed';
}finally{await browser.close();writeFileSync(join(dir,'live-browser-smoke.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record,null,2));if(record.status!=='passed')process.exitCode=1;
