/** One-time empty-install bootstrap. Only explicit Medstar records and reference kinds are seeded. */
import pg from 'pg';
import bcrypt from 'bcrypt';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {postgresTls} from '../../db/postgres-tls.js';
const secretDirectory=process.env.CRM_BOOTSTRAP_SECRET_DIRECTORY||'/run/bootstrap';
const ownerPassword=readFileSync(join(secretDirectory,'owner-password'),'utf8').trim();
const admin=JSON.parse(readFileSync(join(secretDirectory,'admin.json'),'utf8'));
if(admin.email!=='info@medstarhospitals.com'||process.env.CRM_TENANT_UID!=='H98VG4'||process.env.CRM_TENANT_ID!=='70')throw Error('Unexpected installation identity');
const db=new pg.Client({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:process.env.POSTGRES_DATABASE,user:'medstar_owner',password:ownerPassword,ssl:postgresTls()});
const refs=JSON.parse(readFileSync(new URL('./schema-reference.json',import.meta.url)));
const schemaHash=createHash('sha256').update(readFileSync(new URL('./schema.sql',import.meta.url))).digest('hex');
try{await db.connect();await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('dedicated-crm-bootstrap'))");
 await db.query('CREATE TABLE IF NOT EXISTS crm_installation_versions (version text PRIMARY KEY, schema_sha256 text NOT NULL, installed_at timestamptz NOT NULL DEFAULT now())');
 const prior=(await db.query("SELECT schema_sha256 FROM crm_installation_versions WHERE version='initial-20261025'")).rows[0];
 if(prior){if(prior.schema_sha256!==schemaHash)throw Error('Schema changed; a versioned upgrade is required');await db.query('ROLLBACK');console.log('Bootstrap already applied; no changes');process.exitCode=0;}
 else{
 for(const table of ['entity_kinds','entity_uid_rules'])for(const row of refs[table]){
  const fields=Object.keys(row),values=Object.values(row);await db.query(`INSERT INTO ${table} (${fields.map(k=>'"'+k+'"').join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT DO NOTHING`,values);
 }
 const mobileApps={enabled:true,origin:process.env.CRM_PUBLIC_ORIGIN,deploymentId:'4bf38838-13a9-461c-9ef2-544a95df0cd1',revision:1,apps:[{product:'crm',name:'Medstar CRM',appId:'com.medstarhospitals.crm',registration:'disabled'}]};
 const currentTenant=(await db.query("SELECT id,unique_id FROM tenants WHERE id=70")).rows[0];
 if(currentTenant&&currentTenant.unique_id!=='H98VG4')throw Error('Conflicting tenant identity');
 if(!currentTenant)await db.query(`INSERT INTO tenants(id,uid,unique_id,name,slug,subdomain,type,email,phone,admin_email,address,plan,status,is_verified,settings,metadata,created_at,updated_at) VALUES(70,$1,'H98VG4','Medstar Hospital','medstar-hospital','medstar','hospital',$2,'9585858382',$2,'{}','free','active',false,$3,'{"installation":"dedicated","billing_activated":false}',now(),now())`,['45b39651-6274-4c46-8332-6244448e86f2',admin.email,JSON.stringify({timezone:'Asia/Kolkata',language:'en',currency:'INR',mobileApps})]);
 const hash=await bcrypt.hash(admin.password,12);
 const columns=new Set((await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'")).rows.map(r=>r.column_name));
 const user={firstName:'Medstar',lastName:'Administrator',email:admin.email,password:hash,phoneNumber:'9585858382',role:'team',status:'active',isAdmin:false,isTeam:true,isVerified:false,tenant_id:70,organization_id:70,organization_type:'hospital',organization_uid:'H98VG4',metadata:JSON.stringify({isCRM:true,crmAccess:true,crmRole:'admin',tenantId:70,crmPermissions:['leads','deals','contacts','activities','reports'],installationBootstrap:true}),createdAt:new Date(),updatedAt:new Date(),created_at:new Date(),updated_at:new Date()};
 const fields=Object.keys(user).filter(k=>columns.has(k));
 const created=(await db.query(`INSERT INTO users (${fields.map(k=>'"'+k+'"').join(',')}) VALUES (${fields.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,fields.map(k=>user[k]))).rows[0];
 await db.query('UPDATE tenants SET admin_user_id=$1 WHERE id=70',[created.id]);
 for(const table of ['tenants','users'])await db.query(`SELECT setval(pg_get_serial_sequence($1,'id'),GREATEST((SELECT COALESCE(MAX(id),1) FROM ${table}),1))`,[table]);
 const {up}=await import('../../migrations/20261016000100-feature-flags.migration.js');await up(db);
 const password=process.env.POSTGRES_PASSWORD;if(!/^[a-f0-9]{64}$/.test(password))throw Error('Invalid application secret format');
 if(!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='medstar_app'")).rows.length)await db.query(`CREATE ROLE medstar_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
 await db.query('GRANT USAGE ON SCHEMA public TO medstar_app');
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO medstar_app');
 await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO medstar_app');
 await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO medstar_app');
 await db.query('REVOKE ALL ON crm_installation_versions FROM medstar_app');
 for(const name of ['app.current_org_id','app.current_tenant_id','app.current_tenant'])await db.query(`ALTER ROLE medstar_app SET "${name}" TO '70'`);
 await db.query(`ALTER ROLE medstar_app SET "app.is_platform_admin" TO 'false'`);
 await db.query(`ALTER ROLE medstar_app SET "app.current_tenant_uid" TO 'H98VG4'`);
 await db.query('INSERT INTO crm_installation_versions(version,schema_sha256) VALUES($1,$2)',['initial-20261025',schemaHash]);
 await db.query('COMMIT');console.log(JSON.stringify({tenantUid:'H98VG4',administratorCreated:true,sharedDataImported:false}));
 }
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{await db.end();}
