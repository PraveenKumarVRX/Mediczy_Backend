import dotenv from 'dotenv';
import twilio from 'twilio';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupProduction() {
  console.log('\n🚀 WhatsApp Business Production Setup\n');
  console.log('This wizard will help you configure your approved WhatsApp Business account\n');
  
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      console.log('❌ Twilio credentials not found in .env file');
      rl.close();
      return;
    }
    
    const client = twilio(accountSid, authToken);
    
    // Verify account
    console.log('📋 Step 1: Verifying Twilio account...');
    const account = await client.api.v2010.accounts(accountSid).fetch();
    console.log(`✅ Account: ${account.friendlyName} (${account.status})\n`);
    
    // List WhatsApp senders
    console.log('📱 Step 2: Checking WhatsApp Business Profile...');
    try {
      const senders = await client.messaging.v1.services.list({ limit: 20 });
      const whatsappSenders = senders.filter(s => 
        s.friendlyName && s.friendlyName.toLowerCase().includes('whatsapp')
      );
      
      if (whatsappSenders.length > 0) {
        console.log('✅ WhatsApp Business Profile found:');
        whatsappSenders.forEach(sender => {
          console.log(`   - ${sender.friendlyName}`);
          console.log(`     SID: ${sender.sid}`);
        });
      }
    } catch (error) {
      console.log('⚠️  Could not fetch WhatsApp senders (this is OK)');
    }
    
    // List phone numbers
    console.log('\n📞 Step 3: Available Phone Numbers:');
    const phoneNumbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    phoneNumbers.forEach((num, idx) => {
      console.log(`   ${idx + 1}. ${num.phoneNumber} - ${num.friendlyName}`);
    });
    
    // Get WhatsApp number
    console.log('\n💬 Enter your WhatsApp Business number:');
    console.log('   (Format: +91XXXXXXXXXX or select from list above)');
    const whatsappNumber = await question('WhatsApp Number: ');
    
    // List approved templates
    console.log('\n📋 Step 4: Fetching Approved Templates...');
    let templates = [];
    try {
      templates = await client.content.v1.contents.list({ limit: 50 });
      
      if (templates.length > 0) {
        console.log(`✅ Found ${templates.length} approved template(s):\n`);
        templates.forEach((template, index) => {
          console.log(`${index + 1}. ${template.friendlyName}`);
          console.log(`   SID: ${template.sid}`);
          console.log(`   Language: ${template.language || 'en'}`);
          
          // Show variables if available
          if (template.types && template.types.twilio_text) {
            const body = template.types.twilio_text.body;
            if (body) {
              const variables = body.match(/\{\{(\d+)\}\}/g);
              if (variables) {
                console.log(`   Variables: ${variables.join(', ')}`);
              }
            }
          }
          console.log('');
        });
      } else {
        console.log('⚠️  No templates found. Please create templates in Twilio Console.');
      }
    } catch (error) {
      console.log('⚠️  Could not fetch templates:', error.message);
    }
    
    // Map templates
    console.log('\n🔗 Step 5: Map Your Templates\n');
    console.log('Enter the Template SID (HXxxxxx...) for each message type.');
    console.log('Press Enter to skip any template.\n');
    
    const templateMappings = {
      appointmentConfirmation: '',
      appointmentReminder: '',
      healthReport: '',
      prescription: '',
      otp: '',
      checkupReminder: '',
      kioskRegister: ''
    };
    
    const templateDescriptions = {
      appointmentConfirmation: 'Appointment Confirmation (confirms booking with date/time/location)',
      appointmentReminder: 'Appointment Reminder (24hr reminder)',
      healthReport: 'Health Report Ready (notifies report availability)',
      prescription: 'Prescription Notification (notifies prescription ready)',
      otp: 'OTP Verification (sends verification code)',
      checkupReminder: 'Health Checkup Reminder (reminds about annual checkup)',
      kioskRegister: 'Kiosk registration invite (hospital name + expiry + secure link URL)'
    };
    
    for (const [key, desc] of Object.entries(templateDescriptions)) {
      const sid = await question(`${desc}\nTemplate SID: `);
      templateMappings[key] = sid.trim();
    }
    
    // Generate .env configuration
    console.log('\n\n✅ Configuration Complete!\n');
    console.log('='.repeat(70));
    console.log('ADD THESE TO YOUR .env FILE:');
    console.log('='.repeat(70));
    console.log('');
    console.log(`TWILIO_WHATSAPP_NUMBER=whatsapp:${whatsappNumber}`);
    console.log('');
    console.log('# WhatsApp Production Templates');
    console.log(`WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION=${templateMappings.appointmentConfirmation}`);
    console.log(`WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=${templateMappings.appointmentReminder}`);
    console.log(`WHATSAPP_TEMPLATE_HEALTH_REPORT=${templateMappings.healthReport}`);
    console.log(`WHATSAPP_TEMPLATE_PRESCRIPTION=${templateMappings.prescription}`);
    console.log(`WHATSAPP_TEMPLATE_OTP=${templateMappings.otp}`);
    console.log(`WHATSAPP_TEMPLATE_CHECKUP_REMINDER=${templateMappings.checkupReminder}`);
    console.log(`WHATSAPP_TEMPLATE_KIOSK_REGISTER=${templateMappings.kioskRegister}`);
    console.log('WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=text');
    console.log('');
    console.log('='.repeat(70));
    
    // Ask if should update .env automatically
    console.log('\n');
    const shouldUpdate = await question('Would you like to automatically update .env file? (yes/no): ');
    
    if (shouldUpdate.toLowerCase() === 'yes' || shouldUpdate.toLowerCase() === 'y') {
      const fs = await import('fs');
      let envContent = fs.readFileSync('.env', 'utf-8');
      
      // Update WhatsApp number
      if (envContent.includes('TWILIO_WHATSAPP_NUMBER=')) {
        envContent = envContent.replace(
          /TWILIO_WHATSAPP_NUMBER=.*/,
          `TWILIO_WHATSAPP_NUMBER=whatsapp:${whatsappNumber}`
        );
      }
      
      // Update templates
      envContent = envContent.replace(
        /WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION=.*/,
        `WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION=${templateMappings.appointmentConfirmation}`
      );
      envContent = envContent.replace(
        /WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=.*/,
        `WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=${templateMappings.appointmentReminder}`
      );
      envContent = envContent.replace(
        /WHATSAPP_TEMPLATE_HEALTH_REPORT=.*/,
        `WHATSAPP_TEMPLATE_HEALTH_REPORT=${templateMappings.healthReport}`
      );
      envContent = envContent.replace(
        /WHATSAPP_TEMPLATE_PRESCRIPTION=.*/,
        `WHATSAPP_TEMPLATE_PRESCRIPTION=${templateMappings.prescription}`
      );
      envContent = envContent.replace(
        /WHATSAPP_TEMPLATE_OTP=.*/,
        `WHATSAPP_TEMPLATE_OTP=${templateMappings.otp}`
      );
      envContent = envContent.replace(
        /WHATSAPP_TEMPLATE_CHECKUP_REMINDER=.*/,
        `WHATSAPP_TEMPLATE_CHECKUP_REMINDER=${templateMappings.checkupReminder}`
      );
      
      fs.writeFileSync('.env', envContent);
      console.log('✅ .env file updated successfully!\n');
    }
    
    // Test option
    console.log('\n📤 Next Steps:');
    console.log('1. Restart your server to load new configuration');
    console.log('2. Test with: node test-production-whatsapp.js');
    console.log('3. Send real messages via API: POST /api/whatsapp-production/send/...');
    console.log('4. Configure webhook in Twilio Console:');
    console.log('   URL: https://mayden.in:9443/api/whatsapp-production/webhook');
    console.log('   Method: POST\n');
    
    console.log('✅ Production WhatsApp is ready to use!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
  } finally {
    rl.close();
  }
}

setupProduction();
