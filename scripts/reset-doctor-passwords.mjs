#!/usr/bin/env node

/**
 * Doctor Password Reset Utility (PostgreSQL)
 * ------------------------------------------
 * Normalizes the credentials for core doctor test accounts so the
 * doctor portal login works consistently across environments.
 *
 * Default targets (can be adjusted below):
 *  - doctor@mediczy.com      -> Doctor123
 *  - rajesh.doctor@mediqzy.com -> Doctor123!
 *  - meera.doctor@mediqzy.com  -> Doctor123!
 *  - amit.doctor@mediqzy.com   -> Doctor123!
 */

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { postgresSequelize } from '../server/db/postgres-sequelize.js';

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim();
    if (key && !(key in process.env)) {
      process.env[key.trim()] = value;
    }
  });
}

loadDotEnv();

const doctorTargets = [
  { email: 'doctor@mediczy.com', password: 'Doctor123', reason: 'Primary doctor portal test user' },
  { email: 'rajesh.doctor@mediqzy.com', password: 'Doctor123!', reason: 'Cardiologist test account' },
  { email: 'meera.doctor@mediqzy.com', password: 'Doctor123!', reason: 'Pediatrician test account' },
  { email: 'amit.doctor@mediqzy.com', password: 'Doctor123!', reason: 'General practitioner test account' },
];

async function resetDoctorPasswords() {
  try {
    await postgresSequelize.authenticate();
    console.log('✅ Connected to PostgreSQL');

    for (const target of doctorTargets) {
      const [rows] = await postgresSequelize.query(
        'SELECT id, email FROM doctors WHERE LOWER(email) = LOWER(?) LIMIT 1',
        { replacements: [target.email] }
      );

      if (!rows || !rows.length) {
        console.warn(`⚠️  Doctor not found: ${target.email}`);
        continue;
      }

      const doctor = rows[0];
      const hashedPassword = await bcrypt.hash(target.password, 10);

      await postgresSequelize.query(
        'UPDATE doctors SET password = ?, "updatedAt" = NOW() WHERE id = ?',
        { replacements: [hashedPassword, doctor.id] }
      );

      // Verify write
      const [verifyRows] = await postgresSequelize.query(
        'SELECT password FROM doctors WHERE id = ?',
        { replacements: [doctor.id] }
      );
      const storedHash = verifyRows?.[0]?.password;
      const isMatch = storedHash ? await bcrypt.compare(target.password, storedHash) : false;

      console.log(`✅ Updated ${doctor.email} (${target.reason})${isMatch ? '' : ' ⚠️ verification failed'}`);
      if (!isMatch) {
        console.warn(`   ➜ Stored hash did not match expected password for ${target.email}`);
      }
    }

    console.log('🎉 Doctor passwords reset complete');
  } catch (error) {
    console.error('❌ Error resetting doctor passwords:', error.message);
    process.exitCode = 1;
  } finally {
    await postgresSequelize.close();
  }
}

resetDoctorPasswords();
