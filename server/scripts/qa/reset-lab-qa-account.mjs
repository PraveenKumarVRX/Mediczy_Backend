#!/usr/bin/env node
/**
 * Reset canonical + QA lab accounts — mirrors reset-doctor-qa-account.mjs.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-lab-qa-account.mjs
 *   # or via SSM-loaded env:
 *   npm run fix:lab-login:ssm
 *
 * Optional env:
 *   LAB_EMAIL=lab@mediczy.com
 *   LAB_PASSWORD=Lab@123
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { Lab } from '../../models/index.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });
dotenv.config();

const EMAIL = (process.env.LAB_EMAIL || 'lab@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.LAB_PASSWORD || 'Lab@123';

const DEFAULT_VALUES = {
  name: 'Mediczy Diagnostics Lab',
  phoneNumber: '+919999000003',
  status: 'active',
  isVerified: true,
  department: 'pathology',
};

export async function resetLabQaAccount({
  email = EMAIL,
  password = PASSWORD,
  values = DEFAULT_VALUES,
} = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let lab = await Lab.findOne({
    where: postgresSequelize.where(
      postgresSequelize.fn('LOWER', postgresSequelize.col('email')),
      normalizedEmail,
    ),
  });

  const patch = {
    ...values,
    email: normalizedEmail,
    password,
    isVerified: true,
    status: 'active',
  };

  if (!lab) {
    lab = await Lab.create({
      ...patch,
    });
    return { action: 'created', id: lab.id, email: normalizedEmail };
  }

  await lab.update(patch);
  return { action: 'updated', id: lab.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();

  const primary = await resetLabQaAccount();
  const qa = await resetLabQaAccount({
    email: 'qa.lab@mediczy.com',
    password: 'QaLab@123',
    values: {
      name: 'QA Central Lab',
      phoneNumber: '9999991001',
      status: 'active',
      isVerified: true,
      department: 'pathology',
    },
  });

  console.log('Lab accounts reset:');
  console.log(JSON.stringify({ primary, qa }, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('QA:    qa.lab@mediczy.com / QaLab@123');
  console.log('URL:   https://app.mediqzy.com/lab/login');
  await postgresSequelize.close();
}

const isMain =
  process.argv[1]?.includes('reset-lab-qa-account') ||
  process.argv[2]?.includes('reset-lab-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset lab QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
