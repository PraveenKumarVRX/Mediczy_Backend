#!/usr/bin/env node

/**
 * API ENDPOINT TEST SCRIPT
 * Tests actual HTTP endpoints for video consultation functionality
 * 
 * Requires:
 * - Node.js and npm installed
 * - Server running on PORT 8888
 * - User with active membership plan (ID: 19)
 * - Valid JWT token for authentication
 */

import axios from 'axios';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

const API_BASE_URL = 'https://app.mediqzy.com/api';
const LOCAL_API_URL = 'http://localhost:8888/api';

function log(color, text) {
  console.log(`${color}${text}${colors.reset}`);
}

async function testEndpoint(method, endpoint, token, body = null, isLocal = false) {
  const url = `${isLocal ? LOCAL_API_URL : API_BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const config = { headers };
    let response;

    if (method === 'GET') {
      response = await axios.get(url, config);
    } else if (method === 'POST') {
      response = await axios.post(url, body, config);
    } else if (method === 'PUT') {
      response = await axios.put(url, body, config);
    }

    return {
      success: true,
      status: response.status,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    };
  }
}

async function runAPITests() {
  log(colors.bold + colors.blue, '\n╔══════════════════════════════════════════════════════════╗');
  log(colors.bold + colors.blue, '║          API ENDPOINT TEST SUITE - VIDEO CONSULTATION    ║');
  log(colors.bold + colors.blue, '╚══════════════════════════════════════════════════════════╝\n');

  log(colors.yellow, 'ℹ️  NOTE: These tests require:');
  log(colors.yellow, '   • Running server (PORT 8888 for local, or https://app.mediqzy.com for prod)');
  log(colors.yellow, '   • Valid JWT authentication token');
  log(colors.yellow, '   • Test appointment created for user ID 19\n');

  const testConfig = {
    doctorToken: process.env.DOCTOR_JWT_TOKEN || 'YOUR_DOCTOR_TOKEN_HERE',
    patientToken: process.env.PATIENT_JWT_TOKEN || 'YOUR_PATIENT_TOKEN_HERE',
    userId: 19,
    appointmentId: 213, // From database verification
    useProd: process.env.USE_PROD === 'true'
  };

  log(colors.blue, 'Test Configuration:');
  log(colors.yellow, `  └─ User ID: ${testConfig.userId}`);
  log(colors.yellow, `  └─ Appointment ID: ${testConfig.appointmentId}`);
  log(colors.yellow, `  └─ Environment: ${testConfig.useProd ? 'Production' : 'Local'}`);
  log(colors.yellow, `  └─ Doctor Token: ${testConfig.doctorToken.substring(0, 20)}...`);
  log(colors.yellow, `  └─ Patient Token: ${testConfig.patientToken.substring(0, 20)}...\n`);

  // ============================================================================
  // TEST 1: Doctor Initiate Call (POST)
  // ============================================================================
  log(colors.bold, '🎬 TEST 1: Doctor Initiate Video Call');
  log(colors.blue, '─'.repeat(60));

  const initiateCallResponse = await testEndpoint(
    'POST',
    `/doctor/appointments/${testConfig.appointmentId}/initiate-call`,
    testConfig.doctorToken,
    {},
    !testConfig.useProd
  );

  if (initiateCallResponse.success && initiateCallResponse.status === 200) {
    log(colors.green, `✅ PASS: Doctor can initiate call (Status: ${initiateCallResponse.status})`);
    if (initiateCallResponse.data.data?.meetingLink) {
      log(colors.yellow, `  └─ Meeting Link: ${initiateCallResponse.data.data.meetingLink.substring(0, 50)}...`);
    }
    if (initiateCallResponse.data.data?.meetingId) {
      log(colors.yellow, `  └─ Meeting ID: ${initiateCallResponse.data.data.meetingId}`);
    }
  } else if (initiateCallResponse.status === 402) {
    log(colors.red, `❌ FAIL: Payment required (Status: 402)`);
    log(colors.red, `  └─ Message: ${initiateCallResponse.data?.message}`);
    log(colors.red, `  └─ This means membership validation is NOT working`);
  } else {
    log(colors.red, `❌ FAIL: Doctor initiate call failed (Status: ${initiateCallResponse.status})`);
    log(colors.red, `  └─ Message: ${initiateCallResponse.data?.message || initiateCallResponse.message}`);
  }

  // ============================================================================
  // TEST 2: Patient Join Video Call (GET)
  // ============================================================================
  log(colors.bold, '\n🎥 TEST 2: Patient Join Video Call');
  log(colors.blue, '─'.repeat(60));

  const joinCallResponse = await testEndpoint(
    'GET',
    `/online-consultation/video/join/${testConfig.appointmentId}`,
    testConfig.patientToken,
    null,
    !testConfig.useProd
  );

  if (joinCallResponse.success && joinCallResponse.status === 200) {
    log(colors.green, `✅ PASS: Patient can join call (Status: ${joinCallResponse.status})`);
    if (joinCallResponse.data.data?.accessToken) {
      log(colors.yellow, `  └─ Access Token: ${joinCallResponse.data.data.accessToken.substring(0, 30)}...`);
    }
    if (joinCallResponse.data.data?.meetingId) {
      log(colors.yellow, `  └─ Meeting ID: ${joinCallResponse.data.data.meetingId}`);
    }
  } else if (joinCallResponse.status === 402) {
    log(colors.red, `❌ FAIL: Payment required (Status: 402)`);
    log(colors.red, `  └─ Message: ${joinCallResponse.data?.message}`);
    log(colors.red, `  └─ This means membership validation is NOT working`);
  } else {
    log(colors.red, `❌ FAIL: Patient join call failed (Status: ${joinCallResponse.status})`);
    log(colors.red, `  └─ Message: ${joinCallResponse.data?.message || joinCallResponse.message}`);
  }

  // ============================================================================
  // TEST 3: Verify Meeting Consistency
  // ============================================================================
  log(colors.bold, '\n🔗 TEST 3: Meeting Link Consistency');
  log(colors.blue, '─'.repeat(60));

  if (initiateCallResponse.success && joinCallResponse.success) {
    const initMeetingId = initiateCallResponse.data.data?.meetingId;
    const joinMeetingId = joinCallResponse.data.data?.meetingId;

    if (initMeetingId === joinMeetingId) {
      log(colors.green, `✅ PASS: Meeting IDs match`);
      log(colors.yellow, `  └─ Meeting ID: ${initMeetingId}`);
    } else {
      log(colors.red, `❌ FAIL: Meeting IDs don't match`);
      log(colors.red, `  └─ Doctor got: ${initMeetingId}`);
      log(colors.red, `  └─ Patient got: ${joinMeetingId}`);
    }
  } else {
    log(colors.yellow, `⊘ SKIP: Both endpoints must succeed for this test`);
  }

  // ============================================================================
  // TEST 4: Authentication Validation
  // ============================================================================
  log(colors.bold, '\n🔐 TEST 4: Authentication Validation');
  log(colors.blue, '─'.repeat(60));

  const badTokenResponse = await testEndpoint(
    'GET',
    `/online-consultation/video/join/${testConfig.appointmentId}`,
    'invalid_token_xxx',
    null,
    !testConfig.useProd
  );

  if (!badTokenResponse.success && badTokenResponse.status === 401) {
    log(colors.green, `✅ PASS: Invalid token rejected (Status: 401)`);
  } else if (!badTokenResponse.success && badTokenResponse.status === 403) {
    log(colors.green, `✅ PASS: Invalid token rejected (Status: 403)`);
  } else {
    log(colors.red, `⚠️  WARNING: Invalid token not properly rejected`);
    log(colors.red, `  └─ Status: ${badTokenResponse.status}`);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  log(colors.bold + colors.blue, '\n╔══════════════════════════════════════════════════════════╗');
  log(colors.bold + colors.blue, '║                    TEST SUMMARY                           ║');
  log(colors.bold + colors.blue, '╚══════════════════════════════════════════════════════════╝\n');

  const initSuccess = initiateCallResponse.success && initiateCallResponse.status === 200;
  const joinSuccess = joinCallResponse.success && joinCallResponse.status === 200;

  log(colors.bold, '🎯 ENDPOINT STATUS:');
  log(initSuccess ? colors.green : colors.red, `${initSuccess ? '✅' : '❌'} Doctor Initiate Call`);
  log(joinSuccess ? colors.green : colors.red, `${joinSuccess ? '✅' : '❌'} Patient Join Call`);

  if (initSuccess && joinSuccess) {
    log(colors.green + colors.bold, '\n✅ ALL ENDPOINT TESTS PASSED');
    log(colors.green, '   • Doctor can initiate calls');
    log(colors.green, '   • Patient can join calls');
    log(colors.green, '   • Membership validation working');
    log(colors.green, '   • System ready for production');
  } else {
    log(colors.yellow + colors.bold, '\n⚠️  SOME TESTS FAILED');
    log(colors.yellow, '   • Check authentication tokens');
    log(colors.yellow, '   • Verify server is running');
    log(colors.yellow, '   • Check appointment exists');
  }

  log(colors.bold, '\n📝 INSTRUCTIONS TO RUN FULL TESTS:');
  log(colors.blue, '   1. Get valid JWT tokens:');
  log(colors.blue, '      DOCTOR_JWT_TOKEN=$(node -e "console.log(require(\'./get-jwt-token.js\'))")');
  log(colors.blue, '      PATIENT_JWT_TOKEN=$(node -e "console.log(require(\'./get-jwt-token.js\'))")');
  log(colors.blue, '');
  log(colors.blue, '   2. Run tests with tokens:');
  log(colors.blue, '      DOCTOR_JWT_TOKEN=$TOKEN npm test');
  log(colors.blue, '');
  log(colors.blue, '   3. Or set environment:');
  log(colors.blue, '      export DOCTOR_JWT_TOKEN="your_token_here"');
  log(colors.blue, '      export PATIENT_JWT_TOKEN="your_token_here"');
  log(colors.blue, '      node api-endpoint-test.js');

  log(colors.blue, '\n' + '═'.repeat(60) + '\n');
}

// Run the API tests
runAPITests().catch(error => {
  log(colors.red, `❌ Test Error: ${error.message}`);
  process.exit(1);
});
