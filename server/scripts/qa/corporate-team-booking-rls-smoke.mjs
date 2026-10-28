/** Real production schema/RLS probe. Every order insert is rolled back; no notification code runs. */
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {postgresSequelize as db} from '../../db/postgres-sequelize.js';
import {setRlsContext} from '../../middleware/rls-context.middleware.js';
import {createCorporateCheckupOrder} from '../../services/corporate-health-checkup-booking.service.js';
const output=process.env.CORPORATE_BOOKING_SMOKE_OUTPUT;
if(!output)throw new Error('CORPORATE_BOOKING_SMOKE_OUTPUT evidence path is required');
const corporateId=Number(process.env.CORPORATE_BOOKING_CORPORATE_ID||45),checks=[];
const check=(name,passed)=>{checks.push({name,passed});if(!passed)throw new Error(name);};
const query=(sql,replacements={},transaction)=>db.query(sql,{replacements,transaction,type:db.QueryTypes.SELECT});
let transaction;
const orderNumber=`CHK-${corporateId}-RLS-SMOKE-${randomUUID().slice(0,12)}`;
try {
 const [role]=await query(`SELECT r.rolsuper,r.rolbypassrls,c.relrowsecurity,c.relforcerowsecurity FROM pg_roles r JOIN pg_class c ON c.oid='lab_orders'::regclass WHERE r.rolname=current_user`);
 check('Runtime database role enforces forced RLS',!!role&&!role.rolsuper&&!role.rolbypassrls&&role.relrowsecurity&&role.relforcerowsecurity);
 const [staff]=await query(`SELECT id FROM users WHERE ("isTeam"=true OR "isAdmin"=true) AND LOWER(status::text)='active' ORDER BY "isAdmin",id LIMIT 1`);
 const [employee]=await query(`SELECT a."userId" AS id FROM user_associations a WHERE a."entityId"=:corporateId AND a."entityType"='corporate' AND a.role='employee' AND a.status='active' AND a."userId"<>:staffId ORDER BY a."userId" LIMIT 1`,{corporateId,staffId:staff?.id});
 const [lab]=await query(`SELECT l.id FROM labs l JOIN corporate_network_assignments n ON n.partner_id=l.id AND n.partner_type='lab' WHERE n.corporate_id=:corporateId AND LOWER(l.status::text)='active' ORDER BY l.id LIMIT 1`,{corporateId});
 if(!staff||!employee||!lab)throw new Error('Existing staff, corporate employee and mapped lab are required');
 transaction=await db.transaction();
 await setRlsContext(transaction,{orgId:0,userId:staff.id,isPlatformAdmin:false});
 await query('SAVEPOINT original_missing_context',{},transaction);
 let rejected=false;
 try {await query(`INSERT INTO lab_orders (order_number,patient_id,test_type,test_category,status,organization_id) VALUES (:orderNumber,:employeeId,'Rollback-only verification','corporate_health_checkup','pending',:corporateId)`,{orderNumber,employeeId:employee.id,corporateId},transaction);}
 catch(error){rejected=error.original?.code==='42501';}
 await query('ROLLBACK TO SAVEPOINT original_missing_context',{},transaction);
 check('Original missing-context insert reproduces row-security failure',rejected);
 const order=await createCorporateCheckupOrder({corporateId,employeeId:employee.id,labId:lab.id,bookedByUserId:staff.id,orderNumber,testPackage:'Rollback-only verification',notes:'Transactional RLS smoke test; never committed'},transaction);
 const [saved]=await query('SELECT id,lab_id,patient_id,organization_id FROM lab_orders WHERE order_number=:orderNumber',{orderNumber},transaction);
 check('Corrected service inserts with the real runtime policy',saved?.id===order.id&&saved.lab_id===lab.id&&saved.patient_id===employee.id&&saved.organization_id===corporateId);
 const [context]=await query(`SELECT current_setting('app.current_org_id',true) AS org,current_setting('app.is_platform_admin',true) AS platform_admin`,{},transaction);
 check('Booking uses corporate context with admin bypass disabled',context.org===String(corporateId)&&context.platform_admin==='false');
 await setRlsContext(transaction,{orgId:0,userId:staff.id,isPlatformAdmin:false});
 const wrongContext=await query('SELECT id FROM lab_orders WHERE order_number=:orderNumber',{orderNumber},transaction);
 check('A different organization cannot read the saved order',wrongContext.length===0);
 await transaction.rollback();transaction=null;
 await db.transaction(async tx=>{
  await setRlsContext(tx,{orgId:corporateId,userId:staff.id,isPlatformAdmin:false});
  const remaining=await query('SELECT id FROM lab_orders WHERE order_number=:orderNumber',{orderNumber},tx);
  check('Rollback leaves no production test booking behind',remaining.length===0);
 });
} catch(error){checks.push({name:'Smoke run completed',passed:false,message:error.message});process.exitCode=1;}
finally {if(transaction)await transaction.rollback().catch(()=>{});await db.close();const result={at:new Date().toISOString(),corporateId,passed:checks.every(c=>c.passed),committedTestBookings:0,notificationsSent:0,checks};writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));}
