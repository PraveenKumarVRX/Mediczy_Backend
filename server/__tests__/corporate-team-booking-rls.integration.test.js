import {jest} from '@jest/globals';
import express from 'express';
import request from 'supertest';

(process.env.CORPORATE_BOOKING_SQL_INTEGRATION==='1'?describe:describe.skip)('Team booking against production RLS (rolled back)',()=>{
 let db,outer,app,staff,employee,lab,orderNumber;
 const corporateId=Number(process.env.CORPORATE_BOOKING_CORPORATE_ID||45);
 beforeAll(async()=>{
  ({postgresSequelize:db}=await import('../db/postgres-sequelize.js'));
  outer=await db.transaction();
  const query=(sql,options={})=>db.query(sql,{...options,transaction:outer});
  const select=sql=>query(sql,{type:db.QueryTypes.SELECT});
  const teams=await select(`SELECT id,metadata,"isTeam","isAdmin",email FROM users WHERE "isTeam"=true AND COALESCE("isAdmin",false)=false AND LOWER(status::text)='active' ORDER BY id`);
  const assigned=await select(`SELECT "userId" AS id FROM user_associations WHERE "entityType"='corporate' AND "entityId"=${corporateId} AND status='active'`);
  staff=teams.find(u=>{let m=u.metadata||{};if(typeof m==='string'){try{m=JSON.parse(m);}catch{m={};}}return assigned.some(a=>a.id===u.id)||m.accessLevel==='full'||(m.permissions||[]).some(p=>String(p).toLowerCase().includes('corporate management'));});
  [employee]=await select(`SELECT a."userId" AS id FROM user_associations a WHERE a."entityId"=${corporateId} AND a."entityType"='corporate' AND a.role='employee' AND a.status='active' ORDER BY a."userId" LIMIT 1`);
  [lab]=await select(`SELECT l.id,l.name FROM labs l JOIN corporate_network_assignments n ON n.partner_id=l.id AND n.partner_type='lab' WHERE n.corporate_id=${corporateId} AND LOWER(l.status::text)='active' ORDER BY l.id LIMIT 1`);
  if(!staff||!employee||!lab)throw new Error('Existing authorized Team user, employee and mapped lab required');
  jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction:async fn=>fn(outer),QueryTypes:db.QueryTypes}}));
  jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,_res,next)=>{req.user={...staff,role:'team',isTeam:true};req.userRole='team';req.userType='team';next();}}));
  jest.unstable_mockModule('../services/emailService.js',()=>({default:{sendOutboundEmail:jest.fn()}}));
  jest.unstable_mockModule('../services/whatsapp-production.service.js',()=>({default:{sendAppointmentConfirmation:jest.fn(),sendSessionMessage:jest.fn()}}));
  jest.unstable_mockModule('../services/minio-upload.service.js',()=>({uploadToMinio:jest.fn()}));
  jest.unstable_mockModule('../services/corporate-storage.service.js',()=>({ensureCorporateHealthReportsBucket:jest.fn()}));
  jest.unstable_mockModule('../services/corporate-wellness-mis.service.js',()=>({computeReportSla:jest.fn()}));
  const {default:router}=await import('../routes/corporate-bookings.route.js');
  app=express();app.use(express.json());app.use(router);
 });
 afterAll(async()=>{
  if(outer){await outer.rollback();outer=null;}
  if(db){
   if(orderNumber){
    // The test's mocked query binds outer, so verify cleanup on a fresh native transaction.
    await db.transaction(async transaction=>{
     await db.query("SELECT set_config('app.current_org_id',:org,true),set_config('app.current_user_id','0',true),set_config('app.is_platform_admin','false',true)",{replacements:{org:String(corporateId)},transaction});
     const rows=await db.query('SELECT id FROM lab_orders WHERE order_number=:orderNumber',{replacements:{orderNumber},transaction,type:db.QueryTypes.SELECT});expect(rows).toHaveLength(0);
    });
   }
   await db.close();
  }
 });
 test('actual Team POST handler creates the lab order with notifications disabled',async()=>{
  const result=await request(app).post('/health-checkup').send({employeeId:employee.id,labId:lab.id,labName:lab.name,corporateId,testPackage:'Sales health-checkup rollback verification',checkupDate:'2099-01-01',checkupTime:'09:00',sendEmail:false,sendWhatsapp:false});
  expect(result.status).toBe(201);expect(result.body.booking.id).toEqual(expect.any(Number));orderNumber=result.body.booking.orderNumber;
  expect(result.body.notifications).toEqual({email:'skipped',whatsapp:'skipped'});
  const [saved]=await db.query('SELECT lab_id,organization_id,patient_id FROM lab_orders WHERE order_number=:orderNumber',{replacements:{orderNumber},transaction:outer,type:db.QueryTypes.SELECT});
  expect(saved).toMatchObject({lab_id:lab.id,organization_id:corporateId,patient_id:employee.id});
 });
 test('actual Team history handler sees the order in the correct corporate',async()=>{
  const result=await request(app).get(`/history?corporateId=${corporateId}`);
  expect(result.status).toBe(200);expect(result.body.bookings.some(b=>b.order_number===orderNumber)).toBe(true);expect(result.body.total).toBeGreaterThan(0);
 });
});
