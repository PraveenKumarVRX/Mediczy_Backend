/**
 * Quick Twilio Configuration Checker
 * Shows current configuration and helps diagnose issues
 */

import 'dotenv/config';

console.log('='.repeat(60));
console.log('📋 TWILIO WHATSAPP CONFIGURATION STATUS');
console.log('='.repeat(60));
console.log();

// Check environment variables
const config = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER
};

console.log('Environment Variables:');
console.log('-'.repeat(60));

// Account SID
if (config.accountSid && config.accountSid.trim() !== '') {
  console.log('✅ TWILIO_ACCOUNT_SID:', config.accountSid.substring(0, 10) + '...');
} else {
  console.log('❌ TWILIO_ACCOUNT_SID: NOT SET');
  console.log('   → Add to .env: TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
}

// Auth Token
if (config.authToken && config.authToken.trim() !== '') {
  console.log('✅ TWILIO_AUTH_TOKEN:', '*'.repeat(32));
} else {
  console.log('❌ TWILIO_AUTH_TOKEN: NOT SET');
  console.log('   → Add to .env: TWILIO_AUTH_TOKEN=your_auth_token_here');
}

// Phone Number
const phoneNumber = config.phoneNumber || config.whatsappNumber;
if (phoneNumber && phoneNumber.trim() !== '') {
  console.log('✅ TWILIO_PHONE_NUMBER:', phoneNumber);
} else {
  console.log('❌ TWILIO_PHONE_NUMBER: NOT SET');
  console.log('   → Add to .env: TWILIO_PHONE_NUMBER=+14155238886');
  console.log('   → For sandbox, use the sandbox number from Twilio console');
}

console.log();
console.log('-'.repeat(60));

// Determine status
const allConfigured = config.accountSid && config.accountSid.trim() !== '' &&
                      config.authToken && config.authToken.trim() !== '' &&
                      phoneNumber && phoneNumber.trim() !== '';

if (allConfigured) {
  console.log('✅ STATUS: All Twilio credentials are configured!');
  console.log();
  console.log('Next steps:');
  console.log('1. Run: node test-twilio-whatsapp.js');
  console.log('2. Or use the API endpoint: POST /api/whatsapp-config/test/twilio');
  console.log('3. Send a test message via: POST /api/whatsapp-config/message');
} else {
  console.log('⚠️  STATUS: Twilio credentials are incomplete');
  console.log();
  console.log('To configure Twilio WhatsApp:');
  console.log();
  console.log('1. Log in to Twilio Console: https://console.twilio.com/');
  console.log('2. Copy your Account SID and Auth Token from the dashboard');
  console.log('3. For WhatsApp Sandbox:');
  console.log('   - Go to: Messaging > Try it out > Send a WhatsApp message');
  console.log('   - Copy the "From" sandbox number (e.g., +14155238886)');
  console.log('4. Add these values to /root/Mediczy/server/.env file:');
  console.log();
  console.log('   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  console.log('   TWILIO_AUTH_TOKEN=your_32_character_auth_token');
  console.log('   TWILIO_PHONE_NUMBER=+14155238886');
  console.log();
  console.log('5. Then run this script again to verify');
}

console.log();
console.log('='.repeat(60));
console.log();

// Show .env file location
console.log('📁 Configuration file: /root/Mediczy/server/.env');
console.log('📚 Documentation: https://www.twilio.com/docs/whatsapp/quickstart');
console.log();
