import { SMSService } from './services/sms.service.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testPay4SMS() {
  console.log('🧪 Testing Pay4SMS Gateway...\n');

  // Pay4SMS Configuration (you need to add these to .env)
  const token = '3cc40fb366624fba4447d922ed555417'; // Your actual token
  const senderId = 'MAYDEN'; // Your approved sender ID (MSMART is suspended)
  const templateId = '1707162254671707'; // Your OTP template ID

  console.log('📋 Configuration:');
  console.log(`Provider: Pay4SMS`);
  console.log(`Token: ${token.substring(0, 10)}...`);
  console.log(`Sender ID: ${senderId}`);
  console.log(`Template ID: ${templateId}\n`);

  // Initialize SMS service with Pay4SMS
  const smsService = new SMSService({
    provider: 'pay4sms',
    apiKey: token,
    senderId: senderId,
    credit: '2', // Transactional only (includes OTP)
    templateId: templateId,
    apiUrl: 'http://pay4sms.in'
  });

  console.log('📱 Test 1: Sending OTP SMS with actual value to 7373007737...\n');

  try {
    const result1 = await smsService.sendSMS({
      to: '7373007737',
      message: '123456 is your One Time Password to login with your My Smart Health Account. Don\'t Share this with anyone.',
      templateId: templateId
    });

    console.log('✅ SMS Result:');
    console.log(JSON.stringify(result1, null, 2));
    
    if (result1.success) {
      console.log('\n🎉 SUCCESS! SMS sent successfully.');
      console.log(`Message ID: ${result1.messageId}`);
      console.log(`Credit Type: ${result1.creditType}`);
    } else {
      console.log('\n❌ FAILED! SMS could not be sent.');
      console.log(`Error: ${result1.error}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
    console.log('📱 Test 2: Sending OTP SMS to 7373007737...\n');

    const result2 = await smsService.sendSMS({
      to: '7373007737',
      message: '987654 is your One Time Password to login with your My Smart Health Account. Don\'t Share this with anyone.',
      templateId: templateId
    });

    console.log('✅ OTP SMS Result:');
    console.log(JSON.stringify(result2, null, 2));
    
    if (result2.success) {
      console.log('\n🎉 SUCCESS! OTP SMS sent successfully.');
      console.log(`Message ID: ${result2.messageId}`);
      console.log(`Credit Type: ${result2.creditType} (transactional)`);
    } else {
      console.log('\n❌ FAILED! OTP SMS could not be sent.');
      console.log(`Error: ${result2.error}`);
    }

    // Test 3: Check credit balance
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('💰 Test 3: Checking credit balance...\n');

    const balance = await smsService.getCredits('2'); // Check transactional credits
    console.log('Balance Result:');
    console.log(JSON.stringify(balance, null, 2));

  } catch (error) {
    console.error('\n❌ Error during tests:');
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
testPay4SMS()
  .then(() => {
    console.log('\n✅ All tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  });
