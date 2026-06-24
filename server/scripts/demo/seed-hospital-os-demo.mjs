#!/usr/bin/env node
/**
 * Seeds a complete Hospital OS demo: org, beds, hospital login, optional walk-in patient.
 *
 * Usage (from server/):
 *   node scripts/demo/seed-hospital-os-demo.mjs
 */
import bcrypt from 'bcrypt';
import pool from '../../db/pgPool.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import * as queue from '../../services/hospital-queue.service.js';
import { initDischargeReadiness } from '../../services/adt.service.js';

const ORG_ID = parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10);

async function resolveOrgId() {
  const row = await run(`SELECT id FROM hospitals WHERE email = 'hospital@mediczy.com' LIMIT 1`);
  return row.rows[0]?.id || ORG_ID;
}
const DEMO_PHONE = '9876543211';
const DEMO_FIRST = 'Priya';
const DEMO_LAST = 'Singh';

async function run(sql, params = []) {
  return pool.query(sql, params);
}

async function main() {
  console.log('🏥 Seeding Hospital OS demo data...');
  await sequelize.authenticate();
  const orgId = await resolveOrgId();

  // Hospital login account (legacy hospitals table)
  const existingHospital = await run(
    `SELECT id FROM hospitals WHERE email = $1 LIMIT 1`,
    ['hospital@mediczy.com']
  );
  if (!existingHospital.rows[0]) {
    const hash = await bcrypt.hash('Hospital123', 10);
    await run(
      `INSERT INTO hospitals (uid, hospital_name, email, password, phone_number, address, city, state, pincode, status, is_verified, registration_number, created_at, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,'active',true,$9,NOW(),NOW())`,
      ['Mediqzy Demo Hospital', 'hospital@mediczy.com', hash, '+919876543210', 'Demo Medical District', 'Bangalore', 'Karnataka', '560001', 'HOSP-DEMO-2026']
    );
    console.log('✅ Hospital account: hospital@mediczy.com / Hospital123');
  } else {
    console.log('ℹ️  Hospital account already exists');
  }

  // Ward + beds (minimal)
  let wardId;
  const ward = await run(`SELECT id FROM wards WHERE organization_id = $1 AND name = 'General Ward A' LIMIT 1`, [orgId]);
  if (ward.rows[0]) {
    wardId = ward.rows[0].id;
  } else {
    const ins = await run(
      `INSERT INTO wards (organization_id, name, ward_type, floor, capacity, active)
       VALUES ($1,'General Ward A','general',2,24,true) RETURNING id`,
      [orgId]
    );
    wardId = ins.rows[0].id;
    console.log('✅ Created ward General Ward A');
  }

  for (const bedNum of ['GEN-11', 'GEN-12', 'GEN-13', 'GEN-14']) {
    const exists = await run(
      `SELECT 1 FROM beds WHERE organization_id = $1 AND bed_number = $2 LIMIT 1`,
      [orgId, bedNum]
    );
    if (!exists.rows[0]) {
      await run(
        `INSERT INTO beds (ward_id, organization_id, bed_number, bed_type, status, is_active)
         VALUES ($1,$2,$3,'general','available',true)`,
        [wardId, orgId, bedNum]
      );
    }
  }
  console.log('✅ Beds GEN-11..GEN-14 ready');

  // Demo walk-in patient in today's OPD queue
  const phone = DEMO_PHONE;
  let patientId;
  const userRow = await run(`SELECT id FROM users WHERE "phoneNumber" LIKE $1 LIMIT 1`, [`%${phone.slice(-10)}`]);
  if (userRow.rows[0]) {
    patientId = userRow.rows[0].id;
  } else {
    const email = `demo+${phone}@patient.mediqzy.local`;
    const hash = await bcrypt.hash(`demo-${phone}`, 10);
    const ins = await run(
      `INSERT INTO users ("firstName","lastName",email,password,"phoneNumber",gender,status,"emailVerified",role,metadata)
       VALUES ($1,$2,$3,$4,$5,'female','active',true,'user',$6) RETURNING id`,
      [DEMO_FIRST, DEMO_LAST, email, hash, phone, JSON.stringify({ source: 'demo-seed' })]
    );
    patientId = ins.rows[0].id;
    console.log(`✅ Created demo patient ${DEMO_FIRST} ${DEMO_LAST} (id=${patientId})`);
  }

  const uhid = await queue.allocateUhid(orgId).catch(() => `UHID-DEMO-${patientId}`);
  await run(
    `UPDATE users SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [patientId, JSON.stringify({ uhid, registeredVia: 'demo-seed' })]
  );

  await queue.checkIn({
    organizationId: orgId,
    department: 'opd',
    queueZone: 'opd-waiting',
    patientId,
    patientName: `${DEMO_FIRST} ${DEMO_LAST}`,
    doctorName: 'Dr. Patel',
    queueType: 'walk_in',
    chiefComplaint: 'Abdominal pain',
    metadata: { uhid, demo: true },
  }).catch((e) => console.warn('Queue check-in skipped:', e.message));

  // ── Inpatient demo: admission, bed, vitals, meds, discharge checklist ──
  const bedRow = await run(
    `SELECT id FROM beds WHERE organization_id = $1 AND bed_number = 'GEN-11' LIMIT 1`,
    [orgId]
  );
  const bedId = bedRow.rows[0]?.id;

  let admissionId;
  const existingAdm = await run(
    `SELECT id FROM ip_admissions WHERE patient_id = $1 AND status NOT IN ('discharged','cancelled') ORDER BY id DESC LIMIT 1`,
    [patientId]
  );
  if (existingAdm.rows[0]) {
    admissionId = existingAdm.rows[0].id;
    if (bedId) {
      await run(
        `UPDATE ip_admissions SET ward_id = $2, bed_id = $3, admission_diagnosis = COALESCE(admission_diagnosis, 'Acute appendicitis'), updated_at = NOW() WHERE id = $1`,
        [admissionId, wardId, bedId]
      );
      await run(`UPDATE beds SET status = 'occupied' WHERE id = $1`, [bedId]);
    }
  } else if (bedId) {
    const admIns = await run(
      `INSERT INTO ip_admissions (
         organization_id, patient_id, admission_number, admission_type, admission_datetime,
         admission_diagnosis, ward_id, bed_id, expected_los_days, status
       ) VALUES ($1,$2,$3,'op_converted',NOW(),'Acute appendicitis',$4,$5,3,'admitted')
       RETURNING id`,
      [orgId, patientId, `IP${new Date().getFullYear()}DEMO`, wardId, bedId]
    );
    admissionId = admIns.rows[0].id;
    await run(`UPDATE beds SET status = 'occupied' WHERE id = $1`, [bedId]);
    console.log(`✅ Created demo admission id=${admissionId}`);
  }

  if (admissionId) {
    await initDischargeReadiness(admissionId, orgId).catch((e) => console.warn('Readiness init:', e.message));
    await run(
      `UPDATE discharge_readiness_items SET is_complete = TRUE, completed_at = NOW(), completed_by = 'demo-seed'
       WHERE admission_id = $1 AND dimension IN ('clinical', 'nursing_education', 'medication_reconciliation')`,
      [admissionId]
    ).catch(() => {});

    const vitalsExists = await run(
      `SELECT 1 FROM vital_records WHERE admission_id = $1 LIMIT 1`,
      [admissionId]
    );
    if (!vitalsExists.rows[0]) {
      await run(
        `INSERT INTO vital_records (
           organization_id, admission_id, patient_id, recorded_at, source,
           temperature, pulse, bp_systolic, bp_diastolic, spo2, respiratory_rate, news2_score
         ) VALUES ($1,$2,$3,NOW(),'manual',37.8,92,118,76,97,18,3)`,
        [orgId, admissionId, patientId]
      );
      console.log('✅ Seeded latest vitals');
    }

    const medExists = await run(
      `SELECT 1 FROM medication_orders WHERE admission_id = $1 LIMIT 1`,
      [admissionId]
    );
    if (!medExists.rows[0]) {
      await run(
        `INSERT INTO medication_orders (
           organization_id, admission_id, patient_id, drug_name, dose, route, frequency, order_status, start_datetime
         ) VALUES
         ($1,$2,$3,'Ceftriaxone','1g','iv','BD','active',NOW()),
         ($1,$2,$3,'Paracetamol','650mg','oral','Q6H','active',NOW())`,
        [orgId, admissionId, patientId]
      );
      console.log('✅ Seeded active medications');
    }

    await run(`
      CREATE TABLE IF NOT EXISTS patient_allergies (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL,
        allergen TEXT NOT NULL,
        reaction_type TEXT,
        severity TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const allergyExists = await run(
      `SELECT 1 FROM patient_allergies WHERE patient_id = $1 AND allergen = 'Penicillin' LIMIT 1`,
      [patientId]
    );
    if (!allergyExists.rows[0]) {
      await run(
        `INSERT INTO patient_allergies (patient_id, allergen, reaction_type, severity, active)
         VALUES ($1,'Penicillin','Rash','moderate',true)`,
        [patientId]
      );
    }
  }

  console.log('\n🎯 Demo ready:');
  console.log(`   Kiosk walk-in: ${DEMO_FIRST} ${DEMO_LAST}, phone ${phone}`);
  console.log(`   Patient ID for admission: ${patientId}`);
  if (admissionId) console.log(`   Active admission ID: ${admissionId}`);
  console.log('   Hospital login: hospital@mediczy.com / Hospital123');
  console.log('   OPD display: /display/queue?zone=opd-waiting');
  console.log(`   Inpatient workspace: /hmis/patient/${patientId}/workspace`);
  if (admissionId) console.log(`   Discharge workflow: /hmis/admission/${admissionId}/discharge`);
  await pool.end();
  await sequelize.close();
}

main().catch((e) => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
