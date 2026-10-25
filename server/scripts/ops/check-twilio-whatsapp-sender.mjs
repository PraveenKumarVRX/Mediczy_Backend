import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
try {
  const resp = await client.request({ method: 'GET', uri: 'https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp' });
  console.log(JSON.stringify(resp.body, null, 2));
} catch (err) {
  console.error('❌ List senders failed:', err.status, err.message);
}
process.exit(0);
