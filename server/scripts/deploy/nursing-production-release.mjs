#!/usr/bin/env node
/** Invoked through the existing SSM loader. Does not seed or change clinical user records. */
import {Sequelize,QueryTypes} from 'sequelize';
import {parseArgs} from 'node:util';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const {values}=parseArgs({args:process.argv.slice(3),options:{'expected-host':{type:'string'},'expected-database':{type:'string'},'snapshot':{type:'string'},'evidence-dir':{type:'string'}}});
const host=process.env.POSTGRES_PRIMARY_HOST||process.env.POSTGRES_HOST;
const database=process.env.POSTGRES_PRIMARY_DATABASE||process.env.POSTGRES_DATABASE;
if(process.env.NODE_ENV!=='production'||!values['expected-host']||host!==values['expected-host']||!values['expected-database']||database!==values['expected-database']||!values.snapshot||!values['evidence-dir'])throw new Error('Explicit production host, database, available snapshot and private evidence directory are required');
const aws=(args)=>{const r=spawnSync('aws',[...args,'--output','json','--no-cli-pager'],{encoding:'utf8'});if(r.status!==0)throw new Error('AWS snapshot verification failed');return JSON.parse(r.stdout);};
const snapshot=aws(['rds','describe-db-snapshots','--db-snapshot-identifier',values.snapshot]).DBSnapshots[0];
if(snapshot.Status!=='available')throw new Error('Pre-release RDS snapshot is not available; no migration attempted');
const instance=aws(['rds','describe-db-instances','--db-instance-identifier',snapshot.DBInstanceIdentifier]).DBInstances[0];
if(instance.Endpoint.Address!==host)throw new Error('Snapshot belongs to another database host');
const dir=resolve(values['evidence-dir']);mkdirSync(dir,{recursive:true,mode:0o700});
const record={at:new Date().toISOString(),host,database,snapshot:snapshot.DBSnapshotIdentifier,snapshotState:snapshot.Status,status:'failed',clinicalRecordsSeeded:false};
const db=new Sequelize(database,process.env.POSTGRES_PRIMARY_USER||process.env.POSTGRES_USER,process.env.POSTGRES_PRIMARY_PASSWORD||process.env.POSTGRES_PASSWORD,{host,port:Number(process.env.POSTGRES_PRIMARY_PORT||process.env.POSTGRES_PORT||5432),dialect:'postgres',logging:false,dialectOptions:{options:'-c lock_timeout=5000 -c statement_timeout=60000',ssl:process.env.POSTGRES_SSL==='true'?{rejectUnauthorized:false}:false},pool:{min:0,max:2},retry:{max:0}});
const tables=['nursing_device_bindings','nursing_device_observations','nursing_infusion_events','nursing_staff_links','nursing_notifications','nursing_images','nursing_facility_settings','nursing_assignments','nursing_audit_events','nursing_outbox','nursing_replays','nursing_handovers','nursing_interventions','nursing_care_goals','nursing_goal_evaluations','nursing_flowsheet_entries','nursing_tasks','nursing_assessments'];
try{
  const [duplicates]=await db.query(`SELECT (SELECT COUNT(*) FROM (SELECT 1 FROM medication_administrations GROUP BY order_id,scheduled_time HAVING COUNT(*)>1)s)::int AS slots,(SELECT COUNT(*) FROM (SELECT 1 FROM pharmacy_dispense_queue WHERE administration_id IS NOT NULL GROUP BY organization_id,administration_id HAVING COUNT(*)>1)q)::int AS pharmacy`,{type:QueryTypes.SELECT});
  if(duplicates.slots||duplicates.pharmacy)throw new Error('Historical duplicate slots or pharmacy links require clinical reconciliation');
  const migration=new URL('../../migrations/20261019000100-nursing-workflow-integrity.migration.js',import.meta.url);
  record.migrationSha256=createHash('sha256').update(readFileSync(migration)).digest('hex');
  // The migration is atomic. Lock waits and statements are bounded for live traffic.
  await db.query("SET lock_timeout='5s'; SET statement_timeout='60s'");
  await (await import(migration.href)).up(db.getQueryInterface(),Sequelize);
  const rows=await db.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) AS policy FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (:tables) AND c.relkind='r'`,{replacements:{tables},type:QueryTypes.SELECT});
  record.rls=rows;
  if(rows.length!==tables.length||rows.some(r=>!r.relrowsecurity||!r.relforcerowsecurity||!r.policy))throw new Error('Nursing RLS verification failed after migration');
  for(const table of tables){const [row]=await db.query(`SELECT COUNT(*)::int AS count FROM ${table}`,{type:QueryTypes.SELECT});if(row.count!==0)throw new Error('Nursing rows visible without tenant context');}
  record.knownPlatformLimitations=['Existing runtime role owns application tables; global role separation remains pending','Existing RDS instance has unencrypted storage; new nursing images use KMS encryption'];
  record.status='passed';
} catch(error){record.error=error.message;throw error;}
finally{writeFileSync(join(dir,`migration-${Date.now()}.json`),JSON.stringify(record,null,2)+'\n',{mode:0o600});await db.close();}
console.log(JSON.stringify(record,null,2));
