import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

console.log('📋 Twilio Error 63016 - Recipient Not Opted In\n');
console.log('='.repeat(70));

console.log('\n🔍 What does Error 63016 mean?');
console.log('   The recipient has not opted in to receive WhatsApp messages');
console.log('   from your Twilio WhatsApp Business number.');

console.log('\n✅ SOLUTION - The recipient must:');
console.log('   1. Open WhatsApp');
console.log('   2. Send a message to: +919791476194');
console.log('   3. Message content: "Hi" or "JOIN" or any message');
console.log('   4. Wait for confirmation response from Mediczy');
console.log('   5. After confirmation, they can receive messages');

console.log('\n📝 Template Message Setup (Alternative):');
console.log('   If you need to send without opt-in:');
console.log('   - Create approved WhatsApp templates in Twilio Console');
console.log('   - Use Facebook Business Manager for approval');
console.log('   - This process takes 24-48 hours');

console.log('\n⚡ QUICK TEST - Send Opt-in Request:');
console.log('   Ask the recipient (+917010144591) to:');
console.log('   1. Save contact: +919791476194');
console.log('   2. Send "Hello" via WhatsApp to that number');
console.log('   3. Wait for automated response');

console.log('\n🔗 Helpful Links:');
console.log('   - Twilio Console: https://console.twilio.com/');
console.log('   - WhatsApp Sender Registration:');
console.log('     https://www.twilio.com/console/sms/whatsapp/senders');
console.log('   - Error Code Reference:');
console.log('     https://www.twilio.com/docs/api/errors/63016');

console.log('\n' + '='.repeat(70));

// Try to get more details about the sender number
try {
  console.log('\n📞 Checking Sender Number Details...\n');
  
  const incomingNumbers = await client.incomingPhoneNumbers.list({ 
    phoneNumber: '+919791476194',
    limit: 1 
  });
  
  if (incomingNumbers.length > 0) {
    const number = incomingNumbers[0];
    console.log('Sender Number Information:');
    console.log(`   SID: ${number.sid}`);
    console.log(`   Phone Number: ${number.phoneNumber}`);
    console.log(`   Friendly Name: ${number.friendlyName}`);
    console.log(`   Capabilities: ${JSON.stringify(number.capabilities)}`);
  }
  
  // Check WhatsApp sender status
  console.log('\n📱 WhatsApp Sender Status:');
  const whatsappSenders = await client.messaging.v1.services.list({ limit: 5 });
  
  if (whatsappSenders.length > 0) {
    whatsappSenders.forEach((service, index) => {
      console.log(`\n   ${index + 1}. Service: ${service.friendlyName}`);
      console.log(`      SID: ${service.sid}`);
    });
  } else {
    console.log('   No WhatsApp messaging services found');
  }
  
} catch (error) {
  console.log(`   Could not fetch detailed info: ${error.message}`);
}

console.log('\n✨ Next Steps:');
console.log('   1. Contact recipient at +917010144591');
console.log('   2. Ask them to initiate WhatsApp chat with +919791476194');
console.log('   3. After they send first message, run:');
console.log('      node send-test-whatsapp.mjs');
console.log('\n');
