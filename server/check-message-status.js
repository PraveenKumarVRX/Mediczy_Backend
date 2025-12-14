import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function checkMessageStatus() {
  console.log('\n🔍 Checking Twilio Message Status\n');
  
  try {
    // Get the most recent message
    const messages = await client.messages.list({ limit: 5 });
    
    if (messages.length === 0) {
      console.log('❌ No messages found in account');
      return;
    }
    
    console.log(`📊 Found ${messages.length} recent message(s):\n`);
    
    messages.forEach((msg, index) => {
      console.log(`Message ${index + 1}:`);
      console.log(`  SID: ${msg.sid}`);
      console.log(`  Status: ${msg.status}`);
      console.log(`  To: ${msg.to}`);
      console.log(`  From: ${msg.from}`);
      console.log(`  Date: ${msg.dateCreated}`);
      console.log(`  Error Code: ${msg.errorCode || 'None'}`);
      console.log(`  Error Message: ${msg.errorMessage || 'None'}`);
      console.log(`  Price: ${msg.price || 'N/A'} ${msg.priceUnit || ''}`);
      console.log('');
    });
    
    // Check if we're in sandbox mode
    const fromNumbers = await client.incomingPhoneNumbers.list({ limit: 10 });
    
    console.log('\n📱 Account Phone Numbers:');
    fromNumbers.forEach(num => {
      console.log(`  ${num.phoneNumber} - ${num.friendlyName}`);
    });
    
    // Check WhatsApp sender
    console.log('\n📋 WhatsApp Configuration:');
    console.log(`  Configured Number: ${process.env.TWILIO_PHONE_NUMBER}`);
    console.log(`  Account Type: Check if this is a Sandbox or Approved number`);
    
    console.log('\n💡 Common Reasons for Not Receiving WhatsApp Messages:\n');
    console.log('1. SANDBOX MODE:');
    console.log('   • Recipient must first JOIN the sandbox');
    console.log('   • Send "join <sandbox-code>" to the Twilio sandbox number');
    console.log('   • Check: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn\n');
    
    console.log('2. PHONE NUMBER FORMAT:');
    console.log('   • Must include country code: +91 for India');
    console.log('   • Remove any spaces or special characters\n');
    
    console.log('3. WHATSAPP BUSINESS API:');
    console.log('   • Production requires WhatsApp Business API approval');
    console.log('   • Apply at: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders\n');
    
    console.log('4. MESSAGE TEMPLATE:');
    console.log('   • Production requires approved message templates');
    console.log('   • Sandbox allows free-form messages after joining\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkMessageStatus();
