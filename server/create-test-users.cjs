/**
 * Create Test Users for Clinic System
 * Creates users directly in database since API server may not be running
 */

const { Sequelize } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Database connection
const sequelize = new Sequelize('mediczy_ai', 'mediczy_helper', (process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.DB_PASS || undefined), {
  host: '127.0.0.1',
  dialect: 'postgres',
  logging: false
});

const CLINIC_ID = 3; // From previous step

const TEST_USERS = [
  { 
    email: 'doctor@mediczy.com', 
    name: 'Dr. Test Doctor',
    role: 'doctor',
    phoneNumber: '+91-9999000001',
    specialization: 'General Medicine',
    qualification: 'MBBS, MD',
    experience: '5 years',
    gender: 'Male'
  },
  { 
    email: 'user@mediczy.com', 
    name: 'Test Patient',
    role: 'user',
    phoneNumber: '+91-9999000002',
    gender: 'Female'
  },
  { 
    email: 'lab@mediczy.com', 
    name: 'Lab Technician',
    role: 'lab_staff',
    phoneNumber: '+91-9999000003',
    department: 'Laboratory',
    gender: 'Male'
  },
  { 
    email: 'pharmacy@mediczy.com', 
    name: 'Pharmacy Manager',
    role: 'pharmacy_staff',
    phoneNumber: '+91-9999000004',
    department: 'Pharmacy',
    gender: 'Female'
  },
  { 
    email: 'nurse@mediczy.com', 
    name: 'Nurse Test',
    role: 'nurse',
    phoneNumber: '+91-9999000005',
    qualification: 'RN',
    gender: 'Female'
  },
  { 
    email: 'ambulance@mediczy.com', 
    name: 'Ambulance Driver',
    role: 'ambulance_driver',
    phoneNumber: '+91-9999000006',
    license: 'DL123456',
    gender: 'Male'
  }
];

function generateSecurePassword(length = 12) {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '@#$%&*!';
  
  let password = '';
  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += numbers[crypto.randomInt(0, numbers.length)];
  password += special[crypto.randomInt(0, special.length)];
  
  const allChars = uppercase + lowercase + numbers + special;
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)];
  }
  
  return password.split('').sort(() => crypto.randomInt(0, 2) - 1).join('');
}

async function createUsers() {
  console.log('👥 Creating test users in database...\n');
  
  const createdUsers = [];
  
  for (const user of TEST_USERS) {
    try {
      // Check if user already exists
      const [existing] = await sequelize.query(
        `SELECT id, email FROM users WHERE email = '${user.email}' LIMIT 1`
      );
      
      if (existing.length > 0) {
        console.log(`⚠️  User already exists: ${user.email} (ID: ${existing[0].id})`);
        createdUsers.push({ ...user, id: existing[0].id, password: 'ALREADY_EXISTS' });
        continue;
      }
      
      // Generate secure password
      const tempPassword = generateSecurePassword(12);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      // Create metadata
      const metadata = {
        requirePasswordChange: true,
        clinic_id: CLINIC_ID,
        isTeam: user.role !== 'user' && user.role !== 'doctor',
        isDoctor: user.role === 'doctor',
        ...(user.specialization && { specialization: user.specialization }),
        ...(user.qualification && { qualification: user.qualification }),
        ...(user.experience && { experience: user.experience }),
        ...(user.department && { department: user.department }),
        ...(user.license && { license: user.license })
      };
      
      // Insert user
      const [result] = await sequelize.query(`
        INSERT INTO users (
          "firstName", "lastName", email, password, "phoneNumber", role, gender,
          "dateOfBirth", metadata, "createdAt", "updatedAt"
        ) VALUES (
          '${user.name.split(' ')[0]}',
          '${user.name.split(' ').slice(1).join(' ') || user.name.split(' ')[0]}',
          '${user.email}',
          '${hashedPassword}',
          '${user.phoneNumber}',
          '${user.role}',
          '${user.gender}',
          '1990-01-01',
          '${JSON.stringify(metadata)}',
          NOW(),
          NOW()
        ) RETURNING id, email, role
      `);
      
      console.log(`✅ Created ${user.role}: ${user.email}`);
      console.log(`   User ID: ${result[0].id}`);
      console.log(`   Password: ${tempPassword}`);
      console.log(`   Linked to Clinic ID: ${CLINIC_ID}\n`);
      
      createdUsers.push({
        ...user,
        id: result[0].id,
        password: tempPassword
      });
      
    } catch (error) {
      console.error(`❌ Error creating ${user.email}:`, error.message);
    }
  }
  
  return createdUsers;
}

async function printSummary(users) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ TEST USERS CREATED SUCCESSFULLY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('📋 USER CREDENTIALS (SAVE THESE!):\n');
  
  users.forEach(user => {
    if (user.id) {
      console.log(`   ${user.role.toUpperCase()}`);
      console.log(`   ├─ Email: ${user.email}`);
      console.log(`   ├─ Password: ${user.password}`);
      console.log(`   ├─ User ID: ${user.id}`);
      console.log(`   └─ Linked to: SmartHealth Clinic (ID: ${CLINIC_ID})\n`);
    }
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏥 CLINIC LOGIN DETAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Email: clinic@mediczy.com');
  console.log('   Password: Clinic123');
  console.log('   URL: https://app.mediqzy.com/clinic/login');
  console.log('   Dashboard: https://app.mediqzy.com/clinic/dashboard');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('🎯 NEXT STEPS:');
  console.log('   1. Update clinic auth routes to use database');
  console.log('   2. Test clinic login');
  console.log('   3. Test user logins\n');
}

async function main() {
  console.log('🚀 CLINIC TEST USERS SETUP');
  console.log('===========================\n');
  
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');
    
    const users = await createUsers();
    await printSummary(users);
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
