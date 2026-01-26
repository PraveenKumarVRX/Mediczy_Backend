/**
 * Create Clinic Account - Using hospitals table
 * Email: clinic@mediczy.com
 * Password: Clinic123
 */

import Hospital from './models/hospital.model.intelligent.js';
import { postgresSequelize } from './db/postgres-sequelize.js';

async function createClinicAccount() {
  try {
    await postgresSequelize.authenticate();
    console.log('✅ Database connected');

    // Check if clinic already exists
    const existing = await Hospital.findOne({
      where: { email: 'clinic@mediczy.com' }
    });

    if (existing) {
      console.log('❌ Clinic already exists:', existing.toJSON());
      process.exit(1);
    }

    // Create clinic account (stored in hospitals table)
    const clinic = await Hospital.create({
      hospitalName: 'Mediczy Test Clinic',
      registrationNumber: 'CLINIC-TEST-2026',
      email: 'clinic@mediczy.com',
      password: 'Clinic123', // Will be auto-hashed by beforeCreate hook
      phoneNumber: '9876543211',
      address: 'Test City, Clinic District',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      totalBeds: 10,
      availableBeds: 8,
      specializations: ['General Practice', 'Pediatrics'],
      facilities: ['OPD', 'Pharmacy'],
      status: 'active',
      isVerified: true,
      metadata: {
        clinicType: 'General',
        numberOfRooms: 5
      }
    });

    console.log('✅ Clinic created successfully:');
    console.log(JSON.stringify({
      id: clinic.id,
      email: clinic.email,
      hospitalName: clinic.hospitalName,
      status: clinic.status,
      isVerified: clinic.isVerified
    }, null, 2));

    console.log('\n🔑 Login credentials:');
    console.log('Email: clinic@mediczy.com');
    console.log('Password: Clinic123');

  } catch (error) {
    console.error('❌ Error creating clinic:', error);
    process.exit(1);
  } finally {
    await postgresSequelize.close();
    process.exit(0);
  }
}

createClinicAccount();
