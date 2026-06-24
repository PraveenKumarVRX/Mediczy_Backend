#!/usr/bin/env node
/**
 * Seeds a complete Hospital OS demo with rich dummy data (no Docker required).
 *
 * Prerequisites: native PostgreSQL + Redis running locally.
 *
 * Usage (from server/):
 *   npm run demo:seed
 *   node scripts/demo/seed-hospital-os-demo.mjs
 */
import bcrypt from 'bcrypt';
import pool from '../../db/pgPool.js';
import { postgresSequelize as sequelize } from '../../db/postgres-sequelize.js';
import * as queue from '../../services/hospital-queue.service.js';
import { initDischargeReadiness } from '../../services/adt.service.js';

const ORG_ID = parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10);

const DEMO_PATIENTS = [
  { first: 'Priya', last: 'Singh', phone: '9876543211', gender: 'female', complaint: 'Abdominal pain', doctor: 'Dr. Patel', ipd: true, diagnosis: 'Acute appendicitis', bed: 'GEN-11' },
  { first: 'Rahul', last: 'Mehta', phone: '9876543212', gender: 'male', complaint: 'Chest discomfort', doctor: 'Dr. Sharma', ipd: true, diagnosis: 'Unstable angina', bed: 'GEN-12' },
  { first: 'Ananya', last: 'Iyer', phone: '9876543213', gender: 'female', complaint: 'Fever & cough', doctor: 'Dr. Patel', opd: true },
  { first: 'Vikram', last: 'Reddy', phone: '9876543214', gender: 'male', complaint: 'Knee pain', doctor: 'Dr. Nair', opd: true },
  { first: 'Sneha', last: 'Desai', phone: '9876543215', gender: 'female', complaint: 'Diabetes follow-up', doctor: 'Dr. Sharma', opd: true },
  { first: 'Arjun', last: 'Kapoor', phone: '9876543216', gender: 'male', complaint: 'Migraine', doctor: 'Dr. Patel', opd: true },
];

async function resolveOrgId() {
  const row = await run(`SELECT id FROM hospitals WHERE email = 'hospital@mediczy.com' LIMIT 1`);
  return row.rows[0]?.id || ORG_ID;
}

async function run(sql, params = []) {
  return pool.query(sql, params);
}

async function upsertPatient({ first, last, phone, gender }) {
  const userRow = await run(`SELECT id FROM users WHERE "phoneNumber" LIKE $1 LIMIT 1`, [`%${phone.slice(-10)}`]);
  if (userRow.rows[0]) return userRow.rows[0].id;

  const email = `demo+${phone}@patient.mediqzy.local`;
  const hash = await bcrypt.hash(`demo-${phone}`, 10);
  const ins = await run(
    `INSERT INTO users ("firstName","lastName",email,password,"phoneNumber",gender,"dateOfBirth",status,"emailVerified",role,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active',true,'user',$8) RETURNING id`,
    [first, last, email, hash, phone, gender, '1988-06-15', JSON.stringify({ source: 'demo-seed' })]
  );
  return ins.rows[0].id;
}

async function ensureBed(orgId, wardId, bedNum, status = 'available') {
  const exists = await run(
    `SELECT id, status FROM beds WHERE organization_id = $1 AND bed_number = $2 LIMIT 1`,
    [orgId, bedNum]
  );
  if (exists.rows[0]) {
    if (status !== 'available') {
      await run(`UPDATE beds SET status = $2 WHERE id = $1`, [exists.rows[0].id, status]);
    }
    return exists.rows[0].id;
  }
  const ins = await run(
    `INSERT INTO beds (ward_id, organization_id, bed_number, bed_type, status, is_active)
     VALUES ($1,$2,$3,'general',$4,true) RETURNING id`,
    [wardId, orgId, bedNum, status]
  );
  return ins.rows[0].id;
}

