const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

async function runWhatsAppBusinessAPITests() {
  console.log('🚀 Starting WhatsApp Business API Tests');
  console.log('========================================');

  try {
    // Test 1: Health Check
    console.log('\n📡 Testing server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`).catch(() => ({ status: 'DOWN' }));
    console.log(healthResponse.status === 200 ? '✅ Server is healthy' : '❌ Server health check failed');

    // Test 2: Business Profile (without auth for now)
    console.log('\n📋 Testing Business Profile endpoint...');
    try {
      const profileResponse = await axios.get(`${BASE_URL}/api/whatsapp-business/business/profile`);
      console.log('✅ Business Profile endpoint accessible');
      console.log('Response:', JSON.stringify(profileResponse.data, null, 2));
    } catch (error) {
      if (error.response) {
        console.log(`📝 Business Profile endpoint returned: ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 401) {
          console.log('🔐 Authentication required (expected behavior)');
        }
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    // Test 3: Phone Number Info
    console.log('\n📱 Testing Phone Number Info endpoint...');
    try {
      const phoneResponse = await axios.get(`${BASE_URL}/api/whatsapp-business/phone/info`);
      console.log('✅ Phone Info endpoint accessible');
      console.log('Response:', JSON.stringify(phoneResponse.data, null, 2));
    } catch (error) {
      if (error.response) {
        console.log(`📝 Phone Info endpoint returned: ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 401) {
          console.log('🔐 Authentication required (expected behavior)');
        }
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    // Test 4: Analytics endpoint
    console.log('\n📊 Testing Analytics endpoint...');
    try {
      const analyticsResponse = await axios.get(`${BASE_URL}/api/whatsapp-business/analytics`);
      console.log('✅ Analytics endpoint accessible');
      console.log('Response:', JSON.stringify(analyticsResponse.data, null, 2));
    } catch (error) {
      if (error.response) {
        console.log(`📝 Analytics endpoint returned: ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 401) {
          console.log('🔐 Authentication required (expected behavior)');
        }
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    // Test 5: Webhook verification endpoint (GET)
    console.log('\n🔗 Testing Webhook verification endpoint...');
    try {
      const webhookResponse = await axios.get(`${BASE_URL}/api/whatsapp-business/webhook?hub.mode=subscribe&hub.challenge=test&hub.verify_token=test`);
      console.log('✅ Webhook endpoint accessible');
      console.log('Response:', webhookResponse.data);
    } catch (error) {
      if (error.response) {
        console.log(`📝 Webhook endpoint returned: ${error.response.status} ${error.response.statusText}`);
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    // Test 6: QR Code endpoint
    console.log('\n🎯 Testing QR Code generation endpoint...');
    try {
      const qrResponse = await axios.get(`${BASE_URL}/api/whatsapp-business/qr-code?prefilled_message=Hello`);
      console.log('✅ QR Code endpoint accessible');
      console.log('Response:', JSON.stringify(qrResponse.data, null, 2));
    } catch (error) {
      if (error.response) {
        console.log(`📝 QR Code endpoint returned: ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 401) {
          console.log('🔐 Authentication required (expected behavior)');
        }
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('❌ Network error:', error.message);
      }
    }

    console.log('\n🎉 WhatsApp Business API Tests Completed!');
    console.log('========================================');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
}

// Self-executing function
if (require.main === module) {
  runWhatsAppBusinessAPITests();
}

module.exports = runWhatsAppBusinessAPITests;