#!/usr/bin/env node
/**
 * Ensure a clinic tenant + /clinic/login (hospitals) account exist.
 *
 * Usage (on EC2):
 *   cd /home/ubuntu/Mediczy/server
 *   CLINIC_NAME='AJ Dental Clinic' \
 *   CLINIC_CODE=AJDENTAL \
 *   CLINIC_SUBDOMAIN=ajdental \
 *   CLINIC_EMAIL=admin@ajdental.com \
 *   CLINIC_PASSWORD='AjDental@123' \
 *   node scripts/qa/ensure-clinic-login-account.mjs
 *
 * Or via admin API after deploy:
 *   POST /api/admin/clinics/ensure-login
 */
import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import Tenant from '../../models/postgres/tenant.model.postgres.js';
import Hospital from '../../models/hospital.model.intelligent.js';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });
dotenv.config();

const DEFAULTS = {
  name: process.env.CLINIC_NAME || 'AJ Dental Clinic',
  code: (process.env.CLINIC_CODE || 'AJDENTAL').toUpperCase(),
  subdomain: (process.env.CLINIC_SUBDOMAIN || 'ajdental').toLowerCase().trim(),
  email: (process.env.CLINIC_EMAIL || 'admin@ajdental.com').toLowerCase().trim(),
  password: process.env.CLINIC_PASSWORD || 'AjDental@123',
  phone: process.env.CLINIC_PHONE || '+919999000111',
  city: process.env.CLINIC_CITY || 'India',
  specialty: process.env.CLINIC_SPECIALTY || 'dental',
};

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

export async function ensureClinicLoginAccount(input = {}) {
  const name = String(input.name || DEFAULTS.name).trim();
  const code = String(input.code || DEFAULTS.code).toUpperCase().trim();
  const subdomain = String(input.subdomain || DEFAULTS.subdomain).toLowerCase().trim();
  const email = String(input.email || DEFAULTS.email).toLowerCase().trim();
  const password = String(input.password || DEFAULTS.password);
  const phone = String(input.phone || DEFAULTS.phone);
  const city = String(input.city || DEFAULTS.city);
  const specialty = String(input.specialty || DEFAULTS.specialty);
  const slug = toSlug(input.slug || subdomain || name);

  if (!name || !subdomain || !email || !password) {
    throw new Error('name, subdomain, email, and password are required');
  }

  let tenant = await Tenant.findOne({
    where: {
      type: 'clinic',
      [Op.or]: [
        { subdomain },
        { slug },
        { slug: subdomain },
        { email },
        { admin_email: email },
      ],
    },
  });

  const tenantPatch = {
    name,
    slug,
    subdomain,
    email: input.tenantEmail || `${subdomain}@mediczy.internal`,
    phone,
    type: 'clinic',
    status: 'active',
    is_verified: true,
    verified_at: new Date(),
    admin_email: email,
    admin_password: password,
    plan: input.plan || tenant?.plan || 'free',
    settings: {
      ...(tenant?.settings || {}),
      clinic_code: code,
      specialty,
      timezone: 'Asia/Kolkata',
      language: 'en',
      currency: 'INR',
    },
    branding: {
      ...(tenant?.branding || {}),
      display_name: code,
    },
    metadata: {
      ...(tenant?.metadata || {}),
      clinic_code: code,
      specialty,
      ensure_login: true,
      ensure_login_at: new Date().toISOString(),
    },
  };

  let tenantAction = 'updated';
  if (!tenant) {
    tenant = await Tenant.create(tenantPatch);
    tenantAction = 'created';
  } else {
    await tenant.update(tenantPatch);
  }

  let hospital = await Hospital.findOne({
    where: { email },
  });

  const hospitalPatch = {
    hospitalName: name,
    email,
    password,
    phoneNumber: phone,
    city,
    state: input.state || '',
    address: input.address || `${name}`,
    registrationNumber: input.registrationNumber || `CLINIC-${code}`,
    status: 'active',
    isVerified: true,
    specializations: ['Dental', specialty].filter(Boolean),
    facilities: [],
    metadata: {
      clinicType: 'Dental Clinic',
      registeredAs: 'clinic',
      clinic_code: code,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_subdomain: tenant.subdomain,
      numberOfRooms: Number(input.numberOfRooms || 0),
    },
  };

  let hospitalAction = 'updated';
  if (!hospital) {
    hospital = await Hospital.create(hospitalPatch);
    hospitalAction = 'created';
  } else {
    await hospital.update(hospitalPatch);
  }

  return {
    tenantAction,
    hospitalAction,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      status: tenant.status,
      access_url: `https://${tenant.subdomain}.mediqzy.com`,
    },
    hospital: {
      id: hospital.id,
      name: hospital.hospitalName || hospital.hospital_name,
      email: hospital.email,
      status: hospital.status,
    },
    login: {
      email,
      password,
      urls: [
        `https://${subdomain}.mediqzy.com/clinic/login`,
        'https://app.mediqzy.com/clinic/login',
      ],
    },
  };
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
