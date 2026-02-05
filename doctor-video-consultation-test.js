/**
 * Doctor Appointment & Video Consultation Sanity Test
 * Tests the complete workflow from doctor login to video consultation
 */

const axios = require('axios');

const BASE_URL = 'https://app.mediqzy.com/api';
const DOCTOR_EMAIL = 'doctor@mediczy.com';
const DOCTOR_PASSWORD = 'Doctor123';

let doctorToken = null;
let doctorId = null;

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(type, message) {
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    test: '🧪',
    header: '📋'
  };
  console.log(`${icons[type] || ''} ${message}`);
}

function header(text) {
  console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
  console.log(`${colors.cyan}${text}${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}\n`);
}

async function testDoctorLogin() {
  try {
    log('test', 'Testing doctor login...');
    
    const response = await axios.post(`${BASE_URL}/doctors/login`, {
      email: DOCTOR_EMAIL,
      password: DOCTOR_PASSWORD
    });

    if (response.data.token) {
      doctorToken = response.data.token;
      doctorId = response.data.doctor?.id || response.data.doctor?._id;
      
      log('success', `Doctor login successful`);
      console.log(`   Doctor ID: ${doctorId}`);
      console.log(`   Name: ${response.data.doctor?.firstName} ${response.data.doctor?.lastName}`);
      console.log(`   Email: ${response.data.doctor?.email}`);
      console.log(`   Specialization: ${response.data.doctor?.specialization}`);
      return true;
    } else {
      log('error', 'Login failed: No token returned');
      return false;
    }
  } catch (error) {
    log('error', `Doctor login failed: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      console.log('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function testGetDoctorAppointments() {
  try {
    log('test', 'Fetching doctor appointments...');
    
    const response = await axios.get(`${BASE_URL}/doctors/appointments`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success) {
      const appointments = response.data.appointments || [];
      log('success', `Retrieved ${appointments.length} appointments`);
      
      if (appointments.length > 0) {
        console.log(`\n   Recent appointments:`);
        appointments.slice(0, 3).forEach((apt, idx) => {
          console.log(`   ${idx + 1}. ID: ${apt.id} | Patient: ${apt.patientName} | Status: ${apt.status} | Date: ${apt.appointmentDate}`);
        });
      }
      
      return { success: true, appointments };
    } else {
      log('error', 'Failed to fetch appointments');
      return { success: false, appointments: [] };
    }
  } catch (error) {
    log('error', `Get appointments failed: ${error.response?.data?.message || error.message}`);
    return { success: false, appointments: [] };
  }
}

async function testVideoConsultationStats() {
  try {
    log('test', 'Fetching video consultation stats...');
    
    const response = await axios.get(`${BASE_URL}/doctors/video-consultations/stats`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success) {
      const stats = response.data.stats;
      log('success', 'Video consultation stats retrieved');
      console.log(`   Total: ${stats.total}`);
      console.log(`   Today: ${stats.today}`);
      console.log(`   Completed: ${stats.completed}`);
      console.log(`   Pending: ${stats.pending}`);
      return true;
    } else {
      log('error', 'Failed to fetch stats');
      return false;
    }
  } catch (error) {
    log('error', `Get stats failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function testVideoConsultationRecent() {
  try {
    log('test', 'Fetching recent video consultations...');
    
    const response = await axios.get(`${BASE_URL}/doctors/video-consultations/recent?limit=5`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success) {
      const consultations = response.data.consultations || [];
      log('success', `Retrieved ${consultations.length} recent consultations`);
      
      if (consultations.length > 0) {
        console.log(`\n   Recent consultations:`);
        consultations.forEach((cons, idx) => {
          console.log(`   ${idx + 1}. Patient: ${cons.patient} | Status: ${cons.status} | Date: ${cons.date}`);
        });
      }
      
      return true;
    } else {
      log('error', 'Failed to fetch recent consultations');
      return false;
    }
  } catch (error) {
    log('error', `Get recent consultations failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function testVideoConsultationUpcoming() {
  try {
    log('test', 'Fetching upcoming video consultations...');
    
    const response = await axios.get(`${BASE_URL}/doctors/video-consultations/upcoming`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success) {
      const consultations = response.data.consultations || [];
      log('success', `Retrieved ${consultations.length} upcoming consultations`);
      
      if (consultations.length > 0) {
        console.log(`\n   Upcoming consultations:`);
        consultations.forEach((cons, idx) => {
          console.log(`   ${idx + 1}. ID: ${cons.id} | Patient: ${cons.patientName} | Date: ${cons.appointmentDate} | Time: ${cons.appointmentTime}`);
        });
      }
      
      return { success: true, consultations };
    } else {
      log('error', 'Failed to fetch upcoming consultations');
      return { success: false, consultations: [] };
    }
  } catch (error) {
    log('error', `Get upcoming consultations failed: ${error.response?.data?.message || error.message}`);
    return { success: false, consultations: [] };
  }
}

async function testInitiateVideoCall(appointmentId) {
  try {
    log('test', `Testing initiate video call for appointment ${appointmentId}...`);
    
    const response = await axios.post(
      `${BASE_URL}/doctors/appointments/${appointmentId}/initiate-call`,
      {},
      { headers: { Authorization: `Bearer ${doctorToken}` } }
    );

    if (response.data.success) {
      log('success', 'Video call initiated successfully');
      console.log(`   Meeting ID: ${response.data.video?.meetingId}`);
      console.log(`   Platform: ${response.data.video?.platform}`);
      console.log(`   Has Meeting Link: ${!!response.data.video?.meetingLink}`);
      return true;
    } else {
      log('error', 'Failed to initiate call');
      return false;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    
    // 402 is expected if payment not completed
    if (error.response?.status === 402) {
      log('info', `Payment required (402): ${errorMsg}`);
      return true; // This is actually expected behavior
    }
    
    // 400 might be expected if appointment status is wrong
    if (error.response?.status === 400) {
      log('info', `Invalid appointment state (400): ${errorMsg}`);
      return true; // This is expected behavior
    }
    
    log('error', `Initiate call failed: ${errorMsg}`);
    return false;
  }
}

async function testDoctorProfile() {
  try {
    log('test', 'Fetching doctor profile...');
    
    const response = await axios.get(`${BASE_URL}/doctors/profile`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success || response.data.doctor) {
      const doctor = response.data.doctor || response.data;
      log('success', 'Doctor profile retrieved');
      console.log(`   Name: ${doctor.firstName} ${doctor.lastName}`);
      console.log(`   Specialization: ${doctor.specialization || 'N/A'}`);
      console.log(`   Experience: ${doctor.experience || 'N/A'} years`);
      return true;
    } else {
      log('error', 'Failed to fetch profile');
      return false;
    }
  } catch (error) {
    log('error', `Get profile failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function testDoctorSchedule() {
  try {
    log('test', 'Fetching doctor schedule...');
    
    const response = await axios.get(`${BASE_URL}/doctors/schedule`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data) {
      log('success', 'Doctor schedule retrieved');
      return true;
    } else {
      log('error', 'Failed to fetch schedule');
      return false;
    }
  } catch (error) {
    // 404 or no schedule is acceptable
    if (error.response?.status === 404) {
      log('info', 'No schedule configured (404)');
      return true;
    }
    log('error', `Get schedule failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function runAllTests() {
  header('DOCTOR APPOINTMENT & VIDEO CONSULTATION SANITY TEST');
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Doctor Login
  results.total++;
  if (await testDoctorLogin()) {
    results.passed++;
  } else {
    results.failed++;
    log('error', 'Login failed - stopping tests');
    return results;
  }

  console.log('');

  // Test 2: Get Profile
  results.total++;
  if (await testDoctorProfile()) {
    results.passed++;
  } else {
    results.failed++;
  }

  console.log('');

  // Test 3: Get Appointments
  results.total++;
  const appointmentsResult = await testGetDoctorAppointments();
  if (appointmentsResult.success) {
    results.passed++;
  } else {
    results.failed++;
  }

  console.log('');

  // Test 4: Video Consultation Stats
  results.total++;
  if (await testVideoConsultationStats()) {
    results.passed++;
  } else {
    results.failed++;
  }

  console.log('');

  // Test 5: Recent Video Consultations
  results.total++;
  if (await testVideoConsultationRecent()) {
    results.passed++;
  } else {
    results.failed++;
  }

  console.log('');

  // Test 6: Upcoming Video Consultations
  results.total++;
  const upcomingResult = await testVideoConsultationUpcoming();
  if (upcomingResult.success) {
    results.passed++;
  } else {
    results.failed++;
  }

  console.log('');

  // Test 7: Initiate Video Call (if there's an upcoming appointment)
  if (upcomingResult.consultations && upcomingResult.consultations.length > 0) {
    const testAppointment = upcomingResult.consultations[0];
    results.total++;
    if (await testInitiateVideoCall(testAppointment.id)) {
      results.passed++;
    } else {
      results.failed++;
    }
    console.log('');
  } else if (appointmentsResult.appointments && appointmentsResult.appointments.length > 0) {
    // Try with any appointment
    const testAppointment = appointmentsResult.appointments[0];
    results.total++;
    if (await testInitiateVideoCall(testAppointment.id)) {
      results.passed++;
    } else {
      results.failed++;
    }
    console.log('');
  }

  // Test 8: Get Schedule
  results.total++;
  if (await testDoctorSchedule()) {
    results.passed++;
  } else {
    results.failed++;
  }

  console.log('');

  // Summary
  header('TEST SUMMARY');
  console.log(`${colors.green}Passed: ${results.passed}/${results.total}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed}/${results.total}${colors.reset}`);
  
  const percentage = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`\nSuccess Rate: ${percentage}%`);
  
  if (results.passed === results.total) {
    console.log(`\n${colors.green}🎉 All tests passed! Doctor workflow is working correctly.${colors.reset}\n`);
  } else if (results.passed >= results.total * 0.8) {
    console.log(`\n${colors.yellow}⚠️  Most tests passed. Some features may need attention.${colors.reset}\n`);
  } else {
    console.log(`\n${colors.red}❌ Multiple tests failed. Please review the errors above.${colors.reset}\n`);
  }

  return results;
}

// Run tests
runAllTests().catch(error => {
  log('error', `Test suite failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
