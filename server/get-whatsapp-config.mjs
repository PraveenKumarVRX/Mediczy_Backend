import express from 'express';
import whatsAppService from './services/whatsapp.service.js';

const config = whatsAppService.getConfig();

console.log('📱 Current WhatsApp Configuration:\n');
console.log('='.repeat(70));
console.log('\n🔧 Active Provider:', config.provider);
console.log('\n📊 Provider Settings:');
console.log(JSON.stringify(config.providers[config.provider], null, 2));

console.log('\n\n💾 Checking if configuration was updated via admin dashboard...');
console.log('Current Twilio Settings from Service:');
console.log({
  accountSid: config.providers.twilio.settings.accountSid || 'NOT SET',
  phoneNumberId: config.providers.twilio.settings.phoneNumberId || 'NOT SET',
  sandbox: config.providers.twilio.settings.sandbox,
  enabled: config.providers.twilio.enabled
});

console.log('\n📋 Environment Variables:');
console.log({
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID?.substring(0, 10) + '...' || 'NOT SET',
  TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || 'NOT SET'
});

process.exit(0);
