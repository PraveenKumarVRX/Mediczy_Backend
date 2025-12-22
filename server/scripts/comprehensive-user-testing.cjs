#!/usr/bin/env node

/**
 * 🧪 MEDICZY COMPREHENSIVE USER TESTING SUITE
 * 
 * This script systematically tests all functionalities for each user type:
 * - Regular Users: Health tracking, appointments, consultations
 * - Doctors: Patient management, prescriptions, consultations 
 * - Nurses: Patient monitoring, vital signs, records
 * - Team Users: Administrative tasks, user management
 * 
 * Usage: node comprehensive-user-testing.js
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';
const TEST_RESULTS_DIR = process.env.TEST_RESULTS_DIR || path.resolve(process.cwd(), 'test-results');
const DELAY_BETWEEN_TESTS = 1000; // 1 second

// Test Credentials
const TEST_USERS = {
    patient: { email: 'patient@test.com', password: 'test123', type: 'user' },
    doctor: { email: 'cardio@test.com', password: 'test123', type: 'doctor' },
    nurse: { email: 'nurse@test.com', password: 'test123', type: 'nurse' },
    admin: { email: 'admin@test.com', password: 'test123', type: 'admin' },
    team: { email: 'reception@test.com', password: 'test123', type: 'team' }
};

// Results tracking
let testResults = {
    summary: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: []
    },
    userTests: {},
    timestamp: new Date().toISOString()
};

// Utility functions
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const makeRequest = async (endpoint, options = {}) => {
    try {
        const url = `${BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        return {
            success: response.ok,
            status: response.status,
            data,
            headers: response.headers
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            status: 0
        };
    }
};

const logTest = (userType, testName, success, details = '') => {
    const status = success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${userType.toUpperCase()} | ${testName}`);
    if (details) console.log(`   📋 ${details}`);
    
    testResults.summary.total++;
    if (success) {
        testResults.summary.passed++;
    } else {
        testResults.summary.failed++;
        testResults.summary.errors.push(`${userType}: ${testName} - ${details}`);
    }
    
    if (!testResults.userTests[userType]) {
        testResults.userTests[userType] = { passed: 0, failed: 0, tests: [] };
    }
    
    testResults.userTests[userType].tests.push({
        name: testName,
        success,
        details,
        timestamp: new Date().toISOString()
    });
    
    if (success) {
        testResults.userTests[userType].passed++;
    } else {
        testResults.userTests[userType].failed++;
    }
};

// Authentication helper
const authenticateUser = async (userType) => {
    const user = TEST_USERS[userType];
    if (!user) {
        logTest(userType, 'Authentication Setup', false, 'User credentials not found');
        return null;
    }
    
    // Determine the correct login endpoint based on user type
    let loginEndpoint = '/api/users/login';
    if (userType === 'doctor') {
        loginEndpoint = '/api/doctors/login';
    } else if (userType === 'nurse') {
        loginEndpoint = '/api/nurse/login';
    } else if (userType === 'admin' || userType === 'team') {
        loginEndpoint = '/api/users/login'; // Admin and team users use regular user login
    }
    
    const response = await makeRequest(loginEndpoint, {
        method: 'POST',
        body: JSON.stringify({
            email: user.email,
            password: user.password
        })
    });
    
    if (response.success && response.data && response.data.token) {
        logTest(userType, 'User Authentication', true, `Token received for ${user.email}`);
        return response.data.token;
    } else {
        logTest(userType, 'User Authentication', false, response.error || response.data || 'Login failed');
        return null;
    }
};

// Test suites for each user type

// 👤 REGULAR USER TESTS
const testRegularUser = async (token) => {
    const userType = 'patient';
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('\n🔍 Testing Regular User Functionality...');
    
    // Profile management
    const profile = await makeRequest('/api/users/profile', { headers });
    logTest(userType, 'Profile Access', profile.success, 
        profile.success ? 'Profile data retrieved' : profile.error);
    
    // Lab directory access (correct endpoint)
    const labs = await makeRequest('/api/labs', { headers });
    logTest(userType, 'Lab Directory Access', labs.success,
        labs.success ? `${labs.data?.data?.labs?.length || 0} labs available` : labs.error);
    
    // Doctor directory access (correct endpoint)
    const doctors = await makeRequest('/api/doctors/search', { headers });
    logTest(userType, 'Doctor Directory Access', doctors.success,
        doctors.success ? `${doctors.data?.doctors?.length || 0} doctors available` : doctors.error);
    
    // Fitness data tracking (correct endpoint)
    const fitnessData = await makeRequest('/api/fitness-data/store', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            fitnessData: [{
                date: new Date().toISOString(),
                steps: 8000,
                calories: 250,
                activeMinutes: 30,
                distance: 5.2
            }]
        })
    });
    logTest(userType, 'Fitness Data Recording', fitnessData.success,
        fitnessData.success ? 'Fitness data recorded' : fitnessData.error);
    
    // AI medical assistance (correct endpoint)
    const medicalAI = await makeRequest('/api/medical-ai/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query: 'I have a headache, what should I do?',
            language: 'en',
            userContext: { age: 30, gender: 'male' }
        })
    });
    logTest(userType, 'Medical AI Chat', medicalAI.success,
        medicalAI.success ? 'AI response received' : medicalAI.error);
    
    // Appointments system
    const appointments = await makeRequest('/api/appointments', { headers });
    logTest(userType, 'Appointment System', appointments.success,
        appointments.success ? `${appointments.data?.appointments?.length || 0} appointments found` : appointments.error);
    
    // Enhanced appointment booking
    const enhancedAppointments = await makeRequest('/api/enhanced-appointments', { headers });
    logTest(userType, 'Enhanced Appointments', enhancedAppointments.success,
        enhancedAppointments.success ? 'Enhanced booking system accessible' : enhancedAppointments.error);
    
    await delay(DELAY_BETWEEN_TESTS);
};

// 👨‍⚕️ DOCTOR TESTS
const testDoctor = async (token) => {
    const userType = 'doctor';
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('\n🔍 Testing Doctor Functionality...');
    
    // Doctor profile and specialization
    const profile = await makeRequest('/api/doctors/profile', { headers });
    logTest(userType, 'Doctor Profile Access', profile.success,
        profile.success ? 'Doctor profile retrieved' : profile.error);
    
    // Doctor availability management (correct endpoint)
    const availability = await makeRequest('/api/doctors/availability', { headers });
    logTest(userType, 'Availability Management', availability.success,
        availability.success ? 'Availability system accessible' : availability.error);
    
    // Appointment management
    const appointments = await makeRequest('/api/appointments', { headers });
    logTest(userType, 'Doctor Appointments', appointments.success,
        appointments.success ? `${appointments.data?.appointments?.length || 0} appointments found` : appointments.error);
    
    // Enhanced appointment system
    const enhancedAppointments = await makeRequest('/api/enhanced-appointments', { headers });
    logTest(userType, 'Enhanced Appointment System', enhancedAppointments.success,
        enhancedAppointments.success ? 'Enhanced appointment system working' : enhancedAppointments.error);
    
    // Patient management
    const patients = await makeRequest('/api/patients', { headers });
    logTest(userType, 'Patient Management', patients.success,
        patients.success ? `${patients.data?.patients?.length || 0} patients accessible` : patients.error);
    
    // CRM functionality for doctors
    const crm = await makeRequest('/api/crm', { headers });
    logTest(userType, 'CRM System Access', crm.success,
        crm.success ? 'CRM system accessible' : crm.error);
    
    // Medical AI assistance for doctors (correct endpoint)
    const medicalAI = await makeRequest('/api/medical-ai/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query: 'Patient symptoms analysis for chest pain',
            language: 'en',
            userContext: { 
                role: 'doctor',
                specialty: 'cardiology',
                case: 'chest_pain_analysis'
            }
        })
    });
    logTest(userType, 'Medical AI for Doctors', medicalAI.success,
        medicalAI.success ? 'Doctor AI assistance working' : medicalAI.error);
    
    await delay(DELAY_BETWEEN_TESTS);
};

// 👩‍⚕️ NURSE TESTS
const testNurse = async (token) => {
    const userType = 'nurse';
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('\n🔍 Testing Nurse Functionality...');
    
    // Nurse profile access
    const profile = await makeRequest('/api/nurse/profile', { headers });
    logTest(userType, 'Nurse Profile Access', profile.success,
        profile.success ? 'Nurse profile retrieved' : profile.error);
    
    // Patient management for nurses
    const patients = await makeRequest('/api/patients', { headers });
    logTest(userType, 'Patient Management', patients.success,
        patients.success ? `${patients.data?.patients?.length || 0} patients accessible` : patients.error);
    
    // Appointment assistance
    const appointments = await makeRequest('/api/appointments/nurse', { headers });
    logTest(userType, 'Appointment Assistance', appointments.success,
        appointments.success ? 'Appointment assistance accessible' : appointments.error);
    
    // Team coordination
    const team = await makeRequest('/api/team/coordination', { headers });
    logTest(userType, 'Team Coordination', team.success,
        team.success ? 'Team coordination system working' : team.error);
    
    // Chat system for nurses
    const chat = await makeRequest('/api/chat/nurse', { headers });
    logTest(userType, 'Nurse Chat System', chat.success,
        chat.success ? 'Chat system accessible' : chat.error);
    
    // CRM access for nurses
    const crm = await makeRequest('/api/crm/nurse', { headers });
    logTest(userType, 'CRM System Access', crm.success,
        crm.success ? 'CRM system accessible' : crm.error);
    
    await delay(DELAY_BETWEEN_TESTS);
};

// 👥 TEAM/ADMIN USER TESTS
const testTeamUser = async (token) => {
    const userType = 'team';
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('\n🔍 Testing Team/Admin User Functionality...');
    
    // Admin dashboard access (correct endpoint)
    const dashboard = await makeRequest('/api/admin/stats', { headers });
    logTest(userType, 'Admin Dashboard Access', dashboard.success,
        dashboard.success ? 'Dashboard accessible' : dashboard.error);
    
    // User management
    const users = await makeRequest('/api/admin/users', { headers });
    logTest(userType, 'User Management', users.success,
        users.success ? `${users.data?.users?.length || 0} users in system` : users.error);
    
    // Doctor management
    const doctors = await makeRequest('/api/admin/doctors', { headers });
    logTest(userType, 'Doctor Management', doctors.success,
        doctors.success ? `${doctors.data?.doctors?.length || 0} doctors in system` : doctors.error);
    
    // Appointment coordination
    const appointments = await makeRequest('/api/admin/appointments', { headers });
    logTest(userType, 'Appointment Coordination', appointments.success,
        appointments.success ? 'Appointment system accessible' : appointments.error);
    
    // System statistics (public endpoint)
    const stats = await makeRequest('/stats', { headers });
    logTest(userType, 'System Statistics', stats.success,
        stats.success ? 'Statistics available' : stats.error);
    
    // User verification management
    const verification = await makeRequest('/api/admin/verification', { headers });
    logTest(userType, 'User Verification System', verification.success,
        verification.success ? 'Verification system working' : verification.error);
    
    // Lab management
    const labs = await makeRequest('/api/labs', { headers });
    logTest(userType, 'Lab Management', labs.success,
        labs.success ? `${labs.data?.data?.labs?.length || 0} labs in system` : labs.error);
    
    await delay(DELAY_BETWEEN_TESTS);
};

// Main testing orchestrator
const runComprehensiveTests = async () => {
    console.log('🚀 STARTING MEDICZY COMPREHENSIVE USER TESTING SUITE');
    console.log('=' * 60);
    
    // Create test results directory
    if (!fs.existsSync(TEST_RESULTS_DIR)) {
        fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });
    }
    
    // Test each user type
    for (const [userType, userData] of Object.entries(TEST_USERS)) {
        try {
            console.log(`\n📋 Testing ${userType.toUpperCase()} User Type`);
            console.log('-'.repeat(40));
            
            // Authenticate user
            const token = await authenticateUser(userType);
            if (!token) {
                console.log(`❌ Skipping ${userType} tests due to authentication failure`);
                continue;
            }
            
            // Run appropriate test suite
            switch (userType) {
                case 'patient':
                    await testRegularUser(token);
                    break;
                case 'doctor':
                    await testDoctor(token);
                    break;
                case 'nurse':
                    await testNurse(token);
                    break;
                case 'admin':
                case 'team':
                    await testTeamUser(token);
                    break;
                default:
                    console.log(`⚠️  Unknown user type: ${userType}`);
            }
            
        } catch (error) {
            console.error(`💥 Error testing ${userType}:`, error.message);
            logTest(userType, 'Test Suite Execution', false, error.message);
        }
        
        await delay(DELAY_BETWEEN_TESTS);
    }
    
    // Generate comprehensive report
    await generateTestReport();
};

// Generate test report
const generateTestReport = async () => {
    console.log('\n📊 GENERATING COMPREHENSIVE TEST REPORT');
    console.log('=' * 60);
    
    // Console summary
    console.log(`\n🎯 TEST SUMMARY:`);
    console.log(`   Total Tests: ${testResults.summary.total}`);
    console.log(`   Passed: ${testResults.summary.passed} ✅`);
    console.log(`   Failed: ${testResults.summary.failed} ❌`);
    console.log(`   Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`);
    
    // User type breakdown
    console.log(`\n👥 USER TYPE BREAKDOWN:`);
    for (const [userType, results] of Object.entries(testResults.userTests)) {
        const total = results.passed + results.failed;
        const successRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;
        console.log(`   ${userType.toUpperCase()}: ${results.passed}/${total} (${successRate}%)`);
    }
    
    // Errors summary
    if (testResults.summary.errors.length > 0) {
        console.log(`\n🚨 ERRORS FOUND:`);
        testResults.summary.errors.forEach((error, index) => {
            console.log(`   ${index + 1}. ${error}`);
        });
    }
    
    // Save detailed report
    const reportPath = path.join(TEST_RESULTS_DIR, `test-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
    console.log(`\n💾 Detailed report saved: ${reportPath}`);
    
    // Generate issue recommendations
    const issuesPath = path.join(TEST_RESULTS_DIR, `issues-to-fix-${Date.now()}.md`);
    await generateIssueReport(issuesPath);
};

// Generate issue report with fix recommendations
const generateIssueReport = async (filePath) => {
    let issueReport = `# 🔧 MEDICZY ISSUES TO FIX\n\n`;
    issueReport += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    if (testResults.summary.errors.length === 0) {
        issueReport += `🎉 **No critical issues found!** All tests passed successfully.\n\n`;
    } else {
        issueReport += `## 🚨 Critical Issues Found: ${testResults.summary.errors.length}\n\n`;
        
        testResults.summary.errors.forEach((error, index) => {
            issueReport += `### ${index + 1}. ${error}\n\n`;
            
            // Add fix recommendations based on error type
            if (error.includes('Authentication')) {
                issueReport += `**Fix Priority:** HIGH\n`;
                issueReport += `**Recommended Fix:** Check user authentication routes and JWT token validation.\n\n`;
            } else if (error.includes('Profile')) {
                issueReport += `**Fix Priority:** MEDIUM\n`;
                issueReport += `**Recommended Fix:** Verify user profile endpoints and database schema.\n\n`;
            } else if (error.includes('Appointment')) {
                issueReport += `**Fix Priority:** HIGH\n`;
                issueReport += `**Recommended Fix:** Check appointment booking system and database relations.\n\n`;
            } else {
                issueReport += `**Fix Priority:** MEDIUM\n`;
                issueReport += `**Recommended Fix:** Investigate endpoint functionality and error handling.\n\n`;
            }
        });
    }
    
    // Add user type specific recommendations
    issueReport += `## 📋 User Type Specific Analysis\n\n`;
    for (const [userType, results] of Object.entries(testResults.userTests)) {
        const failedTests = results.tests.filter(test => !test.success);
        if (failedTests.length > 0) {
            issueReport += `### ${userType.toUpperCase()} Issues:\n`;
            failedTests.forEach(test => {
                issueReport += `- **${test.name}**: ${test.details}\n`;
            });
            issueReport += `\n`;
        }
    }
    
    fs.writeFileSync(filePath, issueReport);
    console.log(`📋 Issue report saved: ${filePath}`);
};

// Export for use as module
module.exports = {
    runComprehensiveTests,
    testResults
};

// Run if called directly
if (require.main === module) {
    runComprehensiveTests().catch(error => {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    });
}
