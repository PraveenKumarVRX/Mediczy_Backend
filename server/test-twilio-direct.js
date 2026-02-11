#!/usr/bin/env node

/**
 * Direct Twilio OTP Service Test Script
 * Tests the new direct Twilio integration without going through N8N
 */

import axios from 'axios';

const API_BASE = 'http://localhost:8888/api/otp';

// Test phone numbers
const TEST_PHONES = [
  '9884089921',        // Primary test number
  '9373007737',        // Secondary test number
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSingleOTP(phone) {
  try {
    console.log(`\n📱 Testing OTP delivery to: ${phone}`);
    
    const response = await axios.post(`${API_BASE}/test/whatsapp`, {
      phone,
      purpose: 'login'
      // OTP will be auto-generated
    });

    if (response.data.success) {
      console.log(`✅ SUCCESS: OTP sent`);
      console.log(`   SID: ${response.data.data.sid}`);
      console.log(`   Status: ${response.data.data.status}`);
      console.log(`   OTP: ${response.data.data.otp}`);
      console.log(`   Delivered at: ${response.data.data.deliveredAt}`);
      return response.data.data.sid;
    } else {
      console.log(`❌ FAILED: ${response.data.data.error}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ ERROR: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

async function checkOTPStatus(sid) {
  try {
    console.log(`\n📊 Checking status for SID: ${sid}`);
    
    const response = await axios.get(`${API_BASE}/test/status/${sid}`);
    
    if (response.data.success) {
      console.log(`✅ Status retrieved:`);
      console.log(`   Status: ${response.data.data.status}`);
      console.log(`   Error Code: ${response.data.data.errorCode || 'None'}`);
      console.log(`   Error Message: ${response.data.data.errorMessage || 'None'}`);
    } else {
      console.log(`❌ Failed to get status: ${response.data.message}`);
    }
  } catch (error) {
    console.error(`❌ ERROR: ${error.response?.data?.error || error.message}`);
  }
}

async function testBulkOTP() {
  try {
    console.log(`\n📬 Testing bulk OTP delivery to ${TEST_PHONES.length} numbers`);
    
    const response = await axios.post(`${API_BASE}/test/bulk`, {
      recipients: TEST_PHONES.map(phone => ({
        phone,
        // OTP will be auto-generated for each
      }))
    });

    if (response.data.success) {
      console.log(`✅ Bulk send results:`);
      console.log(`   Total: ${response.data.data.total}`);
      console.log(`   Successful: ${response.data.data.successful}`);
      console.log(`   Failed: ${response.data.data.failed}`);
      
      response.data.data.results.forEach((result, idx) => {
        const status = result.success ? '✅' : '❌';
        console.log(`   ${status} ${TEST_PHONES[idx]}: ${result.status || result.error}`);
      });
    } else {
      console.log(`❌ Bulk send failed: ${response.data.error}`);
    }
  } catch (error) {
    console.error(`❌ ERROR: ${error.response?.data?.error || error.message}`);
  }
}

async function main() {
  console.log('🚀 Direct Twilio OTP Service Test');
  console.log('='.repeat(50));
  
  console.log(`\nAPI Base: ${API_BASE}`);
  console.log(`Test Numbers: ${TEST_PHONES.join(', ')}\n`);
  
  try {
    // Test 1: Send all individual OTPs
    console.log('\n--- TEST 1: Individual OTP Sends ---');
    const sids = [];
    for (const phone of TEST_PHONES) {
      const sid = await testSingleOTP(phone);
      if (sid) sids.push(sid);
      await delay(2000); // 2 second delay between sends
    }

    // Test 2: Check status of sent OTPs
    if (sids.length > 0) {
      console.log('\n--- TEST 2: Check OTP Status ---');
      await delay(3000); // Wait a bit for Twilio to process
      for (const sid of sids) {
        await checkOTPStatus(sid);
        await delay(1000);
      }
    }

    // Test 3: Bulk send
    console.log('\n--- TEST 3: Bulk OTP Send ---');
    await testBulkOTP();

  } catch (error) {
    console.error('❌ Test suite error:', error.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Test suite completed');
  console.log('\nNEXT STEPS:');
  console.log('1. Check your phone for WhatsApp messages');
  console.log('2. Verify OTP codes in Twilio Console: https://console.twilio.com');
  console.log('3. Check server logs for any errors');
  console.log('4. If successful, update password-reset.service.js and other OTP services');
}

main();
