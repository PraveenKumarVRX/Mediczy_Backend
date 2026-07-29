#!/usr/bin/env node
/**
 * Ensure a clinic tenant + hospitals login + clinic_admin exist.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   CLINIC_NAME='AJ Dental Clinic' \
 *   CLINIC_CODE=AJDENTAL \
 *   CLINIC_SUBDOMAIN=ajdental \
 *   CLINIC_EMAIL=admin@ajdental.com \
 *   CLINIC_PASSWORD='Mayden@321' \
 *   node scripts/qa/ensure-clinic-login-account.mjs
 */
import dotenv from 'dotenv';
import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import { provisionClinicPortal } from '../../services/clinic-portal.service.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });
dotenv.config();

export async function ensureClinicLoginAccount(input = {}) {
  return provisionClinicPortal({
    name: input.name || process.env.CLINIC_NAME || 'AJ Dental Clinic',
    code: input.code || process.env.CLINIC_CODE || 'AJDENTAL',
    subdomain: input.subdomain || process.env.CLINIC_SUBDOMAIN || 'ajdental',
    slug: input.slug || process.env.CLINIC_SLUG || input.subdomain || process.env.CLINIC_SUBDOMAIN || 'ajdental',
    email: input.email || process.env.CLINIC_EMAIL || 'admin@ajdental.com',
    password: input.password || process.env.CLINIC_PASSWORD || 'Mayden@321',
    phone: input.phone || process.env.CLINIC_PHONE || '+919999000111',
    city: input.city || process.env.CLINIC_CITY || 'India',
    specialty: input.specialty || process.env.CLINIC_SPECIALTY || 'dental',
    plan: input.plan,
    tenantId: input.tenantId,
    admin_first_name: input.admin_first_name || 'AJ',
    admin_last_name: input.admin_last_name || 'Dental',
    registrationNumber: input.registrationNumber,
  });
}

async function main() {
  await connectToPostgresDB();
  const result = await ensureClinicLoginAccount();
  console.log(JSON.stringify(result, null, 2));
  console.log('\nLogin:');
  console.log(`  URL:   ${result.login.urls[0]}`);
  console.log(`  Email: ${result.login.email}`);
  console.log(`  Pass:  ${result.login.password}`);
  process.exit(0);
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('ensure-clinic-login-account.mjs')
  || process.argv[1].includes('ensure-clinic-login-account')
);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
