#!/usr/bin/env node
/**
 * Reset QA ambulance provider account — mirrors reset-doctor-qa-account.mjs.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   node scripts/qa/reset-ambulance-qa-account.mjs
 *
 * Optional env:
 *   AMBULANCE_EMAIL=ambulance@mediczy.com
 *   AMBULANCE_PASSWORD=Ambulance123
 */
import dotenv from 'dotenv';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import { Ambulance } from '../../models/index.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const EMAIL = (process.env.AMBULANCE_EMAIL || 'ambulance@mediczy.com').toLowerCase().trim();
const PASSWORD = process.env.AMBULANCE_PASSWORD || 'Ambulance123';

export async function resetAmbulanceQaAccount({ email = EMAIL, password = PASSWORD } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let ambulance = await Ambulance.findOne({
    where: postgresSequelize.where(
      postgresSequelize.fn('LOWER', postgresSequelize.col('email')),
      normalizedEmail,
    ),
  });

  const patch = {
    password,
    isVerified: true,
    isAvailable: true,
    status: 'active',
  };

  if (!ambulance) {
    ambulance = await Ambulance.create({
      email: normalizedEmail,
      password,
      providerName: 'QA Ambulance Service',
      phone: '+919999000005',
      ...patch,
    });
    return { action: 'created', id: ambulance.id, email: normalizedEmail };
  }

  await ambulance.update(patch);
  return { action: 'updated', id: ambulance.id, email: normalizedEmail };
}

async function main() {
  await connectToPostgresDB();
  const result = await resetAmbulanceQaAccount();
  console.log('Ambulance QA account reset:');
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('URL:   https://app.mediqzy.com/ambulance/login');
  await postgresSequelize.close();
}

const isMain = process.argv[1]?.includes('reset-ambulance-qa-account');
if (isMain) {
  main().catch(async (err) => {
    console.error('Failed to reset ambulance QA account:', err.message);
    try { await postgresSequelize.close(); } catch {}
    process.exit(1);
  });
}
