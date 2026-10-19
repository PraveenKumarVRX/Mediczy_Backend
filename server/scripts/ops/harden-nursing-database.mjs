/** Explicit production operation; never imported by the application startup. */
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';
import { Client } from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { postgresTls } from '../../db/postgres-tls.js';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
const apply=args.includes('--apply');
if(!args.includes('--expected-host')||!args.includes('--evidence'))throw new Error('Supply --expected-host and --evidence; default is a rollback-only rehearsal');
const expected=option('--expected-host'),region=process.env.AWS_REGION||'ap-south-1';
const ssm=new SSMClient({region});
const res=await ssm.send(new GetParametersCommand({Names:['POSTGRES_HOST','POSTGRES_DATABASE','POSTGRES_PASSWORD','POSTGRES_USER','RDS_MASTER_PASSWORD','RDS_INSTANCE_ID'].map(k=>'/mediczy/prod/'+k),WithDecryption:true}));
const settings=Object.fromEntries(res.Parameters.map(p=>[p.Name.split('/').at(-1),p.Value]));
if(settings.POSTGRES_HOST!==expected || settings.POSTGRES_DATABASE!=='mediczy_prod' || settings.POSTGRES_USER!=='mediczy_helper')throw new Error('Unexpected production target');
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region',region,'--output','json'],{encoding:'utf8'}));
const instanceId=settings.RDS_INSTANCE_ID||'mediczy-prod';
if(!['mediczy-prod','mediczy-prod-encrypted-20261019'].includes(instanceId))throw new Error('Unexpected RDS identifier');
const instance=aws('rds','describe-db-instances','--db-instance-identifier',instanceId).DBInstances[0];
if(instance.Endpoint.Address!==expected)throw new Error('RDS endpoint mismatch');
if(apply){if(!args.includes('--snapshot'))throw new Error('Apply requires a current --snapshot');const snap=aws('rds','describe-db-snapshots','--db-snapshot-identifier',option('--snapshot')).DBSnapshots[0];if(snap.Status!=='available'||snap.DBInstanceIdentifier!==instanceId||Date.now()-Date.parse(snap.SnapshotCreateTime)>3600000)throw new Error('Recovery snapshot must be available and under one hour old');}
let password=settings.RDS_MASTER_PASSWORD;
if(instance.MasterUserSecret){const secret=aws('secretsmanager','get-secret-value','--secret-id',instance.MasterUserSecret.SecretArn);password=JSON.parse(secret.SecretString).password;}
const ssl=postgresTls({NODE_ENV:'production',POSTGRES_HOST:expected});
const client=new Client({host:expected,database:settings.POSTGRES_DATABASE,user:'postgres',password,ssl,connectionTimeoutMillis:10000,application_name:'mediqzy-hardening-deployment'});
await client.connect();
const sql=readFileSync(new URL('../../../infra/database/nursing-ownership.sql',import.meta.url),'utf8');
const record={at:new Date().toISOString(),mode:apply?'apply':'rollback-only-rehearsal',host:expected,sqlSha256:createHash('sha256').update(sql).digest('hex')};
try{await client.query(apply?sql:sql.replace(/COMMIT;\s*$/,'ROLLBACK;'));record.result='passed';}
catch(e){await client.query('ROLLBACK');record.result='failed';record.errorCode=e.code;throw e;}
finally{await client.end();writeFileSync(option('--evidence'),JSON.stringify(record,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(record));
