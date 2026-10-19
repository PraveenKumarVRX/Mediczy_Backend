/** Fenced final copy. No source data is deleted. Refuses automatic rollback after services start. */
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { SSMClient, GetParametersCommand, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import { postgresTls } from '../../db/postgres-tls.js';
const require=createRequire(import.meta.url),pm2=require('/usr/lib/node_modules/pm2');
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!args.includes('--evidence'))throw new Error('Supply --evidence');
const apply=args.includes('--apply'),dir=resolve(option('--evidence')),region='ap-south-1',root='/home/ubuntu/Mediczy';
mkdirSync(dir,{recursive:true,mode:0o700});
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region',region,'--output','json'],{encoding:'utf8'}));
const source=aws('rds','describe-db-instances','--db-instance-identifier','mediczy-prod').DBInstances[0];
const target=aws('rds','describe-db-instances','--db-instance-identifier','mediczy-prod-encrypted-20261019').DBInstances[0];
if(source.Endpoint.Address===target.Endpoint?.Address||!target.StorageEncrypted||!target.MultiAZ||target.PubliclyAccessible||!target.DeletionProtection||target.DBInstanceStatus!=='available'||target.MasterUserSecret?.SecretStatus!=='active')throw new Error('Private encrypted protected Multi-AZ target is not ready');
const rehearsal=JSON.parse(readFileSync(join(dir,'recovery-counted','restore-receipt.json'),'utf8'));
if(rehearsal.status!=='passed'||rehearsal.target!==target.DBInstanceIdentifier||!rehearsal.exactRowCountsVerified)throw new Error('Complete target restore rehearsal is required');
const oldHost=source.Endpoint.Address,newHost=target.Endpoint.Address;
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id',source.MasterUserSecret.SecretArn).SecretString);
const sourceDb=new Client({host:oldHost,database:'mediczy_prod',user:secret.username,password:secret.password,ssl:postgresTls({NODE_ENV:'production',POSTGRES_HOST:oldHost}),application_name:'mediqzy-encrypted-cutover'});await sourceDb.connect();
if(!(await sourceDb.query("SELECT pg_try_advisory_lock(hashtextextended('mediqzy:production-encrypted-cutover',0)) AS locked")).rows[0].locked)throw new Error('Another database cutover is active');
const ssm=new SSMClient({region});
const parameterNames=['POSTGRES_HOST','POSTGRES_PRIMARY_HOST','POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DATABASE','RDS_INSTANCE_ID'];
const parameters=await ssm.send(new GetParametersCommand({Names:parameterNames.map(k=>'/mediczy/prod/'+k),WithDecryption:true}));
const oldParameters=parameters.Parameters,values=Object.fromEntries(oldParameters.map(p=>[p.Name.split('/').at(-1),p.Value]));
if(values.POSTGRES_HOST!==oldHost)throw new Error('Live SSM no longer points to the expected source');
await new Promise((res,rej)=>pm2.connect(e=>e?rej(e):res()));
const list=await new Promise((res,rej)=>pm2.list((e,p)=>e?rej(e):res(p)));
const names=['mediczy-server','mediczy-worker','feedback-intelligence','sib-fastapi'];
const processes=names.map(n=>{const p=list.find(p=>p.name===n);if(!p||p.pm2_env.status!=='online')throw new Error('Expected running process missing: '+n);return p;});
const currentApi=processes.find(p=>p.name==='mediczy-server');
if(currentApi.pm2_env.pm_cwd!=='/home/ubuntu/mediqzy-releases/nursing-20261019-06/server')throw new Error('Unexpected active backend release');
const configFiles=[root+'/.env',root+'/server/.env',root+'/.env.production.local',root+'/server/.env.production.local'].filter(existsSync);
const oldFiles=Object.fromEntries(configFiles.map(f=>[f,readFileSync(f,'utf8')]));
const record={startedAt:new Date().toISOString(),mode:apply?'apply':'preflight',source:source.DBInstanceIdentifier,target:target.DBInstanceIdentifier,sourceHost:oldHost,targetHost:newHost,restoreRehearsal:rehearsal,status:'failed',steps:[]};
const note=name=>{record.steps.push({at:new Date().toISOString(),name});writeFileSync(join(dir,'cutover.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});console.log(name);};
const remote=(action,options)=>new Promise((res,rej)=>pm2.Client.executeRemote(action,options,(e,r)=>e?rej(new Error(action+' failed')):res(r)));
const script=path=>new URL(path,import.meta.url).pathname;
const child=(file,argv)=>new Promise((res,rej)=>{const p=spawn(process.execPath,[file,...argv],{stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',d=>{output+=d;});p.stderr.on('data',d=>{output+=d;});p.on('error',rej);p.on('close',code=>{writeFileSync(join(dir,file.split('/').at(-1)+'.private.log'),output,{mode:0o600});code===0?res():rej(new Error(file.split('/').at(-1)+' failed; inspect private log'));});});
const maintenance='/home/ubuntu/database-maintenance.flag';let fenced=false,routingChanged=false,servicesStarted=false,maintenanceStarted=false;
try{
 const clients=(await sourceDb.query("SELECT usename,client_addr,count(*)::int n FROM pg_stat_activity WHERE usename NOT IN('rdsadmin') AND pid<>pg_backend_pid() GROUP BY 1,2")).rows;
 if(clients.some(c=>c.client_addr!=='172.31.47.217'||c.usename!=='mediczy_helper'))throw new Error('Unexpected database writers require investigation');
 note('Preflight passed: target security, restore, routing, active release and writer inventory');
 if(!apply){record.status='passed';}
 else{
  if(!existsSync('/etc/nginx/database-maintenance-enabled'))throw new Error('Nginx maintenance flag support must be installed and tested first');
  if(existsSync(join(dir,'cutover-state.private.json')))throw new Error('A prior cutover exists; inspect it before resuming');
  writeFileSync(join(dir,'cutover-state.private.json'),JSON.stringify({processes,oldFiles,oldParameters},null,2),{mode:0o600});
  writeFileSync(maintenance,'database migration\n',{mode:0o644});maintenanceStarted=true;
  const maintenanceProbe=await fetch('https://app.mediqzy.com/api/health?database-cutover='+Date.now());if(maintenanceProbe.status!==503)throw new Error('Maintenance route did not return 503');
  for(const p of processes)await remote('stopProcessId',p.pm_id);
  await sourceDb.query('ALTER ROLE mediczy_helper NOLOGIN');fenced=true;
  await sourceDb.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='mediczy_helper'");
  note('Source runtime fenced; API and database workers stopped');
  const finalDir=join(dir,'final-fenced-copy');
  await child(script('./database-recovery-dump.mjs'),['--instance',source.DBInstanceIdentifier,'--output-dir',finalDir,'--kms-key',target.KmsKeyId]);
  note('Fresh complete encrypted dump captured under write fence');
  await child(script('./database-recovery-restore.mjs'),['--target',target.DBInstanceIdentifier,'--archive-dir',finalDir,'--replace-target']);
  note('Final target restore passed exact table counts and sequence positions');
  // No application clients have been started against the replacement at this point.
  routingChanged=true;
  for(const [name,value]of Object.entries({POSTGRES_HOST:newHost,POSTGRES_PRIMARY_HOST:newHost,RDS_INSTANCE_ID:target.DBInstanceIdentifier}))await ssm.send(new PutParameterCommand({Name:'/mediczy/prod/'+name,Value:value,Type:'String',Overwrite:true}));
  for(const [file,body]of Object.entries(oldFiles)){
   let updated=body.replaceAll(oldHost,newHost);updated=updated.replace(/^RDS_INSTANCE_ID=.*$/m,'RDS_INSTANCE_ID='+target.DBInstanceIdentifier);
   if(!/^RDS_INSTANCE_ID=/m.test(updated))updated+='\nRDS_INSTANCE_ID='+target.DBInstanceIdentifier+'\n';
   writeFileSync(file,updated,{mode:0o600});
  }
  routingChanged=true;
  note('SSM and local production connection targets switched');
  // Starting services can produce writes: automatic rollback to the old data is forbidden after this line.
  servicesStarted=true;
  for(const p of processes){
   const env=Object.fromEntries(Object.entries(p.pm2_env.env||{}).map(([k,v])=>[k,typeof v==='string'?v.replaceAll(oldHost,newHost):v]));
   Object.assign(env,{POSTGRES_HOST:newHost,POSTGRES_PRIMARY_HOST:newHost,PG_HOST:newHost,DB_HOST:newHost,POSTGRES_DATABASE:values.POSTGRES_DATABASE,POSTGRES_PRIMARY_DATABASE:values.POSTGRES_DATABASE,DB_NAME:values.POSTGRES_DATABASE,PG_DATABASE:values.POSTGRES_DATABASE,POSTGRES_USER:values.POSTGRES_USER,POSTGRES_PRIMARY_USER:values.POSTGRES_USER,DB_USER:values.POSTGRES_USER,PG_USER:values.POSTGRES_USER,POSTGRES_PASSWORD:values.POSTGRES_PASSWORD,POSTGRES_PRIMARY_PASSWORD:values.POSTGRES_PASSWORD,PG_PASSWORD:values.POSTGRES_PASSWORD,DB_PASSWORD:values.POSTGRES_PASSWORD,DB_PASS:values.POSTGRES_PASSWORD,RDS_INSTANCE_ID:target.DBInstanceIdentifier,PGSSLMODE:'verify-full',PGSSLROOTCERT:root+'/server/db/certs/aws-rds-ap-south-1.pem'});
   for(const key of Object.keys(env))if(/^(RDS_MASTER_|POSTGRES_BACKUP_|DB_ADMIN_|POSTGRES_MIGRATOR_)/.test(key))delete env[key];
   await remote('restartProcessId',{id:p.pm_id,env});
  }
  note('Services started on encrypted target; source remains fenced');
  for(let n=0;n<30;n++){try{const r=await fetch('http://127.0.0.1:8888/api/health');const b=await r.json();if(r.ok&&b.status==='healthy')break;if(n===29)throw new Error('Backend did not become healthy');}catch(e){if(n===29)throw e;}await new Promise(r=>setTimeout(r,1000));}
  unlinkSync(maintenance);execFileSync('pm2',['save'],{stdio:'ignore'});
  record.status='passed';record.finishedAt=new Date().toISOString();note('API maintenance lifted; PM2 process configuration saved');
 }
}catch(error){
 record.error=error.message;
 if(maintenanceStarted&&!servicesStarted){
  if(routingChanged){for(const name of ['POSTGRES_HOST','POSTGRES_PRIMARY_HOST','RDS_INSTANCE_ID'])if(!oldParameters.some(p=>p.Name==='/mediczy/prod/'+name))await ssm.send(new DeleteParameterCommand({Name:'/mediczy/prod/'+name}));for(const p of oldParameters)await ssm.send(new PutParameterCommand({Name:p.Name,Value:p.Value,Type:p.Type,Overwrite:true}));for(const [file,body]of Object.entries(oldFiles))writeFileSync(file,body,{mode:0o600});}
  if(fenced)await sourceDb.query('ALTER ROLE mediczy_helper LOGIN');for(const p of processes)await remote('restartProcessId',{id:p.pm_id,env:p.pm2_env.env});if(existsSync(maintenance))unlinkSync(maintenance);note('Pre-write failure: restored source routing and availability');
 }else if(servicesStarted){note('Failure after service start: source stays fenced; forward recovery required');}
 process.exitCode=1;
}finally{
 await sourceDb.end();pm2.disconnect();writeFileSync(join(dir,apply?'cutover.json':'cutover-preflight.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600});
}
console.log(JSON.stringify({mode:record.mode,status:record.status,error:record.error,steps:record.steps.length}));
