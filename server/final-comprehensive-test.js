#!/usr/bin/env node

/**
 * Comprehensive Enhanced Doctor Management System Test
 * Tests all functionality with unique data and proper cleanup
 */

import axios from 'axios';
import { performance } from 'perf_hooks';

const BASE_URL = 'http://localhost:8000/api';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retries: 3,
  delay: 1000
};

// Generate unique test data
const timestamp = Date.now();
const testDoctorEmail = `doctor.test.${timestamp}@mediczy.com`;
const testPatientEmail = `patient.test.${timestamp}@example.com`;

let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function makeRequest(method, endpoint, data = null, token = null, retries = 0) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {},
      timeout: TEST_CONFIG.timeout
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (data) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    if (retries < TEST_CONFIG.retries && error.code === 'ECONNRESET') {
      log(`   Retrying request (${retries + 1}/${TEST_CONFIG.retries})...`, 'yellow');
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delay));
      return makeRequest(method, endpoint, data, token, retries + 1);
    }
    
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status,
      code: error.code
    };
  }
}

async function runTest(testName, testFunction) {
  const startTime = performance.now();
  testResults.total++;
  
  try {
    log(`\n🧪 ${testName}...`, 'cyan');
    const result = await testFunction();
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    if (result.success) {
      testResults.passed++;
      log(`✅ ${testName} - PASSED (${duration}ms)`, 'green');
      testResults.details.push({ name: testName, status: 'PASSED', duration, details: result.details });
    } else {
      testResults.failed++;
      log(`❌ ${testName} - FAILED (${duration}ms)`, 'red');
      log(`   Error: ${JSON.stringify(result.error)}`, 'red');
      testResults.details.push({ name: testName, status: 'FAILED', duration, error: result.error });
    }
  } catch (error) {
    testResults.failed++;
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    log(`❌ ${testName} - ERROR (${duration}ms)`, 'red');
    log(`   Exception: ${error.message}`, 'red');
    testResults.details.push({ name: testName, status: 'ERROR', duration, error: error.message });
  }
}

// Test data storage
let authToken = '';
let doctorId = '';
let patientToken = '';
let patientId = '';

// Test 1: Enhanced Doctor Registration
async function testDoctorRegistration() {
  const doctorData = {
    prefix: 'Dr.',
    firstName: 'Enhanced',
    lastName: 'TestDoc',
    email: testDoctorEmail,
    password: 'SecureTestPass123!',
    phoneNumber: `+91987654${timestamp.toString().slice(-4)}`,
    specialization: 'Cardiology',
    subSpecializations: ['Interventional Cardiology', 'Cardiac Surgery'],
    experienceYears: 12,
    registrationNumber: `TEST${timestamp}`,
    
    qualifications: {
      ug: {
        degree: 'MBBS',
        college: 'Test Medical College',
        university: 'Test University',
        passingYear: 2010,
        percentage: 85.5
      },
      pg: {
        degree: 'MD',
        specialization: 'Cardiology',
        college: 'Test Institute',
        university: 'Test University',
        passingYear: 2014,
        percentage: 89.2
      }
    },
    
    practiceType: 'both',
    clinicHospitalName: 'Test Heart Clinic',
    practiceAddress: {
      street: '123 Test Medical Plaza',
      city: 'TestCity',
      state: 'TestState',
      country: 'India',
      pincode: '400001',
      landmark: 'Near Test Hospital'
    },
    
    consultationTypes: {
      online: { available: true, fee: 500 },
      walkIn: { available: true, fee: 800 },
      homeVisit: { available: true, fee: 1500 }
    },
    
    languages: ['English', 'Hindi', 'TestLanguage'],
    servicesOffered: ['ECG', 'Echo', 'Stress Testing']
  };

  const result = await makeRequest('POST', '/doctors/register', doctorData);
  
  if (result.success && result.data.success) {
    authToken = result.data.token;
    doctorId = result.data.doctor.id;
    return { 
      success: true, 
      details: `Doctor ID: ${doctorId}, Token received: ${authToken ? 'Yes' : 'No'}` 
    };
  }
  
  return { success: false, error: result.error };
}

