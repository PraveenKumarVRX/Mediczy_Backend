import {jest} from '@jest/globals';
import express from 'express';
import request from 'supertest';
const query=jest.fn(),tx={id:'dedicated-connection'},transaction=jest.fn(async fn=>fn(tx));
const email=jest.fn(),whatsapp=jest.fn();let role='team';
// Dates are not under test here (see checkup-closed-days.test.js): every date is open.
jest.unstable_mockModule('../services/checkup-calendar.service.js',()=>({checkupDateBlock:async()=>null,closedDates:async()=>[],isSunday:()=>false}));
jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction,QueryTypes:{SELECT:'SELECT'}}}));
jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,_res,next)=>{req.user={id:7,role,isTeam:role==='team'};next();}}));
jest.unstable_mockModule('../middleware/corporateTenant.js',()=>({requireCorporateAccess:(req,_res,next)=>{req.resolvedCorporate={id:45};next();}}));
jest.unstable_mockModule('../services/emailService.js',()=>({default:{sendOutboundEmail:email}}));
jest.unstable_mockModule('../services/whatsapp-production.service.js',()=>({default:{sendAppointmentConfirmation:whatsapp,sendSessionMessage:whatsapp}}));
jest.unstable_mockModule('../services/minio-upload.service.js',()=>({uploadToMinio:jest.fn()}));
jest.unstable_mockModule('../services/corporate-storage.service.js',()=>({ensureCorporateHealthReportsBucket:jest.fn()}));
jest.unstable_mockModule('../services/corporate-wellness-mis.service.js',()=>({computeReportSla:jest.fn()}));
const {default:router}=await import('../routes/corporate-bookings.route.js');
const {createCorporateCheckupOrder}=await import('../services/corporate-health-checkup-booking.service.js');
const app=express();app.use(express.json());app.use(router);
const payload={employeeId:9,labId:81,labName:'Diagnostic centre',corporateId:'CABCDE',testPackage:'Sales annual screening',checkupDate:'2099-01-01',checkupTime:'09:00',sendEmail:false,sendWhatsapp:false};
const employee={id:9,firstName:'Test',lastName:'Employee',email:'test@example.invalid',phoneNumber:'9999999999'};
function contextResponses(){for(let i=0;i<3;i++)query.mockResolvedValueOnce([]);}
beforeEach(()=>{role='team';query.mockReset();transaction.mockClear();email.mockClear();whatsapp.mockClear();});
test('Team booking scopes every query to the corporate transaction and persists lab ID',async()=>{
 query.mockResolvedValueOnce([employee]);contextResponses();query.mockResolvedValueOnce([{member:1}]).mockResolvedValueOnce([{id:81}]).mockResolvedValueOnce([{id:13,order_number:'CHK-SAVED'}]);
 const result=await request(app).post('/health-checkup').send(payload);
 expect(result.status).toBe(201);expect(result.body.booking.id).toBe(13);expect(result.body.notifications).toEqual({email:'skipped',whatsapp:'skipped'});
 const calls=query.mock.calls.slice(1);expect(calls.every(([,o])=>o.transaction===tx)).toBe(true);
 expect(calls.slice(0,3).map(([,o])=>o.replacements)).toEqual([{orgId:'45'},{userId:'7'},{isPlatformAdmin:'false'}]);
 expect(calls.slice(0,3).every(([sql])=>sql.includes('set_config(')&&sql.includes(', true)'))).toBe(true);
 const insert=calls.find(([sql])=>sql.includes('INSERT INTO lab_orders'));
 expect(insert[0]).toContain('lab_id');expect(insert[1].replacements).toMatchObject({corporateId:45,employeeId:9,labId:81});
 expect(email).not.toHaveBeenCalled();expect(whatsapp).not.toHaveBeenCalled();
});
test('rejects an employee outside the authorized corporate before insertion',async()=>{
 query.mockResolvedValueOnce([employee]);contextResponses();query.mockResolvedValueOnce([]);
 expect((await request(app).post('/health-checkup').send(payload)).status).toBe(403);
 expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO lab_orders'))).toBe(false);
});
test('rejects an unmapped lab before insertion',async()=>{
 query.mockResolvedValueOnce([employee]);contextResponses();query.mockResolvedValueOnce([{member:1}]).mockResolvedValueOnce([]);
 expect((await request(app).post('/health-checkup').send(payload)).status).toBe(403);
 expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO lab_orders'))).toBe(false);
});
test('a failed insert sends no notifications and does not expose policy internals',async()=>{
 query.mockResolvedValueOnce([employee]);contextResponses();query.mockResolvedValueOnce([{member:1}]).mockResolvedValueOnce([{id:81}]).mockRejectedValueOnce(new Error('new row violates row-level security policy for table lab_orders'));
 const result=await request(app).post('/health-checkup').send({...payload,sendEmail:true,sendWhatsapp:true});
 expect(result.status).toBe(500);expect(result.body.message).not.toContain('lab_orders');expect(email).not.toHaveBeenCalled();expect(whatsapp).not.toHaveBeenCalled();
});
test('history rows and count use the same corporate RLS transaction',async()=>{
 contextResponses();query.mockResolvedValueOnce([{id:13}]).mockResolvedValueOnce([{total:'1'}]);
 const result=await request(app).get('/history?corporateId=CABCDE');
 expect(result.status).toBe(200);expect(result.body).toMatchObject({bookings:[{id:13}],total:1});
 expect(query.mock.calls.every(([,o])=>o.transaction===tx)).toBe(true);
 expect(query.mock.calls.slice(3).every(([,o])=>o.replacements.corporateId===45)).toBe(true);
});
test('ordinary members cannot call the Team booking action',async()=>{role='user';expect((await request(app).post('/health-checkup').send(payload)).status).toBe(403);expect(query).not.toHaveBeenCalled();});
test.each([0,-1,'45other',null])('invalid corporate ID never opens a transaction: %s',async corporateId=>{
 await expect(createCorporateCheckupOrder({...payload,corporateId,bookedByUserId:7})).rejects.toMatchObject({status:400});expect(transaction).not.toHaveBeenCalled();
});
