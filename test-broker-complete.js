#!/usr/bin/env node

/**
 * Broker Management - End-to-End Test
 * Tests the complete broker management flow
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:8888';
const ADMIN_EMAIL = 'admin@mediczy.com';
const ADMIN_PASSWORD = 'SecureAdmin123';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000
});

let adminToken = null;

async function login() {
  console.log('🔐 Logging in as admin...');
  try {
    const response = await api.post('/auth/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    if (response.data && response.data.token) {
      adminToken = response.data.token;
      console.log('✅ Login successful!');
      console.log(`   Token: ${adminToken.substring(0, 20)}...`);
      
      // Set auth header for subsequent calls
      api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
      return true;
    } else {
      console.log('⚠️ No token in response');
      return false;
    }
  } catch (error) {
    console.log('⚠️ Login failed:', error.response?.data?.message || error.message);
    console.log('\n💡 Verify admin credentials:');
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Password: (should match your setup)');
    return false;
  }
}

async function testBrokerAPIs() {
  console.log('\n🧪 Testing Broker Management APIs\n');
  
  let testBrokerId = null;
  
  // Test 1: Create Broker
  console.log('1️⃣ CREATE BROKER');
  try {
    const broker = {
      broker_name: `Test Broker ${Date.now()}`,
      email: `test-broker-${Date.now()}@test.com`,
      phone_number: '+91-9876543210',
      contact_person: 'Test User',
      irdai_license_number: 'IB-TEST-001',
      business_type: 'insurance_broker',
      commission_percentage: 5.5,
      status: 'pending',
      is_verified: false,
      city: 'Mumbai',
      state: 'Maharashtra'
    };
    
    const response = await api.post('/api/admin/aggregators', broker);
    if (response.data && response.data.data) {
      testBrokerId = response.data.data.id;
      console.log('✅ Broker created successfully!');
      console.log(`   ID: ${testBrokerId}`);
      console.log(`   Name: ${response.data.data.broker_name}`);
      console.log(`   Status: ${response.data.data.status}`);
    }
  } catch (error) {
    console.log('❌ Failed to create broker');
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
  }
  
  // Test 2: List Brokers
  console.log('\n2️⃣ LIST BROKERS');
  try {
    const response = await api.get('/api/admin/aggregators?limit=10&offset=0');
    if (response.data && response.data.data) {
      console.log('✅ Brokers listed successfully!');
      console.log(`   Total: ${response.data.total}`);
      console.log(`   Displayed: ${response.data.data.length}`);
      if (response.data.data.length > 0) {
        console.log(`   Sample: ${response.data.data[0].broker_name}`);
      }
    }
  } catch (error) {
    console.log('❌ Failed to list brokers');
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
  }
  
  // Test 3: Get Single Broker
  if (testBrokerId) {
    console.log(`\n3️⃣ GET BROKER (ID: ${testBrokerId})`);
    try {
      const response = await api.get(`/api/admin/aggregators/${testBrokerId}`);
      if (response.data && response.data.data) {
        console.log('✅ Broker retrieved successfully!');
        console.log(`   Name: ${response.data.data.broker_name}`);
        console.log(`   Commission: ${response.data.data.commission_percentage}%`);
        console.log(`   Verified: ${response.data.data.is_verified}`);
      }
    } catch (error) {
      console.log('❌ Failed to retrieve broker');
      console.log(`   Error: ${error.response?.data?.message || error.message}`);
    }
    
    // Test 4: Update Broker
    console.log(`\n4️⃣ UPDATE BROKER (ID: ${testBrokerId})`);
    try {
      const updateData = {
        commission_percentage: 7.5,
        status: 'active',
        is_verified: true
      };
      
      const response = await api.put(`/api/admin/aggregators/${testBrokerId}`, updateData);
      if (response.data && response.data.data) {
        console.log('✅ Broker updated successfully!');
        console.log(`   Commission: ${response.data.data.commission_percentage}%`);
        console.log(`   Status: ${response.data.data.status}`);
        console.log(`   Verified: ${response.data.data.is_verified}`);
      }
    } catch (error) {
      console.log('❌ Failed to update broker');
      console.log(`   Error: ${error.response?.data?.message || error.message}`);
    }
    
    // Test 5: Delete Broker
    console.log(`\n5️⃣ DELETE BROKER (ID: ${testBrokerId})`);
    try {
      const response = await api.delete(`/api/admin/aggregators/${testBrokerId}`);
      if (response.data && response.data.success) {
        console.log('✅ Broker deleted successfully!');
        console.log(`   Message: ${response.data.message}`);
      }
    } catch (error) {
      console.log('❌ Failed to delete broker');
      console.log(`   Error: ${error.response?.data?.message || error.message}`);
    }
  }
  
  console.log('\n✨ All tests completed!\n');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Broker Management - Complete Test Suite            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const loggedIn = await login();
  
  if (loggedIn) {
    await testBrokerAPIs();
  } else {
    console.log('\n⚠️ Could not complete tests without admin authentication');
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});
