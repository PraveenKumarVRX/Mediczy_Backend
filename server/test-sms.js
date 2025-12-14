import { SMSService, SMSTemplateManager } from './services/sms.service.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSMS() {
  console.log('🧪 Testing SMS Gateway...\n');

  // Check if Twilio is configured
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  console.log('📋 Configuration Check:');
  console.log(`Provider: Twilio`);
  console.log(`Account SID: ${twilioSid ? twilioSid.substring(0, 10) + '...' : 'NOT SET'}`);
  console.log(`Auth Token: ${twilioToken ? '***' + twilioToken.slice(-4) : 'NOT SET'}`);
  console.log(`Phone Number: ${twilioPhone || 'NOT SET'}\n`);

  if (!twilioSid || !twilioToken || !twilioPhone) {
    console.error('❌ Twilio credentials not configured in .env file');
    process.exit(1);
  }

  // Initialize SMS service
  const smsService = new SMSService({
    provider: 'twilio',
    apiKey: twilioSid,
    apiSecret: twilioToken,
    senderId: twilioPhone
  });

  console.log('📱 Sending test SMS to +917373007737...\n');

  try {
    const result = await smsService.sendSMS({
      to: '+917373007737',
      message: 'Test SMS from Mediczy Healthcare System. Your SMS gateway is working correctly! ✅'
    });

    console.log('✅ SMS Send Result:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n🎉 SUCCESS! SMS sent successfully.');
      console.log(`Message ID: ${result.messageId}`);
    } else {
      console.log('\n❌ FAILED! SMS could not be sent.');
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('\n❌ Error sending SMS:');
    console.error(error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testSMS()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
