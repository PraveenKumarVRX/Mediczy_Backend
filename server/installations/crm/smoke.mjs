/** Isolated-host acceptance: temporary synthetic tenant, no provider calls. */
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {request} from 'node:http';
import {postgresTls} from '../../db/postgres-tls.js';
const secretDirectory=process.env.CRM_BOOTSTRAP_SECRET_DIRECTORY||'/run/bootstrap';
const db=new pg.Client({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:process.env.POSTGRES_DATABASE,user:'medstar_owner',password:readFileSync(join(secretDirectory,'owner-password'),'utf8').trim(),ssl:postgresTls()});
const checks=[];let tenantId,userId,contactId;
async function call(path,token,method='GET',body){return new Promise((resolve,reject)=>{
 const req=request('http://api:8888'+path,{method,headers:{Host:'medstar.mediqzy.com','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(text)});}catch(error){reject(error);}});});
 req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('Request timeout')));req.end(body?JSON.stringify(body):undefined);
});}
function check(name,condition,status){checks.push({name,passed:condition,status});if(!condition)process.exitCode=1;}
try{
 await db.connect();if(process.env.CRM_TENANT_UID!=='H98VG4')throw Error('Wrong installation');
 // Signed in-process like the foreign token below: a stored admin password goes stale as soon as the
 // owner changes it, which silently disabled this suite. The admin row is read from the database.
 const adminRow=(await db.query(`SELECT u.id,u.role,u.metadata FROM users u WHERE u.tenant_id=$1 AND u.status='active' ORDER BY u.id LIMIT 1`,[Number(process.env.CRM_TENANT_ID)])).rows[0];
 if(!adminRow)throw Error('No active administrator');
 const token=jwt.sign({id:adminRow.id,role:adminRow.role,isCRM:true,userType:'crm',tenantId:Number(process.env.CRM_TENANT_ID||70),crmRole:adminRow.metadata?.crmRole||'admin',tokenType:'access',jti:randomUUID()},process.env.JWT_SECRET,{expiresIn:120});
 const login={data:{crmUser:{id:adminRow.id}}};let r0=await call('/api/crm/profile',token);check('administrator session',r0.status===200,r0.status);
 const stamp=randomUUID().replaceAll('-','').slice(0,12);
 const fixture=(await db.query(`INSERT INTO tenants(uid,name,slug,subdomain,type,email,phone,address,plan,status,settings,metadata,created_at,updated_at) VALUES($1,'CRM Isolation QA',$2,$2,'hospital',$3,'0000000000','{}','free','active','{}','{"synthetic_acceptance":true}',now(),now()) RETURNING id,unique_id`,[randomUUID(),'isolation-'+stamp,'qa-'+stamp+'@example.invalid'])).rows[0];tenantId=fixture.id;
 const user=(await db.query(`INSERT INTO users("firstName","lastName",email,password,"phoneNumber",role,status,"isAdmin","isTeam",tenant_id,organization_id,organization_type,organization_uid,metadata,"createdAt","updatedAt") VALUES('Isolation','QA',$1,'not-a-login-password','0000000000','team','active',false,true,$2,$2,'hospital',$3,$4,now(),now()) RETURNING id`,['foreign-'+stamp+'@example.invalid',tenantId,fixture.unique_id,JSON.stringify({isCRM:true,crmRole:'admin',tenantId})])).rows[0];userId=user.id;
 contactId=(await db.query(`INSERT INTO crm_contacts(name,email,created_by,tenant_uid) VALUES($1,$2,$3,$4) RETURNING id`,['Foreign QA '+stamp,'contact-'+stamp+'@example.invalid',userId,fixture.unique_id])).rows[0].id;
 const foreign=jwt.sign({id:userId,role:'team',isCRM:true,userType:'crm',tenantId,crmRole:'admin',tokenType:'access',jti:randomUUID()},process.env.JWT_SECRET,{expiresIn:120});
 for(const path of ['/api/crm/profile','/api/crm/leads']){const result=await call(path,foreign);check('foreign tenant denied '+path,result.status===403,result.status);}
 let result=await call('/api/crm/contacts?search='+stamp,token);check('foreign contact absent from list',result.status===200&&result.data.data.length===0,result.status);
 result=await call('/api/crm/contacts/'+contactId,token,'PUT',{notes:'must not apply'});check('foreign contact update denied',result.status===404,result.status);
 result=await call('/api/crm/contacts/'+contactId,token,'DELETE');check('foreign contact deletion denied',result.status===404,result.status);
 const bad=jwt.sign({id:login.data.crmUser.id,isCRM:true,tokenType:'access'},'a-different-installation-secret',{expiresIn:120});
 result=await call('/api/crm/profile',bad);check('different installation signing key denied',result.status===401,result.status);
 const remaining=(await db.query('SELECT id FROM crm_contacts WHERE id=$1',[contactId])).rows;check('foreign fixture unchanged',remaining.length===1,200);
}finally{
 if(contactId)await db.query('DELETE FROM crm_contacts WHERE id=$1',[contactId]);
 if(userId)await db.query('DELETE FROM users WHERE id=$1',[userId]);
 if(tenantId)await db.query('DELETE FROM tenants WHERE id=$1',[tenantId]);
 await db.end();console.log(JSON.stringify({checks,providerCalls:0,fixtureRemoved:true}));
}
