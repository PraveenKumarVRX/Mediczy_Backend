import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

console.log('🧪 Testing Twilio WhatsApp Connection\n');
console.log('Configuration:');
console.log('─'.repeat(50));
console.log(`Account SID: ${process.env.TWILIO_ACCOUNT_SID}`);
console.log(`Auth Token: ${process.env.TWILIO_AUTH_TOKEN ? '***' + process.env.TWILIO_AUTH_TOKEN.slice(-4) : 'NOT SET'}`);
console.log(`WhatsApp Number: ${process.env.TWILIO_WHATSAPP_NUMBER}`);
console.log('─'.repeat(50));
console.log();

try {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  console.log('✓ Twilio client initialized');
  console.log('✓ Attempting to validate account...\n');

  // Try to fetch account details to verify credentials
  const account = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
  
  console.log('✅ SUCCESS! Twilio connection verified');
  console.log();
  console.log('Account Details:');
  console.log('─'.repeat(50));
  console.log(`Friendly Name: ${account.friendlyName}`);
  console.log(`Status: ${account.status}`);
  console.log(`Type: ${account.type}`);
  console.log('─'.repeat(50));
  console.log();
  console.log('✅ Twilio WhatsApp is configured and ready!');
  console.log('✅ You can now send WhatsApp messages via the forgot password feature');
  
} catch (error) {
  console.error('❌ Connection Test Failed');
  console.error();
  console.error('Error:', error.message);
  
  if (error.code === 20003) {
    console.error('\n💡 Solution: Check your Account SID and Auth Token');
  } else if (error.status === 401) {
    console.error('\n💡 Solution: Invalid credentials - verify Account SID and Auth Token');
  }
  
  process.exit(1);
}
