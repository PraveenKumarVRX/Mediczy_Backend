#!/usr/bin/env node

/**
 * 🔑 ADMIN PRODUCTION CREDENTIALS TEST SUITE
 * 
 * Testing admin login and all dashboard functions with production admin credentials
 * Admin: admin@mediczy.com / SecurePass123
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8080';
const ADMIN_CREDS = { 
    email: 'admin@mediczy.com', 
    password: 'SecurePass123' 
};

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

// Test 1: Production Admin Authentication
const testProductionAdminAuth = async () => {
    console.log(`🔐 Testing login with: ${ADMIN_CREDS.email}`);
    
    const response = await makeRequest('/api/users/login', {
        method: 'POST',
        body: JSON.stringify(ADMIN_CREDS)
    });
    
    if (response.success && response.data.token) {
        const user = response.data.user;
        return { 
            success: true, 
            details: `Admin ${user.firstName || 'Admin'} ${user.lastName || 'User'} authenticated successfully - Admin Status: ${user.isAdmin ? 'Confirmed' : 'Standard User'}`,
            token: response.data.token,
            user: user
        };
    }
    
    return { 
        success: false, 
        error: `Login failed: ${response.data?.message || 'Invalid credentials'} (Status: ${response.status})`
    };
};

// Test comprehensive admin dashboard functions
const testComprehensiveAdminFunctions = async (token) => {
    const adminEndpoints = [
        { 
            name: 'Admin Profile', 
            path: '/api/admin/profile',
            description: 'Admin user profile and permissions'
        },
        { 
            name: 'Dashboard Statistics', 
            path: '/api/admin/dashboard/stats',
            description: 'Main dashboard overview statistics'
        },
        { 
            name: 'Users Management', 
            path: '/api/admin/users',
            description: 'Complete user account management'
        },
        { 
            name: 'Doctors Management', 
            path: '/api/admin/doctors',
            description: 'Healthcare provider management'
        },
        { 
            name: 'Corporates Management', 
            path: '/api/admin/corporates',
            description: 'Corporate client management'
        },
        { 
            name: 'Nurses Management', 
            path: '/api/admin/nurses',
            description: 'Nursing staff management'
        },
        { 
            name: 'Assistants Management', 
            path: '/api/admin/assistants',
            description: 'Medical assistant management'
        },
        { 
            name: 'Team Management', 
            path: '/api/admin/team',
            description: 'Internal team member management'
        },
        { 
            name: 'Labs Management', 
            path: '/api/admin/labs',
            description: 'Laboratory services management'
        },
        { 
            name: 'Pharmacies Management', 
            path: '/api/admin/pharmacies',
            description: 'Pharmacy network management'
        },
        { 
            name: 'WhatsApp Statistics', 
            path: '/api/admin/whatsapp/stats',
            description: 'WhatsApp communication analytics'
        },
        { 
            name: 'WhatsApp Templates', 
            path: '/api/admin/whatsapp/templates',
            description: 'Message template management'
        },
        { 
            name: 'WhatsApp Campaigns', 
            path: '/api/admin/whatsapp/campaigns',
            description: 'Marketing campaign management'
        },
        { 
            name: 'WhatsApp Messages', 
            path: '/api/admin/whatsapp/messages',
            description: 'Message history and logs'
        },
        { 
            name: 'Payment Analytics', 
            path: '/api/admin/analytics/payments',
            description: 'Financial payment tracking'
        },
        { 
            name: 'Accounts Receivable', 
            path: '/api/admin/analytics/accounts-receivable',
            description: 'Outstanding accounts management'
        }
    ];
    
    const results = [];
    let accessibleCount = 0;
    let totalDataItems = 0;
    
    console.log('\n🗂️  TESTING ALL ADMIN SIDE MENU FUNCTIONS:');
    console.log('=' * 50);
    
    for (const endpoint of adminEndpoints) {
        const response = await makeRequest(endpoint.path, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const success = response.success;
        let details = '';
        
        if (success) {
            accessibleCount++;
            
            // Extract meaningful data from response
            const data = response.data;
            if (data) {
                if (data.users) totalDataItems += data.users.length;
                if (data.doctors) totalDataItems += data.doctors.length;
                if (data.data && Array.isArray(data.data)) totalDataItems += data.data.length;
                if (data.teamUsers) totalDataItems += data.teamUsers.length;
                if (data.nurses) totalDataItems += data.nurses.length;
                if (data.assistants) totalDataItems += data.assistants.length;
                
                details = `${endpoint.name} accessible - ${endpoint.description}`;
                
                // Add specific data counts where available
                if (data.users) details += ` (${data.users.length} users)`;
                if (data.doctors) details += ` (${data.doctors.length} doctors)`;
                if (data.data && Array.isArray(data.data)) details += ` (${data.data.length} items)`;
                if (data.teamUsers) details += ` (${data.teamUsers.length} team members)`;
                if (data.nurses) details += ` (${data.nurses.length} nurses)`;
                if (data.assistants) details += ` (${data.assistants.length} assistants)`;
            }
        } else {
            const errorMsg = response.data?.message || response.error || `HTTP ${response.status}`;
            details = `${endpoint.name} failed - ${errorMsg}`;
        }
        
        results.push({ name: endpoint.name, success, details });
        
        const status = success ? '✅' : '❌';
        console.log(`   ${status} ${endpoint.name}`);
        console.log(`      ${details}`);
    }
    
    return {
        results,
        summary: {
            accessible: accessibleCount,
            total: adminEndpoints.length,
            successRate: ((accessibleCount / adminEndpoints.length) * 100).toFixed(1),
            totalDataItems
        }
    };
};

// Test admin creation functions
const testAdminCreationFunctions = async (token) => {
    console.log('\n➕ TESTING ADMIN CREATION FUNCTIONS:');
    console.log('=' * 40);
    
    const timestamp = Date.now();
    
    const creationTests = [
        {
            name: 'User Creation Test',
            path: '/api/admin/users',
            data: {
                firstName: 'Test',
                lastName: 'User',
                email: `testuser_${timestamp}@mediczy.com`,
                password: 'TestPass123',
                phoneNumber: '+1-555-0101',
                dateOfBirth: '1990-01-01',
                gender: 'Other',
                address_street: '123 Test St',
                address_city: 'Test City',
                address_state: 'TS',
                address_zipCode: '12345'
            }
        },
        {
            name: 'Doctor Creation Test',
            path: '/api/admin/doctors',
            data: {
                firstName: 'Dr. Test',
                lastName: 'Doctor',
                email: `testdoctor_${timestamp}@mediczy.com`,
                password: 'TestPass123',
                phoneNumber: '+1-555-0102',
                specialization: 'General Medicine',
                licenseNumber: `LIC${timestamp}`,
                experience: 5,
                biography: 'Test doctor for admin functionality validation'
            }
        },
        {
            name: 'Corporate Creation Test',
            path: '/api/admin/corporates',
            data: {
                companyName: `Test Corporation ${timestamp}`,
                contactPersonName: 'Corporate Manager',
                contactEmail: `testcorp_${timestamp}@mediczy.com`,
                contactPhone: '+1-555-0103',
                employeeCount: '25',
                industry: 'Technology',
                status: 'Active'
            }
        }
    ];
    
    const creationResults = [];
    
    for (const test of creationTests) {
        const response = await makeRequest(test.path, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(test.data)
        });
        
        const success = response.success;
        let details = '';
        
        if (success) {
            details = `${test.name} successful - Created: ${test.data.email || test.data.companyName}`;
        } else {
            const errorMsg = response.data?.message || response.error || `HTTP ${response.status}`;
            details = `${test.name} failed - ${errorMsg}`;
        }
        
        creationResults.push({ name: test.name, success, details });
        
        const status = success ? '✅' : '❌';
        console.log(`   ${status} ${test.name}`);
        console.log(`      ${details}`);
    }
    
    return creationResults;
};

// Main test execution
const runProductionAdminTests = async () => {
    console.log('🔑 MEDICZY ADMIN PRODUCTION CREDENTIALS TEST');
    console.log('=' * 52);
    console.log(`📧 Admin Email: ${ADMIN_CREDS.email}`);
    console.log(`🌐 Platform URL: ${BASE_URL}`);
    console.log(`🕒 Test Time: ${new Date().toLocaleString()}`);
    
    let adminToken;
    let adminUser;
    
    // Test production admin authentication
    const authResult = await runTest('Production Admin Authentication', testProductionAdminAuth);
    if (!authResult.success) {
        console.log('\n🚨 CRITICAL ERROR: Cannot authenticate with provided admin credentials!');
        console.log('Please verify:');
        console.log('1. Admin email is correct: admin@mediczy.com');
        console.log('2. Password is correct: SecurePass123');
        console.log('3. Admin account exists in database');
        console.log('4. Admin account has proper privileges');
        return;
    }
    
    adminToken = authResult.token;
    adminUser = authResult.user;
    
    console.log(`\n👤 Logged in as: ${adminUser.firstName} ${adminUser.lastName}`);
    console.log(`📧 Email: ${adminUser.email}`);
    console.log(`🔑 Admin Status: ${adminUser.isAdmin ? 'CONFIRMED' : 'NOT SET'}`);
    
    // Test all admin dashboard functions
    const functionResults = await testComprehensiveAdminFunctions(adminToken);
    testResults.push(...functionResults.results);
    
    // Test creation functions
    const creationResults = await testAdminCreationFunctions(adminToken);
    testResults.push(...creationResults);
    
    // Generate comprehensive summary
    console.log('\n📊 ADMIN FUNCTIONALITY TEST RESULTS');
    console.log('=' * 42);
    
    const passed = testResults.filter(t => t.success).length;
    const total = testResults.length;
    const successRate = ((passed / total) * 100).toFixed(1);
    
    console.log(`🧪 Total Tests Executed: ${total}`);
    console.log(`✅ Successful Tests: ${passed}`);
    console.log(`❌ Failed Tests: ${total - passed}`);
    console.log(`📈 Success Rate: ${successRate}%`);
    console.log(`📊 Data Access: ${functionResults.summary.totalDataItems} total items accessible`);
    
    // Categorize results
    const managementFunctions = testResults.filter(t => 
        t.name.includes('Management') || t.name.includes('Statistics') || t.name.includes('Profile')
    );
    const communicationFunctions = testResults.filter(t => 
        t.name.includes('WhatsApp')
    );
    const analyticsFunctions = testResults.filter(t => 
        t.name.includes('Analytics') || t.name.includes('Accounts')
    );
    const creationFunctions = testResults.filter(t => 
        t.name.includes('Creation')
    );
    
    console.log('\n📋 FUNCTION CATEGORY BREAKDOWN:');
    console.log(`   📊 Management Functions: ${managementFunctions.filter(t => t.success).length}/${managementFunctions.length}`);
    console.log(`   💬 Communication Functions: ${communicationFunctions.filter(t => t.success).length}/${communicationFunctions.length}`);
    console.log(`   📈 Analytics Functions: ${analyticsFunctions.filter(t => t.success).length}/${analyticsFunctions.length}`);
    console.log(`   ➕ Creation Functions: ${creationFunctions.filter(t => t.success).length}/${creationFunctions.length}`);
    
    // Side menu assessment
    console.log('\n🗂️  ADMIN SIDE MENU FUNCTION STATUS:');
    const menuFunctions = [
        'Dashboard Statistics', 'Users Management', 'Doctors Management', 
        'Corporates Management', 'Nurses Management', 'Assistants Management',
        'Team Management', 'Labs Management', 'Pharmacies Management',
        'WhatsApp Statistics', 'Payment Analytics'
    ];
    
    menuFunctions.forEach(func => {
        const result = testResults.find(t => t.name.includes(func.split(' ')[0]) && t.name.includes(func.split(' ')[1]));
        const status = result?.success ? '✅' : '❌';
        console.log(`   ${status} ${func}`);
    });
    
    // Issues summary
    const failedTests = testResults.filter(t => !t.success);
    if (failedTests.length > 0) {
        console.log('\n⚠️  ISSUES IDENTIFIED:');
        failedTests.forEach(test => {
            console.log(`❌ ${test.name}: ${test.details}`);
        });
    }
    
    // Final assessment
    console.log('\n🏆 FINAL ADMIN DASHBOARD ASSESSMENT:');
    if (successRate >= 90) {
        console.log('🎉 EXCELLENT! Admin dashboard is fully operational with production credentials.');
    } else if (successRate >= 75) {
        console.log('✅ GOOD! Most admin functions are working with minor issues.');
    } else if (successRate >= 50) {
        console.log('⚠️  PARTIAL! Some admin functions need attention.');
    } else {
        console.log('🚨 CRITICAL! Major admin functionality issues detected.');
    }
    
    console.log(`\n🔐 Admin Access Confirmation: ${adminUser.isAdmin ? 'VERIFIED' : 'NEEDS VERIFICATION'}`);
    console.log('🏁 Admin functionality testing complete!');
    
    return {
        success: successRate >= 75,
        successRate,
        totalTests: total,
        passedTests: passed,
        adminUser
    };
};

// Export for use as module
module.exports = { runProductionAdminTests };

// Run if called directly
if (require.main === module) {
    runProductionAdminTests().catch(error => {
        console.error('💥 Production admin test failed:', error);
        process.exit(1);
    });
}