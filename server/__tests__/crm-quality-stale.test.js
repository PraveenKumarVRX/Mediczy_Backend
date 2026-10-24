import { jest, beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import pg from 'pg';
import { userInfo } from 'node:os';
jest.unstable_mockModule('../db/pgPool.js',()=>({default:{query:()=>{throw new Error('Application pool must not be used by this local test');}}}));
jest.unstable_mockModule('../services/ai-brain/sentiment-classifier.service.js',()=>({classifySentiment:jest.fn()}));
const {runDataQualityScan,getDataQualityIssues}=await import('../services/hospital-crm-worldclass.service.js');
const options={host:'127.0.0.1',port:55490,user:userInfo().username,ssl:false};
const admin=new pg.Pool({...options,database:'postgres'}),database=`crm_quality_qa_${process.pid}`;
let db;
const describeLocal=process.env.CRM_LOCAL_PG_TESTS==='true'?describe:describe.skip;
describeLocal('deleted CRM lead governance regression',()=>{
beforeAll(async()=>{
 await admin.query(`CREATE DATABASE ${database}`);db=new pg.Pool({...options,database,max:1});
 await db.query(`CREATE TABLE crm_leads (id int,name text);
 CREATE TABLE crm_leads_v2 (id int,tenant_id int,legacy_lead_id int,status text,owner_user_id int,identity_id int,person_id int,source_taxonomy_id int);
 CREATE TABLE crm_data_quality_issues (id serial,tenant_id int,entity_type text,entity_id int,issue_type text,severity text,field_name text,status text DEFAULT 'open',detected_at timestamptz DEFAULT now());
 INSERT INTO crm_leads VALUES (101,'Synthetic visible lead');
 INSERT INTO crm_leads_v2 VALUES (1,1,999,'open',NULL,1,1,1),(2,1,101,'open',NULL,2,2,1),(3,2,888,'open',NULL,3,3,1);
 INSERT INTO crm_data_quality_issues (tenant_id,entity_type,entity_id,issue_type) VALUES (1,'lead',1,'missing_owner'),(1,'lead',2,'missing_owner'),(2,'lead',3,'missing_owner');`);
});
afterAll(async()=>{await db?.end();await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.end();});

 it('shows only existing lead records in the requested organization',async()=>{
  const issues=await getDataQualityIssues(1,{},db);expect(issues.map(i=>i.legacy_lead_id)).toEqual([101]);
 });
 it('resolves deleted mirrors without recreating them or closing valid/foreign issues',async()=>{
  expect(await runDataQualityScan(1,1,db)).toEqual([]);
  const {rows}=await db.query('SELECT entity_id,status FROM crm_data_quality_issues ORDER BY entity_id');
  expect(rows).toEqual([{entity_id:1,status:'resolved'},{entity_id:2,status:'open'},{entity_id:3,status:'open'}]);
 });
});
