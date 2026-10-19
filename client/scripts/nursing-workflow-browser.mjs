/** Desktop/tablet UI regression using synthetic API fixtures; no real accounts or external API access. */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import puppeteer from 'puppeteer';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fixture=mkdtempSync(join(root,'tests/.nursing-browser-'));
let server,browser;
const checks=[];
try {
  writeFileSync(join(fixture,'index.html'),'<html><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
  writeFileSync(join(fixture,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Workspace from '@/pages/nurse/NurseClinicalWorkspace';import EMAR from '@/pages/hmis/EMARPage';import '@/index.css';
const emar=new URLSearchParams(location.search).get('screen')==='emar';history.replaceState({},'',emar?'/nurse/emar':'/nurse/ward');localStorage.setItem('nurseToken','nurse-fixture-token');localStorage.setItem('hospitalToken','wrong-hospital-token');localStorage.setItem('userType','nurse');createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[emar?'/nurse/emar':'/nurse/ward?admissionId=1']}>{emar?<EMAR/>:<Workspace/>}</MemoryRouter>);`);
  server=await createServer({configFile:false,root,css:{postcss:{plugins:[(await import('tailwindcss')).default({config:join(root,'tailwind.config.ts')}),(await import('autoprefixer')).default()]}},plugins:[react()],resolve:{alias:{'@':join(root,'src')}},define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')},server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
  await server.listen();const port=server.httpServer.address().port;
  browser=await puppeteer.launch({headless:true,executablePath:process.env.NURSING_CHROMIUM_PATH||'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();await page.setViewport({width:768,height:1024});
  page.on('dialog',dialog=>dialog.accept());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let offlineWrites=false,notes=0,administered=0,lastDose;
  await page.setRequestInterception(true);
  page.on('request',async req=>{
    const url=new URL(req.url());if(!url.pathname.startsWith('/api/'))return url.hostname==='127.0.0.1'?req.continue():req.abort();
    if(!url.pathname.includes('/login'))assert.equal(req.headers().authorization,'Bearer nurse-fixture-token','Visible nurse portal must never use the stored hospital token');
    const path=url.pathname.replace('/api','');let data=[];
    const reply=(status,payload)=>req.respond({status,contentType:'application/json',body:JSON.stringify(payload)});
    if(offlineWrites&&req.method()!=='GET')return reply(503,{message:'Network unavailable; draft retained'});
    if(path==='/nurse/login')return reply(200,{token:'nurse-fixture-token',nurse:{id:11}});
    if(path==='/v1/nursing/context')data={actorId:11,role:'nurse',organizationId:1};
    else if(path==='/v1/nursing/patients')data=[{id:1,patient_id:100,patient_name:'Synthetic Patient',patient_last_name:'A',ward_id:10,ward_name:'Ward A',bed_number:'A1'}];
    else if(path==='/v1/echart/entry') {
      assert.ok(req.headers()['idempotency-key']);const input=JSON.parse(req.postData());notes++;data={id:notes,version:1,entry_type:input.entryType,recorded_by:11,recorded_at:new Date().toISOString(),status:'draft',observation_text:input.observationText};
    }else if(path==='/v1/emar/due')data=administered?[{scheduleId:2,orderId:1,orderVersion:1,version:1,admissionId:1,patientId:100,patientName:'Synthetic Patient',drugName:'Paracetamol',dose:'500',doseUnit:'mg',route:'oral',scheduledTime:new Date().toISOString(),wardId:10,ward:'Ward A',status:'due'}]:[1,2].map(scheduleId=>({scheduleId,orderId:1,orderVersion:1,version:1,admissionId:1,patientId:100,patientName:'Synthetic Patient',drugName:'Paracetamol',dose:'500',doseUnit:'mg',route:'oral',scheduledTime:new Date().toISOString(),wardId:10,ward:'Ward A',status:'due'}));
    else if(path==='/v1/emar/administer'){lastDose=JSON.parse(req.postData());assert.ok(req.headers()['idempotency-key']);administered++;data={id:lastDose.scheduleId,outcome:'given'};}
    return reply(200,{success:true,data});
  });
  const fixturePath=`/tests/${fixture.split('/').pop()}/index.html`;
  await page.goto(`http://127.0.0.1:${port}${fixturePath}`,{waitUntil:'networkidle0'});
  await page.waitForSelector('#nursing-observationText');
  await page.type('#nursing-observationText','Synthetic nurse note awaiting review.');
  await page.waitForFunction(()=>document.body.innerText.includes('draft saved automatically'),{timeout:15000});
  assert.equal(notes,1);checks.push('nurse-only session, assigned patient and server autosave');
  const clickText=async text=>{const found=await page.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);b?.click();return Boolean(b);},text);assert.ok(found,`Missing button: ${text}`);};
  await clickText('Lock');await page.waitForSelector('#unlock-password');assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('Synthetic Patient'));checks.push('session lock removes patient chart from the visible document');
  await page.type('#unlock-email','nurse1@test.invalid');await page.type('#unlock-password','fixture-only');await clickText('Unlock');await page.waitForSelector('#nursing-observationText');assert.equal(await page.$eval('#nursing-observationText',e=>e.value),'Synthetic nurse note awaiting review.');checks.push('same-nurse unlock preserves the draft');
  await clickText('fluids');await page.waitForSelector('#nursing-ioVolumeMl');await page.type('#nursing-ioType','intake');await page.type('#nursing-ioVolumeMl','250');offlineWrites=true;await clickText('Save record');await page.waitForFunction(()=>document.body.innerText.includes('Network unavailable'));assert.equal(await page.$eval('#nursing-ioVolumeMl',e=>e.value),'250');checks.push('interrupted fluid write retains the unsaved draft and shows an error');offlineWrites=false;
  for(const viewport of [{width:768,height:1024},{width:1024,height:768},{width:1440,height:900}]){await page.setViewport(viewport);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}checks.push('portrait tablet, landscape tablet and desktop have no horizontal overflow');
  await page.goto(`http://127.0.0.1:${port}${fixturePath}?screen=emar`,{waitUntil:'networkidle0'});await page.waitForFunction(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent==='Record outcome').length===2);
  await clickText('Record outcome');await page.waitForSelector('#emar-scannedPatientId');await page.type('#emar-scannedPatientId','100');await page.type('#emar-scannedDrugCode','PARA-500');await clickText('Save outcome');await page.waitForFunction(()=>document.body.innerText.includes('Dose outcome saved.'));
  assert.equal(lastDose.scheduleId,1);assert.equal(lastDose.doseGiven,'500');assert.equal(lastDose.doseUnitGiven,'mg');assert.equal(lastDose.routeUsed,'oral');assert.ok(lastDose.administeredTime);checks.push('eMAR keeps two doses of the same order distinct and sends actual dose details');
  assert.deepEqual(errors,[]);console.log(`NURSING_BROWSER_PASS: ${checks.length} checks`);checks.forEach(c=>console.log(`PASS ${c}`));
}finally{if(browser)await browser.close();if(server)await server.close();rmSync(fixture,{recursive:true,force:true});}
