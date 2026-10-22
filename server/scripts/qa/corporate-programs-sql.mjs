// Run as postgres against the local Unix socket. No production credentials or writes.
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { corporatePrograms } from '../../services/corporate-programs.service.js';
const db = new Sequelize('postgres','postgres',null,{dialect:'postgres',host:'/var/run/postgresql',logging:false,pool:{max:1}});
try {
  await db.query(`CREATE TEMP TABLE users(id int,"dateOfBirth" date);
    CREATE TEMP TABLE corporate_employees(id int,corporate_id int,"userId" int,"employeeId" text,department text,"isActive" boolean,metadata jsonb,"joiningDate" date,"exitDate" date);
    CREATE TEMP TABLE appointments(id int,"userId" int,"doctorId" int,"appointmentDate" date,"doctorName" text,status text,"paymentStatus" text,"paymentAmount" numeric,"paymentDetails" jsonb,corporate_tenant_id int);
    CREATE TEMP TABLE health_checkup_bookings(id int,user_id int,corporate_id int,lab_id int,lab_snapshot jsonb,appointment_date date,status text,payment_status text,payment_amount numeric,currency text DEFAULT 'INR');
    CREATE TEMP TABLE corporate_scheduled_appointments(id int,corporate_id int,"employeeId" text,date date,status text,facility text);
    CREATE TEMP TABLE corporate_settings(corporate_id int PRIMARY KEY,settings jsonb,"updatedAt" timestamptz);
    INSERT INTO users VALUES(1,'1990-01-01'),(2,'1980-01-01'),(3,NULL);
    INSERT INTO corporate_employees VALUES(1,3,1,'E1','IT',true,'{"careFeedback":{"consultation:1":{"rating":4,"year":2026}}}',NULL,NULL),(2,3,2,'E2','HR',true,'{}',NULL,NULL),(3,4,3,'OTHER','Other',true,'{}',NULL,NULL);
    INSERT INTO appointments VALUES(1,1,10,'2026-03-01','A','completed','paid',200,'{}',3),(2,1,10,'2026-03-02','A','cancelled','refunded',500,'{}',3),(3,3,10,'2026-03-01','A','completed','paid',9000,'{}',4),(4,1,10,'2026-03-03','Personal','completed','paid',9999,'{}',NULL);
    INSERT INTO health_checkup_bookings VALUES(1,2,3,20,'{"name":"Lab A"}','2026-04-01','completed','paid',500,'INR'),(2,3,4,20,'{}','2026-04-01','completed','paid',9000,'INR');
    INSERT INTO corporate_scheduled_appointments VALUES(1,3,'E1','2026-03-01','scheduled','Clinic');
    INSERT INTO corporate_settings VALUES(3,'{"programs":{"budgets":{"2026":1000}}}',NOW());`);
  const service=corporatePrograms(db);
  const data=await service.analytics(3,2026);
  assert.equal(data.monthly.length,12);
  assert.equal(data.budget.paidSpend,700);
  assert.equal(data.budget.remaining,300);
  assert.equal(data.budget.utilizationPercent,70);
  assert.equal(data.monthly.reduce((sum,row)=>sum+row.completed,0),2);
  assert.equal(data.departments.reduce((sum,row)=>sum+row.participating,0),2);
  assert.equal(data.vendors.length,3);
  assert.equal(data.feedback.responses,1);
  assert.equal(Number(data.feedback.average_rating),4);
  assert.equal(data.ages.reduce((sum,row)=>sum+row.completed,0),2);
  const missing=await service.analytics(4,2026); assert.equal(missing.budget.annual,null);
  await db.transaction(async tx=>service.updateSettings(3,programs=>{programs.budgets={...programs.budgets,2027:500};},tx));
  const [rows]=await db.query('SELECT settings FROM corporate_settings WHERE corporate_id=3'); assert.equal(rows[0].settings.programs.budgets[2026],1000); assert.equal(rows[0].settings.programs.budgets[2027],500);
  console.log(JSON.stringify({passed:true,checks:13,productionMutations:0}));
}finally{await db.close();}
