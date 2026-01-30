#!/usr/bin/env node

/**
 * Test RocketChat Incoming Webhook Integration
 * This simulates a WhatsApp message being sent to RocketChat #general
 */

import axios from 'axios';

const INCOMING_WEBHOOK_URL = process.env.ROCKETCHAT_INCOMING_WEBHOOK_URL || 
  'http://localhost:3005/hooks/697d27420d23b15e771ff5ff/2g45Kyw4okXM9F47omzqScRzdCiEsei25vytf26jug62nzdn';

async function testWebhook() {
  console.log('🧪 Testing RocketChat Incoming Webhook...\n');
  console.log('📍 Webhook URL:', INCOMING_WEBHOOK_URL);
  
  const testMessage = {
    text: '📱 **WhatsApp Message from Test User** (+917373007737)\n\nHello! This is a test message from the Mediczy backend.',
    attachments: [
      {
        title: 'WhatsApp Message',
        text: 'Hello! This is a test message from the Mediczy backend.',
        color: '#25D366', // WhatsApp green
        fields: [
          {
            title: 'From',
            value: 'Test User (+917373007737)',
            short: true
          },
          {
            title: 'Time',
            value: new Date().toLocaleString('en-IN', { 
              timeZone: 'Asia/Kolkata',
              dateStyle: 'short',
              timeStyle: 'short'
            }),
            short: true
          }
        ],
        ts: new Date().toISOString()
      }
    ]
  };

  try {
    console.log('\n📤 Sending test message to RocketChat...');
    const response = await axios.post(INCOMING_WEBHOOK_URL, testMessage, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    console.log('✅ SUCCESS!');
    console.log('📊 Response:', response.data);
    console.log('\n🎉 Check your RocketChat #general channel - you should see the test message!');
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testWebhook();
