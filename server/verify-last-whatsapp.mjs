import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

console.log('📱 Checking last WhatsApp message status...\n');

try {
  const messages = await client.messages.list({ limit: 3 });
  
  console.log('Last 3 messages:\n');
  messages.forEach((msg, index) => {
    console.log(`${index + 1}. Message SID: ${msg.sid}`);
    console.log(`   To: ${msg.to}`);
    console.log(`   Status: ${msg.status}`);
    console.log(`   Date: ${msg.dateCreated}`);
    if (msg.errorCode) {
      console.log(`   ❌ Error: ${msg.errorCode}`);
    } else if (msg.status === 'delivered') {
      console.log(`   ✅ Delivered successfully!`);
    }
    console.log('');
  });
  
} catch (error) {
  console.error('Error:', error.message);
}
