import { SMSService } from './services/sms.service.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkDeliveryStatus() {
  console.log('🔍 Checking SMS Delivery Status...\n');

  const token = '3cc40fb366624fba4447d922ed555417';
  const senderId = 'MSMART';

  const smsService = new SMSService({
    provider: 'pay4sms',
    apiKey: token,
    senderId: senderId,
    apiUrl: 'http://pay4sms.in'
  });

  // Message IDs from the test
  const messageIds = [
    '278854894_0',
    '278854896_0'
  ];

  console.log('📋 Checking delivery status for messages...\n');

  for (const msgId of messageIds) {
    try {
      console.log(`\nMessage ID: ${msgId}`);
      const status = await smsService.getDeliveryStatus(msgId);
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error(`Error checking ${msgId}:`, error.message);
    }
  }

  // Try sending a simple test message
  console.log('\n' + '='.repeat(60));
  console.log('\n📱 Sending new test SMS to 7373007737...\n');

  try {
    const result = await smsService.sendSMS({
      to: '7373007737',
      message: '123456 is your One Time Password to login with your My Smart Health Account. Don\'t Share this with anyone',
      templateId: '1707162254671707XXXXXXXX'
    });

    console.log('✅ SMS Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.messageId) {
      console.log('\n⏳ Waiting 5 seconds to check delivery...\n');
      
      // Wait 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('🔍 Checking delivery status...');
      const deliveryStatus = await smsService.getDeliveryStatus(result.messageId);
      console.log(JSON.stringify(deliveryStatus, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDeliveryStatus()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
