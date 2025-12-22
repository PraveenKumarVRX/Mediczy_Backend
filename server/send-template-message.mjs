import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

console.log('📱 Sending WhatsApp Template Message\n');
console.log('='.repeat(70));

const recipientNumber = '+917010144591';
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

console.log(`\nRecipient: ${recipientNumber}`);
console.log(`From: ${whatsappNumber}\n`);

try {
  // First, let's try with a simple text message using contentSid (pre-approved template)
  // Twilio provides some pre-approved templates
  
  // Option 1: Try sending with a simple authentication message
  console.log('Attempting to send OTP template message...\n');
  
  const message = await client.messages.create({
    from: whatsappNumber,
    to: `whatsapp:${recipientNumber}`,
    body: 'Your Mediczy verification code is: 123456. Valid for 10 minutes. Do not share this code with anyone.',
    // For templates, you can use contentSid if you have approved templates
    // contentSid: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  });
  
  console.log('✅ Message sent!\n');
  console.log(`Message SID: ${message.sid}`);
  console.log(`Status: ${message.status}`);
  console.log(`Direction: ${message.direction}`);
  
  // Wait and check status
  console.log('\n⏳ Checking status in 3 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const updated = await client.messages(message.sid).fetch();
  console.log(`Current Status: ${updated.status}`);
  
  if (updated.errorCode) {
    console.log(`\n❌ Error Code: ${updated.errorCode}`);
    console.log(`Error Message: ${updated.errorMessage || 'See error details below'}`);
    
    if (updated.errorCode === 63016) {
      console.log('\n⚠️  Still requires opt-in even with template');
      console.log('\n💡 SOLUTION FOR APPROVED TEMPLATES:');
      console.log('   You need to:');
      console.log('   1. Create a WhatsApp template in Twilio Console');
      console.log('   2. Get it approved by WhatsApp (24-48 hours)');
      console.log('   3. Use the contentSid parameter when sending');
      console.log('\n   OR');
      console.log('\n   Ask recipient to opt-in by messaging your number first');
      console.log(`   Recipient should send any message to: ${whatsappNumber?.replace('whatsapp:', '')}`);
    }
  } else if (updated.status === 'delivered' || updated.status === 'sent') {
    console.log('\n✅ SUCCESS! Message delivered!');
  }
  
  // Try to list available content templates
  console.log('\n📋 Checking for available WhatsApp templates...\n');
  
  try {
    const contents = await client.content.v1.contents.list({ limit: 10 });
    
    if (contents.length > 0) {
      console.log('Available Templates:');
      contents.forEach((content, index) => {
        console.log(`\n${index + 1}. ${content.friendlyName}`);
        console.log(`   SID: ${content.sid}`);
        console.log(`   Type: ${content.types || 'N/A'}`);
      });
    } else {
      console.log('No pre-approved templates found in your account.');
      console.log('\n💡 To create WhatsApp templates:');
      console.log('   1. Go to: https://console.twilio.com/us1/develop/sms/content-editor');
      console.log('   2. Create a new WhatsApp template');
      console.log('   3. Submit for WhatsApp approval (24-48 hours)');
      console.log('   4. Use contentSid when sending messages');
    }
  } catch (error) {
    console.log('Could not fetch templates:', error.message);
  }
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  if (error.code) {
    console.error(`Code: ${error.code}`);
  }
}

console.log('\n' + '='.repeat(70));
