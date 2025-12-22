#!/usr/bin/env node

import './server/models/user.model.mariadb.js';
import User from './server/models/user.model.mariadb.js';
import { connectToDb } from './server/db/mariadb.js';
import bcrypt from 'bcrypt';

async function createTestUser() {
  try {
    // Connect to database
    await connectToDb();
    console.log('Connected to database...');

    // Check if test user already exists
    const existingUser = await User.findOne({ where: { email: 'test@mediczy.com' } });
    
    if (existingUser) {
      console.log('Test user already exists!');
      console.log('📧 Email: test@mediczy.com');
      console.log('🔐 Password: testpass123');
      console.log('👤 Name: Test User');
      process.exit(0);
    }

    // Create test user
    const testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@mediczy.com',
      password: 'testpass123', // Will be hashed automatically by the model
      dateOfBirth: new Date('1990-01-01'),
      gender: 'Male',
      phoneNumber: '+1234567890',
      address_street: '123 Test Street',
      address_city: 'Test City',
      address_state: 'Test State',
      address_zipCode: '12345',
      address_country: 'Test Country',
      emergencyContact_name: 'Emergency Contact',
      emergencyContact_phone: '+1987654321',
      emergencyContact_relationship: 'Friend',
      insurance_provider: 'Test Insurance',
      insurance_policyNumber: 'TEST123456',
      insurance_groupNumber: 'GRP789',
      medical_allergies: 'None',
      medical_medications: 'None',
      medical_conditions: 'None',
      medical_bloodType: 'O+',
      isEmailVerified: true,
      isPhoneVerified: true,
      role: 'user'
    });

    console.log('✅ Test user created successfully!');
    console.log('');
    console.log('🎯 Login Credentials:');
    console.log('📧 Email: test@mediczy.com');
    console.log('🔐 Password: testpass123');
    console.log('👤 Name: Test User');
    console.log('📱 Phone: +1234567890');
    console.log('');
    console.log('🌐 Access the application at:');
    console.log('   https://localhost:9443');
    console.log('   or http://localhost (redirects to HTTPS)');

  } catch (error) {
    console.error('❌ Error creating test user:', error);
    
    if (error.name === 'SequelizeValidationError') {
      console.log('Validation errors:');
      error.errors.forEach(err => {
        console.log(`  - ${err.path}: ${err.message}`);
      });
    }
  }
  
  process.exit(0);
}

// Create admin test user as well
async function createAdminUser() {
  try {
    // Check if admin user already exists
    const existingAdmin = await User.findOne({ where: { email: 'admin@mediczy.com' } });
    
    if (existingAdmin) {
      console.log('Admin user already exists!');
      return;
    }

    const adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@mediczy.com',
      password: 'adminpass123',
      dateOfBirth: new Date('1985-01-01'),
      gender: 'Female',
      phoneNumber: '+1234567891',
      address_street: '456 Admin Street',
      address_city: 'Admin City',
      address_state: 'Admin State',
      address_zipCode: '54321',
      address_country: 'Admin Country',
      emergencyContact_name: 'Admin Emergency',
      emergencyContact_phone: '+1987654322',
      emergencyContact_relationship: 'Spouse',
      insurance_provider: 'Admin Insurance',
      insurance_policyNumber: 'ADMIN123456',
      insurance_groupNumber: 'AGRP789',
      medical_allergies: 'None',
      medical_medications: 'None',
      medical_conditions: 'None',
      medical_bloodType: 'A+',
      isEmailVerified: true,
      isPhoneVerified: true,
      role: 'admin'
    });

    console.log('✅ Admin user created successfully!');
    console.log('📧 Admin Email: admin@mediczy.com');
    console.log('🔐 Admin Password: adminpass123');
  } catch (error) {
    console.log('⚠️  Admin user creation failed (might already exist)');
  }
}

async function main() {
  await createTestUser();
  await createAdminUser();
}

main().catch(console.error);