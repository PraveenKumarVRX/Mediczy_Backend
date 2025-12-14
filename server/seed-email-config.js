import './models/email.model.simple.js';
import { EmailConfig } from './models/email.model.simple.js';

(async () => {
  try {
    console.log('🔍 Checking for email configurations...');
    
    // Check if email config exists
    const existingConfig = await EmailConfig.findOne({ fromEmail: 'notification@mayden.in' });
    
    if (existingConfig) {
      console.log('✅ Email configuration already exists:');
      console.log('📧 From Email:', existingConfig.fromEmail);
      console.log('📛 From Name:', existingConfig.fromName);
      console.log('🖥️  SMTP Host:', existingConfig.host);
      console.log('🔌 Port:', existingConfig.port);
      console.log('🔒 Encryption:', existingConfig.secure ? 'SSL' : 'TLS');
      console.log('✨ Status:', existingConfig.isActive ? 'Active' : 'Inactive');
      console.log('⭐ Default:', existingConfig.isDefault ? 'Yes' : 'No');
    } else {
      console.log('📝 No email configuration found. Creating default Zoho configuration...');
      
      const config = new EmailConfig({
        name: 'Zoho Pro SMTP (Default)',
        host: 'smtppro.zoho.in',
        port: 465,
        secure: true, // SSL
        username: 'notification@mayden.in',
        password: process.env.SMTP_PASSWORD || 'YOUR_PASSWORD_HERE',
        fromEmail: 'notification@mayden.in',
        fromName: 'Mayden Notifications',
        isDefault: true,
        isActive: true,
        replyTo: '',
        rateLimits: {
          perHour: 100,
          perDay: 1000,
          perMonth: 30000
        },
        provider: 'Zoho Professional Mail',
        testResult: {
          success: true,
          message: 'Configuration created - please test'
        },
        createdBy: 'system-seed'
      });
      
      await config.save();
      
      console.log('✅ Email configuration created successfully!');
      console.log('📧 From Email: notification@mayden.in');
      console.log('📛 From Name: Mayden Notifications');
      console.log('🖥️  SMTP Host: smtppro.zoho.in');
      console.log('🔌 Port: 465 (SSL)');
      console.log('⚠️  Note: Please update the password in the Email Management section');
      console.log('');
      console.log('🔐 To set password via environment:');
      console.log('   SMTP_PASSWORD=your_password node server/seed-email-config.js');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
