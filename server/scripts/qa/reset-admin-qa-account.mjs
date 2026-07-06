#!/usr/bin/env node
/**
 * Reset QA admin account — mirrors reset-doctor-qa-account.mjs.
 * Admin has no dedicated model; adminLogin (admin.controller.js) queries the
 * shared User model for { email, isAdmin: true }.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-admin-qa-account.mjs
 *
 * Optional env:
 *   ADMIN_EMAIL=admin@mediczy.com
 *   ADMIN_PASSWORD=Admin1234
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import userModel from '../../models/user.model.intelligent.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.ADMIN_EMAIL || 'admin@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234';

export async function resetAdminQaAccount({ email = EMAIL, password = PASSWORD } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let admin = await userModel.findOne({ where: { email: normalizedEmail } });

  const patch = {
    password,
    isAdmin: true,
    status: 'active',
  };

  if (!admin) {
    admin = await userModel.create({
      email: normalizedEmail,
      password,
      firstName: 'QA',
      lastName: 'Admin',
      phoneNumber: '+919999000006',
      dateOfBirth: '1990-01-01',
      gender: 'Other',
      ...patch,
    });
    return { action: 'created', id: admin.id, email: normalizedEmail };
  }

  await admin.update(patch);
  return { action: 'updated', id: admin.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetAdminQaAccount();
  console.log('Admin QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/admin/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-admin-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset admin QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
