/** Isolated rehearsal by default. Target replacement additionally requires a fenced source. */
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, createReadStream, openSync, closeSync } from 'node:fs';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { postgresTls } from '../../db/postgres-tls.js';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!['--target','--archive-dir'].every(k=>args.includes(k)))throw new Error('Supply --target and --archive-dir');
if(option('--target')!=='mediczy-prod-encrypted-20261019')throw new Error('Only the isolated encrypted replacement is allowed');
const replaceTarget=args.includes('--replace-target');
const dir=resolve(option('--archive-dir')),region=process.env.AWS_REGION||'ap-south-1',database=replaceTarget?'mediczy_prod':'hardening_restore_verification';
const receipt=JSON.parse(readFileSync(join(dir,'receipt.json'),'utf8'));
if(receipt.status!=='passed'||!receipt.format.includes('AES-256-GCM'))throw new Error('A successful authenticated encrypted dump is required');
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region',region,'--output','json'],{encoding:'utf8'}));
const target=aws('rds','describe-db-instances','--db-instance-identifier',option('--target')).DBInstances[0];
if(target.DBInstanceStatus!=='available'||!target.StorageEncrypted||target.PubliclyAccessible||!target.MultiAZ||target.MasterUserSecret?.SecretStatus!=='active')throw new Error('Encrypted private Multi-AZ target is not ready');
const liveHost=aws('ssm','get-parameter','--name','/mediczy/prod/POSTGRES_HOST').Parameter.Value;
if(liveHost===target.Endpoint.Address)throw new Error('Refusing to restore onto the active production instance; create a new isolated target');
if(target.Endpoint.Address===receipt.host)throw new Error('Source and target must be different');
const archive=join(dir,'database.dump.enc');const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);if(hash.digest('hex')!==receipt.sha256)throw new Error('Archive checksum mismatch');
const decoded=aws('kms','decrypt','--ciphertext-blob','fileb://'+join(dir,'database.dump.key.kms'),'--encryption-context','Application=Mediqzy,Purpose=database-recovery');
const key=Buffer.from(decoded.Plaintext,'base64');delete decoded.Plaintext;
const decrypt=()=>{const d=createDecipheriv('aes-256-gcm',key,Buffer.from(receipt.nonce,'base64'));d.setAuthTag(Buffer.from(receipt.authTag,'base64'));return d;};
const result={startedAt:new Date().toISOString(),source:receipt.instance,target:target.DBInstanceIdentifier,database,archiveSha256:receipt.sha256,status:'failed'};
let client;
try {
 // Authenticate the ENTIRE artifact before feeding any SQL to PostgreSQL.
 await pipeline(createReadStream(archive),decrypt(),new Writable({write(chunk,encoding,done){done();}}));
 result.archiveAuthentication='passed';
 const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id',target.MasterUserSecret.SecretArn).SecretString);
 const config={host:target.Endpoint.Address,database:'postgres',user:secret.username,password:secret.password,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:target.Endpoint.Address}),connectionTimeoutMillis:10000};
 client=new Client(config);await client.connect();
 if(replaceTarget){
  if(receipt.instance!=='mediczy-prod'||!receipt.sourceRuntimeFenced||!receipt.rowCounts)throw new Error('Final copy must come from a write-fenced source with exact counts');
  const source=aws('rds','describe-db-instances','--db-instance-identifier','mediczy-prod').DBInstances[0];
  const sourceSecret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id',source.MasterUserSecret.SecretArn).SecretString);
  const sourceClient=new Client({host:source.Endpoint.Address,database:'mediczy_prod',user:sourceSecret.username,password:sourceSecret.password,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:source.Endpoint.Address})});
  try{await sourceClient.connect();if((await sourceClient.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='mediczy_helper'")).rows[0].rolcanlogin||(await sourceClient.query("SELECT 1 FROM pg_stat_activity WHERE usename='mediczy_helper'")).rowCount)throw new Error('Source must remain write-fenced');}finally{await sourceClient.end();}
  if((await client.query('SELECT 1 FROM pg_stat_activity WHERE datname=$1',[database])).rowCount)throw new Error('Target has clients; refusing replacement');
  await client.query('ALTER ROLE mediczy_helper NOLOGIN');
  await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='mediczy_helper'");
  await client.query('DROP DATABASE '+database);
 }else if((await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)throw new Error('Rehearsal database already exists; inspect it before a fresh run');
 await client.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='mediczy_clinical_owner') THEN CREATE ROLE mediczy_clinical_owner NOLOGIN NOBYPASSRLS; END IF; END $$");
 await client.query("ALTER ROLE mediczy_helper SET idle_in_transaction_session_timeout='60s'; ALTER ROLE mediczy_helper SET lock_timeout='10s'");
 await client.query('CREATE DATABASE '+database);
 await client.end();client=null;
 const env={...process.env,PGPASSWORD:secret.password,PGSSLMODE:'verify-full',PGSSLROOTCERT:new URL('../../db/certs/aws-rds-ap-south-1.pem',import.meta.url).pathname};
 const errors=openSync(join(dir,'restore.private.log'),'wx',0o600);
 const restore=spawn('/usr/lib/postgresql/18/bin/pg_restore',['-h',target.Endpoint.Address,'-p','5432','-U',secret.username,'-d',database,'--no-password','--exit-on-error','--single-transaction'],{env,stdio:['pipe','ignore',errors]});
 try{await Promise.all([new Promise((resolve,reject)=>{restore.on('error',reject);restore.on('close',code=>code===0?resolve():reject(new Error('pg_restore failed with exit '+code)));}),pipeline(createReadStream(archive),decrypt(),restore.stdin)]);}finally{closeSync(errors);}
 client=new Client({...config,database});await client.connect();
 const ownerSafety=(await client.query("SELECT rolcanlogin,rolsuper,rolbypassrls,(SELECT count(*)::int FROM pg_auth_members WHERE roleid=r.oid) AS members FROM pg_roles r WHERE rolname='mediczy_clinical_owner'")).rows[0];
 if(!ownerSafety||ownerSafety.rolcanlogin||ownerSafety.rolsuper||ownerSafety.rolbypassrls||ownerSafety.members)throw new Error('Clinical owner role is not isolated');result.ownerRoleVerified=true;
 const definerCount=(await client.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef")).rows[0].n;
 if(definerCount)throw new Error('Unexpected elevated public function after restore');result.noPublicSecurityDefiners=true;
 result.tables=(await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n;
 result.protectedTables=(await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tableowner='mediczy_clinical_owner'")).rows[0].n;
 result.forcedNursingRls=(await client.query("SELECT count(*)::int n FROM pg_class WHERE relname LIKE 'nursing_%' AND relrowsecurity AND relforcerowsecurity")).rows[0].n;
 result.signedNotes=(await client.query('SELECT count(*)::int n FROM nursing_flowsheet_entries WHERE signed_at IS NOT NULL')).rows[0].n;
 if(result.protectedTables!==23||result.forcedNursingRls<18||result.signedNotes<2)throw new Error('Restored clinical controls/history verification failed');
 if(receipt.rowCounts){
  const actual=(await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema')")).rows;
  if(actual.length!==Object.keys(receipt.rowCounts).length)throw new Error('Restored relation count differs from source');
  for(const [name,count]of Object.entries(receipt.rowCounts)){if((await client.query('SELECT count(*)::text AS n FROM '+name)).rows[0].n!==count)throw new Error('Restored row count differs for '+name);}
  result.exactRowCountsVerified=actual.length;
  const sequences=(await client.query("SELECT schemaname,sequencename,last_value::text FROM pg_sequences WHERE schemaname NOT IN('pg_catalog','information_schema') ORDER BY 1,2")).rows;
  const sameSequences=JSON.stringify(sequences)===JSON.stringify(receipt.sequences);
  if(!sameSequences&&receipt.sourceRuntimeFenced)throw new Error('Restored sequence positions differ under write fence');
  result.exactSequencePositionsVerified=sameSequences?sequences.length:0;
  if(!sameSequences)result.sequenceNote='Live source allocated sequence values during the rehearsal; final fenced copy requires an exact match';
 }
 if(replaceTarget){result.targetRuntimeStillFenced=!(await client.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='mediczy_helper'")).rows[0].rolcanlogin;if(!result.targetRuntimeStillFenced)throw new Error('Target runtime was unexpectedly enabled');}
 result.status='passed';result.finishedAt=new Date().toISOString();
}catch(error){result.error=error.message;process.exitCode=1;}
finally{key.fill(0);if(client)await client.end();writeFileSync(join(dir,'restore-receipt.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(result));
