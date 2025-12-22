import nodemailer from 'nodemailer';

// Test both TLS (587) and SSL (465) configurations
async function testZohoSMTP() {
  const configs = [
    {
      name: 'Zoho TLS (Port 587)',
      host: 'smtp.zoho.com',
      port: 587,
      secure: false,
      auth: {
        user: 'support@mediqzy.com',
        pass: 'Mediqzy@2025'
      }
    },
    {
      name: 'Zoho SSL (Port 465)',
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: {
        user: 'support@mediqzy.com',
        pass: 'Mediqzy@2025'
      }
    }
  ];

  for (const config of configs) {
    console.log(`\n🧪 Testing: ${config.name}`);
    console.log(`   Host: ${config.host}:${config.port}`);
    console.log(`   User: ${config.auth.user}`);
    
    try {
      const transporter = nodemailer.createTransport(config);
      await transporter.verify();
      console.log(`   ✅ SUCCESS - SMTP connection verified!`);
      return config;
    } catch (error) {
      console.log(`   ❌ FAILED - ${error.message}`);
    }
  }
  
  return null;
}

testZohoSMTP().then(result => {
  if (result) {
    console.log('\n✅ Working configuration found!');
    console.log(`   Use port: ${result.port}`);
    console.log(`   Use secure: ${result.secure}`);
  } else {
    console.log('\n❌ All configurations failed');
    console.log('\nPossible issues:');
    console.log('1. Password is incorrect');
    console.log('2. Need app-specific password from Zoho');
    console.log('3. SMTP access not enabled in Zoho account');
    console.log('4. Account requires 2FA app password');
  }
  process.exit(result ? 0 : 1);
});
