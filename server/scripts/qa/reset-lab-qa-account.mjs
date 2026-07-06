#!/usr/bin/env node
/**
 * Reset QA lab account — mirrors reset-doctor-qa-account.mjs.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-lab-qa-account.mjs
 *
 * Optional env:
 *   LAB_EMAIL=lab@mediczy.com
 *   LAB_PASSWORD=Lab12345
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { Lab } from '../../models/index.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.LAB_EMAIL || 'lab@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.LAB_PASSWORD || 'Lab12345';

export async function resetLabQaAccount({ email = EMAIL, password = PASSWORD } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let lab = await Lab.findOne({
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

  if (!lab) {
    lab = await Lab.create({
      email: normalizedEmail,
      password,
      name: 'QA Diagnostics Lab',
      phoneNumber: '+919999000003',
      ...patch,
    });
    return { action: 'created', id: lab.id, email: normalizedEmail };
  }

  await lab.update(patch);
  return { action: 'updated', id: lab.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetLabQaAccount();
  console.log('Lab QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/lab/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-lab-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset lab QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