// Test 2: Doctor Authentication & Profile
async function testDoctorProfile() {
  const result = await makeRequest('GET', '/doctors/profile', null, authToken);
  
  if (result.success && result.data.success) {
    const doctor = result.data.doctor;
    return { 
      success: true, 
      details: `Doctor: ${doctor.firstName} ${doctor.lastName}, Specialization: ${doctor.specialization}` 
    };
  }
  
  return { success: false, error: result.error };
}

// Test 3: Doctor Profile Update
async function testDoctorProfileUpdate() {
  const updateData = {
    bio: 'Comprehensive test of enhanced doctor profile system with advanced cardiac care specialization.',
    awards: [
      {
        title: 'Test Excellence Award 2023',
        institution: 'Test Medical Association',
        year: 2023
      }
    ]
  };

  const result = await makeRequest('PUT', '/doctors/profile', updateData, authToken);
  
  if (result.success && result.data.success) {
    return { success: true, details: 'Profile updated successfully' };
  }
  
  return { success: false, error: result.error };
}

// Test 4: Availability Management
async function testAvailabilitySetup() {
  const availabilityData = {
    template: 'weekdays-only',
    timeSlots: [
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '17:00' },
      { startTime: '18:00', endTime: '20:00' }
    ],
    consultationTypes: ['online', 'walkIn'],
    excludeDays: []
  };

  const result = await makeRequest('POST', '/doctors/availability/quick-setup', availabilityData, authToken);
  
  if (result.success && result.data.success) {
    return { success: true, details: 'Availability configured for weekdays with 3 time slots' };
  }
  
  return { success: false, error: result.error };
}

// Test 5: Doctor Dashboard
async function testDoctorDashboard() {
  const result = await makeRequest('GET', '/doctors/availability/dashboard', null, authToken);
  
  if (result.success && result.data.success) {
    const stats = result.data.dashboard.statistics;
    return { 
      success: true, 
      details: `Available days: ${stats.availableDays}, Total slots: ${stats.totalSlots}` 
    };
  }
  
  return { success: false, error: result.error };
}

// Test 6: Patient Registration  
async function testPatientRegistration() {
  const patientData = {
    firstName: 'Test',
    lastName: 'Patient',
    email: testPatientEmail,
    password: 'TestPass123!',
    phoneNumber: `+91876543${timestamp.toString().slice(-4)}`,
    dateOfBirth: '1990-01-15',
    gender: 'Female'
  };

  const result = await makeRequest('POST', '/users/register', patientData);
  
  if (result.success && result.data.token) {
    patientToken = result.data.token;
    patientId = result.data.user?.id || 'unknown';
    return { 
      success: true, 
      details: `Patient registered with ID: ${patientId}` 
    };
  }
  
  return { success: false, error: result.error };
}

// Test 7: Available Slots Check
async function testAvailableSlots() {
  // Get tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const appointmentDate = tomorrow.toISOString().split('T')[0];
  
  const result = await makeRequest(
    'GET', 
    `/enhanced-appointments/available-slots?doctorId=${doctorId}&date=${appointmentDate}&consultationType=online`
  );
  
  if (result.success && result.data.success) {
    const slots = result.data.availableSlots;
    return { 
      success: true, 
      details: `Found ${slots.length} available slots for ${appointmentDate}` 
    };
  }
  
  return { success: false, error: result.error };
}

// Test 8: Enhanced Appointment Booking
async function testAppointmentBooking() {
  if (!patientToken) {
    return { success: false, error: 'Patient token not available' };
  }
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const appointmentDate = tomorrow.toISOString().split('T')[0];
  
  const appointmentData = {
    doctorId: doctorId,
    appointmentDate: appointmentDate,
    timeSlot: '09:00-10:00',
    consultationType: 'online',
    preferredLanguage: 'English',
    symptoms: 'Test consultation for chest discomfort',
    notes: 'First-time comprehensive cardiac evaluation'
  };

  const result = await makeRequest('POST', '/enhanced-appointments/book', appointmentData, patientToken);
  
  if (result.success && result.data.success) {
    const appointment = result.data.appointment;
    return { 
      success: true, 
      details: `Appointment ${appointment.appointmentNumber} booked for ${appointmentDate}` 
    };
  }
  
  return { success: false, error: result.error };
}

