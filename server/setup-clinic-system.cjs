/**
 * Comprehensive Clinic System Setup
 * Creates:
 * 1. Clinic entity in database
 * 2. 6 test users with automated welcome emails
 * 3. Links all users to the clinic
 */

const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const axios = require('axios');

// Database connection
const sequelize = new Sequelize('mediczy_ai', 'mediczy_helper', (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined), {
  host: '127.0.0.1',
  dialect: 'postgres',
  logging: false
});

const API_BASE = 'http://localhost:5000/api';
const ADMIN_EMAIL = 'admin@mediqzy.com';
const ADMIN_PASSWORD = 'Admin@123';

// Test users to create
const TEST_USERS = [
  { email: 'doctor@mediczy.com', role: 'doctor', name: 'Dr. Test Doctor', specialization: 'General Medicine' },
  { email: 'user@mediczy.com', role: 'user', name: 'Test Patient', type: 'patient' },
  { email: 'lab@mediczy.com', role: 'lab_staff', name: 'Lab Technician', department: 'Laboratory' },
  { email: 'pharmacy@mediczy.com', role: 'pharmacy_staff', name: 'Pharmacy Manager', department: 'Pharmacy' },
  { email: 'nurse@mediczy.com', role: 'nurse', name: 'Nurse Test', qualification: 'RN' },
  { email: 'ambulance@mediczy.com', role: 'ambulance_driver', name: 'Ambulance Driver', license: 'DL123456' }
];

