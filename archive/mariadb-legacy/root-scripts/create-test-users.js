const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'Root@12345',
  database: 'mediczy'
};

const TEST_USERS = [
  // Main test accounts
  { table: 'users', email: 'user@mediczy.com', password: 'User123', firstName: 'Test', lastName: 'User', role: 'user' },
  { table: 'doctors', email: 'doctor@mediczy.com', password: 'Doctor123', firstName: 'Test', lastName: 'Doctor', specialization: 'General Practitioner' },
  { table: 'users', email: 'admin@mediczy.com', password: 'Admin123', firstName: 'Admin', lastName: 'User', role: 'admin' },
  { table: 'users', email: 'team@mediczy.com', password: 'Team123', firstName: 'Team', lastName: 'Member', role: 'team' },
  { table: 'nurses', email: 'nurse@mediczy.com', password: 'Nurse123', firstName: 'Test', lastName: 'Nurse' },
  { table: 'doctor_assistants', email: 'assistant@mediczy.com', password: 'Assistant123', firstName: 'Test', lastName: 'Assistant' },
  { table: 'corporates', email: 'corporate@mediczy.com', password: 'Corporate123', companyName: 'Test Corporate Ltd' },
  
  // Legacy accounts
  { table: 'users', email: 'patient@test.com', password: 'test123', firstName: 'John', lastName: 'Patient', role: 'user' },
  { table: 'users', email: 'user@test.com', password: 'test123', firstName: 'Sarah', lastName: 'User', role: 'user' },
  { table: 'users', email: 'wellness@test.com', password: 'test123', firstName: 'Mike', lastName: 'Wellness', role: 'user' },
  { table: 'doctors', email: 'cardio@test.com', password: 'test123', firstName: 'Dr. Rajesh', lastName: 'Sharma', specialization: 'Cardiologist' },
  { table: 'doctors', email: 'neuro@test.com', password: 'test123', firstName: 'Dr. Priya', lastName: 'Patel', specialization: 'Neurologist' },
  { table: 'doctors', email: 'gp@test.com', password: 'test123', firstName: 'Dr. Amit', lastName: 'Kumar', specialization: 'General Practitioner' },
];

async function createTestUsers() {
  let connection;
  
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected to database');
    
    for (const user of TEST_USERS) {
      try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(user.password, 10);
        
        // Check if user already exists
        const [existing] = await connection.execute(
          `SELECT id FROM ${user.table} WHERE email = ?`,
          [user.email]
        );
        
        if (existing.length > 0) {
          console.log(`⏭️  Skipping ${user.email} - already exists`);
          continue;
        }
        
        // Prepare insert based on table
        let query, values;
        
        if (user.table === 'users') {
          query = `INSERT INTO users (email, password, firstName, lastName, role, phoneNumber, isEmailVerified, createdAt, updatedAt) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
          values = [user.email, hashedPassword, user.firstName, user.lastName, user.role || 'user', '9999999999', 1];
        } else if (user.table === 'doctors') {
          query = `INSERT INTO doctors (email, password, firstName, lastName, specialization, qualification, experience, registrationNumber, phoneNumber, isVerified, createdAt, updatedAt) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
          values = [user.email, hashedPassword, user.firstName, user.lastName, user.specialization, 'MBBS', 5, 'REG' + Date.now(), '9999999999', 1];
        } else if (user.table === 'nurses') {
          query = `INSERT INTO nurses (email, password, firstName, lastName, qualification, experience, registrationNumber, phoneNumber, isVerified, createdAt, updatedAt) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
          values = [user.email, hashedPassword, user.firstName, user.lastName, 'BSc Nursing', 3, 'NURSE' + Date.now(), '9999999999', 1];
        } else if (user.table === 'doctor_assistants') {
          query = `INSERT INTO doctor_assistants (email, password, firstName, lastName, phoneNumber, createdAt, updatedAt) 
                   VALUES (?, ?, ?, ?, ?, NOW(), NOW())`;
          values = [user.email, hashedPassword, user.firstName, user.lastName, '9999999999'];
        } else if (user.table === 'corporates') {
          query = `INSERT INTO corporates (email, password, companyName, industry, numberOfEmployees, phoneNumber, isVerified, createdAt, updatedAt) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
          values = [user.email, hashedPassword, user.companyName, 'Healthcare', 500, '9999999999', 1];
        }
        
        await connection.execute(query, values);
        console.log(`✅ Created ${user.email} in ${user.table}`);
        
      } catch (error) {
        console.error(`❌ Error creating ${user.email}:`, error.message);
      }
    }
    
    console.log('\n✅ Test user creation completed!');
    
  } catch (error) {
    console.error('❌ Database connection error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createTestUsers();
