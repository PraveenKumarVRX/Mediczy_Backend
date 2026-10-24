import {jest,describe,beforeAll,afterAll,it,expect} from '@jest/globals';
import pg from 'pg';
import {userInfo} from 'node:os';
import {readFileSync} from 'node:fs';
import express from 'express';
import request from 'supertest';
let db;
const proxy={query:(...args)=>db.query(...args),connect:()=>db.connect()};
jest.unstable_mockModule('../db/pgPool.js',()=>({default:proxy}));
jest.unstable_mockModule('../models/user.model.intelligent.js',()=>({default:{findOne:jest.fn()}}));
jest.unstable_mockModule('../middleware/crm.middleware.js',()=>({authCRM:(req,res,next)=>{const tenant=Number(req.get('x-qa-tenant')||1);req.crmUser={id:tenant,tenantId:tenant,tenantUid:tenant===1?'HAAAAA':'HBBBBB',crmRole:'admin',isAdmin:true};next();}}));
jest.unstable_mockModule('../config/auth.config.js',()=>({JWT_CONFIG:{SECRET:'synthetic-local-qa-secret'}}));
jest.unstable_mockModule('../middleware/rateLimiter.middleware.js',()=>({authLimiter:(req,res,next)=>next()}));
jest.unstable_mockModule('../middleware/audit.middleware.js',()=>({auditLoginAttempt:jest.fn()}));
jest.unstable_mockModule('../services/crm-lead-automation.service.js',()=>({handleLeadStatusChange:jest.fn(async()=>{})}));
jest.unstable_mockModule('../services/hospital-crm-communication-hub.service.js',()=>({listCrmCommunicationLog:jest.fn(async()=>[]),listCrmCallActivity:jest.fn(async()=>[])}));
jest.unstable_mockModule('bullmq',()=>({Queue:class {add=jest.fn();}}));
jest.unstable_mockModule('../config/redis-connection.js',()=>({createRedisConnection:()=>({})}));
jest.unstable_mockModule('../services/s3-presign.service.js',()=>({getUploadsBucket:()=>null,getS3Client:()=>{throw new Error('External storage is disabled in QA');},buildPublicFileUrl:()=>null}));
jest.unstable_mockModule('../services/crm-campaign-dispatcher.service.js',()=>({snapshotCampaignRecipients:jest.fn(),sendCampaignRecipient:()=>{throw new Error('External sending is disabled in QA');}}));
const {up:core}=await import('../migrations/20261015003700-crm-core-governance.migration.js');
const {up:remediation}=await import('../migrations/20261024000000-crm-report-remediation.migration.js');
const {default:router}=await import('../routes/crm.route.js');
const app=express();app.use(express.json());app.use('/crm',router);
const options={host:process.env.CRM_LOCAL_PG_HOST||'127.0.0.1',port:Number(process.env.CRM_LOCAL_PG_PORT||55490),user:userInfo().username,ssl:false};
const admin=new pg.Pool({...options,database:'postgres'}),database=`crm_workflow_qa_${process.pid}`;
const describeLocal=process.env.CRM_LOCAL_PG_TESTS==='true'?describe:describe.skip;
let leadId,dealId,listId;
describeLocal('CRM report: real HTTP routes and disposable PostgreSQL',()=>{
 beforeAll(async()=>{
  await admin.query(`CREATE DATABASE ${database}`);db=new pg.Pool({...options,database,max:6});
  await core();
  await db.query(readFileSync(new URL('../migrations/20260908000000-hospital-crm-foundation.sql',import.meta.url),'utf8'));
  await db.query(`CREATE TABLE tenants(id int PRIMARY KEY,unique_id text);INSERT INTO tenants VALUES(1,'HAAAAA'),(2,'HBBBBB');
    CREATE TABLE users(id int PRIMARY KEY,"firstName" text,"lastName" text,email text,role text,"isTeam" bool,"isAdmin" bool,tenant_id int,metadata jsonb,department_name text,status text);
    INSERT INTO users VALUES(1,'Synthetic','A','a@example.invalid','admin',true,true,1,'{}',NULL,'active'),(2,'Synthetic','B','b@example.invalid','admin',true,true,2,'{}',NULL,'active');
    ALTER TABLE crm_deals ADD tenant_uid text;ALTER TABLE crm_activities ADD tenant_uid text;ALTER TABLE crm_contacts ADD tenant_uid text;
    ALTER TABLE crm_contacts_v2 ADD full_name VARCHAR(240),ADD phone_e164 VARCHAR(40),ADD email VARCHAR(320);ALTER TABLE crm_leads_v2 ADD tenant_uid text,ADD corporate_uid text,ADD identity_id bigint;
    CREATE FUNCTION qa_tenant_uid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN SELECT unique_id INTO NEW.tenant_uid FROM tenants WHERE id=NEW.tenant_id;RETURN NEW;END $$;
    CREATE TRIGGER qa_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id ON crm_leads_v2 FOR EACH ROW EXECUTE FUNCTION qa_tenant_uid();
    CREATE TABLE crm_segments(id bigserial,name text);CREATE TABLE crm_segment_members(tenant_id int,lead_id int,segment_id int);
    CREATE TABLE crm_automations(id bigserial,name text,action_type text);CREATE TABLE crm_automation_executions(id bigserial,status text,scheduled_at timestamptz,completed_at timestamptz,error text,automation_id int,tenant_id int,lead_id int,created_at timestamptz);`);
  const source=readFileSync(new URL('../migrations/20260908000001-hospital-crm-worldclass-domains.sql',import.meta.url),'utf8');
  await db.query(source.match(/CREATE TABLE IF NOT EXISTS crm_audit_log \([\s\S]*?\n\);/)[0]);
  await db.query(source);
  await db.query(readFileSync(new URL('../migrations/20260908000002-hospital-crm-growth-automation.sql',import.meta.url),'utf8'));
  await remediation(db);
  const {up:marketing}=await import('../migrations/20261015003800-crm-campaigns-governance.migration.js');await marketing();
  const {default:growthRouter}=await import('../routes/hospital-crm-growth.route.js');app.use('/crm/growth',growthRouter);
  const {default:marketingRouter}=await import('../routes/crmCampaigns.route.js');app.use('/crm/campaigns',marketingRouter);
 },30000);
 afterAll(async()=>{await db?.end();await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.end();});
 it('serializes concurrent duplicate lead submissions and stores one lead plus one activity/audit',async()=>{
  const body={name:'Synthetic workflow lead',email:'workflow@example.invalid',phone:'9000000991',source:'manual'};
  const result=await Promise.all([request(app).post('/crm/leads').send(body),request(app).post('/crm/leads').send(body)]);
  expect(result.map(r=>r.status).sort()).toEqual([201,409]);leadId=result.find(r=>r.status===201).body.data.id;
  expect(Number((await db.query('SELECT COUNT(*) n FROM crm_leads')).rows[0].n)).toBe(1);
  expect(Number((await db.query('SELECT COUNT(*) n FROM crm_activities')).rows[0].n)).toBe(1);
  expect(Number((await db.query('SELECT COUNT(*) n FROM crm_audit_log')).rows[0].n)).toBe(1);
 });
 it('rejects a duplicate normalized phone even with a different email',async()=>{
  const r=await request(app).post('/crm/leads').send({name:'Duplicate',email:'different@example.invalid',phone:'900-000-0991'});expect(r.status).toBe(409);
 });
 it.each([{value:-5000},{expected_close:'2020-01-01'},{probability:150},{contact_email:'abc'}])('rejects an invalid deal before any record is stored: %j',async invalid=>{
  const r=await request(app).post('/crm/deals').send({title:'Invalid synthetic deal',...invalid});expect(r.status).toBe(400);expect(r.body.message).toBeTruthy();
  expect(Number((await db.query('SELECT COUNT(*) n FROM crm_deals')).rows[0].n)).toBe(0);
 });
 it('requires a linked deal before changing a lead to converted',async()=>{
  expect((await request(app).put(`/crm/leads/${leadId}`).send({status:'converted'})).status).toBe(409);
  expect((await request(app).get(`/crm/leads/${leadId}`)).body.data.status).toBe('new');
 });
 it('creates a linked deal, persists its contact, converts the lead, and preserves zero probability',async()=>{
  const r=await request(app).post('/crm/deals').send({title:'Synthetic linked deal',lead_id:leadId,value:5000,probability:0,stage:'discovery',contact_name:'Synthetic workflow lead',contact_email:'workflow@example.invalid'});
  expect(r.status).toBe(201);dealId=r.body.data.id;expect(r.body.data.probability).toBe(0);expect(r.body.data.contact_id).toBeTruthy();
  const lead=(await request(app).get(`/crm/leads/${leadId}`)).body.data;expect(lead.status).toBe('converted');expect(String(lead.deal_id)).toBe(String(dealId));
  const contacts=(await request(app).get('/crm/contacts')).body.data;expect(contacts.find(c=>c.email==='workflow@example.invalid').phone).toBe('9000000991');
  expect(r.body.data.contact_phone).toBe('9000000991');
 });
 it('logs an activity linked to the same lead, deal and contact',async()=>{
  const contact=(await db.query('SELECT id FROM crm_contacts LIMIT 1')).rows[0].id;
  const r=await request(app).post('/crm/activities').send({type:'call',title:'Synthetic linked activity',lead_id:leadId,deal_id:dealId,contact_id:contact,scheduled_at:new Date(Date.now()+86400000).toISOString()});
  expect(r.status).toBe(201);expect(String(r.body.data.lead_id)).toBe(String(leadId));expect(String(r.body.data.deal_id)).toBe(String(dealId));expect(String(r.body.data.contact_id)).toBe(String(contact));
 });
 it('moves a deal and reports identical saved weighted totals in pipeline and dashboard',async()=>{
  expect((await request(app).put(`/crm/deals/${dealId}`).send({stage:'proposal',probability:50})).status).toBe(200);
  const pipeline=(await request(app).get('/crm/deals/pipeline')).body.data;expect(Number(pipeline.find(p=>p.stage==='proposal').weighted_value)).toBe(2500);
  const dashboard=(await request(app).get('/crm/dashboard/stats')).body;expect(dashboard.success).toBe(true);expect(Number(dashboard.data.deals.weighted_pipeline)).toBe(2500);
 });
 it('returns scoped lead detail/context and includes Discovery separately in funnel reports',async()=>{
  expect((await request(app).get(`/crm/leads/${leadId}/context`)).status).toBe(200);
  const funnel=(await request(app).get('/crm/reports/sales-funnel')).body.data;expect(funnel.some(f=>f.stage==='Deal · discovery')).toBe(true);expect(funnel.some(f=>f.stage==='Lead · converted')).toBe(true);
 });
 it('denies foreign entity reads and cross-tenant references without writing',async()=>{
  const actor=request(app);expect((await actor.get(`/crm/leads/${leadId}`).set('x-qa-tenant','2')).status).toBe(404);
  expect((await actor.get(`/crm/deals/${dealId}`).set('x-qa-tenant','2')).status).toBe(404);
  expect((await actor.post('/crm/deals').set('x-qa-tenant','2').send({title:'Foreign',lead_id:leadId})).status).toBe(404);
  expect((await actor.post('/crm/activities').set('x-qa-tenant','2').send({title:'Foreign',type:'call',deal_id:dealId})).status).toBe(404);
 });
 it('rejects malformed suppression emails, including trailing commas, without storing them',async()=>{
  const r=await request(app).post('/crm/campaigns/suppressions').send({email:'qa@example.invalid,',reason:'manual'});expect(r.status).toBe(400);
  expect(Number((await db.query('SELECT COUNT(*) n FROM crm_marketing_suppressions')).rows[0].n)).toBe(0);
 });
 it('creates a creator-scoped marketing list and denies foreign access or encoded ID bypass',async()=>{
  const r=await request(app).post('/crm/campaigns/lists').send({name:'Synthetic import list'});expect(r.status).toBe(201);listId=r.body.data.id;
  expect((await request(app).get(`/crm/campaigns/lists/${listId}`).set('x-qa-tenant','2')).status).toBe(404);
  expect((await request(app).get(`/crm/campaigns/lists/${listId}%20`)).status).toBe(404);
 });
 it('imports CSV members as visible CRM contacts and repairs repeat-import links without duplicates',async()=>{
  const csv=Buffer.from('email,first_name,last_name,company\nimport@example.invalid,Synthetic,Imported,"QA, Inc"\n"invalid@example.invalid,",Invalid,Address,QA\n');
  const first=await request(app).post(`/crm/campaigns/lists/${listId}/import`).attach('file',csv,'synthetic.csv');expect(first.status).toBe(201);expect(first.body.data.invalidRows).toBe(1);
  expect((await db.query('SELECT company FROM crm_contacts WHERE email=$1',['import@example.invalid'])).rows[0].company).toBe('QA, Inc');
  const member=(await db.query('SELECT * FROM crm_marketing_list_members WHERE list_id=$1',[listId])).rows;expect(member).toHaveLength(1);expect(member[0].contact_id).toBeTruthy();
  await db.query('UPDATE crm_marketing_list_members SET contact_id=NULL WHERE id=$1',[member[0].id]);
  const again=await request(app).post(`/crm/campaigns/lists/${listId}/import`).attach('file',csv,'synthetic.csv');expect(again.status).toBe(201);
  expect(Number((await db.query('SELECT COUNT(*) n FROM crm_contacts WHERE email=$1',['import@example.invalid'])).rows[0].n)).toBe(1);
  expect((await db.query('SELECT contact_id FROM crm_marketing_list_members WHERE id=$1',[member[0].id])).rows[0].contact_id).toBeTruthy();
 });
 it('continues accepting valid XLSX imports through the same endpoint',async()=>{
  const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Contacts');sheet.addRow(['email','first_name','company']);sheet.addRow(['xlsx@example.invalid','Synthetic workbook','QA']);
  const r=await request(app).post(`/crm/campaigns/lists/${listId}/import`).attach('file',Buffer.from(await workbook.xlsx.writeBuffer()),'synthetic.xlsx');expect(r.status).toBe(201);expect(r.body.data.validRows).toBe(1);
  expect(Number((await db.query('SELECT COUNT(*) n FROM crm_contacts WHERE email=$1',['xlsx@example.invalid'])).rows[0].n)).toBe(1);
 });
 it('rejects malformed spreadsheet uploads with a visible 400 response',async()=>{
  const r=await request(app).post(`/crm/campaigns/lists/${listId}/import`).attach('file',Buffer.from('not an XLSX archive'),'invalid.xlsx');expect(r.status).toBe(400);expect(r.body.message).toMatch(/valid CSV or XLSX/);
 });
 it('does not copy the lead phone onto an explicitly selected different contact',async()=>{
  const {rows:[contact]}=await db.query("INSERT INTO crm_contacts(name,email,tenant_uid,created_by) VALUES('Different person',NULL,'HAAAAA',1) RETURNING id");
  const response=await request(app).post('/crm/deals').send({title:'Different contact deal',lead_id:leadId,contact_id:contact.id,value:0});
  expect(response.status).toBe(201);expect(response.body.data.contact_name).toBe('Different person');expect(response.body.data.contact_phone).toBeNull();expect(response.body.data.contact_email).toBeNull();
  expect((await db.query('SELECT phone FROM crm_contacts WHERE id=$1',[contact.id])).rows[0].phone).toBeNull();
 });
 it('growth metrics and recovery exclude unlinked and foreign leads and show canonical names',async()=>{
  const {getGrowthDashboard,listRecoveryQueue,scanRecoveryQueue}=await import('../services/hospital-crm-growth.service.js');
  const {rows:[hidden]}=await db.query(`INSERT INTO crm_leads_v2(tenant_id,status,lifecycle_stage,score,created_at) VALUES(1,'open','new',50,NOW()-INTERVAL '1 day') RETURNING id`);
  const {rows:[foreign]}=await db.query(`INSERT INTO crm_leads_v2(tenant_id,status,lifecycle_stage,score,created_at) VALUES(2,'open','new',50,NOW()-INTERVAL '1 day') RETURNING id`);
  await db.query(`INSERT INTO crm_growth_recovery_cases(tenant_id,lead_id,case_type,status) VALUES(1,$1,'speed_to_lead','open'),(2,$2,'speed_to_lead','open')`,[hidden.id,foreign.id]);
  const before=await db.query('SELECT COUNT(*) AS n FROM crm_growth_recovery_cases');
  expect((await request(app).get(`/crm/growth/scoring/leads/${hidden.id}/history`)).status).toBe(404);
  expect((await request(app).get(`/crm/growth/scoring/leads/${foreign.id}/history`)).status).toBe(404);
  expect((await request(app).get('/crm/growth/dashboard')).status).toBe(200);
  const empty=await listRecoveryQueue(1,{},'HAAAAA');expect(empty).toHaveLength(0);
  expect((await db.query('SELECT COUNT(*) AS n FROM crm_growth_recovery_cases')).rows[0].n).toBe(before.rows[0].n);
  const dashboard=await getGrowthDashboard(1,{},'HAAAAA');
  const visible=(await request(app).get('/crm/leads')).body.pagination.total;
  expect(dashboard.summary.leads).toBe(Number(visible));
  const {rows:[twin]}=await db.query('SELECT id FROM crm_leads_v2 WHERE legacy_lead_id=$1',[leadId]);
  await db.query("UPDATE crm_leads_v2 SET status='open',created_at=NOW()-INTERVAL '1 day' WHERE id=$1",[twin.id]);
  const scanned=await scanRecoveryQueue(1,1,'HAAAAA');expect(scanned.every(row=>String(row.lead_id)===String(twin.id))).toBe(true);expect(scanned).toHaveLength(1);
  const queue=await listRecoveryQueue(1,{},'HAAAAA');expect(queue).toHaveLength(1);expect(Number(queue[0].legacy_lead_id)).toBe(Number(leadId));expect(queue[0].display_name).toBe('Synthetic workflow lead');
  expect(await scanRecoveryQueue(1,1,'HAAAAA')).toHaveLength(0);
  await expect(getGrowthDashboard(1,{},null)).rejects.toMatchObject({statusCode:400});
 });
 it('repairs only blank linked contact phones and is idempotent',async()=>{
  const {up:repair}=await import('../migrations/20261025000000-crm-retest-contact-phones.migration.js');
  await db.query("UPDATE crm_contacts SET phone=NULL WHERE lead_id=$1",[leadId]);
  await db.query("UPDATE crm_deals SET contact_phone=NULL WHERE id=$1",[dealId]);
  const first=await repair(db);expect(first).toEqual({dealsUpdated:1,contactsUpdated:1});
  expect(await repair(db)).toEqual({dealsUpdated:0,contactsUpdated:0});
  await db.query("UPDATE crm_contacts SET phone='9000000555' WHERE lead_id=$1",[leadId]);
  expect(await repair(db)).toEqual({dealsUpdated:0,contactsUpdated:0});
  expect((await db.query('SELECT phone FROM crm_contacts WHERE lead_id=$1',[leadId])).rows[0].phone).toBe('9000000555');
 });
 it('deletes the lead and removes its mirror from the correct tenant',async()=>{
  expect((await request(app).delete(`/crm/leads/${leadId}`)).status).toBe(200);
  for(let i=0;i<20;i++){const count=Number((await db.query('SELECT COUNT(*) n FROM crm_leads_v2 WHERE legacy_lead_id=$1',[leadId])).rows[0].n);if(count===0)return;await new Promise(r=>setTimeout(r,25));}
  throw new Error('Deleted lead mirror persisted');
 });
});
