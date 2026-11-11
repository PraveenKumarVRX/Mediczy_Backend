import {jest} from '@jest/globals';import express from 'express';import request from 'supertest';
const query=jest.fn(),save=jest.fn(),send=jest.fn(),wa=jest.fn(),sign=jest.fn();
jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction:async fn=>fn({}),QueryTypes:{SELECT:'SELECT',UPDATE:'UPDATE'}}}));
jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,_res,next)=>{req.user={id:7,role:'team',isTeam:true};next();}}));
jest.unstable_mockModule('../middleware/corporateTenant.js',()=>({requireCorporateAccess:(req,_res,next)=>{req.resolvedCorporate={id:45};next();}}));
jest.unstable_mockModule('../services/corporate-health-reports.service.js',()=>({saveCorporateHealthReports:save}));
jest.unstable_mockModule('../services/corporate-report-storage-client.js',()=>({corporateReportDownloadUrl:sign}));
jest.unstable_mockModule('../services/emailService.js',()=>({default:{sendOutboundEmail:send}}));
jest.unstable_mockModule('../services/whatsapp-production.service.js',()=>({default:{sendSessionMessage:wa}}));
jest.unstable_mockModule('../services/corporate-wellness-mis.service.js',()=>({computeReportSla:()=>({dueAt:new Date('2026-10-30'),status:'on_time'})}));
const {default:router}=await import('../routes/corporate-bookings.route.js');const app=express();app.use(express.json());app.use(router);
const employee={id:9,firstName:'Test',lastName:'Employee',email:'patient@example.invalid',phoneNumber:'9999999999'};
beforeEach(()=>{query.mockReset();save.mockReset();send.mockReset().mockResolvedValue({id:'sent'});wa.mockReset();sign.mockReset().mockImplementation(async key=>`https://storage.example/signed/${key}`);query.mockImplementation(async sql=>sql.includes('FROM users WHERE id')?[employee]:sql.includes('FROM user_associations')?[{id:1}]:[]);});
test('seven uploaded reports generate one email with seven fresh links and correct flags',async()=>{
 save.mockResolvedValue(Array.from({length:7},(_,i)=>({id:i+1,patientReportId:11+i,key:`file-${i}`,bucket:'pacs-entity-001',reportName:`Report ${i+1}`,mimeType:'application/pdf'})));
 const result=await request(app).post('/reports/upload').field('employeeId','9').field('corporateId','45').field('reportName','Annual health checkup').field('reportType','annual_health_checkup').field('reportDate','2026-10-28').field('sendEmail','true').field('sendWhatsapp','false').attach('reports',Buffer.from('%PDF-test'),'test.pdf');
 expect(result.status).toBe(201);expect(send).toHaveBeenCalledTimes(1);expect(wa).not.toHaveBeenCalled();for(let i=0;i<7;i++)expect(send.mock.calls[0][1].htmlContent).toContain(`https://storage.example/signed/file-${i}`);
 const flag=query.mock.calls.find(([sql])=>sql.includes('notified_email=TRUE'));expect(flag[0]).toContain('IN (:ids)');expect(flag[1].replacements.ids).toEqual([1,2,3,4,5,6,7]);
});
test('resharing a private report uses its actual report-array email shape and refreshed link',async()=>{
 const row={id:1,corporate_id:45,employee_id:9,firstName:'Test',lastName:'Employee',email:'patient@example.invalid',phoneNumber:'9999999999',report_name:'Annual health checkup',report_type:'annual_health_checkup',report_date:'2026-10-28',s3_key:'file-1',report_url:'old',mime_type:'application/pdf',storage_metadata:{storageBackend:'corporate_minio',bucket:'pacs-entity-001'}};
 query.mockImplementation(async sql=>sql.includes('SELECT chr.*')?[row]:[]);
 const result=await request(app).post('/reports/1/share').send({corporateId:45,sendEmail:true,sendWhatsapp:false});expect(result.status).toBe(200);expect(result.body.notifications.email).toBe('sent');expect(send.mock.calls[0][1].htmlContent).toContain('https://storage.example/signed/file-1');expect(wa).not.toHaveBeenCalled();
});
test('report IDs cannot be shared from another selected corporate',async()=>{
 query.mockResolvedValue([{id:1,corporate_id:5}]);expect((await request(app).post('/reports/1/share').send({corporateId:45})).status).toBe(404);expect(send).not.toHaveBeenCalled();
});
