#!/usr/bin/env node

/**
 * Hospital Insurance Dashboard Flow Test
 * Tests the complete user journey from login to dashboard access
 */

import { readFile } from 'fs/promises';

const API_BASE = 'http://localhost:8000/api';
const FRONTEND_BASE = 'http://localhost:9443';

// Test credentials (using existing doctor account)
const TEST_DOCTOR = {
  email: 'doctor@mediczy.com',
  password: 'doctor123'
};

let authToken = null;
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${name}`);
  if (details) console.log(`   ${details}`);
  
  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

async function testBackendHealth() {
  console.log('\n🔍 Testing Backend Health...');
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    // Backend requires auth for health endpoint
    logTest('Backend Server Running', response.status === 401 || response.status === 200, 
      `Status: ${response.status}`);
  } catch (error) {
    logTest('Backend Server Running', false, error.message);
  }
}

async function testFrontendAccess() {
  console.log('\n🌐 Testing Frontend Access...');
  try {
    const response = await fetch(FRONTEND_BASE);
    const html = await response.text();
    
    logTest('Frontend Server Running', response.status === 200, 
      `Status: ${response.status}`);
    logTest('Frontend HTML Valid', html.includes('<div id="root">'), 
      'Root element found');
  } catch (error) {
    logTest('Frontend Server Running', false, error.message);
    logTest('Frontend HTML Valid', false, 'Server not accessible');
  }
}

async function testDoctorLogin() {
  console.log('\n🔐 Testing Doctor Login...');
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_DOCTOR)
    });
    
    const data = await response.json();
    
    if (response.ok && data.token) {
      authToken = data.token;
      logTest('Doctor Login', true, 
        `Token received: ${data.token.substring(0, 20)}...`);
      logTest('User Data Returned', data.user && data.user.email === TEST_DOCTOR.email,
        `User: ${data.user?.email || 'N/A'}`);
    } else {
      logTest('Doctor Login', false, 
        data.message || 'Login failed');
    }
  } catch (error) {
    logTest('Doctor Login', false, error.message);
  }
}

async function testInsuranceEndpoints() {
  console.log('\n💼 Testing Insurance API Endpoints...');
  
  if (!authToken) {
    logTest('Insurance Endpoints', false, 'No auth token available');
    return;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
  
  // Test 1: Get dashboard statistics
  try {
    const statsResponse = await fetch(`${API_BASE}/hospital/insurance/statistics?hospitalId=1`, {
      headers
    });
    const stats = await statsResponse.json();
    
    logTest('Dashboard Statistics Endpoint', statsResponse.ok,
      `Status: ${statsResponse.status}, Data: ${JSON.stringify(stats).substring(0, 100)}...`);
  } catch (error) {
    logTest('Dashboard Statistics Endpoint', false, error.message);
  }
  
  // Test 2: Get claims list
  try {
    const claimsResponse = await fetch(`${API_BASE}/hospital/insurance/claims?hospitalId=1`, {
      headers
    });
    const claims = await claimsResponse.json();
    
    logTest('Claims List Endpoint', claimsResponse.ok,
      `Status: ${claimsResponse.status}, Claims count: ${Array.isArray(claims) ? claims.length : 'N/A'}`);
  } catch (error) {
    logTest('Claims List Endpoint', false, error.message);
  }
  
  // Test 3: Get insurance providers
  try {
    const providersResponse = await fetch(`${API_BASE}/hospital/insurance/providers?hospitalId=1`, {
      headers
    });
    const providers = await providersResponse.json();
    
    logTest('Insurance Providers Endpoint', providersResponse.ok,
      `Status: ${providersResponse.status}, Providers: ${Array.isArray(providers) ? providers.length : 'N/A'}`);
  } catch (error) {
    logTest('Insurance Providers Endpoint', false, error.message);
  }
}

async function testRouteConfiguration() {
  console.log('\n🛣️  Testing Frontend Route Configuration...');
  
  try {
    const routeFile = await readFile('./client/src/routes/index.tsx', 'utf-8');
    
    const hasRoute = routeFile.includes('/hospital/insurance-claims');
    logTest('Insurance Dashboard Route Configured', hasRoute,
      'Route: /hospital/insurance-claims');
    
    const hasComponent = routeFile.includes('HospitalInsuranceClaimsDashboard');
    logTest('Dashboard Component Imported', hasComponent,
      'Component: HospitalInsuranceClaimsDashboard');
  } catch (error) {
    logTest('Route Configuration', false, error.message);
  }
}

async function testBrandConfiguration() {
  console.log('\n🎨 Testing Brand Configuration...');
  
  try {
    const brandFile = await readFile('./client/src/config/brand.ts', 'utf-8');
    
    logTest('Brand Config Exists', true, 'File found');
    logTest('Mediqzy Brand Name', brandFile.includes('Mediqzy'),
      'Brand name configured');
    logTest('Teal Color Theme', brandFile.includes('teal'),
      'Primary color: teal');
    logTest('Logo Path Configured', brandFile.includes('/logo/Mediqzy_logo.jpeg'),
      'Logo: /logo/Mediqzy_logo.jpeg');
  } catch (error) {
    logTest('Brand Configuration', false, error.message);
  }
}

async function testCSSTheme() {
  console.log('\n💅 Testing CSS Theme...');
  
  try {
    const cssFile = await readFile('./client/src/styles/HospitalInsuranceDashboard.css', 'utf-8');
    
    logTest('Dashboard CSS Exists', true, 'File found');
    logTest('Uses CSS Variables', cssFile.includes('hsl(var(--primary))'),
      'Theme variables integrated');
    logTest('Inter Font Family', cssFile.includes('Inter'),
      'Font family configured');
    logTest('Mediqzy Brand Comment', cssFile.includes('Mediqzy Brand'),
      'Brand identity documented');
  } catch (error) {
    logTest('CSS Theme', false, error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏥 HOSPITAL INSURANCE DASHBOARD FLOW TEST');
  console.log('═══════════════════════════════════════════════════════════');
  
  await testBackendHealth();
  await testFrontendAccess();
  await testDoctorLogin();
  await testInsuranceEndpoints();
  await testRouteConfiguration();
  await testBrandConfiguration();
  await testCSSTheme();
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  console.log('\n🌐 FRONTEND ACCESS:');
  console.log(`   Dashboard URL: ${FRONTEND_BASE}/hospital/insurance-claims`);
  console.log(`   Login first at: ${FRONTEND_BASE}/login`);
  console.log(`   Credentials: ${TEST_DOCTOR.email} / ${TEST_DOCTOR.password}`);
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

runAllTests();
