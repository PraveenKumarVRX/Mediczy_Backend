/**
 * Create Hospital Account - Legacy hospitals table
 * Email: hospital@mediczy.com
 * Password: Hospital123
 */

import Hospital from './models/hospital.model.intelligent.js';
import { postgresSequelize } from './db/postgres-sequelize.js';

async function createHospitalAccount() {
  try {
    await postgresSequelize.authenticate();
    console.log('✅ Database connected');

    // Check if hospital already exists
    const existing = await Hospital.findOne({
      where: { email: 'hospital@mediczy.com' }
    });

    if (existing) {
      console.log('❌ Hospital already exists:', existing.toJSON());
      process.exit(1);
    }

    // Create hospital account
    const hospital = await Hospital.create({
      hospitalName: 'Mediczy Test Hospital',
      registrationNumber: 'HOSP-TEST-2026',
      email: 'hospital@mediczy.com',
      password: 'Hospital123', // Will be auto-hashed by beforeCreate hook
      phoneNumber: '9876543210',
      address: 'Test City, Medical District',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      totalBeds: 100,
      availableBeds: 80,
      specializations: ['General Medicine', 'Surgery', 'Cardiology'],
      facilities: ['Emergency', 'ICU', 'Pharmacy'],
      status: 'active',
      isVerified: true
    });

    console.log('✅ Hospital created successfully:');
    console.log(JSON.stringify({
      id: hospital.id,
      email: hospital.email,
      hospitalName: hospital.hospitalName,
      status: hospital.status,
      isVerified: hospital.isVerified
    }, null, 2));

    console.log('\n🔑 Login credentials:');
    console.log('Email: hospital@mediczy.com');
    console.log('Password: Hospital123');

  } catch (error) {
    console.error('❌ Error creating hospital:', error);
    process.exit(1);
  } finally {
    await postgresSequelize.close();
    process.exit(0);
  }
}

createHospitalAccount();
