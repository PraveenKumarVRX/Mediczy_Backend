/** Separate administrator connection. Default: transactional rollback rehearsal. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { postgresTls } from '../../db/postgres-tls.js';
import { up,harden,withMigrationOwner,TABLES } from '../../migrations/20261020008000-contact-center.migration.js';
import {up as extend,TABLES as MEDIA_TABLES} from '../../migrations/20261020008100-contact-center-livekit.migration.js';
const ALL_TABLES=[...TABLES,...MEDIA_TABLES];

const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const expected=option('--expected-host'),evidence=option('--evidence'),apply=args.includes('--apply');
if(!expected||!evidence)throw new Error('Supply --expected-host and --evidence; default is rollback-only');
const region=process.env.AWS_REGION||'ap-south-1';
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region',region,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const params=aws('ssm','get-parameters','--names',...['POSTGRES_HOST','POSTGRES_DATABASE','POSTGRES_USER','RDS_INSTANCE_ID'].map(k=>'/mediczy/prod/'+k),'--with-decryption');
const settings=Object.fromEntries(params.Parameters.map(p=>[p.Name.split('/').at(-1),p.Value]));
if(settings.POSTGRES_HOST!==expected||settings.POSTGRES_DATABASE!=='mediczy_prod'||settings.POSTGRES_USER!=='mediczy_helper'||!settings.RDS_INSTANCE_ID)throw new Error('Unexpected production database target');
const db=aws('rds','describe-db-instances','--db-instance-identifier',settings.RDS_INSTANCE_ID).DBInstances[0];
if(db.Endpoint.Address!==expected||!db.StorageEncrypted||!db.MultiAZ||db.PubliclyAccessible||db.MasterUserSecret?.SecretStatus!=='active')throw new Error('The encrypted private active RDS target is required');
if(apply){
  if(!option('--snapshot'))throw new Error('--apply requires a recovery --snapshot');
  const snapshot=aws('rds','describe-db-snapshots','--db-snapshot-identifier',option('--snapshot')).DBSnapshots[0];
  const age=Date.now()-Date.parse(snapshot.SnapshotCreateTime);
  if(snapshot.Status!=='available'||snapshot.DBInstanceIdentifier!==db.DBInstanceIdentifier||!snapshot.Encrypted||!Number.isFinite(age)||age<0||age>3600000)throw new Error('Recovery snapshot must be encrypted, available, for this RDS instance and under one hour old');
}
const admin=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id',db.MasterUserSecret.SecretArn).SecretString);
const client=new Client({host:expected,database:settings.POSTGRES_DATABASE,user:admin.username,password:admin.password,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:expected}),connectionTimeoutMillis:10000,application_name:'mediqzy-contact-center-migration'});
const migration=readFileSync(new URL('../../migrations/20261020008000-contact-center.migration.js',import.meta.url));
const record={at:new Date().toISOString(),mode:apply?'apply':'rollback-only',instance:db.DBInstanceIdentifier,host:expected,snapshot:apply?option('--snapshot'):null,migrationSha256:createHash('sha256').update(migration).digest('hex'),tables:TABLES.length,liveCalls:0};
try{
  await client.connect();await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';SELECT pg_advisory_xact_lock(hashtext('contact-center-schema'))");
  await withMigrationOwner(client,async()=>{await up(client);await extend(client);await harden(client,settings.POSTGRES_USER,ALL_TABLES);});
  const {rows}=await client.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1)",[ALL_TABLES]);
  if(rows.length!==ALL_TABLES.length||rows.some(r=>!r.relrowsecurity||!r.relforcerowsecurity||r.rolname!=='mediqzy_voice_owner'))throw new Error('Ownership or RLS verification failed');
  await client.query(apply?'COMMIT':'ROLLBACK');record.result='passed';
}catch(error){await client.query('ROLLBACK').catch(()=>{});record.result='failed';record.errorCode=error.code||'MIGRATION_FAILED';process.exitCode=1;}
finally{await client.end();writeFileSync(evidence,JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record));