const DISCHARGE_DRAFT = `DISCHARGE SUMMARY — Mediqzy Demo Hospital

Patient: Priya Singh (UHID-000001)
Admission: IP2026000001 | Ward: General Ward A | Bed: GEN-11
Diagnosis: Acute appendicitis — laparoscopic appendectomy performed

Hospital Course:
Patient presented with right iliac fossa pain and low-grade fever. CT abdomen confirmed acute appendicitis.
Underwent uneventful laparoscopic appendectomy on Day 1. Post-operative recovery was satisfactory.
Afebrile from Day 2. Tolerating oral diet. Ambulating independently.

Discharge Medications:
1. Paracetamol 650mg oral Q6H PRN pain (5 days)
2. Pantoprazole 40mg oral OD (7 days)

Follow-up: Surgical OPD in 7 days with Dr. Patel.
Diet: Light home diet; avoid spicy/fried food for 1 week.
Activity: Avoid heavy lifting for 2 weeks.

Emergency: Return if fever >101°F, wound redness, or severe pain.`;

const DEMO_CAPABILITIES = [
  'practice_management', 'appointments', 'bed_management', 'patients', 'doctors',
  'branches', 'ambulance', 'communication', 'ehr', 'mrd', 'opd_ipd', 'ip_sheets',
  'discharge_summary', 'pharmacy', 'lab_reports', 'insurance_billing', 'billing', 'staff_management',
];

