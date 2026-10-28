import {jest} from '@jest/globals';
import express from 'express';
import request from 'supertest';
(process.env.HEALTH_PACKAGE_ASSIGNMENT_SQL_INTEGRATION==='1'?describe:describe.skip)('Dairy Day package employee management (production rollback)',()=>{
 let db,tx,app,sales,other,employeeId,before;
 beforeAll(async()=>{
  ({postgresSequelize:db}=await import('../db/postgres-sequelize.js'));tx=await db.transaction();
  const query=(sql,options={})=>db.query(sql,{...options,transaction:tx});
  const select=(sql,replacements={})=>query(sql,{replacements,type:db.QueryTypes.SELECT});
  const teams=await select(`SELECT id,metadata FROM users WHERE "isTeam"=true AND COALESCE("isAdmin",false)=false AND LOWER(status::text)='active' ORDER BY id`);
  const staff=teams.find(u=>{let m=u.metadata||{};if(typeof m==='string'){try{m=JSON.parse(m);}catch{m={};}}return m.accessLevel==='full'||(m.permissions||[]).some(p=>['corporate management','corporate management access','all access'].includes(String(p).toLowerCase()));});
  [sales]=await select(`SELECT id,corporate_id,max_users FROM corporate_health_package_catalog WHERE corporate_id=45 AND name ILIKE '%sales%' LIMIT 1`);
  [other]=await select(`SELECT id FROM corporate_health_package_catalog WHERE corporate_id=45 AND name ILIKE '%pre%employment%' LIMIT 1`);
  if(!staff||!sales||!other)throw new Error('Existing Team user and both Dairy Day packages required');
  before=await select(`SELECT "userId","packageId",status,"validFrom","validTo","usedAt" FROM user_health_packages WHERE corporate_id=45 AND "packageId" IN (:ids) ORDER BY "packageId","userId"`,{ids:[sales.id,other.id]});
  const candidate=await select(`SELECT h."userId" AS id FROM user_health_packages h WHERE h.corporate_id=45 AND h."packageId"=:id AND h.status='active' AND EXISTS (SELECT 1 FROM user_associations a WHERE a."userId"=h."userId" AND a."entityType"='corporate' AND a."entityId"=45 AND a.role='employee' AND a.status='active') ORDER BY h."userId" LIMIT 1`,{id:sales.id});employeeId=candidate[0]?.id;
  jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,transaction:async fn=>fn(tx),QueryTypes:db.QueryTypes}}));
  jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,_res,next)=>{req.user={...staff,role:'team',isTeam:true};req.userRole='team';next();},requireRole:roles=>(req,res,next)=>roles.includes('team')?next():res.sendStatus(403)}));
  const {default:router}=await import('../routes/admin-health-packages.route.js');app=express();app.use(express.json());app.use(router);
 });
 afterAll(async()=>{
  if(tx){await tx.rollback();tx=null;}
  if(db){
   if(before){const after=await db.query(`SELECT "userId","packageId",status,"validFrom","validTo","usedAt" FROM user_health_packages WHERE corporate_id=45 AND "packageId" IN (:ids) ORDER BY "packageId","userId"`,{replacements:{ids:[sales.id,other.id]},type:db.QueryTypes.SELECT});expect(after).toEqual(before);}
   await db.close();
  }
 });
 test('lists current assignments with department/designation and package-specific data',async()=>{
  const result=await request(app).get(`/${sales.id}/employee-options`);
  expect(result.status).toBe(200);expect(result.body.data.length).toBeGreaterThan(0);
  expect(result.body.data.filter(e=>e.assigned).length).toBe(before.filter(e=>e.packageId===sales.id&&e.status==='active').length);
  expect(result.body.data.some(e=>e.department)).toBe(true);expect(result.body.data.some(e=>e.designation)).toBe(true);
 });
 test('removes an employee only from Sales and frees capacity',async()=>{
  const result=await request(app).patch(`/${sales.id}/assignments`).send({removeEmployeeIds:[employeeId]});
  expect(result.status).toBe(200);expect(result.body.data.removed).toBe(1);
  const otherAssignments=await db.query(`SELECT "userId","packageId",status,"validFrom","validTo","usedAt" FROM user_health_packages WHERE corporate_id=45 AND "packageId"=:id ORDER BY "userId"`,{replacements:{id:other.id},transaction:tx,type:db.QueryTypes.SELECT});
  expect(otherAssignments).toEqual(before.filter(e=>e.packageId===other.id));
 });
 test('adds the employee back at capacity without resetting validity or redemption history',async()=>{
  const result=await request(app).patch(`/${sales.id}/assignments`).send({addEmployeeIds:[employeeId]});expect(result.status).toBe(200);expect(result.body.data.added).toBe(1);
  const after=await db.query(`SELECT "userId","packageId",status,"validFrom","validTo","usedAt" FROM user_health_packages WHERE corporate_id=45 AND "packageId" IN (:ids) ORDER BY "packageId","userId"`,{replacements:{ids:[sales.id,other.id]},transaction:tx,type:db.QueryTypes.SELECT});expect(after).toEqual(before);
 });
});
