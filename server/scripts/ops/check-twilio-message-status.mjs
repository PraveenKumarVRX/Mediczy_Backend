// Usage: node server/scripts/ssm-env-loader.mjs server/scripts/ops/check-twilio-message-status.mjs <message-sid>
import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const sid = process.argv[process.argv.length - 1];
const msg = await client.messages(sid).fetch();
console.log('sid:', msg.sid, 'status:', msg.status, 'errorCode:', msg.errorCode, 'errorMessage:', msg.errorMessage);
process.exit(0);
