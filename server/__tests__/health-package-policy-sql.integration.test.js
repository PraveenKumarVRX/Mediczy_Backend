import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { Sequelize } from 'sequelize';

const enabled = process.env.HEALTH_PACKAGE_POLICY_SQL_INTEGRATION === '1';
(enabled ? describe : describe.skip)('corporate package policy with real PostgreSQL', () => {
  let db, outer, app, actor, packageId;
  beforeAll(async () => {
    // Explicit local socket only. All fixture DDL and data roll back.
    db = new Sequelize('postgres', 'postgres', null, {dialect:'postgres',host:'/var/run/postgresql',logging:false});
    outer = await db.transaction();
    const query = (sql, options={}) => db.query(sql,{...options,transaction:outer});
    await query(`CREATE SCHEMA health_package_policy_qa_${process.pid}; SET LOCAL search_path TO health_package_policy_qa_${process.pid};
      CREATE TABLE users (id INTEGER PRIMARY KEY,"firstName" TEXT,"lastName" TEXT,email TEXT,"phoneNumber" TEXT,gender TEXT,"dateOfBirth" DATE);
      CREATE TABLE corporates (id INTEGER PRIMARY KEY,"companyName" TEXT,status TEXT);
      CREATE TABLE user_associations ("userId" INTEGER,"entityId" INTEGER,"entityType" TEXT,role TEXT,status TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE corporate_employees ("userId" INTEGER,corporate_id INTEGER,"isActive" BOOLEAN);
      CREATE TABLE labs (id INTEGER PRIMARY KEY,name TEXT,address JSONB,"phoneNumber" TEXT,accreditation JSONB,rating NUMERIC,metadata JSONB,status TEXT);
      CREATE TABLE hospitals (id INTEGER PRIMARY KEY,hospital_name TEXT,address TEXT,metadata JSONB,status TEXT);
      CREATE TABLE corporate_network_assignments (corporate_id INTEGER,partner_id INTEGER,partner_type TEXT);
      CREATE TABLE user_health_packages (id SERIAL PRIMARY KEY,"userId" INTEGER,corporate_id INTEGER,"packageId" VARCHAR(150),"packageName" TEXT,"packageDetails" JSONB,"validFrom" DATE,"validTo" DATE,status TEXT,"usedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ DEFAULT NOW(),"updatedAt" TIMESTAMPTZ DEFAULT NOW(),UNIQUE("userId","packageId"));
      INSERT INTO users (id) VALUES (1),(2);
      INSERT INTO corporates VALUES (3,'Test corporate','active');
      INSERT INTO user_associations ("userId","entityId","entityType",role,status) VALUES (1,3,'corporate','employee','active'),(2,3,'corporate','employee','active');
      INSERT INTO corporate_employees VALUES (1,3,true),(2,3,true);
      INSERT INTO labs VALUES (5,'Allowed lab','{}','', '[]',5,'{"healthCheckupSlots":["09:00"]}','active'),(6,'Other lab','{}','','[]',5,'{"healthCheckupSlots":["09:00"]}','active');
      INSERT INTO hospitals VALUES (5,'Allowed hospital','Test city','{"healthCheckupSlots":["09:00"]}','active');
      INSERT INTO corporate_network_assignments VALUES (3,5,'lab'),(3,6,'lab'),(3,5,'hospital');`);
    jest.unstable_mockModule('../db/pgPool.js',()=>({default:{}}));
    for (const file of ['20261015006000-health-checkup-bookings.migration.js','20261021009000-corporate-health-package-catalog.migration.js','20261028000100-health-package-eligibility.migration.js']) {
      const {up} = await import(`../migrations/${file}`); await up({query});
      if(file.includes('eligibility')) await up({query});
    }
    jest.unstable_mockModule('../middleware/auth.middleware.js',()=>({authUser:(req,_res,next)=>{req.user=actor;req.userRole=actor.role;next();},requireRole:roles=>(req,res,next)=>roles.includes(actor.role)?next():res.sendStatus(403)}));
    jest.unstable_mockModule('../db/postgres-sequelize.js',()=>({postgresSequelize:{query,QueryTypes:db.QueryTypes,transaction:async fn=>fn ? fn(outer) : {commit:async()=>{},rollback:async()=>{}}}}));
    jest.unstable_mockModule('../services/payment-gateway.service.js',()=>({default:{}}));
    jest.unstable_mockModule('../services/emailService.js',()=>({default:{sendOutboundEmail:async()=>{}}}));
    jest.unstable_mockModule('../services/whatsapp-production.service.js',()=>({default:{configured:false}}));
    const {default:admin} = await import('../routes/admin-health-packages.route.js');
    const {default:booking} = await import('../routes/health-checkup.route.js');
    app=express();app.use(express.json());app.use('/admin',admin);app.use('/member',booking);
  });
  afterAll(async()=>{if(outer) await outer.rollback();if(db) await db.close();});
  const payload={corporateId:'3',packageName:'Parents screening',tests:['CBC'],frequency:'Annual',validityPeriod:'1 Year',costPerEmployee:100,maxEmployees:2,status:'Active',eligibleRelations:['parent','parent_in_law'],venueMode:'restricted',venues:[{partnerId:5,partnerType:'lab',relation:'parent'},{partnerId:5,partnerType:'hospital',relation:'parent_in_law'}]};
  const book=(relation,labId)=>request(app).post('/member/bookings').send({packageId,relation,labId,date:'2099-01-01',timeSlot:'09:00',patient:{name:'Parent',phone:'9999999999'}});
  test('Team creates and assigns a dependent-only package',async()=>{
    actor={id:1,role:'team',isTeam:true,metadata:{permissions:['Corporate Management']}};
    const result=await request(app).post('/admin').send(payload);
    expect(result.status).toBe(201);packageId=result.body.data.id;
    expect(result.body.data.eligibleRelations).toEqual(['parent','parent_in_law']);
    expect((await request(app).post(`/admin/${packageId}/tag-employees`).send({employeeIds:[1]})).status).toBe(200);
    expect((await request(app).get(`/admin/${packageId}/assignments`)).body.data[0].userId).toBe(1);
    expect((await request(app).get('/admin/corporates/3/venues')).body.data).toHaveLength(3);
  });
  test('lists authoritative eligibility and relation-specific diagnostic venues',async()=>{
    actor={id:1,role:'user'};
    const packages=await request(app).get('/member/packages');
    expect(packages.status).toBe(200);expect(packages.body.packages[0].eligibleRelations).toEqual(['parent','parent_in_law']);
    expect((await request(app).get('/member/labs').query({packageId,relation:'parent'})).body.labs.map(l=>l.id)).toEqual(['5']);
    expect((await request(app).get('/member/labs').query({packageId,relation:'parent_in_law'})).body.labs.map(l=>l.id)).toEqual(['hospital:5']);
    expect((await request(app).get('/member/slots').query({packageId,relation:'parent_in_law',labId:'hospital:5',date:'2099-01-01'})).body.slots[0].available).toBe(true);
  });
  test('rejects uncovered relations, wrong venues, and unassigned employees',async()=>{
    expect((await book('self','5')).body.code).toBe('relation_not_eligible');
    expect((await book('parent','6')).body.code).toBe('lab_not_available');
    expect((await book('parent_in_law','5')).body.code).toBe('lab_not_available');
    actor={id:2,role:'user'};
    expect((await book('parent','5')).body.code).toBe('package_not_eligible');
  });
  test('books a sponsored hospital appointment without employee payment',async()=>{
    actor={id:1,role:'user'};
    const result=await book('parent_in_law','hospital:5');
    expect(result.status).toBe(201);expect(result.body.booking).toMatchObject({relation:'parent_in_law',status:'confirmed',lab:{id:'hospital:5'},payment:{amount:0,status:'not_required'}});
    expect((await book('parent_in_law','hospital:5')).body.code).toBe('already_booked');
    expect((await request(app).post(`/member/bookings/${result.body.booking.id}/reschedule`).send({date:'2099-01-02',timeSlot:'09:00'})).status).toBe(200);
    actor={id:1,role:'team',isTeam:true,metadata:{permissions:['Corporate Management']}};
    expect((await request(app).put(`/admin/${packageId}`).send({...payload,eligibleRelations:['parent']})).status).toBe(200);
    actor={id:1,role:'user'};
    expect((await request(app).post(`/member/bookings/${result.body.booking.id}/reschedule`).send({date:'2099-01-03',timeSlot:'09:00'})).body.code).toBe('relation_not_eligible');
  });
  test('database rejects two active bookings for the same hospital slot',async()=>{
    await db.query('SAVEPOINT slot_collision',{transaction:outer});
    try {
      await expect(db.query(`INSERT INTO health_checkup_bookings (booking_reference,user_id,member_type,corporate_id,package_id,package_name,hospital_id,appointment_date,time_slot,status)
        VALUES ('HC-COLLISION',2,'corporate',3,:packageId,'Collision',5,'2099-01-02','09:00','confirmed')`,{replacements:{packageId},transaction:outer})).rejects.toMatchObject({original:{code:'23505',constraint:'uniq_health_checkup_active_hospital_slot'}});
    } finally {await db.query('ROLLBACK TO SAVEPOINT slot_collision',{transaction:outer});}
  });

});
