#!/usr/bin/env node

import dotenv from 'dotenv';
import Redis from 'ioredis';

import { connectToPostgresDB } from '../../db/postgres-sequelize.js';
import postgresSequelize from '../../db/postgres-sequelize.js';
import Lab from '../../models/postgres/lab.model.postgres.js';
import Pharmacy from '../../models/postgres/pharmacy.model.postgres.js';
import Hospital from '../../models/hospital.model.intelligent.js';
import nurseModel from '../../models/nurse.model.intelligent.js';
import { resetDoctorQaAccount } from './reset-doctor-qa-account.mjs';

dotenv.config({ path: '/home/ubuntu/Mediczy/server/.env' });

const QA_ACCOUNTS = {
  doctor: {
    email: 'doctor@mediczy.com',
    password: 'Doctor123',
    note: 'Existing seeded doctor account expected in environment',
  },
  lab: {
    email: 'qa.lab@mediczy.com',
    password: 'QaLab@123',
    values: {
      name: 'QA Central Lab',
      phoneNumber: '9999991001',
      status: 'active',
      isVerified: true,
      department: 'pathology',
    },
  },
  pharmacy: {
    email: 'qa.pharmacy@mediczy.com',
    password: 'QaPharm@123',
    values: {
      name: 'QA Pharmacy Store',
      phoneNumber: '9999991002',
      status: 'active',
      isVerified: true,
      homeDelivery: true,
      is24x7: true,
    },
  },
  nurse: {
    email: 'qa.nurse@mediczy.com',
    password: 'QaNurse@123',
    values: {
      firstName: 'QA',
      lastName: 'Nurse',
      phoneNumber: '9999991003',
      status: 'active',
      isVerified: true,
      specialization: 'General Nursing',
      qualification: 'BSc Nursing',
    },
  },
  hospital: {
    email: 'qa.hospital@mediczy.com',
    password: 'QaHosp@123',
    values: {
      hospitalName: 'QA General Hospital',
      phoneNumber: '9999991004',
      city: 'Bengaluru',
      state: 'Karnataka',
      status: 'active',
      isVerified: true,
      totalBeds: 100,
      availableBeds: 40,
      address: 'QA Block, Bengaluru',
    },
  },
};

async function upsertLab() {
  const { email, password, values } = QA_ACCOUNTS.lab;
  let row = await Lab.findOne({ where: { email } });
  if (!row) {
    row = await Lab.create({ email, password, ...values });
    return { action: 'created', id: row.id };
  }
  await row.update({ ...values, password });
  return { action: 'updated', id: row.id };
}

async function upsertPharmacy() {
  const { email, password, values } = QA_ACCOUNTS.pharmacy;
  let row = await Pharmacy.findOne({ where: { email } });
  if (!row) {
    row = await Pharmacy.create({ email, password, ...values });
    return { action: 'created', id: row.id };
  }
  await row.update({ ...values, password });
  return { action: 'updated', id: row.id };
}

async function upsertHospital() {
  const { email, password, values } = QA_ACCOUNTS.hospital;
  let row = await Hospital.findOne({ where: { email } });
  if (!row) {
    row = await Hospital.create({ email, password, ...values });
    return { action: 'created', id: row.id };
  }
  await row.update({ ...values, password });
  return { action: 'updated', id: row.id };
}

async function upsertNurse() {
  const { email, password, values } = QA_ACCOUNTS.nurse;
  let row = await nurseModel.findOne({ where: { email } });
  if (!row) {
    row = await nurseModel.create({ email, password, ...values });
    return { action: 'created', id: row.id };
  }
  await row.update({ ...values, password });
  return { action: 'updated', id: row.id };
}

async function clearRateLimitKeys() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
  });

  const ips = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const levels = ['short', 'medium', 'long'];
  const keys = new Set();

  for (const ip of ips) {
    keys.add(`csguard:blocked:${ip}`);
    for (const level of levels) keys.add(`csguard:fails:${level}:${ip}`);

    const patterns = [`rl:*${ip}*`, `rl:*ip:${ip}*`, `auth:*${ip}*`];
    for (const pattern of patterns) {
      const matched = await redis.keys(pattern).catch(() => []);
      for (const key of matched) keys.add(key);
    }
  }

  if (keys.size > 0) {
    await redis.del(...Array.from(keys)).catch(() => {});
  }

  await redis.quit().catch(() => {});
  return keys.size;
}

async function main() {
  await connectToPostgresDB();

  const results = {};
  results.doctor = await resetDoctorQaAccount({
    email: QA_ACCOUNTS.doctor.email,
    password: QA_ACCOUNTS.doctor.password,
  });
  results.lab = await upsertLab();
  results.pharmacy = await upsertPharmacy();
  results.nurse = await upsertNurse();
  results.hospital = await upsertHospital();

  const cleared = await clearRateLimitKeys();

  console.log('QA login blockers fixed:');
  console.log(JSON.stringify({ results, clearedRateLimitKeys: cleared }, null, 2));

  console.log('\nQA credentials for manual testing:');
  console.log(`doctor   | ${QA_ACCOUNTS.doctor.email}   | ${QA_ACCOUNTS.doctor.password}`);
  console.log(`lab      | ${QA_ACCOUNTS.lab.email}      | ${QA_ACCOUNTS.lab.password}`);
  console.log(`pharmacy | ${QA_ACCOUNTS.pharmacy.email} | ${QA_ACCOUNTS.pharmacy.password}`);
  console.log(`nurse    | ${QA_ACCOUNTS.nurse.email}    | ${QA_ACCOUNTS.nurse.password}`);
  console.log(`hospital | ${QA_ACCOUNTS.hospital.email} | ${QA_ACCOUNTS.hospital.password}`);

  await postgresSequelize.close();
}

main().catch(async (err) => {
  console.error('Failed to fix portal login blockers:', err.message);
  try { await postgresSequelize.close(); } catch {}
  process.exit(1);
});
