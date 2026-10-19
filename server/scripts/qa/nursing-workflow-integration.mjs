/** Disposable local PostgreSQL only. Creates and removes its own cluster; never reads deployment DB settings. */
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import { Sequelize,QueryTypes } from 'sequelize';
import bcrypt from 'bcrypt';

const root=mkdtempSync(join(tmpdir(),'mediqzy-nursing-test-'));
const binaries=process.env.NURSING_POSTGRES_BIN||'/usr/lib/postgresql/16/bin';
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
let started=false,owner,application;let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`);};
try {
  execFileSync(join(binaries,'initdb'),['-D',join(root,'data'),'-A','trust','-U','nursing_test_owner','--no-locale','-E','UTF8'],{stdio:'ignore'});
  execFileSync(join(binaries,'pg_ctl'),['-D',join(root,'data'),'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start'],{stdio:'ignore'});started=true;
  owner=new Sequelize('postgres','nursing_test_owner','local-test-only',{host:'127.0.0.1',port,dialect:'postgres',logging:false});
  await owner.query('CREATE DATABASE nursing_gap_test');await owner.close();
  owner=new Sequelize('nursing_gap_test','nursing_test_owner','local-test-only',{host:'127.0.0.1',port,dialect:'postgres',logging:false});
  await owner.query(`CREATE ROLE nursing_test_app LOGIN PASSWORD 'local-test-only';
    CREATE TABLE users(id INTEGER PRIMARY KEY,organization_id INTEGER,"firstName" TEXT,"lastName" TEXT);
    CREATE TABLE nurses(id INTEGER PRIMARY KEY,tenant_id INTEGER,email TEXT,password TEXT,"isActive" BOOLEAN DEFAULT true,status TEXT DEFAULT 'active');
    CREATE TABLE wards(id INTEGER PRIMARY KEY,organization_id INTEGER,name TEXT);
    CREATE TABLE beds(id INTEGER PRIMARY KEY,ward_id INTEGER,bed_number TEXT);
    CREATE TABLE wound_tracking_records(id SERIAL PRIMARY KEY,tenant_id INTEGER NOT NULL,patient_id INTEGER NOT NULL,wound_type VARCHAR(80),stage VARCHAR(80),area_cm2 NUMERIC(10,2),healing_percent NUMERIC(5,2),note TEXT,image_ref VARCHAR(240),created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE consents(id SERIAL PRIMARY KEY,organization_id INTEGER,patient_id INTEGER,consent_type TEXT,status TEXT,signed_at TIMESTAMPTZ DEFAULT NOW(),expires_at TIMESTAMPTZ,procedure_name TEXT);
    CREATE TABLE clinical_knowledge_rules(domain_key TEXT,rule_type TEXT,status TEXT,payload JSONB);
    CREATE TABLE patient_allergies(id SERIAL PRIMARY KEY,user_id INTEGER,organization_id INTEGER,allergen_name TEXT,allergen_type TEXT,allergen_code TEXT,drug_class TEXT,reaction_type TEXT,severity TEXT,verified BOOLEAN,status TEXT,source TEXT,created_at TIMESTAMPTZ DEFAULT NOW());`);
  for(const name of ['20260525000003-create-ip-admissions.js','20260525000006-create-emar-tables.js','20260525000007-create-vitals-and-alerts.js','20260617000003-create-pharmacy-dispense-queue.js','20261015001300-emar-safety-governance.migration.js'])await(await import(`../../migrations/${name}`)).up(owner.getQueryInterface(),Sequelize);
  const legacy=readFileSync(new URL('../../migrations/20260526000001-create-hmis-phase3-5-tables.js',import.meta.url),'utf8');
  const nursingSQL=legacy.match(/await q\(`(\s*CREATE TABLE IF NOT EXISTS nursing_assessments[\s\S]*?)`\);/)[1];await owner.query(nursingSQL);
  const chart=readFileSync(new URL('../../migrations/20261015003400-nursing-echart-governance.migration.js',import.meta.url),'utf8').match(/await pool.query\(`([\s\S]*?)`\);/)[1];await owner.query(chart);
  await owner.query(`ALTER TABLE ip_admissions ADD COLUMN spo2_target_scale SMALLINT DEFAULT 1; ALTER TABLE ip_admissions ALTER COLUMN admission_datetime SET DEFAULT NOW();
    ALTER TABLE vital_records ADD COLUMN oxygen_supplemental BOOLEAN DEFAULT false,ADD COLUMN consciousness TEXT,ADD COLUMN spo2_scale SMALLINT DEFAULT 1,ADD COLUMN news2_complete BOOLEAN,ADD COLUMN news2_provisional BOOLEAN DEFAULT false,ADD COLUMN news2_band TEXT;
    INSERT INTO users VALUES(100,1,'Asha','Rao'),(200,2,'Other','Hospital');
    INSERT INTO wards VALUES(10,1,'Ward A'),(20,2,'Ward B');INSERT INTO beds VALUES(10,10,'A1'),(20,20,'B1');
    INSERT INTO ip_admissions(id,organization_id,patient_id,ward_id,bed_id) VALUES(1,1,100,10,10),(2,2,200,20,20);
    INSERT INTO nursing_flowsheet_entries(admission_id,organization_id,entry_type,recorded_by,observation_text) VALUES(1,1,'observation',11,'Historical entry');
    INSERT INTO patient_allergies(user_id,organization_id,status) VALUES(100,1,'no_known_allergy');
    INSERT INTO consents(organization_id,patient_id,consent_type,status) VALUES(1,100,'treatment','signed');`);
  const migration=await import('../../migrations/20261019000100-nursing-workflow-integrity.migration.js');
  await check('duplicate historical dose slots fail the migration atomically',async()=>{
    await owner.query(`INSERT INTO medication_orders(id,organization_id,admission_id,patient_id,drug_name) VALUES(700,1,1,100,'Historical duplicate');
      INSERT INTO medication_administrations(order_id,admission_id,scheduled_time) SELECT 700,1,NOW() FROM generate_series(1,2);`);
    await assert.rejects(migration.up(owner.getQueryInterface(),Sequelize));
    const [r]=await owner.query("SELECT to_regclass('public.nursing_assignments') AS table_name",{type:QueryTypes.SELECT});assert.equal(r.table_name,null);
    await owner.query('DELETE FROM medication_administrations WHERE order_id=700;DELETE FROM medication_orders WHERE id=700');
  });
  await check('additive migration and second run preserve historical chart',async()=>{await migration.up(owner.getQueryInterface(),Sequelize);await migration.up(owner.getQueryInterface(),Sequelize);const [r]=await owner.query('SELECT observation_text FROM nursing_flowsheet_entries WHERE id=1',{type:QueryTypes.SELECT});assert.equal(r.observation_text,'Historical entry');});
  const hrSQL=readFileSync(new URL('../../migrations/20261015002200-hrms-qualifications-privileges.migration.js',import.meta.url),'utf8').match(/await pool.query\(`([\s\S]*?)`\);/)[1];await owner.query(hrSQL);
  await owner.query(`INSERT INTO users VALUES(90,1,'Synthetic','Prescriber');
    INSERT INTO nursing_staff_links(organization_id,actor_role,actor_id,user_id,linked_by) VALUES(1,'doctor',90,90,99);
    INSERT INTO hr_staff_qualifications(id,tenant_id,staff_user_id,qualification_code,qualification_name,status,verification_status) VALUES(1,1,90,'MD','Medical registration','active','verified');
    INSERT INTO hr_staff_privileges(tenant_id,staff_user_id,privilege_code,qualification_id) VALUES(1,90,'prescribe',1);`);
  const password=await bcrypt.hash('Nursing-test-pass!',10);
  await owner.query(`INSERT INTO nurses(id,tenant_id,email,password) VALUES(11,1,'nurse1@test.invalid',:password),(12,1,'nurse2@test.invalid',:password),(22,2,'nurse3@test.invalid',:password);
    INSERT INTO nursing_assignments(organization_id,nurse_id,ward_id,shift_name,starts_at,ends_at,assigned_by) VALUES(1,11,10,'day',NOW()-INTERVAL '1 hour',NOW()+INTERVAL '10 hours',99),(1,12,10,'night',NOW()-INTERVAL '1 hour',NOW()+INTERVAL '10 hours',99),(2,22,20,'day',NOW()-INTERVAL '1 hour',NOW()+INTERVAL '10 hours',98);
    GRANT USAGE ON SCHEMA public TO nursing_test_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nursing_test_app;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO nursing_test_app;`,{replacements:{password}});
  // The production SQL is exercised against the populated, disposable clinical schema.
  const hardening=readFileSync(new URL('../../../infra/database/nursing-ownership.sql',import.meta.url),'utf8')
    .replaceAll('mediczy_helper','nursing_test_app').replace('ALTER SCHEMA public OWNER TO postgres;','ALTER SCHEMA public OWNER TO nursing_test_owner;');
  await check('clinical ownership hardening is repeatable and preserves data',async()=>{await owner.query(hardening);await owner.query(hardening);const [r]=await owner.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tableowner='mediczy_clinical_owner'",{type:QueryTypes.SELECT});assert.equal(r.n,23);});
  Object.assign(process.env,{POSTGRES_PRIMARY_HOST:'127.0.0.1',POSTGRES_HOST:'127.0.0.1',POSTGRES_PRIMARY_PORT:String(port),POSTGRES_PORT:String(port),POSTGRES_PRIMARY_DATABASE:'nursing_gap_test',POSTGRES_DATABASE:'nursing_gap_test',POSTGRES_PRIMARY_USER:'nursing_test_app',POSTGRES_USER:'nursing_test_app',POSTGRES_PRIMARY_PASSWORD:'local-test-only',POSTGRES_PASSWORD:'local-test-only',POSTGRES_SSL:'false',POSTGRES_POOL_MIN:'0',JWT_SECRET:'disposable-nursing-integration-secret',NODE_ENV:'test'});
  delete process.env.POSTGRES_PRIMARY_URI;delete process.env.POSTGRES_URI;delete process.env.PG_URI;
  application=(await import('../../db/postgres-sequelize.js')).postgresSequelize;
  const ctx=await import('../../services/nursing-context.service.js');
  const chartService=await import('../../services/nursing-echart.service.js');
  const emar=await import('../../services/emar.service.js');
  const wf=await import('../../services/nursing-workflow.service.js');
  const ipd=await import('../../services/nursing-ipd.service.js');
  const verification=await import('../../services/nursing-verification.service.js');
  const devices=await import('../../services/nursing-devices.service.js');
  const exporter=await import('../../services/nursing-export.service.js');
  const operations=await import('../../services/nursing-operations.service.js');
  const nurse=(fn,id=11,org=1)=>ctx.withNursingContext({organizationId:org,actorId:id,role:'nurse'},fn);
  const doctor=fn=>ctx.withNursingContext({organizationId:1,actorId:90,role:'doctor'},fn);
  const supervisor=fn=>ctx.withNursingContext({organizationId:1,actorId:99,role:'hospital'},fn);
  await check('tenant and assignment checks deny another hospital admission',async()=>{await assert.rejects(nurse(()=>ctx.assertAdmission(2)),{code:'ADMISSION_NOT_FOUND'});await assert.rejects(nurse(()=>ctx.assertAdmission(1),22,2),{code:'ADMISSION_NOT_FOUND'});});
  await check('simulation-only clinicians cannot access ordinary admissions',async()=>{
    const demo=fn=>ctx.withNursingContext({organizationId:1,actorId:11,role:'nurse',principal:{metadata:{nursing_simulation_only:true}}},fn);
    await assert.rejects(demo(()=>ctx.assertAdmission(1)),{code:'SIMULATION_ONLY_ACCOUNT'});
    await owner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'; UPDATE users SET metadata='{"source":"nursing-release-demo","nursing_simulation_only":true}' WHERE id=100; UPDATE ip_admissions SET notes='SIMULATION ONLY - automated fixture' WHERE id=1`);
    try {assert.equal(Number((await demo(()=>ctx.assertAdmission(1))).id),1);}
    finally {await owner.query(`UPDATE users SET metadata='{}' WHERE id=100; UPDATE ip_admissions SET notes=NULL WHERE id=1`);}
  });
  await check('forced RLS hides other-tenant nursing records without context',async()=>{const rows=await application.query('SELECT * FROM nursing_flowsheet_entries',{type:QueryTypes.SELECT});assert.equal(rows.length,0);});
  await check('simulation nurses cannot be assigned to ordinary wards',async()=>{
    await owner.query(`ALTER TABLE nurses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'; UPDATE nurses SET metadata='{"nursing_simulation_only":true}' WHERE id=12`);
    try {await assert.rejects(supervisor(()=>wf.createNursingAssignment({nurseId:12,wardId:10,shiftName:'demo',startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()})),{code:'SIMULATION_ONLY_ACCOUNT'});}
    finally {await owner.query(`UPDATE nurses SET metadata='{}' WHERE id=12`);}
  });
  await check('application role cannot create clinical schema',async()=>{await assert.rejects(application.query('ALTER TABLE nursing_tasks ADD COLUMN should_not_exist INTEGER'));});
  await check('runtime cannot truncate clinical history or disable RLS/triggers',async()=>{
    for(const sql of ['TRUNCATE nursing_audit_events','ALTER TABLE nursing_flowsheet_entries DISABLE ROW LEVEL SECURITY','ALTER TABLE medication_administrations DISABLE TRIGGER ALL','DROP TABLE nursing_handovers','DROP SCHEMA public CASCADE','SET ROLE mediczy_clinical_owner',"CREATE OR REPLACE FUNCTION nursing_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$"]){await assert.rejects(application.query(sql),undefined,sql);}
  });
  let note;
  await check('draft attribution ignores forged body identity; retries replay',async()=>{const input={admissionId:1,entryType:'note',observationText:'Patient comfortable',recordedBy:22,idempotencyKey:'note-test-001'};note=await nurse(()=>chartService.recordEntry(input));assert.equal(note.recorded_by,11);const replay=await nurse(()=>chartService.recordEntry(input));assert.equal(replay.id,note.id);await assert.rejects(nurse(()=>chartService.recordEntry({...input,observationText:'Changed'})),{code:'idempotency_key_reuse'});});
  await check('fresh author verification signs; stale edits and SQL overwrites fail',async()=>{const proof=await nurse(()=>verification.issueNursingProof({password:'Nursing-test-pass!',purpose:'note.sign',targetId:note.id,admissionId:1}));note=await nurse(()=>chartService.signNursingEntry(note.id,{version:note.version,verificationToken:proof.token}));assert.ok(note.signed_at);await assert.rejects(nurse(()=>chartService.updateNursingDraft(note.id,{version:1,observationText:'Overwrite'})),{code:'ENTRY_IMMUTABLE'});await assert.rejects(owner.query('UPDATE nursing_flowsheet_entries SET observation_text=\'bad\' WHERE id=:id',{replacements:{id:note.id}}));});
  await check('amendment appends a new record and preserves the signed original',async()=>{const correction=await nurse(()=>chartService.amendNursingEntry(note.id,{reason:'Correcting observation',observationText:'Patient resting',idempotencyKey:'amendment-test-001'}));assert.equal(Number(correction.amends_id),note.id);const [old]=await owner.query('SELECT observation_text FROM nursing_flowsheet_entries WHERE id=:id',{replacements:{id:note.id},type:QueryTypes.SELECT});assert.equal(old.observation_text,'Patient comfortable');});
  await check('backdated I/O is counted once in the facility clinical day',async()=>{const input={admissionId:1,entryType:'io',ioType:'intake',ioVolumeMl:250,recordedAt:new Date(Date.now()-86400000).toISOString(),idempotencyKey:'fluid-test-001'};await nurse(()=>chartService.recordEntry(input));await nurse(()=>chartService.recordEntry(input));const rows=await nurse(()=>chartService.getIOSummary(1,3));assert.equal(Number(rows[0].total_intake_ml),250);});
  await check('signed fluid corrections update projections only after signing',async()=>{
    let fluid=(await owner.query("SELECT * FROM nursing_flowsheet_entries WHERE entry_type='io' ORDER BY id LIMIT 1",{type:QueryTypes.SELECT}))[0];
    let proof=await nurse(()=>verification.issueNursingProof({password:'Nursing-test-pass!',purpose:'note.sign',targetId:fluid.id,admissionId:1}));
    fluid=await nurse(()=>chartService.signNursingEntry(fluid.id,{version:fluid.version,verificationToken:proof.token}));
    const amendment=await nurse(()=>chartService.amendNursingEntry(fluid.id,{reason:'Correct measured volume',ioVolumeMl:300,idempotencyKey:'fluid-amend-test-001'}));
    assert.equal(Number((await nurse(()=>chartService.getIOSummary(1,3)))[0].total_intake_ml),250);
    proof=await nurse(()=>verification.issueNursingProof({password:'Nursing-test-pass!',purpose:'note.sign',targetId:amendment.id,admissionId:1}));
    await nurse(()=>chartService.signNursingEntry(amendment.id,{version:amendment.version,verificationToken:proof.token}));
    assert.equal(Number((await nurse(()=>chartService.getIOSummary(1,3)))[0].total_intake_ml),300);
  });
  await check('concurrent amendments cannot silently supersede a newer signed correction',async()=>{
    const [first]=await owner.query('SELECT * FROM nursing_flowsheet_entries WHERE amends_id=:id ORDER BY id LIMIT 1',{replacements:{id:note.id},type:QueryTypes.SELECT});
    const second=await nurse(()=>chartService.amendNursingEntry(note.id,{reason:'Another correction draft',observationText:'Later draft',idempotencyKey:'amendment-test-002'}));
    let proof=await nurse(()=>verification.issueNursingProof({password:'Nursing-test-pass!',purpose:'note.sign',targetId:first.id,admissionId:1}));
    await nurse(()=>chartService.signNursingEntry(first.id,{version:first.version,verificationToken:proof.token}));
    proof=await nurse(()=>verification.issueNursingProof({password:'Nursing-test-pass!',purpose:'note.sign',targetId:second.id,admissionId:1}));
    await assert.rejects(nurse(()=>chartService.signNursingEntry(second.id,{version:second.version,verificationToken:proof.token})),{code:'STALE_AMENDMENT'});
  });
  await check('bedside vitals use shared scoring in the same transaction',async()=>{const r=await nurse(()=>chartService.recordEntry({admissionId:1,entryType:'vitals',heartRate:70,bpSystolic:120,bpDiastolic:80,spo2:98,temperature:37,respiratoryRate:16,consciousness:'A',idempotencyKey:'vital-test-001'}));assert.ok(r.vital_record_id);assert.equal(r.entry_data.news2.score,0);assert.equal(r.entry_data.news2.complete,true);});
  await check('admission task generation is idempotent and patient-filtered',async()=>{await nurse(()=>ipd.autoGenerateAdmissionTasks(1,1,{}));await nurse(()=>ipd.autoGenerateAdmissionTasks(1,1,{}));const rows=await nurse(()=>ipd.getNursingTaskBoard(1,{admissionId:1,status:'all'}));assert.equal(rows.length,5);assert.ok(rows.every(r=>Number(r.admission_id)===1));});
  let order,slot,input;
  await check('nurses cannot prescribe; doctor-created slots are pending with stable IDs',async()=>{const request={admissionId:1,patientId:100,drugName:'Paracetamol',drugCode:'PARA-500',dose:500,doseUnit:'mg',route:'oral',frequencyHours:6,startDatetime:new Date().toISOString(),endDatetime:new Date(Date.now()+60000).toISOString()};await assert.rejects(nurse(()=>emar.createMedicationOrder(request)),{code:'PRESCRIBER_REQUIRED'});order=await doctor(()=>emar.createMedicationOrder(request));[slot]=await nurse(()=>emar.getDueMedications(1,{admissionId:1,windowMinutes:240}));assert.equal(Number(slot.orderId),order.id);assert.ok(['due','late'].includes(slot.status));input={scheduleId:slot.scheduleId,orderId:slot.orderId,version:slot.version,orderVersion:slot.orderVersion,admissionId:1,patientId:100,doseGiven:500,doseUnitGiven:'mg',routeUsed:'oral',scannedPatientId:'100',scannedDrugCode:'PARA-500',outcome:'given',idempotencyKey:'dose-test-001'};});
  await check('approved class allergies are checked at the bedside after the order was issued',async()=>{
    const allergyOrder=await doctor(()=>emar.createMedicationOrder({admissionId:1,patientId:100,drugName:'Amoxicillin',drugCode:'AMOX',dose:500,doseUnit:'mg',route:'oral',frequencyHours:8,startDatetime:new Date().toISOString(),endDatetime:new Date(Date.now()+60000).toISOString()}));
    await owner.query(`INSERT INTO clinical_knowledge_rules VALUES('drug_class_map','drug_class','approved','{"classKey":"penicillin","label":"Penicillins","members":["amoxicillin"],"brandAliases":[],"crossReactsWith":[]}');INSERT INTO patient_allergies(user_id,organization_id,allergen_name,allergen_type,drug_class,status) VALUES(100,1,'Penicillin','drug','penicillin','active');`);
    const dose=(await nurse(()=>emar.getDueMedications(1,{admissionId:1}))).find(d=>Number(d.orderId)===allergyOrder.id);
    const result=await nurse(()=>emar.validateAdministration({orderId:allergyOrder.id,scheduleId:dose.scheduleId,admissionId:1,patientId:100,doseGiven:500,doseUnitGiven:'mg',routeUsed:'oral',scannedPatientId:'100',scannedDrugCode:'AMOX'}));
    assert.equal(result.blocked,true);assert.equal(result.allergy.status,'matched');
    await owner.query("UPDATE patient_allergies SET status='entered_in_error' WHERE allergen_name='Penicillin'");
  });
  await check('legacy order/admission patient mismatches fail before allergy disclosure',async()=>{
    await owner.query('UPDATE medication_orders SET patient_id=200 WHERE id=:id',{replacements:{id:order.id}});
    await assert.rejects(nurse(()=>emar.validateAdministration(input)),{code:'ORDER_IDENTITY_MISMATCH'});
    await owner.query('UPDATE medication_orders SET patient_id=100 WHERE id=:id',{replacements:{id:order.id}});
  });
  await check('wrong dose/unit/route and fabricated barcode Boolean are blocked',async()=>{for(const change of [{doseGiven:5},{doseUnitGiven:'g'},{routeUsed:'iv'},{scannedDrugCode:'WRONG',barcodeVerified:true}]) {const result=await nurse(()=>emar.validateAdministration({...input,...change}));assert.equal(result.blocked,true);}});
  await check('two clinicians and a timeout retry produce one terminal administration',async()=>{const results=await Promise.allSettled([nurse(()=>emar.recordAdministration(input)),nurse(()=>emar.recordAdministration({...input,idempotencyKey:'dose-test-002'}),12)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const replay=await nurse(()=>emar.recordAdministration(input));assert.equal(Number(replay.id),Number(slot.scheduleId));const rows=await owner.query('SELECT * FROM pharmacy_dispense_queue WHERE administration_id=:id',{replacements:{id:slot.scheduleId},type:QueryTypes.SELECT});assert.equal(rows.length,1);await assert.rejects(owner.query('UPDATE medication_administrations SET dose_given=\'999\' WHERE id=:id',{replacements:{id:slot.scheduleId}}));});
  await check('high-alert doses require a distinct active nurse proof and signed hospital consent',async()=>{
    const order=await doctor(()=>emar.createMedicationOrder({admissionId:1,patientId:100,drugName:'Insulin',drugCode:'INSULIN',dose:5,doseUnit:'unit',route:'sc',frequencyHours:12,startDatetime:new Date().toISOString(),endDatetime:new Date(Date.now()+60000).toISOString()}));
    const due=await nurse(()=>emar.getDueMedications(1,{admissionId:1}));const slot=due.find(r=>Number(r.orderId)===order.id);
    const request={scheduleId:slot.scheduleId,orderId:slot.orderId,version:slot.version,orderVersion:slot.orderVersion,admissionId:1,patientId:100,doseGiven:5,doseUnitGiven:'unit',routeUsed:'sc',scannedPatientId:'100',scannedDrugCode:'INSULIN',idempotencyKey:'high-alert-test-001'};
    assert.equal((await nurse(()=>emar.validateAdministration({...request,cosignBy:12}))).blocked,true);
    await assert.rejects(nurse(()=>verification.issueNursingProof({email:'nurse1@test.invalid',password:'Nursing-test-pass!',purpose:'emar.cosign',targetId:slot.scheduleId,admissionId:1})),{code:'DISTINCT_WITNESS_REQUIRED'});
    const proof=await nurse(()=>verification.issueNursingProof({email:'nurse2@test.invalid',password:'Nursing-test-pass!',purpose:'emar.cosign',targetId:slot.scheduleId,admissionId:1}));
    await check('generic camelCase platform consent cannot authorize hospital high-alert administration',async()=>{
      await owner.query('ALTER TABLE consents RENAME TO signed_consents_fixture; CREATE TABLE consents(id SERIAL PRIMARY KEY,"userId" INTEGER,"consentType" TEXT,"isGranted" BOOLEAN,metadata JSONB); GRANT SELECT ON consents TO nursing_test_app; INSERT INTO consents("userId","consentType","isGranted",metadata) VALUES(100,\'treatment\',true,\'{}\')');
      try {await assert.rejects(nurse(()=>emar.recordAdministration({...request,witnessToken:proof.token})),{code:'CONSENT_REQUIRED'});}
      finally {await owner.query('DROP TABLE consents; ALTER TABLE signed_consents_fixture RENAME TO consents');}
    });
    const result=await nurse(()=>emar.recordAdministration({...request,witnessToken:proof.token}));assert.equal(Number(result.cosign_by),12);
  });
  await check('refused doses retain reason and create no consumption request',async()=>{const r=await doctor(()=>emar.createMedicationOrder({admissionId:1,patientId:100,drugName:'Vitamin',drugCode:'VIT',dose:1,doseUnit:'tablet',route:'oral',frequencyHours:12,startDatetime:new Date().toISOString(),endDatetime:new Date(Date.now()+60000).toISOString()}));const due=await nurse(()=>emar.getDueMedications(1,{admissionId:1}));const dose=due.find(x=>Number(x.orderId)===r.id);await nurse(()=>emar.recordAdministration({scheduleId:dose.scheduleId,orderId:dose.orderId,version:dose.version,orderVersion:dose.orderVersion,admissionId:1,patientId:100,outcome:'refused',notGivenReason:'Patient declined',idempotencyKey:'refuse-test-001'}));const [count]=await owner.query('SELECT COUNT(*) AS n FROM pharmacy_dispense_queue WHERE administration_id=:id',{replacements:{id:dose.scheduleId},type:QueryTypes.SELECT});assert.equal(Number(count.n),0);});
  await check('care goals create tasks; evaluations retain authorship and versions',async()=>{const goal=await nurse(()=>wf.createCareGoal({admissionId:1,problem:'Reduced mobility',goal:'Mobilize with assistance',intervention:'Assist with mobilization',idempotencyKey:'goal-test-001'}));const result=await nurse(()=>wf.evaluateCareGoal(goal.id,{version:goal.version,status:'met',note:'Mobilized with assistance'}));assert.equal(result.status,'met');await assert.rejects(nurse(()=>wf.evaluateCareGoal(goal.id,{version:1,status:'met',note:'Stale'})),{code:'STALE_VERSION'});});
  await check('wound records require human review and use admission-scoped episodes',async()=>{const request={admissionId:1,woundType:'Surgical',bodySite:'Left leg',lengthCm:2,widthCm:1,note:'Reviewed wound',idempotencyKey:'wound-test-001'};await assert.rejects(nurse(()=>wf.recordWound(request)),{code:'HUMAN_REVIEW_REQUIRED'});const wound=await nurse(()=>wf.recordWound({...request,reviewed:true}));assert.equal(Number(wound.area_cm2),2);await assert.rejects(nurse(()=>wf.recordWound({...request,reviewed:true,admissionId:2,idempotencyKey:'wound-test-002'})),{code:'ADMISSION_NOT_FOUND'});});
  await check('full ward census exceeds historical 12/25-patient truncation',async()=>{for(let id=3;id<=32;id++)await owner.query('INSERT INTO ip_admissions(id,organization_id,patient_id,ward_id,bed_id) VALUES(:id,1,100,10,10)',{replacements:{id}});const snapshot=await nurse(()=>wf.wardSnapshot(10));assert.equal(snapshot.patientCount,31);});
  await check('handover requires all SBAR records and the incoming nurse acknowledgment',async()=>{const snapshot=await nurse(()=>wf.wardSnapshot(10));const sbar=Object.fromEntries(snapshot.patients.map(p=>[p.id,{situation:'Reviewed',background:'Reviewed chart',assessment:'Reviewed observations',recommendation:'Continue planned care'}]));let h=await nurse(()=>wf.createHandover({wardId:10,shiftName:'night',receiverId:12,sbar,idempotencyKey:'handover-test-001'}));h=await nurse(()=>wf.transitionHandover(h.id,{version:h.version,receiverId:12,sbar},'send'));await assert.rejects(nurse(()=>wf.transitionHandover(h.id,{version:h.version},'accept')),{code:'HANDOVER_RECEIVER_REQUIRED'});h=await nurse(()=>wf.transitionHandover(h.id,{version:h.version},'accept'),12);assert.equal(h.status,'accepted');await supervisor(()=>operations.dispatchNursingEvents());const notifications=await nurse(()=>operations.nursingNotifications(),12);assert.equal(notifications.length,1);});
  await check('PRN indication, pending-slot and interval/daily limits are enforced',async()=>{
    const order=await doctor(()=>emar.createMedicationOrder({admissionId:1,patientId:100,drugName:'Paracetamol PRN',drugCode:'PRN-PARA',dose:500,doseUnit:'mg',route:'oral',prn:true,prnMinHours:4,prnMax24h:4}));
    const slot=await nurse(()=>emar.preparePrnDose(order.id,{indication:'Reviewed pain',idempotencyKey:'prn-prepare-test-001'}));
    await assert.rejects(nurse(()=>emar.preparePrnDose(order.id,{indication:'Repeat',idempotencyKey:'prn-prepare-test-002'})),{code:'PRN_LIMIT'});
    await nurse(()=>emar.recordAdministration({scheduleId:slot.id,orderId:order.id,version:slot.version,orderVersion:order.version,admissionId:1,patientId:100,doseGiven:500,doseUnitGiven:'mg',routeUsed:'oral',scannedPatientId:'100',scannedDrugCode:'PRN-PARA',idempotencyKey:'prn-give-test-001'}));
    await assert.rejects(nurse(()=>emar.preparePrnDose(order.id,{indication:'Too soon',idempotencyKey:'prn-prepare-test-003'})),{code:'PRN_LIMIT'});
  });
  await check('infusion changes follow the current prescribed rate and immutable state history',async()=>{
    const order=await doctor(()=>emar.createMedicationOrder({admissionId:1,patientId:100,drugName:'Saline',drugCode:'SALINE',dose:500,doseUnit:'mL',route:'iv',frequencyHours:24,infusionRateMlHr:50,startDatetime:new Date().toISOString(),endDatetime:new Date(Date.now()+60000).toISOString()}));
    const slot=(await nurse(()=>emar.getDueMedications(1,{admissionId:1}))).find(r=>Number(r.orderId)===order.id);
    await nurse(()=>emar.recordAdministration({scheduleId:slot.scheduleId,orderId:order.id,version:slot.version,orderVersion:1,admissionId:1,patientId:100,doseGiven:500,doseUnitGiven:'mL',routeUsed:'iv',scannedPatientId:'100',scannedDrugCode:'SALINE',idempotencyKey:'infusion-admin-test-001'}));
    const event={orderId:order.id,orderVersion:1,scheduleId:slot.scheduleId,eventType:'start',rateMlHr:50,reason:'Reviewed infusion',idempotencyKey:'infusion-start-test-001'};
    await nurse(()=>emar.recordInfusionEvent(event));
    await assert.rejects(nurse(()=>emar.recordInfusionEvent({...event,eventType:'rate_change',rateMlHr:99,idempotencyKey:'infusion-change-test-001'})),{code:'INFUSION_RATE_MISMATCH'});
    const updated=await doctor(()=>emar.authorizeInfusionRate(order.id,{version:1,rateMlHr:100,reason:'New authorized rate'}));
    await nurse(()=>emar.recordInfusionEvent({...event,orderVersion:updated.version,eventType:'rate_change',rateMlHr:100,idempotencyKey:'infusion-change-test-002'}));
    await nurse(()=>emar.recordInfusionEvent({...event,orderVersion:updated.version,eventType:'stop',idempotencyKey:'infusion-stop-test-001'}));
    const events=await nurse(()=>emar.listInfusionEvents(1));assert.deepEqual(events.map(r=>r.event_type),['start','rate_change','stop']);
  });
  await check('device signatures and nurse review prevent automatic clinical writes',async()=>{
    const {publicKey,privateKey}=generateKeyPairSync('ed25519');
    const device=await supervisor(()=>devices.registerNursingDevice({admissionId:1,label:'Synthetic monitor',publicKey:publicKey.export({type:'spki',format:'pem'}).toString()}));
    const body={deviceId:device.id,observationKey:'device-observation-test-001',sentAt:new Date().toISOString(),observedAt:new Date().toISOString(),values:{heartRate:70,bpSystolic:120,spo2:98,respiratoryRate:16,temperature:37,consciousness:'A'}};
    const signature=sign(null,Buffer.from(ctx.payloadHash(body)),privateKey).toString('base64');
    await assert.rejects(devices.ingestNursingObservation(body,'invalid'),{code:'DEVICE_AUTH_FAILED'});
    const before=(await owner.query('SELECT COUNT(*) AS n FROM nursing_flowsheet_entries',{type:QueryTypes.SELECT}))[0].n;
    const queued=await devices.ingestNursingObservation(body,signature);assert.equal(queued.status,'pending');
    const retry={...body,sentAt:new Date(Date.now()+1).toISOString()};const replay=await devices.ingestNursingObservation(retry,sign(null,Buffer.from(ctx.payloadHash(retry)),privateKey).toString('base64'));assert.equal(String(replay.id),String(queued.id));
    assert.equal((await owner.query('SELECT COUNT(*) AS n FROM nursing_flowsheet_entries',{type:QueryTypes.SELECT}))[0].n,before);
    const approved=await nurse(()=>devices.reviewDeviceObservation(queued.id,{decision:'accepted',note:'Compared with bedside observation'}));assert.ok(approved.entry_id);
    await assert.rejects(nurse(()=>devices.reviewDeviceObservation(queued.id,{decision:'accepted',note:'Duplicate'})),{code:'OBSERVATION_ALREADY_REVIEWED'});
  });
  await check('nursing export preserves signed provenance and administration history',async()=>{
    const bundle=await nurse(()=>exporter.exportNursingAdmission(1));assert.equal(bundle.resourceType,'Bundle');assert.ok(bundle.entry.some(e=>e.resource.resourceType==='Provenance'));assert.ok(bundle.entry.some(e=>e.resource.resourceType==='MedicationAdministration'));
  });
  await check('read-load smoke measures 40 chart reads at concurrency 10',async()=>{
    const times=[];for(let batch=0;batch<4;batch++)await Promise.all(Array.from({length:10},async()=>{const start=performance.now();await nurse(()=>chartService.getFlowsheet(1));times.push(performance.now()-start);}));times.sort((a,b)=>a-b);console.log(`READ_LOAD_SAMPLE: dataset=31 admissions samples=40 concurrency=10 p95_ms=${times[Math.ceil(times.length*.95)-1].toFixed(1)}`);
  });
  await check('ended ward assignment immediately prevents chart access',async()=>{await owner.query("UPDATE nursing_assignments SET revoked_at=NOW() WHERE nurse_id=11");await assert.rejects(nurse(()=>chartService.getFlowsheet(1)),{code:'WARD_ASSIGNMENT_REQUIRED'});});
  // Restore into another disposable database to verify the backup is usable and signed history survives.
  await check('logical backup and restore preserve signed history and terminal doses',async()=>{
    const expected=Number((await owner.query('SELECT COUNT(*) AS n FROM nursing_flowsheet_entries WHERE signed_at IS NOT NULL',{type:QueryTypes.SELECT}))[0].n);
    const dump=join(root,'nursing.dump');execFileSync(join(binaries,'pg_dump'),['-h','127.0.0.1','-p',String(port),'-U','nursing_test_owner','-Fc','-f',dump,'nursing_gap_test']);
    await owner.query('CREATE DATABASE nursing_gap_restore');execFileSync(join(binaries,'pg_restore'),['-h','127.0.0.1','-p',String(port),'-U','nursing_test_owner','-d','nursing_gap_restore',dump]);
    const restored=new Sequelize('nursing_gap_restore','nursing_test_owner','local-test-only',{host:'127.0.0.1',port,dialect:'postgres',logging:false});try{const [r]=await restored.query('SELECT COUNT(*) AS n FROM nursing_flowsheet_entries WHERE signed_at IS NOT NULL',{type:QueryTypes.SELECT});assert.equal(Number(r.n),expected);}finally{await restored.close();}
  });
  console.log(`NURSING_INTEGRATION_PASS: ${passed} scenarios, disposable PostgreSQL migration/upgrade/RLS/concurrency/restore`);
} catch(error) {console.error('NURSING_INTEGRATION_FAIL:',error.message);if(error.original)console.error('SQLSTATE:',error.original.code);if(error.sql)console.error('Test SQL:',error.sql);process.exitCode=1;}
finally {
  if(application)await application.close().catch(()=>{});if(owner)await owner.close().catch(()=>{});
  if(started)execFileSync(join(binaries,'pg_ctl'),['-D',join(root,'data'),'-m','immediate','-w','stop'],{stdio:'ignore'});
  rmSync(root,{recursive:true,force:true});
}
