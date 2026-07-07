#!/usr/bin/env node
/**
 * Reset QA insurance-desk staff account — mirrors reset-nurse-qa-account.mjs.
 * Insurance desk staff live in the `users` table with role='insurance_desk_staff'
 * (see makeDeptHandlers in unified-hospital-staff.controller.js), scoped to a
 * hospital tenant via organization_id.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-insurance-desk-qa-account.mjs
 *
 * Optional env:
 *   INSURANCE_DESK_EMAIL=insurance-desk@mediczy.com
 *   INSURANCE_DESK_PASSWORD=InsDesk@123
 *   INSURANCE_DESK_HOSPITAL_ID=1
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { User } from '../../models/user.model.intelligent.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.INSURANCE_DESK_EMAIL || 'insurance-desk@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.INSURANCE_DESK_PASSWORD || 'InsDesk@123';
const HOSPITAL_ID = parseInt(process.env.INSURANCE_DESK_HOSPITAL_ID || '1', 10);

export async function resetInsuranceDeskQaAccount({ email = EMAIL, password = PASSWORD, hospitalId = HOSPITAL_ID } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let staff = await User.findOne({
    where: postgresSequelize.where(
      postgresSequelize.fn('LOWER', postgresSequelize.col('email')),
      normalizedEmail,
    ),
  });

  const patch = {
    password,
    role: 'insurance_desk_staff',
    organization_id: hospitalId,
    status: 'active',
    emailVerified: true,
    metadata: { department: 'Insurance Desk Staff', created_via: 'qa_reset_script' },
  };

  if (!staff) {
    staff = await User.create({
      email: normalizedEmail,
      firstName: 'QA',
      lastName: 'InsuranceDesk',
      phoneNumber: '+919999000099',
      dateOfBirth: '1990-01-01',
      gender: 'Other',
      ...patch,
    });
    return { action: 'created', id: staff.id, email: normalizedEmail };
  }

  await staff.update(patch);
  return { action: 'updated', id: staff.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetInsuranceDeskQaAccount();
  console.log('Insurance desk staff QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/insurance-desk/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-insurance-desk-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset insurance-desk QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
