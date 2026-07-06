#!/usr/bin/env node
/**
 * Reset QA patient/user account — mirrors reset-doctor-qa-account.mjs.
 * Login endpoint: POST /api/users/login (see LOGIN_ENDPOINTS.user in
 * client/src/hooks/auth.ts).
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-user-qa-account.mjs
 *
 * Optional env:
 *   USER_EMAIL=user@mediczy.com
 *   USER_PASSWORD=User@123
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import userModel from '../../models/user.model.intelligent.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.USER_EMAIL || 'user@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.USER_PASSWORD || 'User@123';

export async function resetUserQaAccount({ email = EMAIL, password = PASSWORD } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let user = await userModel.findOne({ where: { email: normalizedEmail } });

  const patch = {
    password,
    status: 'active',
    isAdmin: false,
  };

  if (!user) {
    user = await userModel.create({
      email: normalizedEmail,
      password,
      firstName: 'QA',
      lastName: 'Patient',
      phoneNumber: '+919999000007',
      dateOfBirth: '1990-01-01',
      gender: 'Other',
      ...patch,
    });
    return { action: 'created', id: user.id, email: normalizedEmail };
  }

  await user.update(patch);
  return { action: 'updated', id: user.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetUserQaAccount();
  console.log('User (patient) QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-user-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset user QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
