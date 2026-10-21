/** Read-only live release checks: no booking, notification, configuration or calling requests. */
import {writeFileSync} from 'node:fs';
import jwt from 'jsonwebtoken';
import {postgresSequelize as db} from '../../db/postgres-sequelize.js';
const output=process.env.CROSS_PORTAL_SMOKE_OUTPUT;
if(!output)throw new Error('CROSS_PORTAL_SMOKE_OUTPUT private JSON path required');
const base='https://app.mediqzy.com',checks=[];
const select=(sql,replacements={})=>db.query(sql,{replacements,type:db.QueryTypes.SELECT});
const token=(identity,extra={})=>jwt.sign({id:identity.id,userId:identity.id,tokenType:'access',...extra},process.env.JWT_SECRET,{expiresIn:600});
async function check(name,path,auth,validate,status=200){
 const response=await fetch(base+path,{headers:auth?{Authorization:`Bearer ${auth}`}:{},signal:AbortSignal.timeout(20000)});
 let body;try{body=await response.json();}catch{body={};}
 checks.push({name,path,status:response.status,expected:status,passed:response.status===status&&validate(body)});return body;
}
try{
 const [corporate]=await select(`SELECT id FROM corporates WHERE id=3 AND LOWER(status)='active'`);
 const [admin]=await select(`SELECT id FROM users WHERE "isAdmin"=true AND status='active' ORDER BY id LIMIT 1`);
 const [crm]=await select(`SELECT u.id FROM users u WHERE u.status='active' AND u.metadata->>'crmRole' IN ('admin','business_head') AND (u.organization_uid IS NOT NULL OR u.tenant_id IS NOT NULL) ORDER BY (u.metadata->>'crmRole'='admin') DESC,u.id LIMIT 1`);
 if(!corporate||!admin)throw new Error('Existing active corporate and admin identities required');
 const hr=token(corporate,{role:'corporate',userType:'corporate',corporateId:corporate.id,organization_id:corporate.id});
 const adminToken=token(admin,{role:'admin',userType:'admin',isAdmin:true});
 const [count]=await select(`SELECT COUNT(*)::int AS total FROM corporate_employees WHERE corporate_id=:id AND "isActive"=true`,{id:corporate.id});
 await check('HR active roster matches database','/api/corporate/employees',hr,b=>b.data?.employees?.length===count.total);
 await check('HR inactive roster can be listed','/api/corporate/employees?status=inactive',hr,b=>Array.isArray(b.data?.employees));
 const notifications=await check('HR notification inbox','/api/corporate/notifications',hr,b=>Array.isArray(b.data?.notifications));
 await check('HR unread badge matches inbox','/api/corporate/notifications/unread-count',hr,b=>b.data?.count===notifications.data?.notifications?.filter(n=>!n.read).length);
 await check('HR analytics has real roster departments and absent unmeasured scores','/api/corporate/dashboard/health-analytics',hr,b=>b.data?.totalEmployees===count.total&&Array.isArray(b.data?.departmentRisks)&&b.data.departmentRisks.reduce((sum,r)=>sum+r.totalEmployees,0)===count.total);
 const [participants]=await select(`SELECT COUNT(*)::int AS total FROM corporate_employees ce WHERE ce.corporate_id=:id AND ce."isActive"=true AND (EXISTS(SELECT 1 FROM corporate_scheduled_appointments a WHERE a.corporate_id=ce.corporate_id AND a."employeeId"=ce."employeeId" AND LOWER(a.status)='completed') OR EXISTS(SELECT 1 FROM corporate_ahc_enrollments e WHERE e.corporate_id=ce.corporate_id AND e.employee_id=ce."employeeId" AND e.status='completed'))`,{id:corporate.id});
 await check('Participation excludes unused enrollment','/api/corporate/analytics/participation',hr,b=>b.data?.totalEligible===count.total&&b.data?.totalParticipating===participants.total);
 await check('Combined HR and employee appointments returns valid scoped rows','/api/corporate/all-appointments',hr,b=>Array.isArray(b.data?.appointments)&&b.data.appointments.every(a=>['hr_booked','employee_booked'].includes(a.source)));
 const batches=await check('AHC batches','/api/corporate/ahc/batches',hr,b=>Array.isArray(b.data?.batches));
 const batch=batches.data?.batches?.[0];
 if(batch)await check('AHC enrollment names and departments resolve','/api/corporate/ahc/batches/'+encodeURIComponent(batch.id)+'/enrollments',hr,b=>Array.isArray(b.data?.enrollments)&&b.data.enrollments.every(e=>e.employeeName&&e.name&&e.department));
 await check('HR wellness events include invitation metadata','/api/corporate/wellness-calendar/activities',hr,b=>Array.isArray(b.data?.activities)&&b.data.activities.every(a=>Object.hasOwn(a,'participantSelection')&&Object.hasOwn(a,'totalInvited')));
 await check('Team report and certificate employee picker resolves the HR roster','/api/corporate-bookings/employees?corporateId='+corporate.id,adminToken,b=>Array.isArray(b.employees)&&b.employees.every(e=>e.department));
 await check('Corporate package billing source','/api/corporate/my-benefits',hr,b=>typeof b.data?.linkedPlan==='boolean');
 await check('Unauthenticated contact center denied','/api/crm/contact-center',null,()=>true,401);
 if(!crm)throw new Error('No existing CRM identity with resolved organization available for provider smoke');
 const crmToken=token(crm,{role:'crm',userType:'crm',isCRM:true});
 await check('Contact center exposes six providers without changing configuration','/api/crm/contact-center',crmToken,b=>['exotel','telecmi','zoom_phone','airtel_iq','twilio','plivo'].every(id=>b.providerOptions?.some(p=>p.id===id))&&typeof b.providerConfigured==='boolean');
 const result={at:new Date().toISOString(),productionMutations:0,liveCalls:0,passed:checks.every(c=>c.passed),checks};
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.passed)}));if(!result.passed)process.exitCode=1;
}catch(error){writeFileSync(output,JSON.stringify({passed:false,productionMutations:0,liveCalls:0,checks,error:error.message},null,2)+'\n',{mode:0o600});throw error;}finally{await db.close();}
