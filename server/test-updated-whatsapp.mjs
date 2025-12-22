import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

console.log('🔍 Testing WhatsApp with Updated Configuration\n');
console.log('='.repeat(70));

// Load credentials from environment
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

console.log('\n📋 Current Configuration:');
console.log(`Account SID: ${accountSid?.substring(0, 10)}...`);
console.log(`WhatsApp Number: ${whatsappNumber}`);

if (!accountSid || !authToken || !whatsappNumber) {
  console.error('\n❌ Error: Missing Twilio credentials');
  process.exit(1);
}

// Initialize Twilio client
const client = twilio(accountSid, authToken);

console.log('\n📱 Sending test message to +917010144591...\n');

try {
  // Check if we need to use messaging service SID
  // Based on earlier discovery, we found messaging services:
  // - MGaaa46814fea5ac01d5b34277c7ea9f8a (My SmartHealth)
  
  const messagePayload = {
    body: 'Hello from Mediczy! 🏥\n\nThis is a test message after updating configuration in admin dashboard.\n\nIf you receive this, WhatsApp integration is working!\n\nTest Code: 789012',
    from: whatsappNumber,
    to: 'whatsapp:+917010144591'
  };
  
  console.log('Sending message with payload:');
  console.log(JSON.stringify(messagePayload, null, 2));
  console.log('');
  
  const message = await client.messages.create(messagePayload);
  
  console.log('✅ Message sent successfully!\n');
  console.log(`Message SID: ${message.sid}`);
  console.log(`Status: ${message.status}`);
  console.log(`Direction: ${message.direction}`);
  console.log(`To: ${message.to}`);
  console.log(`From: ${message.from}`);
  
  if (message.errorCode) {
    console.log(`\n❌ Error Code: ${message.errorCode}`);
    console.log(`Error Message: ${message.errorMessage}`);
  }
  
  // Wait a bit and check status
  console.log('\n⏳ Waiting 3 seconds to check status...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const updatedMessage = await client.messages(message.sid).fetch();
  console.log(`Updated Status: ${updatedMessage.status}`);
  
  if (updatedMessage.errorCode) {
    console.log(`\n⚠️  Message Status: ${updatedMessage.status}`);
    console.log(`Error Code: ${updatedMessage.errorCode}`);
    
    if (updatedMessage.errorCode === 63016) {
      console.log('\n📋 Error 63016 - Recipient Not Opted In');
      console.log('   The recipient must first send a message to your WhatsApp number');
      console.log(`   Recipient should message: ${whatsappNumber}`);
    }
  }
  
} catch (error) {
  console.error('\n❌ Error sending message:');
  console.error(error.message);
  if (error.code) {
    console.error(`Error Code: ${error.code}`);
  }
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
