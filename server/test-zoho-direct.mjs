import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 587,
  secure: false,
  auth: {
    user: 'support@mediqzy.com',
    pass: 'Mediqzy'
  },
  debug: true,
  logger: true
});

console.log('Testing Zoho SMTP with app password...');
transporter.verify()
  .then(() => {
    console.log('✅ SUCCESS! SMTP connection verified');
    return transporter.sendMail({
      from: '"Mediczy Support" <support@mediqzy.com>',
      to: 'testuser2025@mediczy.com',
      subject: 'Test Email - Forgot Password',
      text: 'This is a test email to verify SMTP is working.'
    });
  })
  .then(info => {
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ SMTP Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  });