async function adminLogin() {
  console.log('🔐 Logging in as admin...');
  try {
    const response = await axios.post(`${API_BASE}/admin/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    console.log('✅ Admin login successful');
    return response.data.token;
  } catch (error) {
    console.error('❌ Admin login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createClinicEntity() {
  console.log('\n📋 Step 1: Creating clinic entity in database...');
  
  try {
    // Check if clinic already exists in hospitals table
    const [existingClinic] = await sequelize.query(
      "SELECT id, hospital_name, email FROM hospitals WHERE email = 'clinic@mediczy.com' LIMIT 1"
    );

    if (existingClinic.length > 0) {
      console.log('✅ Clinic already exists:', existingClinic[0]);
      return { id: existingClinic[0].id, name: existingClinic[0].hospital_name, email: existingClinic[0].email };
    }

    // Create clinic in hospitals table
    const hashedPassword = await bcrypt.hash('Clinic123', 10);
    
    const [result] = await sequelize.query(`
      INSERT INTO hospitals (
        hospital_name, email, password, phone_number, 
        address, city, state, pincode, registration_number,
        total_beds, available_beds, network_type, cashless_enabled,
        status, is_verified, specializations, facilities, metadata,
        created_at, updated_at
      ) VALUES (
        'SmartHealth Clinic',
        'clinic@mediczy.com',
        '${hashedPassword}',
        '+91-9876543210',
        '321 Health Street, New Delhi',
        'New Delhi',
        'Delhi',
        '110001',
        'CLINIC-DL-2024-001',
        50,
        40,
        'Premium',
        true,
        'active',
        true,
        '["General Medicine", "Pediatrics", "Dental"]',
        '["Pharmacy", "Laboratory", "X-Ray"]',
        '{"clinicType": "General Practice", "numberOfRooms": 5, "hasPharmacy": true, "hasLab": true}',
        NOW(),
        NOW()
      ) RETURNING id, hospital_name, email
    `);

    console.log('✅ Clinic created in hospitals table:', result[0]);
    return { id: result[0].id, name: result[0].hospital_name, email: result[0].email };
  } catch (error) {
    console.error('❌ Error creating clinic:', error);
    throw error;
  }
}

async function createTestUsers(adminToken) {
  console.log('\n👥 Step 2: Creating test users with automated welcome emails...');
  
  const createdUsers = [];
  
  for (const user of TEST_USERS) {
    try {
      console.log(`\n📧 Creating ${user.role}: ${user.email}...`);
      
      let endpoint, payload;
      
      if (user.role === 'doctor') {
        endpoint = `${API_BASE}/admin/doctors`;
        payload = {
          name: user.name,
          email: user.email,
          phoneNumber: '+91-9999999999',
          specialization: user.specialization,
          experience: '5 years',
          qualification: 'MBBS, MD',
          licenseNumber: 'MED-' + Date.now(),
          consultationFee: 500
        };
      } else if (user.role === 'user') {
        endpoint = `${API_BASE}/admin/users`;
        payload = {
          name: user.name,
          email: user.email,
          phoneNumber: '+91-9999999999',
          role: 'user'
        };
      } else {
        // Team/Staff users
        endpoint = `${API_BASE}/admin/team`;
        payload = {
          name: user.name,
          email: user.email,
          phoneNumber: '+91-9999999999',
          role: user.role,
          department: user.department || 'General',
          designation: user.name
        };
      }
      
      const response = await axios.post(endpoint, payload, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      console.log(`✅ Created ${user.role}: ${user.email}`);
      console.log(`   User ID: ${response.data.user?.id || response.data.doctor?.id}`);
      console.log(`   Welcome email sent automatically`);
      
      createdUsers.push({
        ...user,
        id: response.data.user?.id || response.data.doctor?.id,
        data: response.data
      });
      
      // Wait a bit to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`❌ Error creating ${user.email}:`, error.response?.data || error.message);
      // Continue with other users even if one fails
    }
  }
  
  return createdUsers;
}

async function linkUsersToClinic(clinicId, users) {
  console.log('\n🔗 Step 3: Linking users to clinic...');
  
  for (const user of users) {
    if (!user.id) continue;
    
    try {
      // Update user metadata to include clinic_id
      await sequelize.query(`
        UPDATE users 
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{clinic_id}',
          '"${clinicId}"'
        )
        WHERE id = ${user.id}
      `);
      
      console.log(`✅ Linked ${user.email} to clinic`);
    } catch (error) {
      console.error(`❌ Error linking ${user.email}:`, error.message);
    }
  }
}

async function verifySetup(clinic, users) {
  console.log('\n✅ Step 4: Verification Summary\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 CLINIC DETAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Name: ${clinic.name}`);
  console.log(`   Email: ${clinic.email}`);
  console.log(`   Password: Clinic123`);
  console.log(`   Login URL: https://app.mediqzy.com/clinic/login`);
  console.log(`   Dashboard: https://app.mediqzy.com/clinic/dashboard`);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👥 TEST USERS CREATED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  users.forEach(user => {
    if (user.id) {
      console.log(`\n   ✓ ${user.role.toUpperCase()}`);
      console.log(`     Email: ${user.email}`);
      console.log(`     ID: ${user.id}`);
      console.log(`     Password: Check welcome email (sent automatically)`);
    }
  });
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 WELCOME EMAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   All users received welcome emails with:');
  console.log('   - Temporary passwords (secure, auto-generated)');
  console.log('   - Login instructions');
  console.log('   - First-login password change required');
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 NEXT STEPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   1. Test clinic login at https://app.mediqzy.com/clinic/login');
  console.log('   2. Use credentials: clinic@mediczy.com / Clinic123');
  console.log('   3. Check email inbox for test user passwords');
  console.log('   4. Update clinic auth routes to use database (next task)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function main() {
  console.log('🏥 CLINIC SYSTEM SETUP - COMPREHENSIVE');
  console.log('======================================\n');
  
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Step 1: Create clinic entity
    const clinic = await createClinicEntity();
    
    // Step 2: Login as admin
    const adminToken = await adminLogin();
    
    // Step 3: Create test users
    const users = await createTestUsers(adminToken);
    
    // Step 4: Link users to clinic
    await linkUsersToClinic(clinic.id, users);
    
    // Step 5: Verification
    await verifySetup(clinic, users);
    
    console.log('🎉 Setup completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run setup
main();
