// Usage: node server/scripts/ssm-env-loader.mjs server/scripts/ops/test-twilio-otp-template.mjs <destination-10digit>
import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const destination = process.argv[process.argv.length - 1].replace(/[^0-9]/g, '');
const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+918098998998';
const templateSid = process.env.TWILIO_OTP_TEMPLATE_SID || 'HX33ae0014bd63fad4404789d2373b6174';
try {
  const message = await client.messages.create({
    from: whatsappFrom,
    to: `whatsapp:+91${destination}`,
    contentSid: templateSid,
    contentVariables: JSON.stringify({ '1': '123456' }),
  });
  console.log('✅ Twilio accepted:', { sid: message.sid, status: message.status, errorCode: message.errorCode });
} catch (err) {
  console.error('❌ Twilio send failed:', err.code, err.message);
}
process.exit(0);
