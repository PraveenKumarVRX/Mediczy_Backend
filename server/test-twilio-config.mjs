import twilio from 'twilio';

const accountSid = 'ACe60079054c0b9f2a7aac3a64a5aea744';
const authToken = 'c9d8dd281b9ef0fd858ff936348740bf';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║        TWILIO CONFIGURATION TEST                       ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

try {
  const client = twilio(accountSid, authToken);
  
  // Test 1: Account verification
  console.log('1️⃣  Account Verification...');
  const account = await client.api.accounts(accountSid).fetch();
  console.log(`   ✅ Authenticated: ${account.status}\n`);
  
  // Test 2: Get phone numbers
  console.log('2️⃣  Phone Numbers:');
  const numbers = await client.incomingPhoneNumbers.list({ limit: 10 });
  if (numbers.length === 0) {
    console.log('   ⚠️  No incoming phone numbers found\n');
  } else {
    numbers.forEach((num, i) => {
      const caps = Object.keys(num.capabilities).filter(k => num.capabilities[k]);
      console.log(`   ${i+1}. ${num.phoneNumber}`);
      console.log(`      Capabilities: ${caps.length > 0 ? caps.join(', ') : 'None'}`);
    });
    console.log();
  }
  
  // Test 3: Try sending test message
  console.log('3️⃣  Test Message Send:');
  try {
    const msg = await client.messages.create({
      from: 'whatsapp:+918098998998',
      to: 'whatsapp:+919884089921',
      body: 'TestOTP: 123456'
    });
    console.log(`   ✅ Message sent: ${msg.sid}`);
    console.log(`   Status: ${msg.status}\n`);
  } catch (err) {
    console.log(`   ❌ Send failed\n`);
    console.log(`   Code: ${err.code}`);
    console.log(`   Message: ${err.message}\n`);
  }
  
} catch (error) {
  console.log(`❌ Error: ${error.message}\n`);
}
