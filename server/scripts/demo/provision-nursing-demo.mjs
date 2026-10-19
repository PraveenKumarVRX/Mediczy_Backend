#!/usr/bin/env node
/** Deliberately creates labeled synthetic fixtures only inside an explicitly verified demo hospital. */
import {Sequelize,QueryTypes} from 'sequelize';
import {SSMClient,GetParameterCommand,PutParameterCommand} from '@aws-sdk/client-ssm';
import bcrypt from 'bcrypt';import {randomBytes} from 'node:crypto';import {mkdirSync,writeFileSync} from 'node:fs';import {parseArgs} from 'node:util';import {resolve,join} from 'node:path';
const {values}=parseArgs({args:process.argv.slice(3),options:{'hospital-id':{type:'string'},'tenant-id':{type:'string'},'evidence-dir':{type:'string'}}});
const hospitalId=Number(values['hospital-id']),tenantId=Number(values['tenant-id']);
if(!Number.isSafeInteger(hospitalId)||!Number.isSafeInteger(tenantId)||!values['evidence-dir'])throw new Error('Explicit demo hospital, tenant and private evidence directory required');
const db=new Sequelize(process.env.POSTGRES_DATABASE,process.env.POSTGRES_USER,process.env.POSTGRES_PASSWORD,{host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT||5432),dialect:'postgres',logging:false,dialectOptions:{ssl:process.env.POSTGRES_SSL==='true'?{rejectUnauthorized:false}:false},pool:{min:0,max:2},retry:{max:0}});
const ssm=new SSMClient({region:process.env.AWS_REGION||'ap-south-1'});
const uid=prefix=>prefix+randomBytes(3).toString('hex').slice(0,5).toUpperCase();
const dir=resolve(values['evidence-dir']);mkdirSync(dir,{recursive:true,mode:0o700});
try{
 const [hospital]=await db.query(`SELECT h.id,h.tenant_id,h.hospital_name FROM hospitals h JOIN tenants t ON t.id=h.tenant_id WHERE h.id=:hospital AND h.tenant_id=:tenant AND h.metadata->>'demo'='true' AND t.metadata->>'demo'='true' AND h.status='active' AND t.status='active'`,{replacements:{hospital:hospitalId,tenant:tenantId},type:QueryTypes.SELECT});
 if(!hospital)throw new Error('Both the hospital and its linked tenant must be explicitly marked as active demo data');
 const access=[];
 for(const key of ['day','incoming']){
  const email=`nursing.demo.${key}@mediqzy.invalid`,parameter=`/mediczy/demo/nursing/tenant-${tenantId}/${key}`;
  let value;
  try{value=JSON.parse((await ssm.send(new GetParameterCommand({Name:parameter,WithDecryption:true}))).Parameter.Value);}
  catch(e){if(e.name!=='ParameterNotFound')throw e;value={email,password:randomBytes(24).toString('base64url')};await ssm.send(new PutParameterCommand({Name:parameter,Type:'SecureString',Value:JSON.stringify(value),Overwrite:false,Description:'Simulation-only nursing access. Dedicated synthetic admissions; not a clinical staff credential.'}));}
  if(value.email!==email)throw new Error('Demo credential alias mismatch');access.push({...value,parameter,key});
 }
 const report=await db.transaction(async transaction=>{
  const q=(sql,replacements={})=>db.query(sql,{transaction,replacements,type:QueryTypes.SELECT});
  await q("SELECT set_config('app.current_org_id',:org,true),set_config('app.current_user_id','0',true),set_config('app.is_platform_admin','false',true)",{org:String(tenantId)});
  await q('SELECT pg_advisory_xact_lock(:org,190019)',{org:tenantId});
  const metadata=JSON.stringify({demo:true,nursing_simulation_only:true,source:'nursing-release-demo'});
  let [ward]=await q("SELECT id FROM wards WHERE organization_id=:org AND name='Nursing Simulation Ward'",{org:tenantId});
  if(!ward)[ward]=await q("INSERT INTO wards(organization_id,name,ward_type,capacity,active) VALUES(:org,'Nursing Simulation Ward','general',4,true) RETURNING id",{org:tenantId});
  let [patient]=await q("SELECT id FROM users WHERE email='nursing.demo.patient@mediqzy.invalid' AND organization_id=:org AND metadata->>'nursing_simulation_only'='true'",{org:tenantId});
  if(!patient)[patient]=await q(`INSERT INTO users("firstName","lastName",email,password,"phoneNumber",status,role,organization_id,organization_type,tenant_id,metadata,unique_id,"createdAt","updatedAt") VALUES('Nursing Demo','Patient','nursing.demo.patient@mediqzy.invalid',:hash,'000000090001','active','user',:org,'hospital',:org,:metadata::jsonb,:uid,NOW(),NOW()) RETURNING id`,{org:tenantId,metadata,uid:uid('U'),hash:await bcrypt.hash(randomBytes(24).toString('hex'),10)});
  let [bed]=await q("SELECT id FROM beds WHERE organization_id=:org AND ward_id=:ward AND bed_number='DEMO-NUR-01'",{org:tenantId,ward:ward.id});
  if(!bed)[bed]=await q("INSERT INTO beds(organization_id,ward_id,ward,bed_number,bed_type,status,patient_id,created_at,updated_at) VALUES(:org,:ward,'Nursing Simulation Ward','DEMO-NUR-01','general','occupied',:patient,NOW(),NOW()) RETURNING id",{org:tenantId,ward:ward.id,patient:patient.id});
  let [admission]=await q("SELECT id FROM ip_admissions WHERE organization_id=:org AND patient_id=:patient AND notes LIKE 'SIMULATION ONLY - nursing release demo%' AND status='admitted'",{org:tenantId,patient:patient.id});
  if(!admission)[admission]=await q("INSERT INTO ip_admissions(organization_id,patient_id,ward_id,bed_id,admission_number,admission_datetime,status,notes) VALUES(:org,:patient,:ward,:bed,:number,NOW(),'admitted','SIMULATION ONLY - nursing release demo; no actual patient or treatment') RETURNING id",{org:tenantId,patient:patient.id,ward:ward.id,bed:bed.id,number:`DEMO-NUR-${tenantId}-${Date.now()}`});
  const nurses=[];
  for(const [index,account] of access.entries()){
   let [nurse]=await q('SELECT id,tenant_id,metadata FROM nurses WHERE email=:email',{email:account.email});
   if(nurse&&(Number(nurse.tenant_id)!==tenantId||nurse.metadata?.nursing_simulation_only!==true))throw new Error('Existing non-demo nurse uses the reserved demo alias');
   if(!nurse)[nurse]=await q(`INSERT INTO nurses("firstName","lastName",email,"phoneNumber",password,qualification,status,"isVerified",tenant_id,metadata,unique_id,uid,"createdAt","updatedAt") VALUES('Demo',:name,:email,:phone,:hash,'SIMULATION ONLY - not a verified clinical qualification','active',false,:org,:metadata::jsonb,:uid,gen_random_uuid(),NOW(),NOW()) RETURNING id`,{name:index?'Incoming Nurse':'Day Nurse',email:account.email,phone:`00000009001${index+1}`,hash:await bcrypt.hash(account.password,10),org:tenantId,metadata,uid:uid('N')});
   let [assignment]=await q('SELECT id FROM nursing_assignments WHERE organization_id=:org AND nurse_id=:nurse AND ward_id=:ward AND revoked_at IS NULL AND ends_at>NOW() AND starts_at<=NOW()',{org:tenantId,nurse:nurse.id,ward:ward.id});
   if(!assignment)[assignment]=await q("INSERT INTO nursing_assignments(organization_id,nurse_id,ward_id,shift_name,starts_at,ends_at,assigned_by) VALUES(:org,:nurse,:ward,'SIMULATION ONLY - 12 hour demonstration',NOW()-INTERVAL '1 minute',NOW()+INTERVAL '12 hours',0) RETURNING id,ends_at",{org:tenantId,nurse:nurse.id,ward:ward.id});
   nurses.push({id:nurse.id,email:account.email,credential_parameter:account.parameter,assignmentId:assignment.id});
  }
  await q('INSERT INTO nursing_facility_settings(organization_id,timezone,barcode_required,ai_enabled) VALUES(:org,\'Asia/Kolkata\',true,false) ON CONFLICT(organization_id) DO NOTHING',{org:tenantId});
  // No prescribing privilege, real professional qualification, signed patient consent or medication order is fabricated.
  await q("INSERT INTO nursing_audit_events(organization_id,actor_id,actor_role,action,entity_type,entity_id,data) VALUES(:org,0,'deployment_service','demo.provisioned','synthetic_admission',:id,:data::jsonb)",{org:tenantId,id:String(admission.id),data:JSON.stringify({source:'user-authorized demo onboarding',hospitalId,wardId:ward.id,nurseIds:nurses.map(n=>n.id),simulationOnly:true})});
  return {hospitalId,tenantId,hospitalName:hospital.hospital_name,wardId:ward.id,patientId:patient.id,admissionId:admission.id,nurses,simulationOnly:true,clinicalAcceptance:false,prescribingPrivilegesGranted:false};
 });
 writeFileSync(join(dir,'demo-provisioning.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 writeFileSync(join(dir,'demo-access.private.json'),JSON.stringify(access.map(({email,password,parameter})=>({email,password,parameter})),null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}finally{ssm.destroy();await db.close();}