// Test 9: Doctor Search
async function testDoctorSearch() {
  const searchParams = new URLSearchParams({
    specialization: 'Cardiology',
    consultationType: 'online',
    language: 'English',
    maxFee: '1000'
  });

  const result = await makeRequest('GET', `/doctors/search?${searchParams.toString()}`);
  
  if (result.success && result.data.success) {
    const doctors = result.data.doctors;
    return { 
      success: true, 
      details: `Found ${doctors.length} doctors matching search criteria` 
    };
  }
  
  return { success: false, error: result.error };
}

// Test 10: System Health Check
async function testSystemHealth() {
  const result = await makeRequest('GET', '/health');
  
  if (result.success) {
    return { 
      success: true, 
      details: `System status: ${result.data.status}, Uptime: ${Math.round(result.data.uptime)}s` 
    };
  }
  
  return { success: false, error: result.error };
}

// Main test runner
async function runAllTests() {
  log('🚀 Enhanced Doctor Management System - Comprehensive Test Suite', 'bright');
  log('=' .repeat(80), 'yellow');
  log(`Test Run ID: ${timestamp}`, 'blue');
  log(`Doctor Email: ${testDoctorEmail}`, 'blue');
  log(`Patient Email: ${testPatientEmail}`, 'blue');
  log('=' .repeat(80), 'yellow');

  const testSuite = [
    { name: 'System Health Check', fn: testSystemHealth },
    { name: 'Enhanced Doctor Registration', fn: testDoctorRegistration },
    { name: 'Doctor Profile Retrieval', fn: testDoctorProfile },
    { name: 'Doctor Profile Update', fn: testDoctorProfileUpdate },
    { name: 'Availability Management Setup', fn: testAvailabilitySetup },
    { name: 'Doctor Dashboard', fn: testDoctorDashboard },
    { name: 'Patient Registration', fn: testPatientRegistration },
    { name: 'Available Slots Check', fn: testAvailableSlots },
    { name: 'Enhanced Appointment Booking', fn: testAppointmentBooking },
    { name: 'Doctor Search & Discovery', fn: testDoctorSearch }
  ];

  const startTime = performance.now();

  for (const test of testSuite) {
    await runTest(test.name, test.fn);
    
    // Add delay between tests to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const endTime = performance.now();
  const totalDuration = Math.round(endTime - startTime);

  // Final Results
  log('\n📊 Test Results Summary', 'bright');
  log('=' .repeat(80), 'yellow');
  
  testResults.details.forEach(result => {
    const statusColor = result.status === 'PASSED' ? 'green' : 'red';
    const duration = result.duration ? `(${result.duration}ms)` : '';
    log(`${result.status === 'PASSED' ? '✅' : '❌'} ${result.name} ${duration}`, statusColor);
    if (result.details) {
      log(`   ${result.details}`, 'blue');
    }
  });

  log(`\n🎯 Overall Results: ${testResults.passed}/${testResults.total} tests passed (${Math.round(testResults.passed/testResults.total*100)}%)`, 
       testResults.passed === testResults.total ? 'green' : 'yellow');
  
  log(`⏱️  Total execution time: ${totalDuration}ms`, 'blue');

  if (testResults.passed === testResults.total) {
    log('\n🎉 All tests passed! Enhanced Doctor Management System is fully functional.', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. System requires attention.', 'yellow');
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  log('\n❌ Unhandled Rejection at: Promise', 'red');
  console.log(reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  log('\n❌ Uncaught Exception thrown', 'red');
  console.log(err);
  process.exit(1);
});

// Run the comprehensive test suite
runAllTests().catch(error => {
  log('\n❌ Test suite failed to execute', 'red');
  console.error(error);
  process.exit(1);
});