import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import pg from 'pg';
const bin='/usr/lib/postgresql/16/bin';
test('fresh CRM bootstrap is isolated, least-privilege and restart-safe',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'medstar-bootstrap-'));let started=false,db;
 try{
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  execFileSync(bin+'/initdb',['-D',dir+'/pg','-U','medstar_owner','-A','trust','--no-locale'],{stdio:'ignore'});
  execFileSync(bin+'/pg_ctl',['-D',dir+'/pg','-l',dir+'/log','-o',`-F -h 127.0.0.1 -p ${port} -k ${dir}`,'-w','start'],{stdio:'ignore'});started=true;
  execFileSync(bin+'/psql',['-h','127.0.0.1','-p',String(port),'-U','medstar_owner','-d','postgres','-v','ON_ERROR_STOP=1','--single-transaction','-f',new URL('../installations/crm/schema.sql',import.meta.url).pathname],{stdio:'ignore'});
  writeFileSync(dir+'/owner-password','test-only',{mode:0o600});writeFileSync(dir+'/admin.json',JSON.stringify({email:'info@medstarhospitals.com',password:'test-only-never-a-live-password'}),{mode:0o600});
  const env={...process.env,NODE_ENV:'test',CRM_BOOTSTRAP_SECRET_DIRECTORY:dir,CRM_TENANT_ID:'70',CRM_TENANT_UID:'H98VG4',CRM_PUBLIC_ORIGIN:'https://medstar.mediqzy.com',POSTGRES_HOST:'127.0.0.1',POSTGRES_PORT:String(port),POSTGRES_DATABASE:'postgres',POSTGRES_USER:'medstar_app',POSTGRES_PASSWORD:'a'.repeat(64),POSTGRES_SSL:'false',POSTGRES_PRIMARY_HOST:'127.0.0.1',POSTGRES_PRIMARY_PORT:String(port),POSTGRES_PRIMARY_DATABASE:'postgres',POSTGRES_PRIMARY_USER:'medstar_app',POSTGRES_PRIMARY_PASSWORD:'a'.repeat(64)};
  const run=()=>execFileSync(process.execPath,[new URL('../installations/crm/bootstrap.mjs',import.meta.url).pathname],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.match(run(),/administratorCreated/);
  db=new pg.Client({host:'127.0.0.1',port,user:'medstar_owner',database:'postgres'});await db.connect();
  const before=(await db.query('SELECT id,password,metadata,"isAdmin",organization_uid FROM users')).rows;
  assert.equal(before.length,1);assert.equal(before[0].metadata.crmRole,'admin');assert.equal(before[0].isAdmin,false);assert.equal(before[0].organization_uid,'H98VG4');
  const role=(await db.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,has_schema_privilege('medstar_app','public','CREATE') AS ddl FROM pg_roles WHERE rolname='medstar_app'")).rows[0];
  assert.deepEqual(role,{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false,ddl:false});
  assert.match(run(),/already applied/);assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count,1);
  assert.equal((await db.query('SELECT password FROM users')).rows[0].password,before[0].password);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM crm_leads')).rows[0].count,0);
  const upgrade=()=>execFileSync(process.execPath,[new URL('../installations/crm/upgrade-workspace.mjs',import.meta.url).pathname],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.match(upgrade(),/upgrade applied/);assert.match(upgrade(),/upgrade applied/);
  assert.equal((await db.query("SELECT has_table_privilege('medstar_app','communication_workspace_messages','INSERT') AS allowed")).rows[0].allowed,true);
  assert.equal((await db.query("SELECT has_schema_privilege('medstar_app','public','CREATE') AS allowed")).rows[0].allowed,false);
 }finally{if(db)await db.end();if(started)execFileSync(bin+'/pg_ctl',['-D',dir+'/pg','-m','immediate','stop'],{stdio:'ignore'});rmSync(dir,{recursive:true,force:true});}
});
