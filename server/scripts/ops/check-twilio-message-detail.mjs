// Usage: node server/scripts/ssm-env-loader.mjs server/scripts/ops/check-twilio-message-detail.mjs <message-sid>
import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const sid = process.argv[process.argv.length - 1];
const msg = await client.messages(sid).fetch();
console.log(JSON.stringify({
  status: msg.status, errorCode: msg.errorCode, errorMessage: msg.errorMessage,
  to: msg.to, from: msg.from, dateSent: msg.dateSent, dateUpdated: msg.dateUpdated,
}, null, 2));
process.exit(0);
