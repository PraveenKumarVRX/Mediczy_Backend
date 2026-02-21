#!/usr/bin/env node

/**
 * Test script for email send and sync endpoints
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

// Test token for parinitha (team member)
// You'll need to get a real token by logging in
const TEST_TOKEN = 'test-bearer-token'; // Replace with actual token

async function testEndpoints() {
  console.log('🧪 Testing Email Send & Sync Endpoints\n');

  try {
    // Test 1: Send Email
    console.log('📧 Test 1: Send Email');
    try {
      const sendResponse = await axios.post(`${API_BASE}/team/emails/send`, {
        to: 'test@example.com',
        subject: 'Test Email',
        htmlContent: '<p>This is a test email</p>'
      }, {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`
        }
      });

      console.log('✅ Send endpoint responded:');
      console.log(`   Status: ${sendResponse.status}`);
      console.log(`   Message: ${sendResponse.data.message}`);
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('⚠️  Expected error (no email config): ', error.response.data.message);
      } else {
        console.log('❌ Error:', error.message);
      }
    }

    // Test 2: Sync Emails
    console.log('\n📬 Test 2: Sync Emails');
    try {
      const syncResponse = await axios.post(`${API_BASE}/team/emails/sync`, {}, {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`
        }
      });

      console.log('✅ Sync endpoint responded:');
      console.log(`   Status: ${syncResponse.status}`);
      console.log(`   Message: ${syncResponse.data.message}`);
      console.log(`   New emails: ${syncResponse.data.data?.newEmails || 0}`);
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('⚠️  Expected error (no email config): ', error.response.data.message);
      } else {
        console.log('❌ Error:', error.message);
      }
    }

    // Test 3: Get Stats
    console.log('\n📊 Test 3: Get Email Stats');
    try {
      const statsResponse = await axios.get(`${API_BASE}/team/emails/stats`, {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`
        }
      });

      console.log('✅ Stats endpoint responded:');
      console.log(`   Status: ${statsResponse.status}`);
      console.log(`   Total emails: ${statsResponse.data.data?.total || 0}`);
      console.log(`   Unread: ${statsResponse.data.data?.unread || 0}`);
    } catch (error: any) {
      console.log('❌ Error:', error.message);
    }

    console.log('\n✅ Endpoint tests completed!');
    console.log('\nNote: For full functionality, you need to:');
    console.log('1. Configure email settings (SMTP/IMAP) in /team/settings');
    console.log('2. Use a valid authentication token from a logged-in user');
    console.log('3. Sync emails to populate the inbox');
    console.log('4. Send emails using the configured SMTP settings');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testEndpoints();
