/** Rotate the exposed runtime credential; never print either password or place it in argv. */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { SSMClient, GetParameterCommand, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import { postgresTls } from '../../db/postgres-tls.js';
const require=createRequire(import.meta.url),pm2=require('/usr/lib/node_modules/pm2');
const region='ap-south-1',root='/home/ubuntu/Mediczy',dir='/home/ubuntu/database-hardening-evidence/20261019';
if(!process.argv.includes('--apply'))throw new Error('Explicit --apply required');
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region',region,'--output','json'],{encoding:'utf8'}));
const instance='mediczy-prod-encrypted-20261019',db=aws('rds','describe-db-instances','--db-instance-identifier',instance).DBInstances[0];
if(!db.StorageEncrypted||!db.MultiAZ||db.PubliclyAccessible||db.MasterUserSecret?.SecretStatus!=='active')throw new Error('Unexpected active target');
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id',db.MasterUserSecret.SecretArn).SecretString);
const ssm=new SSMClient({region});const parameter='/mediczy/prod/POSTGRES_PASSWORD';
const previous=await ssm.send(new GetParameterCommand({Name:parameter,WithDecryption:true}));const oldPassword=previous.Parameter.Value;
const candidate='/mediczy/operations/database-rotation/'+Date.now();const password=randomBytes(48).toString('base64url');
await ssm.send(new PutParameterCommand({Name:candidate,Value:password,Type:'SecureString',Description:'Temporary recovery reference for runtime database credential rotation'}));
const config={host:db.Endpoint.Address,database:'mediczy_prod',user:'postgres',password:secret.password,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:db.Endpoint.Address}),application_name:'mediqzy-credential-rotation'};
const admin=new Client(config);await admin.connect();
if(!(await admin.query("SELECT pg_try_advisory_lock(hashtextextended('mediqzy:runtime-credential-rotation',0)) AS locked")).rows[0].locked)throw new Error('Another credential rotation is active');
await new Promise((res,rej)=>pm2.connect(e=>e?rej(e):res()));
const list=await new Promise((res,rej)=>pm2.list((e,r)=>e?rej(e):res(r)));
const processes=['mediczy-server','mediczy-worker','feedback-intelligence','sib-fastapi'].map(name=>{const p=list.find(p=>p.name===name);if(!p||p.pm2_env.status!=='online'||p.pm2_env.POSTGRES_HOST!==db.Endpoint.Address)throw new Error('Expected active process not found: '+name);return p;});
const remote=(method,value)=>new Promise((res,rej)=>pm2.Client.executeRemote(method,value,(e,r)=>e?rej(new Error(method+' failed')):res(r)));
const paths=[root+'/.env',root+'/server/.env'];for(const path of paths)if(execFileSync('git',['ls-files','--',path],{cwd:root,encoding:'utf8'}).trim())throw new Error('Refusing to put runtime secrets in a tracked env file');
writeFileSync(dir+'/credential-rotation-state.private.json',JSON.stringify({processes,files:Object.fromEntries(paths.map(p=>[p,readFileSync(p,'utf8')]))},null,2),{mode:0o600});
const record={startedAt:new Date().toISOString(),instance,status:'running',candidateParameter:candidate,oldCredentialWasTracked:true};
const maintenance='/home/ubuntu/database-maintenance.flag';let changed=false;
try{
 writeFileSync(maintenance,'database credential rotation\n',{mode:0o644});
 for(const p of processes)await remote('stopProcessId',p.pm_id);
 await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='mediczy_helper'");
 await admin.query("SET password_encryption='scram-sha-256'");
 await admin.query("ALTER ROLE mediczy_helper PASSWORD '"+password.replaceAll("'","''")+"'");changed=true;
 for(const name of [parameter,'/mediczy/prod/POSTGRES_PRIMARY_PASSWORD'])await ssm.send(new PutParameterCommand({Name:name,Value:password,Type:'SecureString',Overwrite:true}));
 const passwordKeys=new Set(['POSTGRES_PASSWORD','POSTGRES_PRIMARY_PASSWORD','PG_PASSWORD','PGPASSWORD','DB_PASSWORD','DB_PASS']);
 const hosts=new Set(['POSTGRES_HOST','POSTGRES_PRIMARY_HOST','PG_HOST','DB_HOST']);
 const pgUri=value=>{try{const u=new URL(value);if(['postgres:','postgresql:'].includes(u.protocol)){u.hostname=db.Endpoint.Address;u.username='mediczy_helper';u.password=password;u.pathname='/mediczy_prod';return u.toString();}}catch{}return value;};
 for(const path of paths){
  let body=readFileSync(path,'utf8').split('\n').map(line=>{const m=line.match(/^([A-Z_]+)=(.*)$/);if(!m)return line;const k=m[1];if(passwordKeys.has(k))return k+'='+password;if(hosts.has(k))return k+'='+db.Endpoint.Address;if(['POSTGRES_URI','POSTGRES_PRIMARY_URI','PG_URI','DATABASE_URL'].includes(k))return k+'='+pgUri(m[2].replace(/^['"]|['"]$/g,''));return line;}).join('\n');
  if(!/^POSTGRES_PASSWORD=/m.test(body))body+='\nPOSTGRES_PASSWORD='+password+'\n';writeFileSync(path,body);chmodSync(path,0o600);
 }
 for(const path of [root+'/.env.production.local',root+'/server/.env.production.local'])if(existsSync(path))chmodSync(path,0o600);
 const good=new Client({...config,user:'mediczy_helper',password});await good.connect();await good.query('SELECT 1');await good.end();record.newCredentialVerified=true;
 const bad=new Client({...config,user:'mediczy_helper',password:oldPassword,connectionTimeoutMillis:5000});let rejected=false;try{await bad.connect();}catch(e){rejected=e.code==='28P01';}finally{await bad.end();}if(!rejected)throw new Error('Old runtime credential was not rejected');record.oldCredentialRejected=true;
 for(const p of processes){const env={...(p.pm2_env.env||{})};for(const key of passwordKeys)env[key]=password;for(const key of ['POSTGRES_URI','POSTGRES_PRIMARY_URI','PG_URI','DATABASE_URL'])if(env[key])env[key]=pgUri(env[key]);await remote('restartProcessId',{id:p.pm_id,env});}
 for(let n=0;n<30;n++){try{const r=await fetch('http://127.0.0.1:8888/api/health');if(r.ok&&(await r.json()).status==='healthy')break;if(n===29)throw new Error('Backend did not recover');}catch(e){if(n===29)throw e;}await new Promise(r=>setTimeout(r,1000));}
 unlinkSync(maintenance);execFileSync('pm2',['save'],{stdio:'ignore'});await ssm.send(new DeleteParameterCommand({Name:candidate}));record.candidateParameterDeleted=true;record.status='passed';record.finishedAt=new Date().toISOString();
}catch(error){record.status='failed';record.error=error.message;record.databasePasswordChanged=changed;record.recovery='Read the candidate SecureString and complete SSM/env/process updates; do not restore the compromised password';process.exitCode=1;}
finally{await admin.end();pm2.disconnect();writeFileSync(dir+'/credential-rotation.json',JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record));
