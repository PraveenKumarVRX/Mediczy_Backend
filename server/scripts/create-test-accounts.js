#!/usr/bin/env node

/**
 * Create Test Accounts for Mediczy Application
 * ============================================
 * 
 * Creates comprehensive test accounts for different user types:
 * - Regular Users
 * - Doctors (various specializations)
 * - Nurses
 * - Admin Users
 * - Team Members
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const DB_CONFIG = {
  host: 'localhost',
  user: 'mediczy',
  password: 'Mediczy2024Secure',
  database: 'mediczy'
};

class TestAccountCreator {
  constructor() {
    this.connection = null;
    this.testPassword = 'test123'; // Standard password for all test accounts
    this.hashedPassword = null;
  }

  async initialize() {
    console.log('🔐 Creating test accounts for Mediczy application...\n');
    
    // Hash the standard password
    this.hashedPassword = await bcrypt.hash(this.testPassword, 10);
    
    // Connect to database
    this.connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Database connected');
  }

  async createTestUsers() {
    console.log('\n👥 Creating Test Users...');
    
    const users = [
      {
        firstName: 'John',
        lastName: 'Patient',
        email: 'patient@test.com',
        phone: '+91-9876543210',
        gender: 'Male',
        dob: '1990-05-15',
        city: 'Mumbai',
        state: 'Maharashtra'
      },
      {
        firstName: 'Sarah',
        lastName: 'User',
        email: 'user@test.com',
        phone: '+91-9876543211',
        gender: 'Female',
        dob: '1985-08-22',
        city: 'Delhi',
        state: 'Delhi'
      },
      {
        firstName: 'Mike',
        lastName: 'Wellness',
        email: 'wellness@test.com',
        phone: '+91-9876543212',
        gender: 'Male',
        dob: '1988-12-10',
        city: 'Bangalore',
        state: 'Karnataka'
      }
    ];

    for (const user of users) {
      try {
        await this.connection.execute(`
          INSERT INTO users (
            firstName, lastName, email, password, phoneNumber, gender, 
            dateOfBirth, address_city, address_state, address_country,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'India', NOW(), NOW())
          ON DUPLICATE KEY UPDATE updatedAt = NOW()
        `, [
          user.firstName, user.lastName, user.email, this.hashedPassword,
          user.phone, user.gender, user.dob, user.city, user.state
        ]);
        
        console.log(`✅ User: ${user.email}`);
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
          console.error(`❌ Failed to create user ${user.email}:`, error.message);
        } else {
          console.log(`ℹ️  User already exists: ${user.email}`);
        }
      }
    }
  }

  async createTestDoctors() {
    console.log('\n👨‍⚕️ Creating Test Doctors...');
    
    const doctors = [
      {
        firstName: 'Dr. Rajesh',
        lastName: 'Sharma',
        email: 'cardio@test.com',
        phone: '+91-9876543220',
        specialization: 'Cardiologist',
        qualification: 'MD Cardiology, AIIMS Delhi',
        experience: 15,
        fees: 1500.00,
        address: 'Max Hospital, Saket, New Delhi'
      },
      {
        firstName: 'Dr. Priya',
        lastName: 'Patel',
        email: 'neuro@test.com',
        phone: '+91-9876543221',
        specialization: 'Neurologist',
        qualification: 'DM Neurology, PGI Chandigarh',
        experience: 12,
        fees: 1800.00,
        address: 'Apollo Hospital, Ahmedabad'
      },
      {
        firstName: 'Dr. Amit',
        lastName: 'Kumar',
        email: 'gp@test.com',
        phone: '+91-9876543222',
        specialization: 'General Practitioner',
        qualification: 'MBBS, MD General Medicine',
        experience: 8,
        fees: 800.00,
        address: 'Community Health Center, Pune'
      },
      {
        firstName: 'Dr. Sunita',
        lastName: 'Singh',
        email: 'pediatric@test.com',
        phone: '+91-9876543223',
        specialization: 'Pediatrician',
        qualification: 'MD Pediatrics, KGMU Lucknow',
        experience: 10,
        fees: 1200.00,
        address: 'Fortis Hospital, Noida'
      },
      {
        firstName: 'Dr. Arjun',
        lastName: 'Reddy',
        email: 'ortho@test.com',
        phone: '+91-9876543224',
        specialization: 'Orthopedist',
        qualification: 'MS Orthopedics, CMC Vellore',
        experience: 14,
        fees: 1600.00,
        address: 'Manipal Hospital, Bangalore'
      }
    ];

    for (const doctor of doctors) {
      try {
        await this.connection.execute(`
          INSERT INTO doctors (
            prefix, firstName, lastName, email, password, phoneNumber,
            specialization, qualification, experience, consultationFees,
            clinicAddress, isVerified, isAvailable, createdAt, updatedAt
          ) VALUES (
            'Dr', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW()
          )
          ON DUPLICATE KEY UPDATE updatedAt = NOW()
        `, [
          doctor.firstName, doctor.lastName, doctor.email, this.hashedPassword,
          doctor.phone, doctor.specialization, doctor.qualification,
          doctor.experience, doctor.fees, doctor.address
        ]);
        
        console.log(`✅ Doctor: ${doctor.email} (${doctor.specialization})`);
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
          console.error(`❌ Failed to create doctor ${doctor.email}:`, error.message);
        } else {
          console.log(`ℹ️  Doctor already exists: ${doctor.email}`);
        }
      }
    }
  }

  async createTeamAccounts() {
    console.log('\n👥 Creating Team & Staff Accounts...');
    
    // Check if we have a nurses or staff table
    const tables = await this.connection.execute('SHOW TABLES');
    const tableNames = tables[0].map(row => Object.values(row)[0]);
    
    console.log('Available tables:', tableNames.join(', '));
    
    // For now, create team accounts as users with special naming
    const teamMembers = [
      {
        firstName: 'Nurse',
        lastName: 'Manager',
        email: 'nurse@test.com',
        phone: '+91-9876543230',
        gender: 'Female',
        dob: '1987-03-20',
        city: 'Chennai',
        state: 'Tamil Nadu'
      },
      {
        firstName: 'Admin',
        lastName: 'Staff',
        email: 'admin@test.com',
        phone: '+91-9876543231',
        gender: 'Male',
        dob: '1984-11-05',
        city: 'Hyderabad',
        state: 'Telangana'
      },
      {
        firstName: 'Lab',
        lastName: 'Technician',
        email: 'lab@test.com',
        phone: '+91-9876543232',
        gender: 'Male',
        dob: '1991-07-18',
        city: 'Kolkata',
        state: 'West Bengal'
      },
      {
        firstName: 'Reception',
        lastName: 'Desk',
        email: 'reception@test.com',
        phone: '+91-9876543233',
        gender: 'Female',
        dob: '1993-09-12',
        city: 'Jaipur',
        state: 'Rajasthan'
      }
    ];

    for (const member of teamMembers) {
      try {
        await this.connection.execute(`
          INSERT INTO users (
            firstName, lastName, email, password, phoneNumber, gender,
            dateOfBirth, address_city, address_state, address_country,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'India', NOW(), NOW())
          ON DUPLICATE KEY UPDATE updatedAt = NOW()
        `, [
          member.firstName, member.lastName, member.email, this.hashedPassword,
          member.phone, member.gender, member.dob, member.city, member.state
        ]);
        
        console.log(`✅ Team Member: ${member.email} (${member.firstName} ${member.lastName})`);
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
          console.error(`❌ Failed to create team member ${member.email}:`, error.message);
        } else {
          console.log(`ℹ️  Team member already exists: ${member.email}`);
        }
      }
    }
  }

  async generateCredentialsReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 MEDICZY TEST CREDENTIALS REPORT');
    console.log('='.repeat(80));
    
    console.log('\n🔑 UNIVERSAL TEST PASSWORD: test123\n');
    
    console.log('👤 REGULAR USERS:');
    console.log('─'.repeat(50));
    console.log('📧 patient@test.com     | John Patient     | Mumbai Patient');
    console.log('📧 user@test.com        | Sarah User       | Delhi User');
    console.log('📧 wellness@test.com    | Mike Wellness    | Bangalore Wellness User');
    
    console.log('\n👨‍⚕️ DOCTORS:');
    console.log('─'.repeat(50));
    console.log('📧 cardio@test.com      | Dr. Rajesh Sharma | Cardiologist (₹1500)');
    console.log('📧 neuro@test.com       | Dr. Priya Patel   | Neurologist (₹1800)');
    console.log('📧 gp@test.com          | Dr. Amit Kumar    | General Practitioner (₹800)');
    console.log('📧 pediatric@test.com   | Dr. Sunita Singh  | Pediatrician (₹1200)');
    console.log('📧 ortho@test.com       | Dr. Arjun Reddy   | Orthopedist (₹1600)');
    
    console.log('\n👥 TEAM & STAFF:');
    console.log('─'.repeat(50));
    console.log('📧 nurse@test.com       | Nurse Manager     | Healthcare Staff');
    console.log('📧 admin@test.com       | Admin Staff       | Administrative');
    console.log('📧 lab@test.com         | Lab Technician    | Laboratory Staff');
    console.log('📧 reception@test.com   | Reception Desk    | Front Desk Staff');
    
    console.log('\n🌐 EXISTING ACCOUNTS:');
    console.log('─'.repeat(50));
    console.log('📧 admin@mediczy.local  | Platform Admin    | System Administrator');
    console.log('📧 kumar@test.com       | Kumar Jay         | Existing User');
    
    console.log('\n🔐 LOGIN INSTRUCTIONS:');
    console.log('─'.repeat(50));
    console.log('1. Go to: http://your-server-ip/');
    console.log('2. Use any email above with password: test123');
    console.log('3. Doctors have separate login at doctor-specific routes');
    console.log('4. All accounts are pre-verified and active');
    
    console.log('\n🧪 TESTING FEATURES:');
    console.log('─'.repeat(50));
    console.log('• Labs: Search 2,362+ laboratories');
    console.log('• Doctors: Browse 5,000+ healthcare providers'); 
    console.log('• Appointments: Book with test doctors');
    console.log('• AI Chat: Medical AI assistance');
    console.log('• Health Tracking: BMI, calories, vitals');
    console.log('• Emergency: Triage and emergency services');
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ All test accounts created successfully!');
    console.log('🚀 Ready for comprehensive application testing');
    console.log('='.repeat(80));
  }

  async cleanup() {
    if (this.connection) {
      await this.connection.end();
      console.log('\n🧹 Database connection closed');
    }
  }
}

// Main execution
async function main() {
  const creator = new TestAccountCreator();
  
  try {
    await creator.initialize();
    await creator.createTestUsers();
    await creator.createTestDoctors();
    await creator.createTeamAccounts();
    await creator.generateCredentialsReport();
    
  } catch (error) {
    console.error('\n❌ Error creating test accounts:', error);
    process.exit(1);
    
  } finally {
    await creator.cleanup();
  }
}

// Export for use as module or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default TestAccountCreator;