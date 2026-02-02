#!/usr/bin/env node

const twilio = require('twilio');
require('dotenv').config({ path: './server/.env' });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;

const client = twilio(accountSid, authToken);

// Phone number to send to
const phoneNumber = '7373007737';
const toNumber = `whatsapp:+91${phoneNumber}`;

// Available templates
const templates = {
  OTP: process.env.WHATSAPP_TEMPLATE_OTP,
  APPOINTMENT_CONFIRMATION: process.env.WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION,
  APPOINTMENT_REMINDER: process.env.WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER,
  HEALTH_REPORT: process.env.WHATSAPP_TEMPLATE_HEALTH_REPORT,
  PRESCRIPTION: process.env.WHATSAPP_TEMPLATE_PRESCRIPTION,
  CHECKUP_REMINDER: process.env.WHATSAPP_TEMPLATE_CHECKUP_REMINDER,
};

console.log('📱 Available WhatsApp Templates:');
console.log('================================');
Object.entries(templates).forEach(([name, templateId]) => {
  console.log(`${name}: ${templateId}`);
});

// Function to send template message
async function sendTemplateMessage(toNumber, templateSid, bodyVariables = []) {
  try {
    console.log(`\n📤 Sending WhatsApp message to ${toNumber}...`);
    console.log(`Template: ${templateSid}`);
    if (bodyVariables.length > 0) {
      console.log(`Variables: ${JSON.stringify(bodyVariables)}`);
    }

    const message = await client.messages.create({
      from: whatsappFrom,
      to: toNumber,
      contentSid: templateSid,
      contentVariables: JSON.stringify(bodyVariables),
    });

    console.log('✅ Message sent successfully!');
    console.log(`Message SID: ${message.sid}`);
    console.log(`Status: ${message.status}`);
    return message;
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    throw error;
  }
}

// Function to send simple text message (for testing without template)
async function sendTextMessage(toNumber, body) {
  try {
    console.log(`\n📤 Sending text message to ${toNumber}...`);
    console.log(`Message: ${body}`);

    const message = await client.messages.create({
      from: whatsappFrom,
      to: toNumber,
      body: body,
    });

    console.log('✅ Message sent successfully!');
    console.log(`Message SID: ${message.sid}`);
    console.log(`Status: ${message.status}`);
    return message;
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    throw error;
  }
}

// Main execution
(async () => {
  try {
    console.log(`\n🔧 Twilio Configuration:`);
    console.log(`From: ${whatsappFrom}`);
    console.log(`To: ${toNumber}`);
    console.log(`Account SID: ${accountSid.substring(0, 10)}...`);
    
    // Option 1: Send with OTP template (no variables)
    // await sendTemplateMessage(toNumber, templates.OTP);
    
    // Option 2: Send with variables if template requires them
    // await sendTemplateMessage(toNumber, templates.APPOINTMENT_CONFIRMATION, ['Dr. John', '2026-02-15']);
    
    // Option 3: Send a simple text message for testing
    await sendTextMessage(toNumber, '🏥 Hello from Mediczy! Your WhatsApp integration is working.');
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
