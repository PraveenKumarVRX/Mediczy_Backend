#!/usr/bin/env node

/**
 * Comprehensive Video Functionality Test
 * Tests LiveKit integration, token generation, and video endpoints
 */

import axios from 'axios';
import { AccessToken } from 'livekit-server-sdk';

const BASE_URL = 'http://localhost:8000/api';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://video.mediqzy.com';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'API29FkbfieGsfq';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'J1wqey7DBFq3UUmfhmQCiSHrEKAFSXRwhEvejCZUVBUB';

// Test credentials
const TEST_CREDENTIALS = {
  doctor: {
    email: process.env.TEST_DOCTOR_EMAIL || 'srinath@mediczy.com',
    password: process.env.TEST_DOCTOR_PASSWORD || 'Srinath@123',
    role: 'doctor'
  },
  user: {
    email: process.env.TEST_USER_EMAIL || '',
    password: process.env.TEST_USER_PASSWORD || '',
    phone: process.env.TEST_USER_PHONE || '7373007737',
    otp: process.env.TEST_USER_OTP || '111111',
    role: 'user'
  }
};

let authTokens = {
  doctor: null,
  user: null
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}`);
  log(`Testing: ${testName}`, 'bright');
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Test 1: LiveKit Server Direct Token Generation
async function testLiveKitTokenGeneration() {
  logTest('LiveKit Token Generation (Direct SDK)');
  
  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: 'test-user-123',
      name: 'Test User',
      ttl: 60 * 60
    });
    
    token.addGrant({
      roomJoin: true,
      room: 'test-room-123',
      canPublish: true,
      canSubscribe: true
    });
    
    const jwt = await token.toJwt();
    
    logSuccess('LiveKit token generated successfully');
    logInfo(`Token length: ${jwt.length} characters`);
    logInfo(`Token preview: ${jwt.substring(0, 50)}...`);
    logInfo(`Server URL: ${LIVEKIT_URL}`);
    
    return { success: true, token: jwt };
  } catch (error) {
    logError(`Failed to generate LiveKit token: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 2: Video System Health Check
