import dotenv from 'dotenv';
import { connectToDb, sequelize } from '../db/mariadb.js';
import nurseModel from '../models/nurse.model.intelligent.js';

dotenv.config();

function generatePassword() {
  return Math.random().toString(36).slice(-10) + 'Nurse123!';
}

async function run() {
  try {
    await connectToDb();

    const email = String(process.env.SEED_NURSE_EMAIL || 'nurse@mediczy.com').trim().toLowerCase();
    const firstName = String(process.env.SEED_NURSE_FIRST_NAME || 'Seed').trim();
    const lastName = String(process.env.SEED_NURSE_LAST_NAME || 'Nurse').trim();
    const department = String(process.env.SEED_NURSE_DEPARTMENT || 'General').trim();
    const phoneNumber = String(process.env.SEED_NURSE_PHONE || '').trim() || null;
    const licenseNumber = String(process.env.SEED_NURSE_LICENSE || '').trim() || null;

    const isProduction = process.env.NODE_ENV === 'production';
    const providedPassword = String(process.env.SEED_NURSE_PASSWORD || '').trim();
    if (isProduction && !providedPassword) {
      throw new Error('SEED_NURSE_PASSWORD is required in production');
    }
    const password = providedPassword || generatePassword();

    const existing = await nurseModel.findOne({ where: { email } });
    if (existing) {
      console.log(`✅ Seed nurse already exists: ${email} (id=${existing.id})`);
      return;
    }

    const created = await nurseModel.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      licenseNumber,
      department,
      isActive: true
    });

    console.log(`✅ Seed nurse created: ${email} (id=${created.id})`);
    if (!providedPassword) {
      console.log(`🔑 Generated password (store it securely): ${password}`);
    } else {
      console.log('🔑 Password set from SEED_NURSE_PASSWORD');
    }
  } catch (err) {
    console.error('❌ Seed failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    try {
      await sequelize.close();
    } catch {
      // ignore
    }
  }
}

run();
