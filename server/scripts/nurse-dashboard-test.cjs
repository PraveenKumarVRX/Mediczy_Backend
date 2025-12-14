#!/usr/bin/env node

/**
 * 👩‍⚕️ NURSE DASHBOARD COMPREHENSIVE TESTING SUITE
 * 
 * This script thoroughly tests nurse login and all dashboard functions:
 * - Nurse authentication and profile access
 * - Patient management and monitoring
 * - Vital signs recording and tracking
 * - Medication administration
 * - Patient notes and care documentation
 * - Shift scheduling and ward management
 * - Activity tracking and reporting
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8080';
const NURSE_CREDS = { email: 'nurse@test.com', password: 'test123' };

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

// Test 1: Nurse Authentication
const testNurseAuth = async () => {
    const response = await makeRequest('/api/nurse/login', {
        method: 'POST',
        body: JSON.stringify(NURSE_CREDS)
    });
    
    if (response.success && response.data.token) {
        const nurse = response.data.nurse;
        return { 
            success: true, 
            details: `Nurse ${nurse.firstName} ${nurse.lastName} authenticated - ${nurse.department}`,
            token: response.data.token 
        };
    }
    return { success: false, error: response.data?.message || 'Nurse login failed' };
};

// Test 2: Nurse Profile Dashboard
const testNurseProfile = async (token) => {
    const response = await makeRequest('/api/nurse/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success && response.data.nurse) {
        const nurse = response.data.nurse;
        return { 
            success: true, 
            details: `Profile: ${nurse.firstName} ${nurse.lastName} - License: ${nurse.licenseNumber || 'N/A'} - Dept: ${nurse.department}`
        };
    }
    return { success: false, error: 'Profile access failed' };
};

// Test 3: Patient List Management
const testPatientList = async (token) => {
    const response = await makeRequest('/api/nurse/patients', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success && response.data.patients) {
        const patients = response.data.patients;
        return { 
            success: true, 
            details: `${patients.length} patients assigned - Wards: ${[...new Set(patients.map(p => p.ward))].join(', ')}`
        };
    }
    return { success: false, error: 'Patient list access failed' };
};

// Test 4: Vital Signs Recording
const testVitalSigns = async (token) => {
    const vitalData = {
        patientId: 'P001',
        vitals: {
            temperature: 98.6,
            pulse: 72,
            bloodPressure: '120/80',
            respiratoryRate: 16,
            oxygenSaturation: 98
        }
    };
    
    const response = await makeRequest('/api/nurse/vitals', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(vitalData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `Vitals recorded for ${vitalData.patientId} - Temp: ${vitalData.vitals.temperature}°F, HR: ${vitalData.vitals.pulse} bpm`
        };
    }
    return { success: false, error: response.data?.message || 'Vital signs recording failed' };
};

// Test 5: Medication Administration
const testMedicationAdmin = async (token) => {
    const medicationData = {
        patientId: 'P002',
        medication: 'Acetaminophen',
        dosage: '650mg',
        route: 'Oral',
        frequency: 'Every 6 hours',
        notes: 'Administered for pain management'
    };
    
    const response = await makeRequest('/api/nurse/medications', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(medicationData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `Medication administered: ${medicationData.medication} ${medicationData.dosage} to ${medicationData.patientId}`
        };
    }
    return { success: false, error: response.data?.message || 'Medication administration failed' };
};

// Test 6: Patient Notes Documentation
const testPatientNotes = async (token) => {
    const noteData = {
        patientId: 'P001',
        note: 'Patient is comfortable and resting. No acute distress observed. Family visited during evening hours.',
        category: 'General Assessment'
    };
    
    const response = await makeRequest('/api/nurse/notes', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(noteData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `Patient note documented for ${noteData.patientId} - Category: ${noteData.category}`
        };
    }
    return { success: false, error: response.data?.message || 'Patient notes documentation failed' };
};

// Test 7: Today's Vitals Dashboard
const testTodaysVitals = async (token) => {
    const response = await makeRequest('/api/nurse/vitals/today', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const records = response.data.records || [];
        return { 
            success: true, 
            details: `Today's vitals dashboard: ${records.length} vital sign records recorded`
        };
    }
    return { success: false, error: 'Today\'s vitals dashboard access failed' };
};

// Test 8: Shift Schedule Management
const testShiftSchedule = async (token) => {
    const response = await makeRequest('/api/nurse/schedule', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success && response.data.schedule) {
        const schedule = response.data.schedule;
        return { 
            success: true, 
            details: `Shift: ${schedule.currentShift} (${schedule.shiftStart}-${schedule.shiftEnd}) - Ward: ${schedule.assignedWard}`
        };
    }
    return { success: false, error: 'Shift schedule access failed' };
};

// Test 9: Recent Activity Dashboard
const testRecentActivity = async (token) => {
    const response = await makeRequest('/api/nurse/activity/recent', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const items = response.data.items || [];
        const activityTypes = [...new Set(items.map(item => item.type))];
        return { 
            success: true, 
            details: `Recent activity: ${items.length} activities - Types: ${activityTypes.join(', ')}`
        };
    }
    return { success: false, error: 'Recent activity dashboard access failed' };
};

// Test 10: Patient Medication History
const testMedicationHistory = async (token) => {
    const response = await makeRequest('/api/nurse/medications/P001', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const records = response.data.records || [];
        return { 
            success: true, 
            details: `Medication history for P001: ${records.length} medication records found`
        };
    }
    return { success: false, error: 'Medication history access failed' };
};

// Test 11: Patient Notes History
const testNotesHistory = async (token) => {
    const response = await makeRequest('/api/nurse/notes/P001', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const records = response.data.records || [];
        return { 
            success: true, 
            details: `Patient notes for P001: ${records.length} notes documented`
        };
    }
    return { success: false, error: 'Patient notes history access failed' };
};

// Test 12: Nurse Profile Update
const testProfileUpdate = async (token) => {
    const updateData = {
        firstName: 'Sarah',
        lastName: 'Johnson',
        phoneNumber: '+1-555-0123',
        emergencyContact: '+1-555-0199'
    };
    
    const response = await makeRequest('/api/nurse/profile', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updateData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: 'Nurse profile updated successfully'
        };
    }
    return { success: false, error: response.data?.message || 'Profile update failed' };
};

// Main test runner
const runNurseDashboardTests = async () => {
    console.log('👩‍⚕️ NURSE DASHBOARD COMPREHENSIVE TESTING SUITE');
    console.log('=' * 55);
    
    let nurseToken;
    
    // Authentication and Profile Tests
    const authResult = await runTest('Nurse Authentication', testNurseAuth);
    if (!authResult.success) {
        console.log('\n🚨 CRITICAL: Nurse authentication failed. Cannot proceed with dashboard tests.');
        return;
    }
    nurseToken = authResult.token;
    
    await runTest('Nurse Profile Dashboard', () => testNurseProfile(nurseToken));
    await runTest('Profile Update Functionality', () => testProfileUpdate(nurseToken));
    
    // Patient Management Tests
    await runTest('Patient List Management', () => testPatientList(nurseToken));
    await runTest('Patient Notes Documentation', () => testPatientNotes(nurseToken));
    await runTest('Patient Notes History', () => testNotesHistory(nurseToken));
    
    // Clinical Care Tests
    await runTest('Vital Signs Recording', () => testVitalSigns(nurseToken));
    await runTest('Medication Administration', () => testMedicationAdmin(nurseToken));
    await runTest('Medication History Access', () => testMedicationHistory(nurseToken));
    
    // Dashboard and Monitoring Tests
    await runTest('Today\'s Vitals Dashboard', () => testTodaysVitals(nurseToken));
    await runTest('Recent Activity Dashboard', () => testRecentActivity(nurseToken));
    
    // Shift Management Tests
    await runTest('Shift Schedule Management', () => testShiftSchedule(nurseToken));
    
    // Summary
    console.log('\n📊 NURSE DASHBOARD TEST SUMMARY');
    console.log('=' * 35);
    const passed = testResults.filter(t => t.success).length;
    const total = testResults.length;
    console.log(`Tests Passed: ${passed}/${total} (${((passed/total) * 100).toFixed(1)}%)`);
    
    // Categorize results
    const authTests = testResults.filter(t => t.name.includes('Authentication') || t.name.includes('Profile'));
    const clinicalTests = testResults.filter(t => t.name.includes('Vital') || t.name.includes('Medication') || t.name.includes('Notes'));
    const dashboardTests = testResults.filter(t => t.name.includes('Dashboard') || t.name.includes('Activity') || t.name.includes('Schedule'));
    const patientTests = testResults.filter(t => t.name.includes('Patient') && !t.name.includes('Notes'));
    
    console.log(`\n📋 Test Categories:`);
    console.log(`   🔐 Authentication & Profile: ${authTests.filter(t => t.success).length}/${authTests.length}`);
    console.log(`   🏥 Clinical Care: ${clinicalTests.filter(t => t.success).length}/${clinicalTests.length}`);
    console.log(`   📊 Dashboard Features: ${dashboardTests.filter(t => t.success).length}/${dashboardTests.length}`);
    console.log(`   👥 Patient Management: ${patientTests.filter(t => t.success).length}/${patientTests.length}`);
    
    if (passed < total) {
        console.log('\n🚨 FAILED TESTS:');
        testResults.filter(t => !t.success).forEach(test => {
            console.log(`❌ ${test.name}: ${test.error || 'Unknown error'}`);
        });
    } else {
        console.log('\n🎉 ALL TESTS PASSED! Nurse dashboard is fully functional.');
    }
    
    console.log('\n🏁 Nurse dashboard testing complete!');
};

// Export for use as module
module.exports = { runNurseDashboardTests };

// Run if called directly
if (require.main === module) {
    runNurseDashboardTests().catch(error => {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    });
}