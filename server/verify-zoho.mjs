import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: "smtp.zoho.in",
  port: 465,
  secure: true,
  auth: {
    user: "support@mediqzy.com",
    pass: "Mediqzy@2025".trim()
  }
});

console.log('🧪 Testing Zoho India SMTP...');
console.log('Host: smtp.zoho.in:465 (SSL)');
console.log('User: support@mediqzy.com\n');

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Error:', error.message);
    console.error('\n⚠️  Issue:', error.code);
    
    if (error.code === 'EAUTH') {
      console.log('\n💡 Solutions:');
      console.log('1. Enable IMAP access in Zoho settings');
      console.log('2. Generate app-specific password (if 2FA is ON)');
      console.log('3. Check if password is correct');
      console.log('4. Verify email domain is correct (mediqzy.com)');
    }
  } else {
    console.log('✅ SMTP READY - Authentication successful!');
    console.log('Email delivery will work now.');
  }
  process.exit(error ? 1 : 0);
});
