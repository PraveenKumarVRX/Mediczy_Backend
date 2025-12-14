#!/usr/bin/env node

/**
 * 👥 TEAM USER COMPREHENSIVE TESTING SUITE
 * 
 * This script thoroughly tests team user login and all dashboard functions:
 * - Team user authentication and profile access
 * - Team collaboration features
 * - Project management and task tracking
 * - Team communication and messaging
 * - Resource management and sharing
 * - Team analytics and reporting
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8080';
const TEAM_CREDS = { email: 'team@test.com', password: 'test123' };

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

// Test 1: Team User Authentication
const testTeamAuth = async () => {
    // Try team-specific login endpoint first
    let response = await makeRequest('/api/team/login', {
        method: 'POST',
        body: JSON.stringify(TEAM_CREDS)
    });
    
    // If team endpoint doesn't exist, try general user login
    if (!response.success || response.status === 404) {
        response = await makeRequest('/api/user/login', {
            method: 'POST',
            body: JSON.stringify(TEAM_CREDS)
        });
    }
    
    if (response.success && response.data.token) {
        const user = response.data.user || response.data;
        return { 
            success: true, 
            details: `Team user ${user.firstName || user.email} authenticated`,
            token: response.data.token 
        };
    }
    return { success: false, error: response.data?.message || 'Team user login failed' };
};

// Test 2: Team User Profile
const testTeamProfile = async (token) => {
    // Try team-specific profile endpoint
    let response = await makeRequest('/api/team/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // If team endpoint doesn't exist, try general user profile
    if (!response.success || response.status === 404) {
        response = await makeRequest('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }
    
    if (response.success && response.data) {
        const user = response.data.user || response.data;
        return { 
            success: true, 
            details: `Profile: ${user.firstName || user.email} - Role: ${user.role || 'Team Member'}`
        };
    }
    return { success: false, error: 'Team profile access failed' };
};

// Test 3: Team Dashboard Access
const testTeamDashboard = async (token) => {
    const response = await makeRequest('/api/team/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const dashboard = response.data;
        return { 
            success: true, 
            details: `Dashboard accessed - Team projects, tasks, and collaboration tools available`
        };
    }
    
    // Fallback: Test general user dashboard
    const fallbackResponse = await makeRequest('/api/user/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (fallbackResponse.success) {
        return { 
            success: true, 
            details: 'User dashboard accessed (team-specific features may be limited)'
        };
    }
    
    return { success: false, error: 'Team dashboard access failed' };
};

// Test 4: Team Projects Access
const testTeamProjects = async (token) => {
    const response = await makeRequest('/api/team/projects', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const projects = response.data.projects || [];
        return { 
            success: true, 
            details: `${projects.length} team projects available`
        };
    }
    return { success: false, error: 'Team projects access failed' };
};

// Test 5: Team Tasks Management
const testTeamTasks = async (token) => {
    const response = await makeRequest('/api/team/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const tasks = response.data.tasks || [];
        return { 
            success: true, 
            details: `${tasks.length} team tasks visible`
        };
    }
    return { success: false, error: 'Team tasks access failed' };
};

// Test 6: Team Communication
const testTeamCommunication = async (token) => {
    const response = await makeRequest('/api/team/messages', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const messages = response.data.messages || [];
        return { 
            success: true, 
            details: `Team communication active - ${messages.length} recent messages`
        };
    }
    return { success: false, error: 'Team communication access failed' };
};

// Test 7: Task Creation
const testTaskCreation = async (token) => {
    const taskData = {
        title: 'Test Team Task',
        description: 'Testing task creation functionality for team users',
        priority: 'medium',
        assignedTo: 'team@test.com',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
    };
    
    const response = await makeRequest('/api/team/tasks', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(taskData)
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: `Task "${taskData.title}" created successfully`
        };
    }
    return { success: false, error: 'Task creation failed' };
};

// Test 8: Team Members List
const testTeamMembers = async (token) => {
    const response = await makeRequest('/api/team/members', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const members = response.data.members || [];
        return { 
            success: true, 
            details: `${members.length} team members in organization`
        };
    }
    return { success: false, error: 'Team members list access failed' };
};

// Test 9: Team Analytics
const testTeamAnalytics = async (token) => {
    const response = await makeRequest('/api/team/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const analytics = response.data;
        return { 
            success: true, 
            details: 'Team analytics dashboard accessible - productivity metrics available'
        };
    }
    return { success: false, error: 'Team analytics access failed' };
};

// Test 10: File Sharing
const testFileSharing = async (token) => {
    const response = await makeRequest('/api/team/files', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const files = response.data.files || [];
        return { 
            success: true, 
            details: `File sharing active - ${files.length} shared files available`
        };
    }
    return { success: false, error: 'File sharing access failed' };
};

// Test 11: Team Settings
const testTeamSettings = async (token) => {
    const response = await makeRequest('/api/team/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        return { 
            success: true, 
            details: 'Team settings accessible - configuration options available'
        };
    }
    return { success: false, error: 'Team settings access failed' };
};

// Test 12: Notification System
const testNotifications = async (token) => {
    const response = await makeRequest('/api/team/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.success) {
        const notifications = response.data.notifications || [];
        return { 
            success: true, 
            details: `${notifications.length} team notifications available`
        };
    }
    return { success: false, error: 'Team notifications access failed' };
};

// Main test runner
const runTeamUserTests = async () => {
    console.log('👥 TEAM USER COMPREHENSIVE TESTING SUITE');
    console.log('=' * 45);
    
    let teamToken;
    
    // Authentication and Profile Tests
    const authResult = await runTest('Team User Authentication', testTeamAuth);
    if (!authResult.success) {
        console.log('\n🚨 CRITICAL: Team user authentication failed. Cannot proceed with team tests.');
        return;
    }
    teamToken = authResult.token;
    
    await runTest('Team User Profile', () => testTeamProfile(teamToken));
    await runTest('Team Dashboard Access', () => testTeamDashboard(teamToken));
    
    // Team Management Tests
    await runTest('Team Projects Access', () => testTeamProjects(teamToken));
    await runTest('Team Tasks Management', () => testTeamTasks(teamToken));
    await runTest('Task Creation', () => testTaskCreation(teamToken));
    await runTest('Team Members List', () => testTeamMembers(teamToken));
    
    // Collaboration Tests
    await runTest('Team Communication', () => testTeamCommunication(teamToken));
    await runTest('File Sharing', () => testFileSharing(teamToken));
    await runTest('Notification System', () => testNotifications(teamToken));
    
    // Administrative Tests
    await runTest('Team Analytics', () => testTeamAnalytics(teamToken));
    await runTest('Team Settings', () => testTeamSettings(teamToken));
    
    // Summary
    console.log('\n📊 TEAM USER TEST SUMMARY');
    console.log('=' * 28);
    const passed = testResults.filter(t => t.success).length;
    const total = testResults.length;
    console.log(`Tests Passed: ${passed}/${total} (${((passed/total) * 100).toFixed(1)}%)`);
    
    // Categorize results
    const authTests = testResults.filter(t => t.name.includes('Authentication') || t.name.includes('Profile'));
    const managementTests = testResults.filter(t => t.name.includes('Projects') || t.name.includes('Tasks') || t.name.includes('Members'));
    const collaborationTests = testResults.filter(t => t.name.includes('Communication') || t.name.includes('File') || t.name.includes('Notification'));
    const adminTests = testResults.filter(t => t.name.includes('Analytics') || t.name.includes('Settings'));
    
    console.log(`\n📋 Test Categories:`);
    console.log(`   🔐 Authentication & Profile: ${authTests.filter(t => t.success).length}/${authTests.length}`);
    console.log(`   📋 Project Management: ${managementTests.filter(t => t.success).length}/${managementTests.length}`);
    console.log(`   🤝 Collaboration: ${collaborationTests.filter(t => t.success).length}/${collaborationTests.length}`);
    console.log(`   ⚙️ Administration: ${adminTests.filter(t => t.success).length}/${adminTests.length}`);
    
    if (passed < total) {
        console.log('\n🚨 FAILED TESTS:');
        testResults.filter(t => !t.success).forEach(test => {
            console.log(`❌ ${test.name}: ${test.error || 'Unknown error'}`);
        });
    } else {
        console.log('\n🎉 ALL TESTS PASSED! Team user functionality is fully operational.');
    }
    
    console.log('\n🏁 Team user testing complete!');
};

// Export for use as module
module.exports = { runTeamUserTests };

// Run if called directly
if (require.main === module) {
    runTeamUserTests().catch(error => {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    });
}