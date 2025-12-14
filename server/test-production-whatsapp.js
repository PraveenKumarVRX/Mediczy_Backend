import dotenv from 'dotenv';
import twilio from 'twilio';
import readline from 'readline';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function testProductionWhatsApp() {
  console.log('\n🚀 Production WhatsApp Testing Tool\n');
  
  try {
    // Initialize client
    console.log('ℹ️  Initializing Twilio client...');
    const client = twilio(accountSid, authToken);
    
    // Verify account
    const account = await client.api.v2010.accounts(accountSid).fetch();
    console.log(`✅ Account verified: ${account.friendlyName} (${account.status})\n`);
    
    // Check if using approved number
    console.log('📱 Checking WhatsApp configuration...');
    const senders = await client.messaging.v1.services.list({ limit: 20 });
    const whatsappSenders = senders.filter(s => s.friendlyName.toLowerCase().includes('whatsapp'));
    
    if (whatsappSenders.length > 0) {
      console.log('✅ WhatsApp Business Profile found');
      whatsappSenders.forEach(sender => {
        console.log(`   - ${sender.friendlyName} (${sender.sid})`);
      });
    } else {
      console.log('⚠️  No WhatsApp Business Profile found');
      console.log('   This may indicate sandbox mode or pending approval\n');
    }
    
    // List available templates
    console.log('\n📋 Checking Message Templates...');
    try {
      const templates = await client.content.v1.contents.list({ limit: 20 });
      
      if (templates.length > 0) {
        console.log(`✅ Found ${templates.length} approved template(s):\n`);
        templates.forEach((template, index) => {
          console.log(`   ${index + 1}. ${template.friendlyName}`);
          console.log(`      SID: ${template.sid}`);
          console.log(`      Types: ${template.types ? Object.keys(template.types).join(', ') : 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('⚠️  No approved templates found');
        console.log('   Submit templates at: https://console.twilio.com/us1/develop/sms/try-it-out/templates\n');
      }
    } catch (error) {
      console.log('⚠️  Unable to fetch templates:', error.message);
      console.log('   This is normal if templates are not yet approved\n');
    }
    
    // Test options
    console.log('\n📤 Message Sending Options:\n');
    console.log('1. Send with approved template (production)');
    console.log('2. Send simple text (sandbox/testing only)');
    console.log('3. Check message status');
    console.log('4. Exit\n');
    
    const choice = await question('Select option (1-4): ');
    
    if (choice === '1') {
      // Send with template
      console.log('\n⚠️  Template messaging requires:');
      console.log('   - Approved WhatsApp Business Account');
      console.log('   - Approved message template');
      console.log('   - Template SID from Twilio console\n');
      
      const templateSid = await question('Enter Template SID (HXxxxxx...): ');
      const toNumber = await question('Enter recipient number (+91XXXXXXXXXX): ');
      
      console.log('\nℹ️  Template variables (comma-separated, e.g., John,Dr. Smith,Tomorrow):');
      const variables = await question('Enter values: ');
      
      const contentVariables = {};
      variables.split(',').forEach((val, idx) => {
        contentVariables[(idx + 1).toString()] = val.trim();
      });
      
      console.log('\n📤 Sending template message...');
      
      const message = await client.messages.create({
        from: fromNumber,
        to: `whatsapp:${toNumber}`,
        contentSid: templateSid,
        contentVariables: JSON.stringify(contentVariables)
      });
      
      console.log('✅ Message sent!');
      console.log(`   SID: ${message.sid}`);
      console.log(`   Status: ${message.status}`);
      
    } else if (choice === '2') {
      // Send simple text
      console.log('\n⚠️  Note: Simple text messages only work in sandbox mode');
      console.log('   or for user-initiated conversations (24hr window)\n');
      
      const toNumber = await question('Enter recipient number (+91XXXXXXXXXX): ');
      const messageBody = await question('Enter message: ');
      
      console.log('\n📤 Sending message...');
      
      const message = await client.messages.create({
        from: fromNumber,
        to: `whatsapp:${toNumber}`,
        body: messageBody
      });
      
      console.log('✅ Message sent!');
      console.log(`   SID: ${message.sid}`);
      console.log(`   Status: ${message.status}`);
      
      if (message.status === 'queued' || message.status === 'sent') {
        console.log('\n💡 Check delivery status in 1-2 minutes using option 3');
      }
      
    } else if (choice === '3') {
      // Check status
      const messageSid = await question('\nEnter Message SID (SMxxxxx...): ');
      
      console.log('\n🔍 Fetching message status...');
      const message = await client.messages(messageSid).fetch();
      
      console.log('\n📊 Message Details:');
      console.log(`   Status: ${message.status}`);
      console.log(`   To: ${message.to}`);
      console.log(`   From: ${message.from}`);
      console.log(`   Date: ${message.dateCreated}`);
      console.log(`   Error Code: ${message.errorCode || 'None'}`);
      console.log(`   Error Message: ${message.errorMessage || 'None'}`);
      console.log(`   Price: ${message.price || 'N/A'} ${message.priceUnit || ''}`);
      
      if (message.status === 'delivered') {
        console.log('\n✅ Message delivered successfully!');
      } else if (message.status === 'undelivered' || message.status === 'failed') {
        console.log('\n❌ Message not delivered');
        if (message.errorCode === 63016) {
          console.log('   Error 63016: Recipient not in approved contacts');
          console.log('   Solution: Get WhatsApp Business API approval for production');
        }
      }
    }
    
    console.log('\n✅ Test completed!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    if (error.moreInfo) {
      console.error(`   More Info: ${error.moreInfo}`);
    }
  } finally {
    rl.close();
  }
}

testProductionWhatsApp();
