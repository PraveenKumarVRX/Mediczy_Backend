#!/usr/bin/env node
/**
 * Reset QA nurse account — mirrors reset-doctor-qa-account.mjs.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-nurse-qa-account.mjs
 *
 * Optional env:
 *   NURSE_EMAIL=nurse@mediczy.com
 *   NURSE_PASSWORD=Nurse123
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { Nurse } from '../../models/index.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.NURSE_EMAIL || 'nurse@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.NURSE_PASSWORD || 'Nurse123';

export async function resetNurseQaAccount({ email = EMAIL, password = PASSWORD } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let nurse = await Nurse.findOne({
    where: postgresSequelize.where(
      postgresSequelize.fn('LOWER', postgresSequelize.col('email')),
      normalizedEmail,
    ),
  });

  const patch = {
    password,
    isVerified: true,
    status: 'active',
  };

  if (!nurse) {
    nurse = await Nurse.create({
      email: normalizedEmail,
      password,
      firstName: 'QA',
      lastName: 'Nurse',
      phoneNumber: '+919999000002',
      ...patch,
    });
    return { action: 'created', id: nurse.id, email: normalizedEmail };
  }

  await nurse.update(patch);
  return { action: 'updated', id: nurse.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetNurseQaAccount();
  console.log('Nurse QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/nurse/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-nurse-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset nurse QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
