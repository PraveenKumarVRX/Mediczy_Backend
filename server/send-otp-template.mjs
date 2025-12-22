import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

console.log('📱 Sending WhatsApp Message with Approved OTP Template\n');
console.log('='.repeat(70));

const recipientNumber = '+917010144591';
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const otpTemplateSid = 'HX33ae0014bd63fad4404789d2373b6174';

console.log(`\nRecipient: ${recipientNumber}`);
console.log(`From: ${whatsappNumber}`);
console.log(`Template: otp_verification (${otpTemplateSid})\n`);

try {
  // First, let's get the template details to see what variables it needs
  console.log('Fetching template details...\n');
  
  const template = await client.content.v1.contents(otpTemplateSid).fetch();
  console.log(`Template Name: ${template.friendlyName}`);
  console.log(`Template Language: ${template.language || 'N/A'}`);
  
  // Send message using the approved template
  console.log('\nSending message with approved template...\n');
  
  const message = await client.messages.create({
    from: whatsappNumber,
    to: `whatsapp:${recipientNumber}`,
    contentSid: otpTemplateSid,
    contentVariables: JSON.stringify({
      1: '456789'  // OTP code variable
    })
  });
  
  console.log('✅ Template message sent!\n');
  console.log(`Message SID: ${message.sid}`);
  console.log(`Status: ${message.status}`);
  console.log(`Price: ${message.price || 'N/A'}`);
  
  // Wait and check delivery status
  console.log('\n⏳ Checking delivery status in 5 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const updated = await client.messages(message.sid).fetch();
  console.log(`Updated Status: ${updated.status}`);
  
  if (updated.errorCode) {
    console.log(`\n❌ Error Code: ${updated.errorCode}`);
    console.log(`Error Message: ${updated.errorMessage || 'N/A'}`);
    
    if (updated.errorCode === 63016) {
      console.log('\n⚠️  Even approved templates require opt-in for this account type');
      console.log('\n📋 To enable sending without opt-in:');
      console.log('   1. Upgrade to WhatsApp Business API (not sandbox)');
      console.log('   2. Complete Facebook Business Verification');
      console.log('   3. Get templates approved by WhatsApp');
      console.log('\n   For now, recipient must message your number first:');
      console.log(`   ${whatsappNumber?.replace('whatsapp:', '')}`);
    }
  } else {
    console.log('\n✅ SUCCESS! Message delivered with approved template!');
    console.log(`\nRecipient at ${recipientNumber} should receive:`);
    console.log('   "Your verification code is: 456789"');
  }
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  if (error.status) {
    console.error(`Status: ${error.status}`);
  }
  if (error.moreInfo) {
    console.error(`More info: ${error.moreInfo}`);
  }
}

console.log('\n' + '='.repeat(70));
