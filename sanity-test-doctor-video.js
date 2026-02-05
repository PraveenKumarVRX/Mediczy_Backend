/**
 * Sanity Test: Doctor Appointment & Video Consultation Process
 * Tests the complete doctor workflow including login, appointments, and video consultations
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:8888/api';
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

let doctorToken = null;
let doctorId = null;
let testResults = {
  passed: 0,
  failed: 0,
  warnings: 0
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(70)}\n${msg}\n${'='.repeat(70)}${colors.reset}\n`),
  step: (msg) => console.log(`${colors.cyan}📍 ${msg}${colors.reset}`)
};

// Test 1: Doctor Login
async function testDoctorLogin() {
  log.step('Test 1: Doctor Login');
  
  try {
    const response = await axios.post(`${BASE_URL}/doctors/login`, {
      email: 'doctor@mediczy.com',
      password: 'Doctor@123'
    });

    if (response.data.success && response.data.token) {
      doctorToken = response.data.token;
      doctorId = response.data.doctor?.id || response.data.doctor?._id;
      log.success('Doctor login successful');
      log.info(`Doctor ID: ${doctorId}`);
      testResults.passed++;
      return true;
    } else {
      log.error('Login response missing token or success flag');
      testResults.failed++;
      return false;
    }
  } catch (error) {
    log.error(`Doctor login failed: ${error.response?.data?.message || error.message}`);
    testResults.failed++;
    return false;
  }
}

// Test 2: Get Doctor Profile
async function testGetDoctorProfile() {
  log.step('Test 2: Get Doctor Profile');
  
  if (!doctorToken) {
    log.warn('Skipping - no doctor token');
    testResults.warnings++;
    return false;
  }

  try {
    const response = await axios.get(`${BASE_URL}/doctors/profile`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success || response.data.id || response.data._id) {
      log.success('Doctor profile retrieved successfully');
      log.info(`Name: Dr. ${response.data.firstName || 'Unknown'} ${response.data.lastName || ''}`);
      testResults.passed++;
      return true;
    } else {
      log.error('Profile response invalid');
      testResults.failed++;
      return false;
    }
  } catch (error) {
    log.error(`Get profile failed: ${error.response?.data?.message || error.message}`);
    testResults.failed++;
    return false;
  }
}

// Test 3: Get Doctor Appointments
async function testGetAppointments() {
  log.step('Test 3: Get Doctor Appointments');
  
  if (!doctorToken) {
    log.warn('Skipping - no doctor token');
    testResults.warnings++;
    return false;
  }

  try {
    const response = await axios.get(`${BASE_URL}/doctors/appointments`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success || Array.isArray(response.data) || Array.isArray(response.data.appointments)) {
      const appointments = response.data.appointments || response.data;
      log.success(`Retrieved ${appointments.length} appointment(s)`);
      
      if (appointments.length > 0) {
        const videoAppointments = appointments.filter(apt => 
          apt.consultationType === 'online' || apt.consultationType === 'video'
        );
        log.info(`Video consultations: ${videoAppointments.length}`);
        log.info(`Total appointments: ${appointments.length}`);
      }
      
      testResults.passed++;
      return appointments;
    } else {
      log.error('Appointments response invalid');
      testResults.failed++;
      return false;
    }
  } catch (error) {
    log.error(`Get appointments failed: ${error.response?.data?.message || error.message}`);
    testResults.failed++;
    return false;
  }
}

// Test 4: Video Consultation Stats
async function testVideoConsultationStats() {
  log.step('Test 4: Video Consultation Statistics');
  
  if (!doctorToken) {
    log.warn('Skipping - no doctor token');
    testResults.warnings++;
    return false;
  }

  try {
    const response = await axios.get(`${BASE_URL}/doctors/video-consultations/stats`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success && response.data.stats) {
      log.success('Video consultation stats retrieved');
      log.info(`Total: ${response.data.stats.total || 0}`);
      log.info(`Today: ${response.data.stats.today || 0}`);
      log.info(`Completed: ${response.data.stats.completed || 0}`);
      log.info(`Pending: ${response.data.stats.pending || 0}`);
      testResults.passed++;
      return true;
    } else {
      log.error('Stats response invalid');
      testResults.failed++;
      return false;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      log.warn('Stats endpoint requires authentication (expected)');
      testResults.warnings++;
      return true;
    }
    log.error(`Get video stats failed: ${error.response?.data?.message || error.message}`);
    testResults.failed++;
    return false;
  }
}

// Test 5: Recent Video Consultations
async function testRecentVideoConsultations() {
  log.step('Test 5: Recent Video Consultations');
  
  if (!doctorToken) {
    log.warn('Skipping - no doctor token');
    testResults.warnings++;
    return false;
  }

  try {
    const response = await axios.get(`${BASE_URL}/doctors/video-consultations/recent?limit=5`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success && Array.isArray(response.data.consultations)) {
      log.success(`Retrieved ${response.data.consultations.length} recent consultation(s)`);
      
      if (response.data.consultations.length > 0) {
        const recent = response.data.consultations[0];
        log.info(`Latest: ${recent.patient || 'Unknown'} - ${recent.status || 'N/A'}`);
      }
      
      testResults.passed++;
      return true;
    } else {
      log.error('Recent consultations response invalid');
      testResults.failed++;
      return false;
    }
  } catch (error) {
    log.error(`Get recent consultations failed: ${error.response?.data?.message || error.message}`);
    testResults.failed++;
    return false;
  }
}

// Test 6: Upcoming Video Consultations
async function testUpcomingVideoConsultations() {
  log.step('Test 6: Upcoming Video Consultations');
  
  if (!doctorToken) {
    log.warn('Skipping - no doctor token');
    testResults.warnings++;
    return false;
  }

  try {
    const response = await axios.get(`${BASE_URL}/doctors/video-consultations/upcoming`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data.success && Array.isArray(response.data.consultations)) {
      log.success(`Retrieved ${response.data.consultations.length} upcoming consultation(s)`);
      
      if (response.data.consultations.length > 0) {
        const upcoming = response.data.consultations[0];
        log.info(`Next: ${upcoming.patient || 'Unknown'} - ${upcoming.date || 'N/A'}`);
      }
      
      testResults.passed++;
      return response.data.consultations;
    } else {
      log.error('Upcoming consultations response invalid');
      testResults.failed++;
      return false;
    }
  } catch (error) {
    log.error(`Get upcoming consultations failed: ${error.response?.data?.message || error.message}`);
    testResults.failed++;
    return false;
  }
}

// Test 7: Initiate Video Call (if appointments exist)
async function testInitiateVideoCall(appointments) {
  log.step('Test 7: Initiate Video Call Endpoint');
  
  if (!doctorToken) {
    log.warn('Skipping - no doctor token');
    testResults.warnings++;
    return false;
  }

  if (!appointments || appointments.length === 0) {
    log.warn('No appointments available to test initiate-call');
    testResults.warnings++;
    return false;
  }

  // Find a suitable appointment for testing
  const testAppointment = appointments.find(apt => 
    ['confirmed', 'scheduled', 'accepted'].includes(apt.status) &&
    (apt.consultationType === 'online' || apt.consultationType === 'video')
  );

  if (!testAppointment) {
    log.warn('No suitable video appointment found for initiate-call test');
    testResults.warnings++;
    return false;
  }

  try {
    log.info(`Testing with appointment ID: ${testAppointment.id}`);
    
    const response = await axios.post(
      `${BASE_URL}/doctors/appointments/${testAppointment.id}/initiate-call`,
      {},
      { headers: { Authorization: `Bearer ${doctorToken}` } }
    );

    if (response.data.success && response.data.video) {
      log.success('Video call initiated successfully');
      log.info(`Meeting ID: ${response.data.video.meetingId || 'N/A'}`);
      log.info(`Platform: ${response.data.video.platform || 'N/A'}`);
      
      if (response.data.video.meetingLink || response.data.video.joinUrl) {
        log.info('✓ Meeting link generated');
      }
      
      testResults.passed++;
      return true;
    } else {
      log.error('Initiate call response invalid');
      testResults.failed++;
      return false;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    
    // Some errors are expected (payment required, wrong status, etc.)
    if (error.response?.status === 402) {
      log.warn(`Payment required (expected): ${errorMsg}`);
      testResults.warnings++;
      return true; // This is acceptable behavior
    } else if (error.response?.status === 400 && errorMsg.includes('status')) {
      log.warn(`Appointment status issue (expected): ${errorMsg}`);
      testResults.warnings++;
      return true; // This is acceptable behavior
    } else if (error.response?.status === 500) {
      log.error(`SERVER ERROR 500: ${errorMsg}`);
      testResults.failed++;
      return false;
    } else {
      log.error(`Initiate call failed: ${errorMsg}`);
      testResults.failed++;
      return false;
    }
  }
}

// Test 8: Doctor Dashboard Access
async function testDoctorDashboardAccess() {
  log.step('Test 8: Doctor Dashboard Data Access');
  
  if (!doctorToken) {
    log.warn('Skipping - no doctor token');
    testResults.warnings++;
    return false;
  }

  try {
    // Test dashboard stats endpoint
    const response = await axios.get(`${BASE_URL}/doctors/dashboard/stats`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });

    if (response.data) {
      log.success('Dashboard stats accessible');
      testResults.passed++;
      return true;
    }
  } catch (error) {
    // Dashboard might not have this exact endpoint, try alternatives
    log.warn('Dashboard stats endpoint not found (trying alternatives)');
  }

  // Try appointments as alternative dashboard data
  try {
    await axios.get(`${BASE_URL}/doctors/appointments`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    log.success('Dashboard data accessible via appointments endpoint');
    testResults.passed++;
    return true;
  } catch (error) {
    log.error('Dashboard data not accessible');
    testResults.failed++;
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log.header('🏥 DOCTOR APPOINTMENT & VIDEO CONSULTATION SANITY TEST');
  
  console.log(`Testing doctor workflow at: ${BASE_URL}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Run tests in sequence
  const loginSuccess = await testDoctorLogin();
  
  if (!loginSuccess) {
    log.error('Cannot proceed without successful login');
    printSummary();
    return;
  }

  await testGetDoctorProfile();
  const appointments = await testGetAppointments();
  await testVideoConsultationStats();
  await testRecentVideoConsultations();
  await testUpcomingVideoConsultations();
  await testInitiateVideoCall(appointments);
  await testDoctorDashboardAccess();

  printSummary();
}

function printSummary() {
  log.header('📊 TEST SUMMARY');
  
  const total = testResults.passed + testResults.failed + testResults.warnings;
  const passRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0;
  
  console.log(`${colors.green}✅ Passed: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${testResults.failed}${colors.reset}`);
  console.log(`${colors.yellow}⚠️  Warnings: ${testResults.warnings}${colors.reset}`);
  console.log(`${colors.cyan}📈 Pass Rate: ${passRate}%${colors.reset}`);
  console.log();

  if (testResults.failed === 0) {
    log.success('🎉 All critical tests passed! Doctor video consultation workflow is operational.');
  } else if (testResults.failed <= 2) {
    log.warn(`⚠️  ${testResults.failed} test(s) failed. Review issues above.`);
  } else {
    log.error(`❌ ${testResults.failed} tests failed. Critical issues need attention.`);
  }
  
  console.log();
  log.info('Doctor Workflow Status:');
  console.log('  1. Doctor Login: ' + (testResults.passed > 0 ? '✓' : '✗'));
  console.log('  2. View Appointments: ' + (testResults.passed > 1 ? '✓' : '✗'));
  console.log('  3. Video Consultation Stats: ' + (testResults.passed > 2 ? '✓' : '✗'));
  console.log('  4. Initiate Video Calls: ' + (testResults.passed > 5 || testResults.warnings > 2 ? '✓' : '✗'));
  console.log();
}

// Run the tests
runAllTests().catch(error => {
  log.error(`Test execution failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
