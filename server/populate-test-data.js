import axios from 'axios';
import bcrypt from 'bcrypt';

const INTELLIGENT_DB_URL = 'http://localhost:8000/api';

async function populateTestData() {
  try {
    console.log('Populating Intelligent Database with test data...');

    // Test admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const testAdmin = {
      id: 1,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@mediczy.com',
      password: adminPassword,
      role: 'admin',
      phoneNumber: '+1234567890',
      specialization: 'Administration',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Test doctor
    const doctorPassword = await bcrypt.hash('doctor123', 10);
    const testDoctor = {
      id: 2,
      firstName: 'Dr. John',
      lastName: 'Smith',
      email: 'doctor@mediczy.com',
      password: doctorPassword,
      role: 'doctor',
      phoneNumber: '+1234567891',
      specialization: 'Cardiology',
      experience: 10,
      registrationNumber: 'MED123456',
      clinicAddress: 'Main Hospital, City',
      consultationFees: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Test user patient
    const userPassword = await bcrypt.hash('user123', 10);
    const testUser = {
      id: 3,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'user@mediczy.com',
      password: userPassword,
      role: 'patient',
      phoneNumber: '+1234567892',
      dateOfBirth: '1990-01-01',
      gender: 'Female',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add admin to doctors table (since our adapter checks doctors table for admin role)
    console.log('Adding test admin...');
    await axios.post(`${INTELLIGENT_DB_URL}/doctors/register`, testAdmin);

    // Add test doctor
    console.log('Adding test doctor...');
    await axios.post(`${INTELLIGENT_DB_URL}/doctors/register`, testDoctor);

    // Add test patient
    console.log('Adding test patient...');
    await axios.post(`${INTELLIGENT_DB_URL}/users/register`, testUser);

    console.log('✅ Test data populated successfully!');
    console.log('\nTest credentials:');
    console.log('Admin Login: admin@mediczy.com / admin123');
    console.log('Doctor Login: doctor@mediczy.com / doctor123');
    console.log('User Login: user@mediczy.com / user123');

  } catch (error) {
    console.error('❌ Error populating test data:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Check if main server is running
async function checkService() {
  try {
    const response = await axios.get(`http://localhost:8000/health`);
    console.log('✅ Main server with Intelligent Database is running');
    return true;
  } catch (error) {
    console.log('❌ Main server is not running on port 8000');
    return false;
  }
}

async function main() {
  const serviceRunning = await checkService();
  if (serviceRunning) {
    await populateTestData();
  } else {
    console.log('Please start the main server first (npm start or node index.js).');
  }
}

main();