/** Encrypt a complete pg_dump stream before it reaches disk. Deployment credentials only. */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, createHash, createCipheriv } from 'node:crypto';
import { mkdirSync, writeFileSync, statSync, createReadStream, createWriteStream, openSync, closeSync, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { postgresTls } from '../../db/postgres-tls.js';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!['--instance','--output-dir','--kms-key'].every(k=>args.includes(k)))throw new Error('Supply --instance --output-dir --kms-key');
const instance=option('--instance'),dir=resolve(option('--output-dir')),region=process.env.AWS_REGION||'ap-south-1';
if(!['mediczy-prod','mediczy-prod-encrypted-20261019'].includes(instance))throw new Error('Unexpected database identifier');
mkdirSync(dir,{recursive:true,mode:0o700});
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region',region,'--output','json'],{encoding:'utf8'}));
const db=aws('rds','describe-db-instances','--db-instance-identifier',instance).DBInstances[0];
if(db.MasterUserSecret?.SecretStatus!=='active')throw new Error('Managed master secret is not active');
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id',db.MasterUserSecret.SecretArn).SecretString);
const archive=join(dir,'database.dump.enc'),wrapped=join(dir,'database.dump.key.kms');
if([archive,wrapped].some(existsSync))throw new Error('Use a fresh output directory');
const record={startedAt:new Date().toISOString(),instance,host:db.Endpoint.Address,database:'mediczy_prod',kmsKey:option('--kms-key'),format:'pg_dump custom / AES-256-GCM / KMS envelope encryption',status:'failed'};
let snapshotClient;
const completed=p=>new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error('Recovery subprocess failed with exit '+code)));});
try{
 const encrypted=aws('kms','generate-data-key','--key-id',option('--kms-key'),'--key-spec','AES_256','--encryption-context','Application=Mediqzy,Purpose=database-recovery');
 const nonce=randomBytes(12),key=Buffer.from(encrypted.Plaintext,'base64'),cipher=createCipheriv('aes-256-gcm',key,nonce);
 delete encrypted.Plaintext;
 writeFileSync(wrapped,Buffer.from(encrypted.CiphertextBlob,'base64'),{mode:0o600});
 snapshotClient=new Client({host:db.Endpoint.Address,database:'mediczy_prod',user:secret.username,password:secret.password,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:db.Endpoint.Address}),application_name:'mediqzy-recovery-snapshot'});
 await snapshotClient.connect();await snapshotClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 record.sourceRuntimeFenced=!(await snapshotClient.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='mediczy_helper'")).rows[0].rolcanlogin;
 if(record.sourceRuntimeFenced && (await snapshotClient.query("SELECT 1 FROM pg_stat_activity WHERE usename='mediczy_helper'")).rowCount)throw new Error('Fenced source still has runtime sessions');
 const snapshot=(await snapshotClient.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
 const env={...process.env,PGPASSWORD:secret.password,PGSSLMODE:'verify-full',PGSSLROOTCERT:new URL('../../db/certs/aws-rds-ap-south-1.pem',import.meta.url).pathname};
 const errors=openSync(join(dir,'dump.private.log'),'wx',0o600);
 const dump=spawn('/usr/lib/postgresql/18/bin/pg_dump',['-h',db.Endpoint.Address,'-p','5432','-U',secret.username,'-d','mediczy_prod','--no-password','--format=custom','--compress=gzip:1','--snapshot',snapshot],{env,stdio:['ignore','pipe',errors]});
 try { await Promise.all([completed(dump),pipeline(dump.stdout,cipher,createWriteStream(archive,{flags:'wx',mode:0o600}))]); } finally {key.fill(0);closeSync(errors);}
 const relations=(await snapshotClient.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema') ORDER BY schemaname,tablename")).rows;
 record.rowCounts={};const quote=s=>'"'+s.replaceAll('"','""')+'"';
 for(const r of relations){const name=quote(r.schemaname)+'.'+quote(r.tablename);record.rowCounts[name]=(await snapshotClient.query('SELECT count(*)::text AS n FROM '+name)).rows[0].n;}
 record.sequences=(await snapshotClient.query("SELECT schemaname,sequencename,last_value::text FROM pg_sequences WHERE schemaname NOT IN('pg_catalog','information_schema') ORDER BY 1,2")).rows;
 await snapshotClient.query('COMMIT');await snapshotClient.end();snapshotClient=null;
 record.nonce=nonce.toString('base64');record.authTag=cipher.getAuthTag().toString('base64');
 const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
 Object.assign(record,{status:'passed',bytes:statSync(archive).size,sha256:hash.digest('hex'),finishedAt:new Date().toISOString()});
}catch(e){record.error=e.message;process.exitCode=1;}
finally{if(snapshotClient)await snapshotClient.end();writeFileSync(join(dir,'receipt.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
const {rowCounts,sequences,...summary}=record;console.log(JSON.stringify({...summary,verifiedTableCount:Object.keys(rowCounts||{}).length,sequenceCount:sequences?.length||0}));
