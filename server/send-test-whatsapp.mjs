import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const toNumber = '+917010144591';
const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

console.log('📱 Sending test WhatsApp message...\n');
console.log(`From: ${fromNumber}`);
console.log(`To: whatsapp:${toNumber}`);
console.log();

try {
  const message = await client.messages.create({
    body: 'Hello from Mediczy! 🏥\n\nThis is a test WhatsApp message to verify your integration.\n\nYour OTP verification system is working perfectly!\n\nTest Code: 123456',
    from: fromNumber,
    to: `whatsapp:${toNumber}`
  });

  console.log('✅ Message sent successfully!');
  console.log();
  console.log('Message Details:');
  console.log('─'.repeat(50));
  console.log(`Message SID: ${message.sid}`);
  console.log(`Status: ${message.status}`);
  console.log(`Direction: ${message.direction}`);
  console.log(`To: ${message.to}`);
  console.log(`From: ${message.from}`);
  console.log('─'.repeat(50));
  console.log();
  console.log('✅ WhatsApp message delivered successfully!');
  console.log('Check the phone number for the message.');
  
} catch (error) {
  console.error('❌ Failed to send message');
  console.error();
  console.error('Error:', error.message);
  console.error('Code:', error.code);
  
  if (error.code === 21608) {
    console.error('\n💡 The recipient may not have joined the WhatsApp sandbox.');
    console.error('   Send "join <sandbox-keyword>" to your sandbox number first.');
  } else if (error.code === 63016) {
    console.error('\n💡 WhatsApp template issue - using sandbox mode may require pre-approved templates.');
  }
  
  console.error('\nFull error:', error);
  process.exit(1);
}
