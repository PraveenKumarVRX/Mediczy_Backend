#!/usr/bin/env node
/**
 * Seed script to create dummy doctors across all specializations.
 * Run: node server/scripts/seed-dummy-doctors.mjs
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { sequelize } from '../db/mariadb.js';
import Doctor from '../models/doctor.model.mariadb.js';

const SPECIALIZATIONS = [
  'General Practitioner',
  'Cardiologist',
  'Dermatologist',
  'Pediatrician',
  'Orthopedist',
  'Neurologist',
  'Psychiatrist',
  'Psychologist',
  'Gynecologist',
  'ENT Specialist',
  'Ophthalmologist',
  'Rheumatologist',
  'Pulmonologist',
  'Physiotherapist',
  'Occupational Therapist',
  'Nutritionist',
  'Dietician',
  'Nephrologist',
  'Urologist',
  'Diabetologist',
  'Intensivist',
  'Cardio Thoracic Surgeon',
  'Vascular Surgeon',
  'Neuro Surgeon',
  'Cardio Vascular Surgeon',
  'Gastroenterologist',
  'Gastro Surgeon',
  'General Surgeon',
  'Proctologist',
  'Podiatrician',
  'Dentist',
  'Endocrinologist',
  'Oncologist'
];

const DEFAULT_PASSWORD = 'DoctorPass123';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '.');
}

async function seedDoctors() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Model has a beforeCreate hook that hashes the password, so pass plain text
    let created = 0;
    let skipped = 0;

    for (const spec of SPECIALIZATIONS) {
      const slug = slugify(spec);
      const email = `test.${slug}@mediqzy.com`;

      const existing = await Doctor.findOne({ where: { email } });
      if (existing) {
        console.log(`⏭️  Skipped (exists): ${email}`);
        skipped++;
        continue;
      }

      await Doctor.create({
        prefix: 'Dr',
        firstName: spec.split(' ')[0],
        lastName: 'Test',
        email,
        password: DEFAULT_PASSWORD,
        phoneNumber: `+91900000${String(created + 1).padStart(4, '0')}`,
        specialization: spec,
        qualification: 'MBBS, MD',
        experience: 5 + Math.floor(Math.random() * 15),
        registrationNumber: `REG${Date.now()}${created}`,
        clinicAddress: 'Mediczy Virtual Clinic, Bangalore',
        consultationFees: 300 + Math.floor(Math.random() * 500),
        isVerified: true,
        isAvailable: true,
        isOnline: true,
        languages: JSON.stringify(['English', 'Hindi'])
      });

      console.log(`✅ Created: ${email} (${spec})`);
      created++;
    }

    console.log(`\n📊 Summary: ${created} created, ${skipped} skipped`);
    console.log(`🔑 Default password for all test doctors: ${DEFAULT_PASSWORD}`);
  } catch (error) {
    console.error('❌ Seed error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

seedDoctors();
