import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

console.log('🔍 Checking WhatsApp message status...\n');

try {
  // Get recent messages
  const messages = await client.messages.list({ limit: 5 });
  
  console.log('Recent Messages:');
  console.log('='.repeat(70));
  
  messages.forEach((msg, index) => {
    console.log(`\n${index + 1}. Message SID: ${msg.sid}`);
    console.log(`   Status: ${msg.status}`);
    console.log(`   To: ${msg.to}`);
    console.log(`   From: ${msg.from}`);
    console.log(`   Direction: ${msg.direction}`);
    console.log(`   Date: ${msg.dateCreated}`);
    
    if (msg.errorCode) {
      console.log(`   ❌ Error Code: ${msg.errorCode}`);
      console.log(`   ❌ Error Message: ${msg.errorMessage}`);
    }
  });
  
  console.log('\n' + '='.repeat(70));
  
  // Check if using sandbox
  const phoneNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  console.log('\n📱 WhatsApp Configuration:');
  console.log(`Number: ${phoneNumber}`);
  
  if (phoneNumber.includes('+14155238886') || phoneNumber.includes('+1415523')) {
    console.log('\n⚠️  You are using Twilio WhatsApp SANDBOX');
    console.log('\n📋 To receive messages, the recipient must:');
    console.log('   1. Send a WhatsApp message to: +1 415 523 8886');
    console.log('   2. Message content: "join <your-sandbox-name>"');
    console.log('   3. Wait for confirmation message');
    console.log('   4. Then you can send messages to that number');
  } else {
    console.log('\n✅ Production WhatsApp number detected');
    console.log('   Number should work without sandbox join process');
    console.log('\n   If messages still fail, check:');
    console.log('   - Number is approved for production');
    console.log('   - Message templates are approved (if required)');
    console.log('   - Billing is active');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
