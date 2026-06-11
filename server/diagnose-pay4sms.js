import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function diagnosePay4SMS() {
  console.log('🔍 Pay4SMS Diagnostics\n');
  
  const token = process.env.PAY4SMS_TOKEN;
  const sender = process.env.PAY4SMS_SENDER_ID;
  const phone = process.env.PAY4SMS_TEST_PHONE;
  const templateIds = String(process.env.PAY4SMS_TEMPLATE_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (!token || !sender || !phone || templateIds.length === 0) {
    throw new Error('PAY4SMS_TOKEN, PAY4SMS_SENDER_ID, PAY4SMS_TEST_PHONE, and PAY4SMS_TEMPLATE_IDS are required');
  }
  
  // Test different template IDs
  const templates = templateIds.map((id, index) => ({ id, name: `Template ${index + 1}` }));
  
  console.log('Testing different template IDs:\n');
  
  for (const template of templates) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${template.name}`);
    console.log(`Template ID: ${template.id}\n`);
    
    try {
      const message = '123456 is your One Time Password to login with your My Smart Health Account. Don\'t Share this with anyone.';
      
      const response = await axios.get('http://pay4sms.in/sendsms/', {
        params: {
          token: token,
          credit: '2',
          sender: sender,
          message: message,
          number: phone,
          templateid: template.id
        }
      });
      
      console.log('✅ Response:', JSON.stringify(response.data, null, 2));
      
      if (Array.isArray(response.data)) {
        const status = response.data[0][2];
        const msgId = response.data[0][1];
        console.log(`Status: ${status}`);
        console.log(`Message ID: ${msgId}`);
        
        if (status === 'Sent') {
          console.log('⏳ Waiting 5 seconds to check delivery...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const dlrResponse = await axios.get('http://pay4sms.in/Dlrcheck/', {
            params: {
              token: token,
              msgid: msgId
            }
          });
          
          console.log('📊 DLR Status:', JSON.stringify(dlrResponse.data, null, 2));
        }
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
    }
  }
  
  // Check account info
  console.log('\n' + '='.repeat(60));
  console.log('\n💰 Checking Account Balance:\n');
  
  try {
    const balanceResponse = await axios.get('http://pay4sms.in/Credit-Balance/', {
      params: {
        token: token,
        credit: '2'
      }
    });
    
    console.log('Balance:', JSON.stringify(balanceResponse.data, null, 2));
  } catch (error) {
    console.error('Error checking balance:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Recommendations:\n');
  console.log('1. Verify template IDs are correct in Pay4SMS dashboard');
  console.log('2. Ensure the configured sender ID is linked to the templates');
  console.log('3. Check if templates are in "Active" status');
  console.log('4. Verify DLT registration is complete');
  console.log('5. Contact Pay4SMS support if all messages show "Expired"');
  console.log('\n📞 Pay4SMS Support: Check their dashboard or contact support');
}

diagnosePay4SMS()
  .then(() => {
    console.log('\n✅ Diagnostics completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostics failed:', error);
    process.exit(1);
  });