async function main() {
  console.log('🏥 Seeding Hospital OS demo data (live PostgreSQL, no Docker)...');
  await sequelize.authenticate();
  const orgId = await resolveOrgId();

  const existingHospital = await run(`SELECT id FROM hospitals WHERE email = $1 LIMIT 1`, ['hospital@mediczy.com']);
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

  await run(
    `UPDATE hospitals SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE email = 'hospital@mediczy.com'`,
    [JSON.stringify({ capabilities: DEMO_CAPABILITIES, demo: true })]
  );
  console.log('✅ Demo hospital capabilities unlocked (EHR, MRD, Communication, etc.)');

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

  const bedIds = {};
  for (const bedNum of ['GEN-11', 'GEN-12', 'GEN-13', 'GEN-14']) {
    bedIds[bedNum] = await ensureBed(orgId, wardId, bedNum);
  }
  console.log('✅ Beds GEN-11..GEN-14 ready');

  // Clear today's OPD queue for clean demo tokens A-001, A-002...
  await run(
    `DELETE FROM hospital_queue_entries WHERE organization_id = $1 AND department = 'opd' AND check_in_at::date = CURRENT_DATE`,
    [orgId]
  ).catch(() => {});

  let priyaId = null;
  let priyaAdmissionId = null;

  for (const p of DEMO_PATIENTS) {
    const patientId = await upsertPatient(p);
    const uhid = await queue.allocateUhid(orgId).catch(() => `UHID-DEMO-${patientId}`);
    await run(
      `UPDATE users SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [patientId, JSON.stringify({ uhid, registeredVia: 'demo-seed' })]
    );

    if (p.opd) {
      await queue.checkIn({
        organizationId: orgId,
        department: 'opd',
        queueZone: 'opd-waiting',
        patientId,
        patientName: `${p.first} ${p.last}`,
        doctorName: p.doctor,
        queueType: 'walk_in',
        chiefComplaint: p.complaint,
        metadata: { uhid, demo: true },
      }).catch((e) => console.warn(`Queue ${p.first}:`, e.message));
    }

    if (p.ipd) {
      const bedId = bedIds[p.bed];
      await ensureBed(orgId, wardId, p.bed, 'occupied');

      const existingAdm = await run(
        `SELECT id FROM ip_admissions WHERE patient_id = $1 AND status NOT IN ('discharged','cancelled') ORDER BY id DESC LIMIT 1`,
        [patientId]
      );

      let admissionId;
      if (existingAdm.rows[0]) {
        admissionId = existingAdm.rows[0].id;
        await run(
          `UPDATE ip_admissions SET ward_id = $2, bed_id = $3, admission_diagnosis = $4, updated_at = NOW() WHERE id = $1`,
          [admissionId, wardId, bedId, p.diagnosis]
        );
      } else {
        const admNum = p.first === 'Priya' ? `IP${new Date().getFullYear()}000001` : `IP${new Date().getFullYear()}${String(patientId).padStart(5, '0')}`;
        const admIns = await run(
          `INSERT INTO ip_admissions (
             organization_id, patient_id, admission_number, admission_type, admission_datetime,
             admission_diagnosis, ward_id, bed_id, expected_los_days, status
           ) VALUES ($1,$2,$3,'op_converted',NOW() - INTERVAL '1 day' * $6,$4,$5,$7,3,'admitted')
           RETURNING id`,
          [orgId, patientId, admNum, p.diagnosis, wardId, p.first === 'Priya' ? 1 : 0, bedId]
        );
        admissionId = admIns.rows[0].id;
      }

      if (p.first === 'Priya') {
        priyaId = patientId;
        priyaAdmissionId = admissionId;
      }

      await initDischargeReadiness(admissionId, orgId).catch(() => {});

      if (p.first === 'Priya') {
        await run(
          `UPDATE discharge_readiness_items SET is_complete = TRUE, completed_at = NOW(), completed_by = 'demo-seed'
           WHERE admission_id = $1 AND dimension IN ('clinical', 'nursing_education', 'medication_reconciliation', 'billing')`,
          [admissionId]
        );
      }

      await run(`DELETE FROM vital_records WHERE admission_id = $1`, [admissionId]).catch(() => {});
      await run(
        `INSERT INTO vital_records (
           organization_id, admission_id, patient_id, recorded_at, source,
           temperature, pulse, bp_systolic, bp_diastolic, spo2, respiratory_rate, news2_score
         ) VALUES ($1,$2,$3,NOW(),'manual',$4,$5,$6,$7,$8,$9,$10)`,
        [orgId, admissionId, patientId,
          p.first === 'Priya' ? 37.4 : 36.8,
          p.first === 'Priya' ? 88 : 76,
          p.first === 'Priya' ? 116 : 128,
          p.first === 'Priya' ? 74 : 82,
          p.first === 'Priya' ? 98 : 96,
          p.first === 'Priya' ? 16 : 18,
          p.first === 'Priya' ? 2 : 4]
      );

      await run(`DELETE FROM medication_orders WHERE admission_id = $1`, [admissionId]).catch(() => {});
      if (p.first === 'Priya') {
        await run(
          `INSERT INTO medication_orders (organization_id, admission_id, patient_id, drug_name, dose, route, frequency, order_status, start_datetime)
           VALUES ($1,$2,$3,'Ceftriaxone','1g','iv','BD','active',NOW()),
                  ($1,$2,$3,'Paracetamol','650mg','oral','Q6H','active',NOW()),
                  ($1,$2,$3,'Pantoprazole','40mg','oral','OD','active',NOW())`,
          [orgId, admissionId, patientId]
        );
      } else {
        await run(
          `INSERT INTO medication_orders (organization_id, admission_id, patient_id, drug_name, dose, route, frequency, order_status, start_datetime)
           VALUES ($1,$2,$3,'Aspirin','75mg','oral','OD','active',NOW()),
                  ($1,$2,$3,'Atorvastatin','20mg','oral','HS','active',NOW())`,
          [orgId, admissionId, patientId]
        );
      }
    }
  }

  console.log(`✅ ${DEMO_PATIENTS.length} demo patients (2 IPD, 4 OPD queue)`);

  if (priyaId && priyaAdmissionId) {
    await run(`
      CREATE TABLE IF NOT EXISTS patient_allergies (
        id SERIAL PRIMARY KEY, patient_id INTEGER NOT NULL, allergen TEXT NOT NULL,
        reaction_type TEXT, severity TEXT, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await run(`DELETE FROM patient_allergies WHERE patient_id = $1`, [priyaId]).catch(() => {});
    await run(
      `INSERT INTO patient_allergies (patient_id, allergen, reaction_type, severity, active)
       VALUES ($1,'Penicillin','Rash','moderate',true)`,
      [priyaId]
    );

    await run(`
      CREATE TABLE IF NOT EXISTS clinical_notes (
        id BIGSERIAL PRIMARY KEY, patient_id BIGINT, admission_id BIGINT,
        note_type TEXT, chief_complaint TEXT, diagnosis TEXT, plan TEXT, assessment TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), signed_at TIMESTAMPTZ
      )
    `).catch(() => {});
    await run(`DELETE FROM clinical_notes WHERE admission_id = $1`, [priyaAdmissionId]).catch(() => {});
    await run(
      `INSERT INTO clinical_notes (patient_id, admission_id, note_type, chief_complaint, diagnosis, plan, signed_at)
       VALUES ($1,$2,'progress','Abdominal pain','Acute appendicitis — post-op Day 2','Continue IV antibiotics, advance diet, plan discharge Day 3',NOW())`,
      [priyaId, priyaAdmissionId]
    );

    await run(`
      CREATE TABLE IF NOT EXISTS discharge_packets (
        id BIGSERIAL PRIMARY KEY, organization_id BIGINT, admission_id BIGINT NOT NULL, patient_id BIGINT,
        draft_content TEXT, final_content TEXT, status TEXT DEFAULT 'draft',
        ai_generated BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
    await run(`DELETE FROM discharge_packets WHERE admission_id = $1`, [priyaAdmissionId]).catch(() => {});
    await run(
      `INSERT INTO discharge_packets (organization_id, admission_id, patient_id, draft_content, status, ai_generated)
       VALUES ($1,$2,$3,$4,'draft',true)`,
      [orgId, priyaAdmissionId, priyaId, DISCHARGE_DRAFT]
    );
    console.log('✅ Discharge draft + clinical note seeded for Priya Singh');
  }

  // ER queue demo patients
  await run(`DELETE FROM er_visits WHERE organization_id = $1 AND created_at::date = CURRENT_DATE`, [orgId]).catch(() => {});
  for (const er of [
    { name: 'Rajesh Kumar', triage: 'red', complaint: 'Chest pain radiating to left arm', mlc: false },
    { name: 'Meena Devi', triage: 'yellow', complaint: 'Road traffic accident — limb injury', mlc: true },
    { name: 'Suresh Nair', triage: 'green', complaint: 'Minor laceration', mlc: false },
  ]) {
    await run(
      `INSERT INTO er_visits (organization_id, patient_name, triage_level, chief_complaint, mlc_case, arrival_time, status)
       VALUES ($1,$2,$3,$4,$5,NOW() - INTERVAL '30 minutes',$6)`,
      [orgId, er.name, er.triage, er.complaint, er.mlc, 'active']
    ).catch(() => {});
  }
  console.log('✅ ER triage queue seeded');

  // OT booking for Priya (appendectomy completed)
  if (priyaId && priyaAdmissionId) {
    let otRoomId;
    const otRoom = await run(`SELECT id FROM ot_rooms WHERE organization_id = $1 LIMIT 1`, [orgId]);
    if (!otRoom.rows[0]) {
      const ins = await run(
        `INSERT INTO ot_rooms (organization_id, name, room_type, status, active) VALUES ($1,'OT-1','major','available',true) RETURNING id`,
        [orgId]
      );
      otRoomId = ins.rows[0].id;
    } else otRoomId = otRoom.rows[0].id;

    await run(`DELETE FROM ot_bookings WHERE admission_id = $1`, [priyaAdmissionId]).catch(() => {});
    await run(
      `INSERT INTO ot_bookings (organization_id, admission_id, patient_id, ot_room_id, procedure_name, scheduled_start, scheduled_end, ot_status)
       VALUES ($1,$2,$3,$4,'Laparoscopic appendectomy',NOW() - INTERVAL '1 day',NOW() - INTERVAL '22 hours','completed')`,
      [orgId, priyaAdmissionId, priyaId, otRoomId]
    ).catch(() => {});
    console.log('✅ OT booking seeded');
  }

  console.log('\n🎯 Demo ready (native stack — no Docker):');
  console.log('   Hospital OS Hub: /hospital/os');
  console.log('   Hospital login: hospital@mediczy.com / Hospital123');
  console.log('   OPD display:    /display/queue?zone=opd-waiting');
  if (priyaId) console.log(`   Star patient:   Priya Singh (id=${priyaId})`);
  if (priyaAdmissionId) console.log(`   Admission:      ${priyaAdmissionId} | Discharge: /hmis/admission/${priyaAdmissionId}/discharge`);
  await pool.end();
  await sequelize.close();
}

main().catch((e) => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
