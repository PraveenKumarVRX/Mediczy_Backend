#!/usr/bin/env node

/**
 * Signup Flow Test - Simulates actual signup with OTP
 * Tests the new Direct Twilio integration end-to-end
 */

import axios from 'axios';

const BACKEND_URL = 'http://localhost:8888';

async function testSignupWithOTP() {
  try {
    console.log('🚀 Testing Signup Flow with Direct Twilio OTP');
    console.log('='.repeat(50));

    // Step 1: Signup request
    const signupData = {
      firstName: 'Test',
      lastName: 'User',
      email: `test-${Date.now()}@example.com`,
      phoneNumber: '9884089921',
      password: 'TestPassword123!',
      dateOfBirth: '1990-01-15',
      gender: 'M'
    };

    console.log('\n📝 Step 1: Sending signup request');
    console.log(`   Email: ${signupData.email}`);
    console.log(`   Phone: ${signupData.phoneNumber}`);

    const signupResponse = await axios.post(
      `${BACKEND_URL}/api/auth/signup`,
      signupData,
      { timeout: 30000 }
    );

    if (!signupResponse.data.success) {
      console.log('❌ Signup failed:', signupResponse.data);
      return;
    }

    console.log('✅ Signup successful');
    console.log(`   Account ID: ${signupResponse.data.data?.account_id}`);
    
    // Check if OTP was sent
    if (signupResponse.data.data?.otp_sent) {
      console.log(`\n📱 OTP Delivery Method:`);
      console.log(`   Via Direct Twilio: ${signupResponse.data.data.via_direct_twilio ? '✅' : '❌'}`);
      console.log(`   Via N8N: ${signupResponse.data.data.via_n8n ? '✅' : '❌'}`);
      console.log(`\n✅ Check WhatsApp on 9884089921 for OTP code`);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testSignupWithOTP();
