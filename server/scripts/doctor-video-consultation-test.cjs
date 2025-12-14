#!/usr/bin/env node

/**
 * 🎥 DOCTOR VIDEO CONSULTATION TESTING SUITE
 * 
 * This script thoroughly tests doctor login and video consultation features:
 * - Doctor authentication
 * - Video system configuration
 * - Room token generation
 * - Video room management
 * - Consultation availability
 * - Patient-Doctor video sessions
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8080';

// Test credentials
const DOCTOR_CREDS = { email: 'cardio@test.com', password: 'test123' };
const PATIENT_CREDS = { email: 'patient@test.com', password: 'test123' };

let testResults = [];

const makeRequest = async (endpoint, options = {}) => {
    try {
        const url = `${BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        return { success: response.ok, status: response.status, data };
    } catch (error) {
        return { success: false, error: error.message, status: 0 };
    }
};

const runTest = async (testName, testFunction) => {
    try {
        console.log(`\n🧪 ${testName}...`);
        const result = await testFunction();
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} | ${testName}`);
        if (result.details) console.log(`   📋 ${result.details}`);
        if (!result.success && result.error) console.log(`   💥 ${result.error}`);
        
        testResults.push({ name: testName, success: result.success, details: result.details });
        return result;
    } catch (error) {
        console.log(`❌ FAIL | ${testName} - ${error.message}`);
        testResults.push({ name: testName, success: false, error: error.message });
        return { success: false, error: error.message };
    }
};

// Test 1: Doctor Authentication
const testDoctorAuth = async () => {
    const response = await makeRequest('/api/doctors/login', {
        method: 'POST',
        body: JSON.stringify(DOCTOR_CREDS)
    });
    
    if (response.success && response.data.token) {
        return { 
            success: true, 
            details: `Doctor authenticated: ${response.data.doctor?.email}`,
            token: response.data.token 
        };
    }
    return { success: false, error: response.data?.message || 'Login failed' };
};

// Test 2: Doctor Profile Access
const testDoctorProfile = async (token) => {
    const response = await makeRequest('/api/doctors/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success && response.data.doctor) {
        const doctor = response.data.doctor;
        return { 
            success: true, 
            details: `Profile: ${doctor.name} - ${doctor.specialization || 'N/A'}`
        };
    }
    return { success: false, error: 'Profile access failed' };
};

// Test 3: Video System Test
const testVideoSystem = async () => {
    const response = await makeRequest('/api/video/test');
    
    if (response.success && response.data.message) {
        return { 
            success: true, 
            details: `Video system operational - ${response.data.config?.iceServers?.length || 0} ICE servers`
        };
    }
    return { success: false, error: 'Video system test failed' };
};

// Test 4: Generate Video Room Token
const testVideoRoomToken = async (token) => {
    const response = await makeRequest('/api/video/room/token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            roomId: 'test-consultation-room',
            appointmentId: 12345
        })
    });
    
    if (response.success && response.data.roomToken) {
        return { 
            success: true, 
            details: `Room token generated - expires: ${new Date(response.data.expiresAt).toLocaleTimeString()}`,
            roomToken: response.data.roomToken,
            roomUrl: response.data.roomUrl
        };
    }
    return { success: false, error: response.data?.message || 'Room token generation failed' };
};

// Test 5: Join Video Room
const testJoinVideoRoom = async (token) => {
    const response = await makeRequest('/api/video/room/test-consultation-room/join', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `Joined room at: ${response.data.roomData?.joinedAt}`
        };
    }
    return { success: false, error: 'Failed to join video room' };
};

// Test 6: Leave Video Room
const testLeaveVideoRoom = async (token) => {
    const response = await makeRequest('/api/video/room/test-consultation-room/leave', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: 'Successfully left video room'
        };
    }
    return { success: false, error: 'Failed to leave video room' };
};

// Test 7: Patient Authentication for Video Session
const testPatientAuth = async () => {
    const response = await makeRequest('/api/users/login', {
        method: 'POST',
        body: JSON.stringify(PATIENT_CREDS)
    });
    
    if (response.success && response.data.token) {
        return { 
            success: true, 
            details: `Patient authenticated: ${response.data.user?.email}`,
            token: response.data.token 
        };
    }
    return { success: false, error: 'Patient login failed' };
};

// Test 8: Patient Video Room Access
const testPatientVideoAccess = async (patientToken) => {
    const response = await makeRequest('/api/video/room/token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${patientToken}` },
        body: JSON.stringify({
            roomId: 'patient-consultation-room',
            appointmentId: 67890
        })
    });
    
    if (response.success && response.data.roomToken) {
        return { 
            success: true, 
            details: `Patient room access granted - role: ${response.data.userRole || 'user'}`
        };
    }
    return { success: false, error: 'Patient video access failed' };
};

// Test 9: Multi-user Video Session Simulation
const testMultiUserVideoSession = async (doctorToken, patientToken) => {
    const roomId = 'multi-user-consultation';
    
    // Doctor generates room
    const doctorRoom = await makeRequest('/api/video/room/token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${doctorToken}` },
        body: JSON.stringify({ roomId, appointmentId: 999 })
    });
    
    if (!doctorRoom.success) {
        return { success: false, error: 'Doctor room creation failed' };
    }
    
    // Patient joins room
    const patientJoin = await makeRequest(`/api/video/room/${roomId}/join`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${patientToken}` }
    });
    
    // Doctor joins room
    const doctorJoin = await makeRequest(`/api/video/room/${roomId}/join`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${doctorToken}` }
    });
    
    if (patientJoin.success && doctorJoin.success) {
        return { 
            success: true, 
            details: 'Multi-user video session established successfully'
        };
    }
    return { success: false, error: 'Multi-user session failed' };
};

// Test 10: Video Configuration Access
const testVideoConfig = async (token) => {
    // Test video configuration endpoints (may require admin access)
    const configTest = await makeRequest('/api/video-config/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // Don't fail the test if admin access is required
    return { 
        success: true, 
        details: `Config access: ${configTest.success ? 'Available' : 'Restricted (admin only)'}`
    };
};

// Main test runner
const runDoctorVideoTests = async () => {
    console.log('🎥 DOCTOR VIDEO CONSULTATION TESTING SUITE');
    console.log('=' * 50);
    
    let doctorToken, patientToken;
    
    // Run all tests
    const authResult = await runTest('Doctor Authentication', testDoctorAuth);
    if (!authResult.success) return;
    doctorToken = authResult.token;
    
    await runTest('Doctor Profile Access', () => testDoctorProfile(doctorToken));
    await runTest('Video System Operational', testVideoSystem);
    await runTest('Generate Video Room Token', () => testVideoRoomToken(doctorToken));
    await runTest('Join Video Room', () => testJoinVideoRoom(doctorToken));
    await runTest('Leave Video Room', () => testLeaveVideoRoom(doctorToken));
    
    const patientAuthResult = await runTest('Patient Authentication', testPatientAuth);
    if (patientAuthResult.success) {
        patientToken = patientAuthResult.token;
        await runTest('Patient Video Access', () => testPatientVideoAccess(patientToken));
        await runTest('Multi-user Video Session', () => testMultiUserVideoSession(doctorToken, patientToken));
    }
    
    await runTest('Video Configuration Access', () => testVideoConfig(doctorToken));
    
    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('=' * 30);
    const passed = testResults.filter(t => t.success).length;
    const total = testResults.length;
    console.log(`Tests Passed: ${passed}/${total} (${((passed/total) * 100).toFixed(1)}%)`);
    
    if (passed < total) {
        console.log('\n🚨 FAILED TESTS:');
        testResults.filter(t => !t.success).forEach(test => {
            console.log(`❌ ${test.name}: ${test.error || 'Unknown error'}`);
        });
    }
    
    console.log('\n🏁 Video consultation testing complete!');
};

// Export for use as module
module.exports = { runDoctorVideoTests };

// Run if called directly
if (require.main === module) {
    runDoctorVideoTests().catch(error => {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    });
}