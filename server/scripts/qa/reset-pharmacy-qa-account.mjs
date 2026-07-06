#!/usr/bin/env node
/**
 * Reset QA pharmacy account — mirrors reset-doctor-qa-account.mjs.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-pharmacy-qa-account.mjs
 *
 * Optional env:
 *   PHARMACY_EMAIL=pharmacy@mediczy.com
 *   PHARMACY_PASSWORD=Pharma123
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { Pharmacy } from '../../models/index.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.PHARMACY_EMAIL || 'pharmacy@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.PHARMACY_PASSWORD || 'Pharma123';

export async function resetPharmacyQaAccount({ email = EMAIL, password = PASSWORD } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let pharmacy = await Pharmacy.findOne({
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

  if (!pharmacy) {
    pharmacy = await Pharmacy.create({
      email: normalizedEmail,
      password,
      name: 'QA Pharmacy',
      phoneNumber: '+919999000004',
      ...patch,
    });
    return { action: 'created', id: pharmacy.id, email: normalizedEmail };
  }

  await pharmacy.update(patch);
  return { action: 'updated', id: pharmacy.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetPharmacyQaAccount();
  console.log('Pharmacy QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/pharmacy/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-pharmacy-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset pharmacy QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