async function testVideoSystemHealth() {
  logTest('Video System Health Check');
  
  try {
    const response = await axios.get(`${BASE_URL}/video/test`);
    
    if (response.data.success) {
      logSuccess('Video system is operational');
      logInfo(`Timestamp: ${response.data.timestamp}`);
      logInfo(`ICE Servers configured: ${response.data.config.iceServers.length}`);
      return { success: true, data: response.data };
    } else {
      logError('Video system health check failed');
      return { success: false };
    }
  } catch (error) {
    logError(`Health check failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 3: Doctor Login
async function loginDoctor() {
  logTest('Doctor Authentication');
  
  try {
    const response = await axios.post(`${BASE_URL}/doctors/login`, {
      email: TEST_CREDENTIALS.doctor.email,
      password: TEST_CREDENTIALS.doctor.password
    });
    
    if (response.data.success && response.data.token) {
      authTokens.doctor = response.data.token;
      logSuccess('Doctor login successful');
      logInfo(`Doctor: ${response.data.doctor.name}`);
      logInfo(`Specialization: ${response.data.doctor.specialization || 'N/A'}`);
      return { success: true, token: response.data.token };
    } else {
      logError('Doctor login failed - no token received');
      return { success: false };
    }
  } catch (error) {
    logError(`Doctor login failed: ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 4: User Login (Password or OTP)
async function loginUser() {
  logTest('User Authentication');

  const hasPasswordLogin = TEST_CREDENTIALS.user.email && TEST_CREDENTIALS.user.password;
  const identifier = TEST_CREDENTIALS.user.email || TEST_CREDENTIALS.user.phone;

  if (hasPasswordLogin) {
    try {
      logInfo('Attempting password login...');
      const response = await axios.post(`${BASE_URL}/auth/login`, {
        email: TEST_CREDENTIALS.user.email,
        password: TEST_CREDENTIALS.user.password
      });

      if (response.data.token) {
        authTokens.user = response.data.token;
        logSuccess('User login successful');
        logInfo(`User: ${response.data.user?.email || TEST_CREDENTIALS.user.email}`);
        return { success: true, token: response.data.token };
      }
    } catch (error) {
      logWarning(`Password login failed: ${error.response?.data?.message || error.message}`);
    }
  }

  if (!identifier) {
    logWarning('Skipping - user credentials not provided');
    return { success: false, skipped: true };
  }

  try {
    // Step 1: Request OTP
    logInfo('Requesting OTP...');
    const otpResponse = await axios.post(`${BASE_URL}/auth/send-otp`, {
      identifier
    });

    if (!otpResponse.data.success) {
      logError('Failed to request OTP');
      return { success: false };
    }

    logSuccess('OTP requested successfully');

    // Step 2: Verify OTP
    logInfo('Verifying OTP...');
    const otpCode = otpResponse.data?.data?.otp || TEST_CREDENTIALS.user.otp;
    if (!otpCode) {
      logError('No OTP available for verification');
      return { success: false };
    }

    const loginResponse = await axios.post(`${BASE_URL}/auth/verify-otp`, {
      identifier,
      code: otpCode
    });

    if (loginResponse.data.success && loginResponse.data.token) {
      authTokens.user = loginResponse.data.token;
      logSuccess('User login successful');
      logInfo(`User: ${loginResponse.data.user?.email || identifier}`);
      return { success: true, token: loginResponse.data.token };
    }

    logError('User login failed - no token received');
    return { success: false };
  } catch (error) {
    logError(`User login failed: ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 5: Generate LiveKit Token via API (Doctor)
async function testDoctorLiveKitToken() {
  logTest('Generate LiveKit Token for Doctor');
  
  if (!authTokens.doctor) {
    logWarning('Skipping - doctor not authenticated');
    return { success: false, skipped: true };
  }
  
  try {
    const response = await axios.post(
      `${BASE_URL}/video/livekit/token`,
      {
        roomName: `test-doctor-room-${Date.now()}`
      },
      {
        headers: {
          Authorization: `Bearer ${authTokens.doctor}`
        }
      }
    );
    
    const livekitToken = response.data?.video?.livekit?.token;
    if (response.data.success && livekitToken) {
      logSuccess('LiveKit token generated for doctor');
      logInfo(`Room: ${response.data.video.meetingId}`);
      logInfo(`Server URL: ${response.data.video.livekit.serverUrl}`);
      logInfo(`Token length: ${livekitToken.length} characters`);
      return { success: true, data: response.data };
    } else {
      logError('Failed to generate doctor token');
      return { success: false };
    }
  } catch (error) {
    logError(`Doctor token generation failed: ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 6: Generate LiveKit Token via API (User)
async function testUserLiveKitToken() {
  logTest('Generate LiveKit Token for User');
  
  if (!authTokens.user) {
    logWarning('Skipping - user not authenticated');
    return { success: false, skipped: true };
  }
  
  try {
    const response = await axios.post(
      `${BASE_URL}/video/livekit/token`,
      {
        roomName: `test-user-room-${Date.now()}`
      },
      {
        headers: {
          Authorization: `Bearer ${authTokens.user}`
        }
      }
    );
    
    const livekitToken = response.data?.video?.livekit?.token;
    if (response.data.success && livekitToken) {
      logSuccess('LiveKit token generated for user');
      logInfo(`Room: ${response.data.video.meetingId}`);
      logInfo(`Server URL: ${response.data.video.livekit.serverUrl}`);
      logInfo(`Token length: ${livekitToken.length} characters`);
      return { success: true, data: response.data };
    } else {
      logError('Failed to generate user token');
      return { success: false };
    }
  } catch (error) {
    logError(`User token generation failed: ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 7: Check LiveKit Server Accessibility
async function testLiveKitServerConnection() {
  logTest('LiveKit Server Connection');
  
  try {
    const httpsUrl = LIVEKIT_URL.replace('wss://', 'https://');
    logInfo(`Testing connection to: ${httpsUrl}`);
    
    const response = await axios.get(httpsUrl, {
      timeout: 5000,
      validateStatus: () => true // Accept any status code
    });
    
    logSuccess(`LiveKit server is accessible (Status: ${response.status})`);
    logInfo(`Server responded with ${response.headers['content-type'] || 'unknown content type'}`);
    
    return { success: true, status: response.status };
  } catch (error) {
    logError(`Failed to connect to LiveKit server: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Test 8: Test Room Token Generation (Simple JWT)
async function testRoomTokenGeneration() {
  logTest('Room Token Generation (Simple JWT)');
  
  if (!authTokens.doctor) {
    logWarning('Skipping - doctor not authenticated');
    return { success: false, skipped: true };
  }
  
  try {
    const response = await axios.post(
      `${BASE_URL}/video/room/token`,
      {
        roomId: `room-${Date.now()}`,
        appointmentId: 123
      },
      {
        headers: {
          Authorization: `Bearer ${authTokens.doctor}`
        }
      }
    );
    
    if (response.data.success && response.data.roomToken) {
      logSuccess('Room token generated successfully');
      logInfo(`Room ID: ${response.data.roomId}`);
      logInfo(`Expires at: ${response.data.expiresAt}`);
      logInfo(`ICE servers configured: ${response.data.iceServers.length}`);
      return { success: true, data: response.data };
    } else {
      logError('Failed to generate room token');
      return { success: false };
    }
  } catch (error) {
    logError(`Room token generation failed: ${error.response?.data?.message || error.message}`);
    return { success: false, error: error.message };
  }
}

// Run all tests
async function runAllTests() {
  log('\n' + '='.repeat(60), 'bright');
  log('MEDICZY VIDEO FUNCTIONALITY TEST SUITE', 'bright');
  log('='.repeat(60) + '\n', 'bright');
  
  logInfo(`Base URL: ${BASE_URL}`);
  logInfo(`LiveKit URL: ${LIVEKIT_URL}`);
  logInfo(`LiveKit API Key: ${LIVEKIT_API_KEY.substring(0, 10)}...`);
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };
  
  const tests = [
    { name: 'LiveKit Token Generation', fn: testLiveKitTokenGeneration },
    { name: 'Video System Health', fn: testVideoSystemHealth },
    { name: 'LiveKit Server Connection', fn: testLiveKitServerConnection },
    { name: 'Doctor Login', fn: loginDoctor },
    { name: 'User Login', fn: loginUser },
    { name: 'Doctor LiveKit Token', fn: testDoctorLiveKitToken },
    { name: 'User LiveKit Token', fn: testUserLiveKitToken },
    { name: 'Room Token Generation', fn: testRoomTokenGeneration }
  ];
  
  for (const test of tests) {
    results.total++;
    const result = await test.fn();
    
    if (result.skipped) {
      results.skipped++;
    } else if (result.success) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'bright');
  log('TEST SUMMARY', 'bright');
  log('='.repeat(60), 'bright');
  log(`Total Tests: ${results.total}`, 'bright');
  logSuccess(`Passed: ${results.passed}`);
  logError(`Failed: ${results.failed}`);
  logWarning(`Skipped: ${results.skipped}`);
  log('='.repeat(60) + '\n', 'bright');
  
  // Exit code based on results
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
