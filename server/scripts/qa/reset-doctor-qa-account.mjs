#!/usr/bin/env node
/**
 * Reset QA doctor account — fixes INVALID_PASSWORD / pending activation on prod.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-doctor-qa-account.mjs
 *
 * Optional env:
 *   DOCTOR_EMAIL=doctor@mediczy.com
 *   DOCTOR_PASSWORD=Doctor123
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { Doctor } from '../../models/index.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.DOCTOR_EMAIL || 'doctor@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.DOCTOR_PASSWORD || 'Doctor123';

export async function resetDoctorQaAccount({ email = EMAIL, password = PASSWORD } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let doctor = await Doctor.findOne({
    where: postgresSequelize.where(
      postgresSequelize.fn('LOWER', postgresSequelize.col('email')),
      normalizedEmail,
    ),
  });

  const patch = {
    password,
    isVerified: true,
    emailVerified: true,
    phoneVerified: true,
    documentVerified: true,
    status: 'active',
  };

  if (!doctor) {
    doctor = await Doctor.create({
      email: normalizedEmail,
      password,
      firstName: 'QA',
      lastName: 'Doctor',
      phoneNumber: '+919999000001',
      specialization: 'General Medicine',
      prefix: 'Dr',
      ...patch,
    });
    return { action: 'created', id: doctor.id, email: normalizedEmail };
  }

  await doctor.update(patch);
  return { action: 'updated', id: doctor.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetDoctorQaAccount();
  console.log('Doctor QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/doctor/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-doctor-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset doctor QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
