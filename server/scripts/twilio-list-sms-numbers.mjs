#!/usr/bin/env node
/**
 * List Twilio IncomingPhoneNumbers that can send SMS.
 * Use on prod/EC2 to pick TWILIO_SMS_NUMBER (must NOT be the WhatsApp sender).
 *
 *   cd server && node scripts/twilio-list-sms-numbers.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const wa = String(process.env.TWILIO_WHATSAPP_NUMBER || '')
  .replace(/^whatsapp:/i, '')
  .replace(/\D/g, '');

if (!accountSid?.startsWith('AC') || !authToken) {
  console.error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
  process.exit(1);
}

const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`;
const res = await fetch(url, {
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
  },
});
if (!res.ok) {
  console.error('Twilio API error', res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
const rows = data.incoming_phone_numbers || [];
console.log(`Found ${rows.length} incoming number(s)\n`);
for (const n of rows) {
  const digits = String(n.phone_number || '').replace(/\D/g, '');
  const sms = n.capabilities?.sms === true || n.capabilities?.SMS === true;
  const isWa = wa && digits.endsWith(wa.slice(-10));
  console.log(
    `${n.phone_number}\tsms=${sms}\twhatsappSender=${!!isWa}\t${n.friendly_name || ''}`
  );
}
console.log('\nSet on EC2 (example):');
console.log('  export TWILIO_SMS_NUMBER=+91XXXXXXXXXX');
console.log('  pm2 restart mediczy-server --update-env');
