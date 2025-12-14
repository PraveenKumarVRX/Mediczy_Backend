import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function listTemplatesDetailed() {
  console.log('\n📋 Your Approved WhatsApp Templates\n');
  console.log('='.repeat(80));
  
  try {
    const templates = await client.content.v1.contents.list({ limit: 50 });
    
    if (templates.length === 0) {
      console.log('No templates found.');
      return;
    }
    
    console.log(`Found ${templates.length} template(s)\n`);
    
    // Filter for your custom templates (not Twilio samples)
    const customTemplates = templates.filter(t => 
      !t.friendlyName.startsWith('sample_') && 
      t.language === 'en' || t.language === 'en_US'
    );
    
    console.log('YOUR CUSTOM TEMPLATES:\n');
    customTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.friendlyName}`);
      console.log(`   SID: ${template.sid}`);
      console.log(`   Language: ${template.language}`);
      console.log(`   Status: ${template.approvalRequests?.status || 'Approved'}`);
      
      // Try to show template body
      if (template.types) {
        if (template.types.twilio_text) {
          console.log(`   Body: ${template.types.twilio_text.body}`);
        }
        if (template.types['twilio/text']) {
          console.log(`   Body: ${template.types['twilio/text'].body}`);
        }
      }
      console.log('');
    });
    
    // Show mapping suggestions
    console.log('\n' + '='.repeat(80));
    console.log('RECOMMENDED TEMPLATE MAPPING:\n');
    
    const mappingSuggestions = {
      'otp_verification': 'WHATSAPP_TEMPLATE_OTP',
      'appointment': 'WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION or REMINDER',
      'health': 'WHATSAPP_TEMPLATE_HEALTH_REPORT',
      'prescription': 'WHATSAPP_TEMPLATE_PRESCRIPTION',
      'checkup': 'WHATSAPP_TEMPLATE_CHECKUP_REMINDER'
    };
    
    customTemplates.forEach(template => {
      const name = template.friendlyName.toLowerCase();
      for (const [keyword, envVar] of Object.entries(mappingSuggestions)) {
        if (name.includes(keyword)) {
          console.log(`${template.friendlyName} → ${envVar}`);
          console.log(`   ${envVar}=${template.sid}`);
          console.log('');
        }
      }
    });
    
    console.log('='.repeat(80));
    console.log('\n💡 INSTRUCTIONS:\n');
    console.log('1. Look for templates matching these names:');
    console.log('   - appointment_confirmation or appointment_booking');
    console.log('   - appointment_reminder');
    console.log('   - health_report or report_ready');
    console.log('   - prescription_ready or prescription_notification');
    console.log('   - otp_verification or verification_code');
    console.log('   - checkup_reminder or annual_checkup\n');
    console.log('2. Copy the SID (HXxxxxx...) for each template');
    console.log('3. Update .env file with correct SIDs\n');
    
    // Show all templates for reference
    console.log('\n' + '='.repeat(80));
    console.log('ALL TEMPLATES (including samples):\n');
    templates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.friendlyName} - ${template.sid}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listTemplatesDetailed();
