/** Production browser acceptance; all non-GET API requests are blocked. */
import puppeteer from 'puppeteer';
import jwt from 'jsonwebtoken';
import {writeFileSync} from 'node:fs';
import {postgresSequelize as db} from '../../db/postgres-sequelize.js';
const output=process.env.HEALTH_BROWSER_OUTPUT;
if(!output)throw new Error('HEALTH_BROWSER_OUTPUT private path required');
const base='https://app.mediqzy.com';
const record={at:new Date().toISOString(),productionMutations:0,blockedMutations:0,checks:[],pageErrors:[]};
const [admin]=await db.query(`SELECT id FROM users WHERE "isAdmin"=true AND status='active' ORDER BY id LIMIT 1`,{type:db.QueryTypes.SELECT});
await db.close();
if(!admin)throw new Error('Existing admin required');
const sign=(id,role)=>jwt.sign({id,userId:id,role,userType:role,tokenType:'access',...(role==='admin'?{isAdmin:true}:{corporateId:id,organization_id:id})},process.env.JWT_SECRET,{expiresIn:600});
const browser=await puppeteer.launch({headless:true,executablePath:'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
async function pageFor(role,id){
  const context=await browser.createBrowserContext(),page=await context.newPage();
  await page.setCacheEnabled(false);await page.setBypassServiceWorker(true);await page.setViewport({width:1440,height:1000});
  page.on('pageerror',error=>record.pageErrors.push(error.message));
  await page.evaluateOnNewDocument(({role,token,id})=>{
    localStorage.clear();sessionStorage.clear();localStorage.setItem('userType',role);
    localStorage.setItem(role+'Token',token);
    localStorage.setItem(role==='admin'?'adminData':'corporateData',JSON.stringify({id,role,companyName:'Dairy Day IceCreams Pvt Ltd',isAdmin:role==='admin'}));
  },{role,id,token:sign(id,role)});
  await page.setRequestInterception(true);page.on('request',async request=>{
    try{
      const url=new URL(request.url());
      if(url.origin!==base&&!['data:','blob:'].includes(url.protocol))return await request.abort();
      if(url.pathname.startsWith('/api/')&&request.method()!=='GET'){
        record.blockedMutations++;return await request.respond({status:409,contentType:'application/json',body:JSON.stringify({message:'Read-only acceptance blocks writes'})});
      }
      if(role==='corporate'&&url.pathname==='/api/corporate/ahc/batches')return await request.respond({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{batches:[{id:999999,batchName:'Synthetic activation acceptance',batchYear:2026,dueDate:'2026-12-01',scheduledDate:null,status:'planning',priority:'normal',enrolled:1,completed:0,pending:1,reportReady:0}]}})});
      await request.continue();
    }catch{try{await request.abort();}catch{}}
  });return page;
}
try{
  const adminPage=await pageFor('admin',admin.id);
  await adminPage.goto(base+'/admin/corporate-health-packages',{waitUntil:'networkidle2',timeout:60000});
  await adminPage.waitForFunction(()=>document.body.innerText.includes('Dairy Day Pre employment health checkup'),{timeout:30000});
  const list=await adminPage.evaluate(()=>({real:document.body.innerText.includes('DairyDay_AHC_Sales_2026-27'),demo:/TechCorp Solutions|Global Manufacturing Ltd|Executive Health Checkup/.test(document.body.innerText)}));
  record.checks.push({name:'Admin renders existing Dairy Day packages without sample fallback',passed:list.real&&!list.demo});
  for(const tab of await adminPage.$$('[role=tab]'))if((await tab.evaluate(e=>e.textContent)).includes('Create Package')){await tab.click();break;}
  await adminPage.waitForSelector('[role=combobox]');
  const trigger=(await adminPage.$$('[role=combobox]'))[0];await trigger.click();
  await adminPage.waitForSelector('[role=option]');
  let selected=false;for(const option of await adminPage.$$('[role=option]'))if((await option.evaluate(e=>e.textContent)).trim()==='Dairy Day IceCreams Pvt Ltd'){await option.click();selected=true;break;}
  if(!selected)throw new Error('Dairy Day is missing from the real corporate dropdown');
  const contrast=await trigger.evaluate(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
  record.checks.push({name:'Corporate selection is visible with contrasting text',passed:contrast.text.includes('Dairy Day IceCreams Pvt Ltd')&&contrast.color!==contrast.background});
  const hrPage=await pageFor('corporate',45);
  await hrPage.goto(base+'/corporate/annual-health-checkup',{waitUntil:'networkidle2',timeout:60000});
  await hrPage.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Activate'),{timeout:30000});
  await hrPage.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Activate').click());
  await hrPage.waitForSelector('#activation-package',{timeout:15000});
  record.checks.push({name:'Activation requires an explicit package before invitations',passed:await hrPage.evaluate(()=>[...document.querySelectorAll('[role=dialog] button')].some(e=>e.textContent.includes('Activate and invite employees')&&e.disabled))});
  await hrPage.click('#activation-package');await hrPage.waitForSelector('[role=option]');
  const choices=await hrPage.$$eval('[role=option]',els=>els.map(e=>e.textContent));
  record.checks.push({name:'Activation lists the two real Dairy Day packages',passed:choices.length===2&&choices.some(n=>n.includes('DairyDay_AHC'))});
  record.passed=record.checks.every(c=>c.passed)&&!record.pageErrors.length;
}catch(error){record.passed=false;record.error=error.message;}finally{
  await browser.close();writeFileSync(output,JSON.stringify(record,null,2)+'\n',{mode:0o600});
}
console.log(JSON.stringify(record));if(!record.passed)process.exitCode=1;
