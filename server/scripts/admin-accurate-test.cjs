#!/usr/bin/env node

/**
 * 🔑 ADMIN ACCURATE TESTING SUITE
 * 
 * This script tests admin functions based on actual available endpoints
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8080';
const ADMIN_CREDS = { email: 'admin@test.com', password: 'test123' };

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

// Test 1: Admin Authentication
const testAdminAuth = async () => {
    const response = await makeRequest('/api/users/login', {
        method: 'POST',
        body: JSON.stringify(ADMIN_CREDS)
    });
    
    if (response.success && response.data.token) {
        const user = response.data.user;
        return { 
            success: true, 
            details: `Admin ${user.firstName || 'Admin'} ${user.lastName || 'User'} authenticated - Admin: ${user.isAdmin ? 'Yes' : 'No'}`,
            token: response.data.token 
        };
    }
    return { success: false, error: response.data?.message || 'Admin login failed' };
};

// Test the actual available endpoints
const testActualEndpoints = async (token) => {
    const endpoints = [
        { name: 'Admin Profile', path: '/api/admin/profile' },
        { name: 'Dashboard Statistics', path: '/api/admin/dashboard/stats' },
        { name: 'Users List', path: '/api/admin/users' },
        { name: 'Doctors List', path: '/api/admin/doctors' },
        { name: 'Labs List', path: '/api/admin/labs' },
        { name: 'Pharmacies List', path: '/api/admin/pharmacies' },
        { name: 'Corporates List', path: '/api/admin/corporates' },
        { name: 'Nurses List', path: '/api/admin/nurses' },
        { name: 'Assistants List', path: '/api/admin/assistants' },
        { name: 'Team List', path: '/api/admin/team' },
        { name: 'WhatsApp Stats', path: '/api/admin/whatsapp/stats' },
        { name: 'WhatsApp Templates', path: '/api/admin/whatsapp/templates' },
        { name: 'WhatsApp Campaigns', path: '/api/admin/whatsapp/campaigns' },
        { name: 'WhatsApp Messages', path: '/api/admin/whatsapp/messages' },
        { name: 'Payment Analytics', path: '/api/admin/analytics/payments' },
        { name: 'Accounts Receivable', path: '/api/admin/analytics/accounts-receivable' }
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
        const response = await makeRequest(endpoint.path, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const success = response.success;
        const details = success ? 
            `${endpoint.name} accessible` : 
            `${endpoint.name} failed: ${response.data?.message || response.error || 'Unknown error'}`;
            
        results.push({ name: endpoint.name, success, details });
        
        const status = success ? '✅' : '❌';
        console.log(`   ${status} ${endpoint.name}: ${details}`);
    }
    
    return results;
};

// Test POST endpoints (creation functions)
const testCreationEndpoints = async (token) => {
    const testData = {
        user: {
            firstName: 'Test',
            lastName: 'User',
            email: `testuser_${Date.now()}@test.com`,
            password: 'test123',
            phoneNumber: '+1-555-0123',
            dateOfBirth: '1990-01-01',
            gender: 'Other'
        },
        doctor: {
            firstName: 'Dr. Test',
            lastName: 'Doctor', 
            email: `testdoctor_${Date.now()}@test.com`,
            password: 'test123',
            phoneNumber: '+1-555-0124',
            specialization: 'General Medicine'
        },
        corporate: {
            companyName: `Test Corp ${Date.now()}`,
            contactPersonName: 'Test Manager',
            contactEmail: `testcorp_${Date.now()}@test.com`,
            contactPhone: '+1-555-0125',
            employeeCount: '25',
            industry: 'Technology'
        }
    };
    
    const creationTests = [
        { name: 'User Creation', path: '/api/admin/users', data: testData.user },
        { name: 'Doctor Creation', path: '/api/admin/doctors', data: testData.doctor },
        { name: 'Corporate Creation', path: '/api/admin/corporates', data: testData.corporate }
    ];
    
    const results = [];
    
    for (const test of creationTests) {
        const response = await makeRequest(test.path, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(test.data)
        });
        
        const success = response.success;
        const details = success ? 
            `${test.name} successful` : 
            `${test.name} failed: ${response.data?.message || response.error || 'Unknown error'}`;
            
        results.push({ name: test.name, success, details });
        
        const status = success ? '✅' : '❌';
        console.log(`   ${status} ${test.name}: ${details}`);
    }
    
    return results;
};

// Main test runner
const runAccurateAdminTests = async () => {
    console.log('🔑 ADMIN ACCURATE FUNCTIONALITY TESTING');
    console.log('=' * 45);
    
    let adminToken;
    
    // Authentication Test
    const authResult = await runTest('Admin Authentication', testAdminAuth);
    if (!authResult.success) {
        console.log('\n🚨 CRITICAL: Admin authentication failed. Cannot proceed with admin tests.');
        return;
    }
    adminToken = authResult.token;
    
    // Test all actual available endpoints
    console.log('\n📋 TESTING ACTUAL ADMIN ENDPOINTS:');
    console.log('-' * 40);
    const endpointResults = await testActualEndpoints(adminToken);
    testResults.push(...endpointResults);
    
    // Test creation endpoints
    console.log('\n➕ TESTING CREATION ENDPOINTS:');
    console.log('-' * 35);
    const creationResults = await testCreationEndpoints(adminToken);
    testResults.push(...creationResults);
    
    // Summary
    console.log('\n📊 ADMIN FUNCTIONALITY TEST SUMMARY');
    console.log('=' * 38);
    const passed = testResults.filter(t => t.success).length;
    const total = testResults.length;
    console.log(`Tests Passed: ${passed}/${total} (${((passed/total) * 100).toFixed(1)}%)`);
    
    // Categorize results
    const managementTests = testResults.filter(t => 
        t.name.includes('List') || t.name.includes('Stats') || t.name.includes('Profile')
    );
    const creationTests = testResults.filter(t => t.name.includes('Creation'));
    const analyticsTests = testResults.filter(t => 
        t.name.includes('Analytics') || t.name.includes('WhatsApp')
    );
    
    console.log(`\n📋 Test Categories:`);
    console.log(`   📊 Management Functions: ${managementTests.filter(t => t.success).length}/${managementTests.length}`);
    console.log(`   ➕ Creation Functions: ${creationTests.filter(t => t.success).length}/${creationTests.length}`);
    console.log(`   📈 Analytics & Communications: ${analyticsTests.filter(t => t.success).length}/${analyticsTests.length}`);
    
    // Side Menu Functions Summary (based on actual endpoints)
    console.log(`\n🗂️  ADMIN SIDE MENU FUNCTIONS STATUS:`);
    console.log(`   📊 Dashboard Stats: ${testResults.find(t => t.name.includes('Dashboard Statistics'))?.success ? '✅' : '❌'}`);
    console.log(`   👥 Users Management: ${testResults.find(t => t.name.includes('Users List'))?.success ? '✅' : '❌'}`);
    console.log(`   👨‍⚕️ Doctors Management: ${testResults.find(t => t.name.includes('Doctors List'))?.success ? '✅' : '❌'}`);
    console.log(`   🏢 Corporate Management: ${testResults.find(t => t.name.includes('Corporates List'))?.success ? '✅' : '❌'}`);
    console.log(`   👩‍⚕️ Nurses Management: ${testResults.find(t => t.name.includes('Nurses List'))?.success ? '✅' : '❌'}`);
    console.log(`   👨‍💼 Assistants Management: ${testResults.find(t => t.name.includes('Assistants List'))?.success ? '✅' : '❌'}`);
    console.log(`   👥 Team Management: ${testResults.find(t => t.name.includes('Team List'))?.success ? '✅' : '❌'}`);
    console.log(`   🧪 Labs Management: ${testResults.find(t => t.name.includes('Labs List'))?.success ? '✅' : '❌'}`);
    console.log(`   💊 Pharmacies Management: ${testResults.find(t => t.name.includes('Pharmacies List'))?.success ? '✅' : '❌'}`);
    console.log(`   💬 WhatsApp Integration: ${testResults.find(t => t.name.includes('WhatsApp Stats'))?.success ? '✅' : '❌'}`);
    console.log(`   📊 Payment Analytics: ${testResults.find(t => t.name.includes('Payment Analytics'))?.success ? '✅' : '❌'}`);
    console.log(`   📈 Financial Reports: ${testResults.find(t => t.name.includes('Accounts Receivable'))?.success ? '✅' : '❌'}`);
    
    if (passed < total) {
        console.log('\n⚠️  ISSUES FOUND:');
        testResults.filter(t => !t.success).forEach(test => {
            console.log(`❌ ${test.name}: ${test.details}`);
        });
    }
    
    // Overall assessment
    const successRate = (passed / total) * 100;
    if (successRate >= 80) {
        console.log('\n🎉 EXCELLENT! Admin dashboard is highly functional.');
    } else if (successRate >= 60) {
        console.log('\n✅ GOOD! Most admin features are working properly.');
    } else {
        console.log('\n⚠️  NEEDS ATTENTION! Several admin features require fixes.');
    }
    
    console.log('\n🏁 Admin accurate functionality testing complete!');
    return { passed, total, successRate };
};

// Export for use as module
module.exports = { runAccurateAdminTests };

// Run if called directly
if (require.main === module) {
    runAccurateAdminTests().catch(error => {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    });
}