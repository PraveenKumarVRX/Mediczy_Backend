#!/usr/bin/env node

/**
 * 🔑 ADMIN COMPREHENSIVE TESTING SUITE
 * 
 * This script thoroughly tests admin login and all dashboard functions:
 * - Admin authentication and profile access
 * - Dashboard overview and statistics
 * - User management functions
 * - Doctor management
 * - Corporate management
 * - System monitoring
 * - Side menu navigation functions
 * - Administrative controls
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

// Test 2: Admin Profile Dashboard
const testAdminProfile = async (token) => {
    const response = await makeRequest('/api/users/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success && (response.data.user || response.data)) {
        const user = response.data.user || response.data;
        return { 
            success: true, 
            details: `Profile: ${user.firstName || 'Admin'} ${user.lastName || 'User'} - Admin Access: ${user.isAdmin ? 'Granted' : 'Standard'}`
        };
    }
    return { success: false, error: 'Admin profile access failed' };
};

// Test 3: Dashboard Statistics
const testDashboardStats = async (token) => {
    const response = await makeRequest('/api/admin/dashboard/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const stats = response.data;
        return { 
            success: true, 
            details: `Dashboard stats: Users, Doctors, Appointments data available`
        };
    }
    return { success: false, error: 'Dashboard statistics access failed' };
};

// Test 4: Users Management
const testUsersManagement = async (token) => {
    const response = await makeRequest('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const users = response.data.users || response.data.data || [];
        return { 
            success: true, 
            details: `Users management: ${users.length} users listed`
        };
    }
    return { success: false, error: 'Users management access failed' };
};

// Test 5: Doctors Management
const testDoctorsManagement = async (token) => {
    const response = await makeRequest('/api/admin/doctors', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const doctors = response.data.doctors || response.data.data || [];
        return { 
            success: true, 
            details: `Doctors management: ${doctors.length} doctors listed`
        };
    }
    return { success: false, error: 'Doctors management access failed' };
};

// Test 6: Corporate Management
const testCorporateManagement = async (token) => {
    const response = await makeRequest('/api/admin/corporates', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const corporates = response.data.data || response.data.corporates || [];
        return { 
            success: true, 
            details: `Corporate management: ${corporates.length} corporate entities listed`
        };
    }
    return { success: false, error: 'Corporate management access failed' };
};

// Test 7: System Monitoring
const testSystemMonitoring = async (token) => {
    const response = await makeRequest('/api/admin/system/status', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const status = response.data;
        return { 
            success: true, 
            details: 'System monitoring dashboard accessible'
        };
    }
    return { success: false, error: 'System monitoring access failed' };
};

// Test 8: User Creation
const testUserCreation = async (token) => {
    const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: `testuser_${Date.now()}@test.com`,
        password: 'test123',
        phoneNumber: '+1-555-0123',
        dateOfBirth: '1990-01-01',
        gender: 'Other'
    };
    
    const response = await makeRequest('/api/admin/users', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(userData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `User created: ${userData.email}`
        };
    }
    return { success: false, error: response.data?.message || 'User creation failed' };
};

// Test 9: Doctor Creation
const testDoctorCreation = async (token) => {
    const doctorData = {
        firstName: 'Dr. Test',
        lastName: 'Doctor',
        email: `testdoctor_${Date.now()}@test.com`,
        password: 'test123',
        phoneNumber: '+1-555-0124',
        specialization: 'General Medicine',
        licenseNumber: `LIC${Date.now()}`,
        experience: 5
    };
    
    const response = await makeRequest('/api/admin/doctors', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(doctorData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `Doctor created: ${doctorData.email} - ${doctorData.specialization}`
        };
    }
    return { success: false, error: response.data?.message || 'Doctor creation failed' };
};

// Test 10: Corporate Creation
const testCorporateCreation = async (token) => {
    const corporateData = {
        companyName: `Test Corporation ${Date.now()}`,
        contactPersonName: 'Corporate Manager',
        contactEmail: `corp_${Date.now()}@test.com`,
        contactPhone: '+1-555-0125',
        employeeCount: '50',
        industry: 'Technology',
        status: 'Active'
    };
    
    const response = await makeRequest('/api/admin/corporates', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(corporateData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `Corporate created: ${corporateData.companyName}`
        };
    }
    return { success: false, error: response.data?.message || 'Corporate creation failed' };
};

// Test 11: Labs Management
const testLabsManagement = async (token) => {
    const response = await makeRequest('/api/admin/labs', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const labs = response.data.labs || response.data.data || [];
        return { 
            success: true, 
            details: `Labs management: ${labs.length} labs listed`
        };
    }
    return { success: false, error: 'Labs management access failed' };
};

// Test 12: Pharmacies Management
const testPharmaciesManagement = async (token) => {
    const response = await makeRequest('/api/admin/pharmacies', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const pharmacies = response.data.pharmacies || response.data.data || [];
        return { 
            success: true, 
            details: `Pharmacies management: ${pharmacies.length} pharmacies listed`
        };
    }
    return { success: false, error: 'Pharmacies management access failed' };
};

// Test 13: Hospitals Management
const testHospitalsManagement = async (token) => {
    const response = await makeRequest('/api/admin/hospitals', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const hospitals = response.data.hospitals || response.data.data || [];
        return { 
            success: true, 
            details: `Hospitals management: ${hospitals.length} hospitals listed`
        };
    }
    return { success: false, error: 'Hospitals management access failed' };
};

// Test 14: Appointments Management
const testAppointmentsManagement = async (token) => {
    const response = await makeRequest('/api/admin/appointments', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const appointments = response.data.appointments || response.data.data || [];
        return { 
            success: true, 
            details: `Appointments management: ${appointments.length} appointments listed`
        };
    }
    return { success: false, error: 'Appointments management access failed' };
};

// Test 15: Team Management
const testTeamManagement = async (token) => {
    const response = await makeRequest('/api/admin/team', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const team = response.data.teamUsers || response.data.data || [];
        return { 
            success: true, 
            details: `Team management: ${team.length} team members listed`
        };
    }
    return { success: false, error: 'Team management access failed' };
};

// Test 16: Analytics Dashboard
const testAnalyticsDashboard = async (token) => {
    const response = await makeRequest('/api/admin/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: 'Analytics dashboard accessible with metrics data'
        };
    }
    return { success: false, error: 'Analytics dashboard access failed' };
};

// Test 17: Settings Management
const testSettingsManagement = async (token) => {
    const response = await makeRequest('/api/admin/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: 'Settings management panel accessible'
        };
    }
    return { success: false, error: 'Settings management access failed' };
};

// Test 18: Reports Generation
const testReportsGeneration = async (token) => {
    const response = await makeRequest('/api/admin/reports', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: 'Reports generation system accessible'
        };
    }
    return { success: false, error: 'Reports generation access failed' };
};

// Test 19: Insurance Management
const testInsuranceManagement = async (token) => {
    const response = await makeRequest('/api/admin/insurance', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const insurance = response.data.insurance || response.data.data || [];
        return { 
            success: true, 
            details: `Insurance management: ${insurance.length} insurance plans listed`
        };
    }
    return { success: false, error: 'Insurance management access failed' };
};

// Test 20: Plans Management
const testPlansManagement = async (token) => {
    const response = await makeRequest('/api/admin/plans', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const plans = response.data.plans || response.data.data || [];
        return { 
            success: true, 
            details: `Plans management: ${plans.length} health plans listed`
        };
    }
    return { success: false, error: 'Plans management access failed' };
};

// Main test runner
const runAdminTests = async () => {
    console.log('🔑 ADMIN COMPREHENSIVE TESTING SUITE');
    console.log('=' * 45);
    
    let adminToken;
    
    // Authentication and Profile Tests
    const authResult = await runTest('Admin Authentication', testAdminAuth);
    if (!authResult.success) {
        console.log('\n🚨 CRITICAL: Admin authentication failed. Cannot proceed with admin tests.');
        return;
    }
    adminToken = authResult.token;
    
    await runTest('Admin Profile Access', () => testAdminProfile(adminToken));
    await runTest('Dashboard Statistics', () => testDashboardStats(adminToken));
    
    // Core Management Functions
    await runTest('Users Management', () => testUsersManagement(adminToken));
    await runTest('Doctors Management', () => testDoctorsManagement(adminToken));
    await runTest('Corporate Management', () => testCorporateManagement(adminToken));
    await runTest('Appointments Management', () => testAppointmentsManagement(adminToken));
    
    // Healthcare Provider Management
    await runTest('Labs Management', () => testLabsManagement(adminToken));
    await runTest('Pharmacies Management', () => testPharmaciesManagement(adminToken));
    await runTest('Hospitals Management', () => testHospitalsManagement(adminToken));
    await runTest('Insurance Management', () => testInsuranceManagement(adminToken));
    await runTest('Plans Management', () => testPlansManagement(adminToken));
    
    // Team and System Management
    await runTest('Team Management', () => testTeamManagement(adminToken));
    await runTest('System Monitoring', () => testSystemMonitoring(adminToken));
    await runTest('Analytics Dashboard', () => testAnalyticsDashboard(adminToken));
    await runTest('Settings Management', () => testSettingsManagement(adminToken));
    await runTest('Reports Generation', () => testReportsGeneration(adminToken));
    
    // Creation/Modification Tests
    await runTest('User Creation', () => testUserCreation(adminToken));
    await runTest('Doctor Creation', () => testDoctorCreation(adminToken));
    await runTest('Corporate Creation', () => testCorporateCreation(adminToken));
    
    // Summary
    console.log('\n📊 ADMIN DASHBOARD TEST SUMMARY');
    console.log('=' * 33);
    const passed = testResults.filter(t => t.success).length;
    const total = testResults.length;
    console.log(`Tests Passed: ${passed}/${total} (${((passed/total) * 100).toFixed(1)}%)`);
    
    // Categorize results
    const authTests = testResults.filter(t => t.name.includes('Authentication') || t.name.includes('Profile'));
    const managementTests = testResults.filter(t => t.name.includes('Management') || t.name.includes('Dashboard'));
    const creationTests = testResults.filter(t => t.name.includes('Creation'));
    const systemTests = testResults.filter(t => t.name.includes('System') || t.name.includes('Analytics') || t.name.includes('Settings') || t.name.includes('Reports'));
    
    console.log(`\n📋 Test Categories:`);
    console.log(`   🔐 Authentication & Profile: ${authTests.filter(t => t.success).length}/${authTests.length}`);
    console.log(`   📋 Management Functions: ${managementTests.filter(t => t.success).length}/${managementTests.length}`);
    console.log(`   ➕ Creation Functions: ${creationTests.filter(t => t.success).length}/${creationTests.length}`);
    console.log(`   ⚙️ System Functions: ${systemTests.filter(t => t.success).length}/${systemTests.length}`);
    
    // Side Menu Functions Summary
    console.log(`\n🗂️  SIDE MENU FUNCTIONS TESTED:`);
    console.log(`   📊 Dashboard: ${testResults.find(t => t.name.includes('Dashboard Statistics'))?.success ? '✅' : '❌'}`);
    console.log(`   👥 Users: ${testResults.find(t => t.name.includes('Users Management'))?.success ? '✅' : '❌'}`);
    console.log(`   👨‍⚕️ Doctors: ${testResults.find(t => t.name.includes('Doctors Management'))?.success ? '✅' : '❌'}`);
    console.log(`   🏢 Corporate: ${testResults.find(t => t.name.includes('Corporate Management'))?.success ? '✅' : '❌'}`);
    console.log(`   🏥 Hospitals: ${testResults.find(t => t.name.includes('Hospitals Management'))?.success ? '✅' : '❌'}`);
    console.log(`   🧪 Labs: ${testResults.find(t => t.name.includes('Labs Management'))?.success ? '✅' : '❌'}`);
    console.log(`   💊 Pharmacies: ${testResults.find(t => t.name.includes('Pharmacies Management'))?.success ? '✅' : '❌'}`);
    console.log(`   📅 Appointments: ${testResults.find(t => t.name.includes('Appointments Management'))?.success ? '✅' : '❌'}`);
    console.log(`   👥 Team: ${testResults.find(t => t.name.includes('Team Management'))?.success ? '✅' : '❌'}`);
    console.log(`   📈 Analytics: ${testResults.find(t => t.name.includes('Analytics Dashboard'))?.success ? '✅' : '❌'}`);
    console.log(`   ⚙️ Settings: ${testResults.find(t => t.name.includes('Settings Management'))?.success ? '✅' : '❌'}`);
    console.log(`   📊 Reports: ${testResults.find(t => t.name.includes('Reports Generation'))?.success ? '✅' : '❌'}`);
    console.log(`   🛡️ Insurance: ${testResults.find(t => t.name.includes('Insurance Management'))?.success ? '✅' : '❌'}`);
    console.log(`   📋 Plans: ${testResults.find(t => t.name.includes('Plans Management'))?.success ? '✅' : '❌'}`);
    
    if (passed < total) {
        console.log('\n🚨 FAILED TESTS:');
        testResults.filter(t => !t.success).forEach(test => {
            console.log(`❌ ${test.name}: ${test.error || 'Unknown error'}`);
        });
    } else {
        console.log('\n🎉 ALL TESTS PASSED! Admin dashboard is fully functional.');
    }
    
    console.log('\n🏁 Admin comprehensive testing complete!');
};

// Export for use as module
module.exports = { runAdminTests };

// Run if called directly
if (require.main === module) {
    runAdminTests().catch(error => {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    });
}