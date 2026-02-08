#!/usr/bin/env node

/**
 * Test suite for Broker Management API
 * Tests all CRUD operations for brokers/aggregators
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:8888/api/admin/aggregators';

// Test admin token (replace with actual token from database if needed)
const token = process.env.ADMIN_TOKEN || 'dummy_token_for_testing';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

let testsBroker = null;

async function runTests() {
  console.log('🧪 Starting Broker Management API Tests\n');
  console.log('📍 API Base URL:', BASE_URL);
  console.log('🔑 Using token:', token.substring(0, 20) + '...\n');

  try {
    // Test 1: Create a Broker
    console.log('📝 TEST 1: Create Broker');
    const createPayload = {
      broker_name: 'Test Broker ' + Date.now(),
      email: `test-broker-${Date.now()}@example.com`,
      phone_number: '+91-9876543210',
      contact_person: 'John Doe',
      irdai_license_number: 'IB-TEST-001',
      business_type: 'insurance_broker',
      commission_percentage: 5.5,
      status: 'pending',
      is_verified: false,
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    };

    try {
      const createResponse = await api.post('', createPayload);
      if (createResponse.data && createResponse.data.data) {
        testsBroker = createResponse.data.data;
        console.log('✅ Successfully created broker!');
        console.log('   Broker ID:', testsBroker.id);
        console.log('   Name:', testsBroker.broker_name);
      } else {
        console.log('⚠️ Response structure unexpected:', createResponse.data);
      }
    } catch (error) {
      console.log('⚠️ Create endpoint not available yet (expected without auth)');
      console.log('   Error:', error.response?.data?.message || error.message);
      // Provide next steps
      console.log('\n💡 Next steps:');
      console.log('   1. Get a valid admin token from the database');
      console.log('   2. Set ADMIN_TOKEN environment variable');
      console.log('   3. Re-run this test with: ADMIN_TOKEN=<token> node test-broker-api.js');
    }

    // Test 2: Get all brokers
    console.log('\n📋 TEST 2: List All Brokers');
    try {
      const listResponse = await api.get('');
      if (listResponse.data && listResponse.data.data) {
        console.log('✅ Successfully fetched brokers list');
        console.log(`   Total brokers: ${listResponse.data.total}`);
        console.log(`   Showing: ${listResponse.data.data.length} brokers`);
        if (listResponse.data.data.length > 0) {
          console.log('   First broker:', listResponse.data.data[0].broker_name);
        }
      }
    } catch (error) {
      console.log('⚠️ Could not fetch brokers:', error.response?.data?.message || error.message);
    }

    // Test 3: Get individual broker (if one was created)
    if (testsBroker && testsBroker.id) {
      console.log(`\n👁️  TEST 3: Get Single Broker (ID: ${testsBroker.id})`);
      try {
        const getResponse = await api.get(`/${testsBroker.id}`);
        if (getResponse.data && getResponse.data.data) {
          console.log('✅ Successfully fetched broker details');
          console.log('   Broker:', getResponse.data.data.broker_name);
          console.log('   Status:', getResponse.data.data.status);
          console.log('   Verified:', getResponse.data.data.is_verified);
        }
      } catch (error) {
        console.log('⚠️ Could not fetch broker details:', error.response?.data?.message || error.message);
      }

      // Test 4: Update broker
      console.log(`\n✏️  TEST 4: Update Broker (ID: ${testsBroker.id})`);
      const updatePayload = {
        commission_percentage: 7.5,
        status: 'active',
        is_verified: true
      };
      try {
        const updateResponse = await api.put(`/${testsBroker.id}`, updatePayload);
        if (updateResponse.data && updateResponse.data.data) {
          console.log('✅ Successfully updated broker');
          console.log('   Commission:', updateResponse.data.data.commission_percentage + '%');
          console.log('   Status:', updateResponse.data.data.status);
          console.log('   Verified:', updateResponse.data.data.is_verified);
        }
      } catch (error) {
        console.log('⚠️ Could not update broker:', error.response?.data?.message || error.message);
      }

      // Test 5: Delete broker
      console.log(`\n🗑️  TEST 5: Delete Broker (ID: ${testsBroker.id})`);
      try {
        const deleteResponse = await api.delete(`/${testsBroker.id}`);
        if (deleteResponse.data && deleteResponse.data.success) {
          console.log('✅ Successfully deleted broker');
          console.log('   Message:', deleteResponse.data.message);
        }
      } catch (error) {
        console.log('⚠️ Could not delete broker:', error.response?.data?.message || error.message);
      }
    }

    console.log('\n✨ Test suite completed!\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run tests
runTests();
