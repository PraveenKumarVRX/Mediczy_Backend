import {jest} from '@jest/globals';
import request from 'supertest';
import express from 'express';
(process.env.CORPORATE_REPORTS_SQL_INTEGRATION==='1'?describe:describe.skip)('corporate seven-report batch on production schema (rollback-only)',()=>{
 let db,tx,app,staff,employee,uploaded,initialCounts;const corporateId=45;
 const email=jest.fn(),whatsapp=jest.fn();
 beforeAll(async()=>{
  ({postgresSequelize:db}=await import('../db/postgres-sequelize.js'));tx=await db.transaction();
  const query=(sql,options={})=>db.query(sql,{...options,transaction:tx});const q=sql=>query(sql,{type:db.QueryTypes.SELECT});
  const teams=await q(`SELECT id,metadata FROM users WHERE "isTeam"=true AND COALESCE("isAdmin",false)=false AND LOWER(status::text)='active' ORDER BY id`);
  staff=teams.find(u=>{let m=u.metadata||{};if(typeof m==='string'){try{m=JSON.parse(m);}catch{m={};}}return m.accessLevel==='full'||(m.permissions||[]).some(p=>String(p).toLowerCase().includes('corporate management'));});
  [employee]=await q(`SELECT "userId" AS id FROM user_associations WHERE "entityId"=45 AND "entityType"='corporate' AND role='employee' AND status='active' ORDER BY "userId" LIMIT 1`);
  if(!staff||!employee)throw new Error('Existing authorized Team user and corporate employee required');
  initialCounts=await q(`SELECT (SELECT COUNT(*)::int FROM corporate_health_reports WHERE corporate_id=45) AS corporate,(SELECT COUNT(*)::int FROM reports WHERE metadata->>'source'='team_corporate_health_upload' AND metadata->>'corporateId'='45') AS patient`);
  jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction:async fn=>fn(tx),QueryTypes:db.QueryTypes}}));
  jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,_res,next)=>{req.user={...staff,role:'team',isTeam:true};req.userType='team';req.userRole='team';next();}}));
  let index=0;
  jest.unstable_mockModule('../services/minio-upload.service.js',()=>({uploadToMinio:async()=>({key:`_db-rollback-probe/${process.pid}-${++index}`,url:'https://example.invalid/private-report'})}));
  jest.unstable_mockModule('../services/corporate-storage.service.js',()=>({ensureCorporateHealthReportsBucket:async()=>({bucket:'pacs-entity-001'})}));
  jest.unstable_mockModule('../services/corporate-report-storage-client.js',()=>({getCorporateReportClient:()=>({}),corporateStoredFileUrl:()=>'',corporateReportDownloadUrl:async key=>`https://example.invalid/signed/${key}`,deleteCorporateReportObject:async()=>{}}));
  jest.unstable_mockModule('../services/emailService.js',()=>({default:{sendOutboundEmail:email}}));
  jest.unstable_mockModule('../services/whatsapp-production.service.js',()=>({default:{sendSessionMessage:whatsapp,sendAppointmentConfirmation:whatsapp}}));
  const {default:router}=await import('../routes/corporate-bookings.route.js');app=express();app.use(express.json());app.use(router);
 });
 afterAll(async()=>{
  if(tx)await tx.rollback();
  if(db){if(initialCounts){const after=await db.query(`SELECT (SELECT COUNT(*)::int FROM corporate_health_reports WHERE corporate_id=45) AS corporate,(SELECT COUNT(*)::int FROM reports WHERE metadata->>'source'='team_corporate_health_upload' AND metadata->>'corporateId'='45') AS patient`,{type:db.QueryTypes.SELECT});expect(after).toEqual(initialCounts);}await db.close();}
 });
 test('multipart seven-file upload creates exactly seven corporate and seven employee records',async()=>{
  let req=request(app).post('/reports/upload').field('employeeId',String(employee.id)).field('corporateId','45').field('reportName','Synthetic batch verification').field('reportType','pre_employment').field('reportDate','2026-10-28').field('sendEmail','false').field('sendWhatsapp','false');
  for(let i=0;i<7;i++)req=req.attach('reports',Buffer.from('%PDF-1.4\nSynthetic non-patient verification\n%%EOF'),`synthetic-${i}.pdf`);
  const result=await req;expect(result.status).toBe(201);expect(result.body.reports).toHaveLength(7);uploaded=result.body.reports;
  expect(uploaded.every(r=>r.id&&r.patientReportId&&r.reportUrl.startsWith('https://example.invalid/signed/'))).toBe(true);expect(email).not.toHaveBeenCalled();expect(whatsapp).not.toHaveBeenCalled();
 });
 test('Team report listing shows all seven once with fresh download links',async()=>{
  const result=await request(app).get(`/reports?corporateId=45&employeeId=${employee.id}`);expect(result.status).toBe(200);
  const ids=new Set(uploaded.map(r=>r.id));const saved=result.body.reports.filter(r=>r.source==='manual'&&ids.has(r.id));expect(saved).toHaveLength(7);expect(saved.every(r=>r.report_url.startsWith('https://example.invalid/signed/'))).toBe(true);
 });
 test('paired patient records retain corporate ownership and private storage metadata',async()=>{
  const records=await db.query(`SELECT "userId",organization_id,metadata FROM reports WHERE id IN (:ids)`,{replacements:{ids:uploaded.map(r=>r.patientReportId)},transaction:tx,type:db.QueryTypes.SELECT});
  expect(records).toHaveLength(7);expect(records.every(r=>r.userId===employee.id&&r.organization_id===corporateId&&r.metadata.bucket==='pacs-entity-001'&&r.metadata.storageBackend==='corporate_minio')).toBe(true);
 });
});
