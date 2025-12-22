import axios from 'axios';

// Configuration
const BASE_URL = 'http://localhost:8000';
const API_BASE = `${BASE_URL}/api`;

// Test data
let authToken = '';
let doctorId = '';
let patientToken = '';
let appointmentId = '';

// Console styling
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

// Helper function to make API requests
async function makeRequest(method, endpoint, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {}
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status
    };
  }
}

// Test 1: Doctor Registration
async function testDoctorRegistration() {
  log('\n🧑‍⚕️ Testing Enhanced Doctor Registration...', 'cyan');
  
  const doctorData = {
    prefix: 'Dr.',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    email: 'dr.rajesh.kumar@mediczy.com',
    password: 'SecurePass123!',
    phoneNumber: '+919876543210',
    specialization: 'Cardiology',
    subSpecialization: ['Interventional Cardiology', 'Cardiac Surgery'],
    experienceYears: 15,
    registrationNumber: 'MCI123456789',
    
    // Educational qualifications
    qualifications: {
      ug: {
        degree: 'MBBS',
        college: 'All Institute of Medical Sciences',
        university: 'Delhi University',
        passingYear: 2005,
        percentage: 85.5
      },
      pg: {
        degree: 'MD',
        specialization: 'Cardiology',
        college: 'AIIMS Delhi',
        university: 'Delhi University',
        passingYear: 2009,
        percentage: 89.2
      },
      fellowships: [
        {
          title: 'Fellowship in Interventional Cardiology',
          institution: 'Harvard Medical School',
          year: 2010
        }
      ]
    },
    
    // Practice information
    practiceType: 'both',
    clinicHospitalName: 'Kumar Heart Clinic',
    practiceAddress: {
      street: '123 Medical Plaza',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400001',
      landmark: 'Near Apollo Hospital'
    },
    
    // Consultation types and fees
    consultationTypes: {
      online: { available: true, fee: 500 },
      walkIn: { available: true, fee: 800 },
      homeVisit: { available: true, fee: 1500 }
    },
    
    // Languages
    languages: ['English', 'Hindi', 'Marathi'],
    
    // Services offered
    servicesOffered: [
      'ECG',
      'Echocardiography',
      'Stress Testing',
      'Cardiac Catheterization'
    ]
  };

  const result = await makeRequest('POST', '/doctors/register', doctorData);
  
  if (result.success) {
    log('✅ Doctor registration successful', 'green');
    authToken = result.data.token;
    doctorId = result.data.doctor.id;
    console.log(`   Doctor ID: ${doctorId}`);
    console.log(`   Token: ${authToken.substring(0, 20)}...`);
  } else {
    log('❌ Doctor registration failed', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 2: Doctor Profile Update
async function testDoctorProfileUpdate() {
  log('\n📝 Testing Doctor Profile Update...', 'cyan');
  
  const updateData = {
    bio: 'Experienced cardiologist with 15+ years of practice. Specialized in interventional cardiology and cardiac surgery.',
    awards: [
      {
        title: 'Best Cardiologist Award 2022',
        institution: 'Indian Medical Association',
        year: 2022
      }
    ],
    research: [
      {
        title: 'Minimally Invasive Cardiac Surgery Techniques',
        journal: 'Indian Heart Journal',
        year: 2021,
        impact: 'High'
      }
    ]
  };

  const result = await makeRequest('PUT', '/doctors/profile', updateData, authToken);
  
  if (result.success) {
    log('✅ Doctor profile update successful', 'green');
  } else {
    log('❌ Doctor profile update failed', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 3: Weekly Availability Setup
async function testAvailabilitySetup() {
  log('\n📅 Testing Weekly Availability Setup...', 'cyan');
  
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
  
  if (result.success) {
    log('✅ Availability setup successful', 'green');
  } else {
    log('❌ Availability setup failed', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 4: Patient Registration for Appointment Booking
async function testPatientRegistration() {
  log('\n👤 Testing Patient Registration...', 'cyan');
  
  const patientData = {
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya.sharma@example.com',
    password: 'PatientPass123!',
    phoneNumber: '+919876543211',
    dateOfBirth: '1992-05-15',
    gender: 'Female'
  };

  const result = await makeRequest('POST', '/users/register', patientData);
  
  if (result.success) {
    log('✅ Patient registration successful', 'green');
    patientToken = result.data.token;
    console.log(`   Patient Token: ${patientToken.substring(0, 20)}...`);
  } else {
    log('❌ Patient registration failed', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 5: Check Available Slots
async function testAvailableSlots() {
  log('\n🕐 Testing Available Slots Retrieval...', 'cyan');
  
  // Get tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const appointmentDate = tomorrow.toISOString().split('T')[0];
  
  const result = await makeRequest('GET', `/enhanced-appointments/available-slots?doctorId=${doctorId}&date=${appointmentDate}&consultationType=online`);
  
  if (result.success) {
    log('✅ Available slots retrieved successfully', 'green');
    console.log(`   Available slots: ${result.data.availableSlots.length}`);
    if (result.data.availableSlots.length > 0) {
      console.log(`   First slot: ${result.data.availableSlots[0].timeSlot}`);
    }
  } else {
    log('❌ Failed to retrieve available slots', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success && result.data.availableSlots.length > 0;
}

// Test 6: Book Appointment
async function testAppointmentBooking() {
  log('\n📅 Testing Enhanced Appointment Booking...', 'cyan');
  
  // Get tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const appointmentDate = tomorrow.toISOString().split('T')[0];
  
  const appointmentData = {
    doctorId: doctorId,
    appointmentDate: appointmentDate,
    timeSlot: '09:00-10:00',
    consultationType: 'online',
    preferredLanguage: 'English',
    symptoms: 'Chest pain and shortness of breath',
    notes: 'First-time consultation for cardiac evaluation',
    emergencyContact: '+919876543212'
  };

  const result = await makeRequest('POST', '/enhanced-appointments/book', appointmentData, patientToken);
  
  if (result.success) {
    log('✅ Appointment booking successful', 'green');
    appointmentId = result.data.appointment.id;
    console.log(`   Appointment ID: ${appointmentId}`);
    console.log(`   Appointment Number: ${result.data.appointment.appointmentNumber}`);
    console.log(`   Meeting Link: ${result.data.appointment.meetingDetails.meetingLink}`);
  } else {
    log('❌ Appointment booking failed', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 7: Get Doctor's Dashboard
async function testDoctorDashboard() {
  log('\n📊 Testing Doctor Availability Dashboard...', 'cyan');
  
  const result = await makeRequest('GET', '/doctors/availability/dashboard', null, authToken);
  
  if (result.success) {
    log('✅ Doctor dashboard retrieved successfully', 'green');
    console.log(`   Available days: ${result.data.dashboard.statistics.availableDays}`);
    console.log(`   Total slots: ${result.data.dashboard.statistics.totalSlots}`);
  } else {
    log('❌ Failed to retrieve doctor dashboard', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 8: Get Doctor's Appointments
async function testDoctorAppointments() {
  log('\n📋 Testing Doctor Appointments List...', 'cyan');
  
  // Get today's date
  const today = new Date().toISOString().split('T')[0];
  
  const result = await makeRequest('GET', `/enhanced-appointments/doctor-appointments?date=${today}`, null, authToken);
  
  if (result.success) {
    log('✅ Doctor appointments retrieved successfully', 'green');
    console.log(`   Total appointments: ${result.data.summary.total}`);
    console.log(`   Scheduled: ${result.data.summary.scheduled}`);

    const appointments = result.data.appointments || [];
    if (appointments.length > 0) {
      const latest = appointments[0];
      if (typeof latest.consultationFee === 'undefined') {
        log('⚠️  Missing consultationFee in doctor appointment payload', 'yellow');
      }
      if (latest.appointmentTime && String(latest.appointmentTime).length > 5) {
        log(`⚠️  appointmentTime is not normalized (got ${latest.appointmentTime})`, 'yellow');
      }
    }
  } else {
    log('❌ Failed to retrieve doctor appointments', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 9: Get Patient's Appointments
async function testPatientAppointments() {
  log('\n📱 Testing Patient Appointments List...', 'cyan');
  
  const result = await makeRequest('GET', '/enhanced-appointments/my-appointments', null, patientToken);
  
  if (result.success) {
    log('✅ Patient appointments retrieved successfully', 'green');
    console.log(`   Total appointments: ${result.data.summary.total}`);
    console.log(`   Upcoming: ${result.data.summary.upcoming}`);
  } else {
    log('❌ Failed to retrieve patient appointments', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Test 10: Doctor Search
async function testDoctorSearch() {
  log('\n🔍 Testing Enhanced Doctor Search...', 'cyan');
  
  const searchParams = new URLSearchParams({
    specialization: 'Cardiology',
    city: 'Mumbai',
    consultationType: 'online',
    language: 'English',
    maxFee: '1000'
  });

  const result = await makeRequest('GET', `/doctors/search?${searchParams.toString()}`);
  
  if (result.success) {
    log('✅ Doctor search successful', 'green');
    console.log(`   Found doctors: ${result.data.doctors.length}`);
    if (result.data.doctors.length > 0) {
      console.log(`   First result: ${result.data.doctors[0].name}`);
    }
  } else {
    log('❌ Doctor search failed', 'red');
    console.log('   Error:', result.error);
  }
  
  return result.success;
}

// Main test runner
async function runAllTests() {
  log('🚀 Starting Enhanced Doctor Management System Tests', 'bright');
  log('=' .repeat(60), 'yellow');
  
  const tests = [
    { name: 'Doctor Registration', fn: testDoctorRegistration },
    { name: 'Doctor Profile Update', fn: testDoctorProfileUpdate },
    { name: 'Availability Setup', fn: testAvailabilitySetup },
    { name: 'Patient Registration', fn: testPatientRegistration },
    { name: 'Available Slots', fn: testAvailableSlots },
    { name: 'Appointment Booking', fn: testAppointmentBooking },
    { name: 'Doctor Dashboard', fn: testDoctorDashboard },
    { name: 'Doctor Appointments', fn: testDoctorAppointments },
    { name: 'Patient Appointments', fn: testPatientAppointments },
    { name: 'Doctor Search', fn: testDoctorSearch }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const success = await test.fn();
      results.push({ name: test.name, success });
      
      // Add delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      log(`❌ Test "${test.name}" threw an error: ${error.message}`, 'red');
      results.push({ name: test.name, success: false, error: error.message });
    }
  }
  
  // Summary
  log('\n📊 Test Results Summary', 'bright');
  log('=' .repeat(60), 'yellow');
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    const color = result.success ? 'green' : 'red';
    log(`${status} - ${result.name}`, color);
  });
  
  log(`\n🎯 Overall: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`, 
       passed === total ? 'green' : 'yellow');
  
  if (passed === total) {
    log('\n🎉 All tests passed! Enhanced Doctor Management System is working correctly.', 'green');
  } else {
    log('\n⚠️ Some tests failed. Please check the server logs and fix the issues.', 'yellow');
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  log('❌ Unhandled Rejection at: Promise', 'red');
  console.log(reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  log('❌ Uncaught Exception thrown', 'red');
  console.log(err);
  process.exit(1);
});

// Run tests
runAllTests().catch(error => {
  log('❌ Test suite failed', 'red');
  console.error(error);
  process.exit(1);
});

export default {
  runAllTests,
  testDoctorRegistration,
  testDoctorProfileUpdate,
  testAvailabilitySetup,
  testPatientRegistration,
  testAvailableSlots,
  testAppointmentBooking,
  testDoctorDashboard,
  testDoctorAppointments,
  testPatientAppointments,
  testDoctorSearch
};
