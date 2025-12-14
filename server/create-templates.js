import { EmailTemplate } from './models/email.model.simple.js';

async function createUserTemplates() {
  console.log('🚀 Creating user management email templates...');
  
  const templates = [
    {
      name: 'User Account Created - Welcome',
      category: 'welcome',
      subject: 'Welcome to Mediczy - Your Account is Ready! 🎉',
      htmlContent: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Mediczy! 🎉</h1>
    <p style="color: #e2e8f0; margin: 10px 0 0 0;">Your healthcare journey starts here</p>
  </div>
  
  <!-- Content -->
  <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h2 style="color: #2d3748; margin: 0 0 15px 0;">Hello {{userName}}!</h2>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0;">
      Congratulations! Your Mediczy account has been successfully created. We are excited to have you join our healthcare platform where you can access top-quality medical services and manage your health efficiently.
    </p>
    
    <!-- Account Details -->
    <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2d3748; margin: 0 0 10px 0; font-size: 16px;">Account Details:</h3>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;"><strong>Email:</strong> {{userEmail}}</p>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;"><strong>Account Created:</strong> {{createdDate}}</p>
    </div>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{loginUrl}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Access Your Account
      </a>
    </div>
    
    <!-- Features -->
    <h3 style="color: #2d3748; margin: 25px 0 15px 0;">What you can do with Mediczy:</h3>
    <ul style="color: #4a5568; line-height: 1.6; padding-left: 20px;">
      <li>Book appointments with verified doctors</li>
      <li>Access telemedicine consultations</li>
      <li>Track your health metrics and vitals</li>
      <li>Manage prescriptions and medical records</li>
      <li>Get AI-powered health insights</li>
    </ul>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 20px 0 0 0;">
      If you have any questions or need assistance, please don't hesitate to contact our support team at 
      <a href="mailto:{{supportEmail}}" style="color: #667eea;">{{supportEmail}}</a>
    </p>
  </div>
  
  <!-- Footer -->
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>This email was sent from Mediczy Healthcare Platform</p>
    <p>© 2024 Mediczy. All rights reserved.</p>
  </div>
</div>`,
      textContent: `Welcome to Mediczy!

Hello {{userName}},

Congratulations! Your Mediczy account has been successfully created on {{createdDate}}.

Account Details:
Email: {{userEmail}}
Created: {{createdDate}}

You can now access your account at: {{loginUrl}}

What you can do with Mediczy:
- Book appointments with verified doctors
- Access telemedicine consultations  
- Track your health metrics and vitals
- Manage prescriptions and medical records
- Get AI-powered health insights

If you need help, contact us at {{supportEmail}}

Best regards,
Mediczy Team`,
      variables: ['userName', 'userEmail', 'createdDate', 'loginUrl', 'supportEmail']
    },
    
    {
      name: 'Email Verification',
      category: 'notification', 
      subject: 'Verify Your Email Address - Mediczy',
      htmlContent: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Verify Your Email 📧</h1>
    <p style="color: #e2e8f0; margin: 10px 0 0 0;">Complete your Mediczy registration</p>
  </div>
  
  <!-- Content -->
  <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h2 style="color: #2d3748; margin: 0 0 15px 0;">Hello {{userName}}!</h2>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0;">
      Thank you for registering with Mediczy! To complete your account setup and ensure the security of your account, please verify your email address by clicking the button below.
    </p>
    
    <!-- Verification Info -->
    <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2d3748; margin: 0 0 10px 0; font-size: 16px;">Email Verification Required</h3>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;">Email: {{userEmail}}</p>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;">This link will expire in {{expirationTime}} hours</p>
    </div>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{verificationLink}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Verify Email Address
      </a>
    </div>
    
    <!-- Alternative Link -->
    <div style="background-color: #fff5f5; border: 1px solid #fed7d7; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="color: #c53030; font-size: 14px; margin: 0 0 10px 0;"><strong>Can't click the button?</strong></p>
      <p style="color: #4a5568; font-size: 12px; margin: 0; word-break: break-all;">Copy and paste this link into your browser: {{verificationLink}}</p>
    </div>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
      If you didn't create an account with Mediczy, please ignore this email.
    </p>
  </div>
  
  <!-- Footer -->
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>This email was sent from Mediczy Healthcare Platform</p>
    <p>© 2024 Mediczy. All rights reserved.</p>
  </div>
</div>`,
      textContent: `Verify Your Email - Mediczy

Hello {{userName}},

Thank you for registering with Mediczy! To complete your account setup, please verify your email address.

Email: {{userEmail}}
Verification link expires in: {{expirationTime}} hours

Click here to verify: {{verificationLink}}

If you can't click the link, copy and paste this URL into your browser:
{{verificationLink}}

If you didn't create an account with Mediczy, please ignore this email.

Best regards,
Mediczy Team`,
      variables: ['userName', 'userEmail', 'verificationLink', 'expirationTime']
    },
    
    {
      name: 'Password Reset Request',
      category: 'notification',
      subject: 'Password Reset Request - Mediczy',
      htmlContent: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset 🔐</h1>
    <p style="color: #e2e8f0; margin: 10px 0 0 0;">Secure your Mediczy account</p>
  </div>
  
  <!-- Content -->
  <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h2 style="color: #2d3748; margin: 0 0 15px 0;">Hello {{userName}}!</h2>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0;">
      We received a request to reset the password for your Mediczy account. If you made this request, click the button below to set a new password.
    </p>
    
    <!-- Reset Info -->
    <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2d3748; margin: 0 0 10px 0; font-size: 16px;">Password Reset Details</h3>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;">Account: {{userEmail}}</p>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;">Request Time: {{requestTime}}</p>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;">Link expires in: {{expirationTime}} hours</p>
    </div>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{resetLink}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Reset Password
      </a>
    </div>
    
    <!-- Security Warning -->
    <div style="background-color: #fff5f5; border: 1px solid #fed7d7; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="color: #c53030; font-size: 14px; margin: 0 0 10px 0;"><strong>Important Security Information:</strong></p>
      <ul style="color: #4a5568; font-size: 12px; margin: 0; padding-left: 15px;">
        <li>This link will expire in {{expirationTime}} hours</li>
        <li>If you didn't request this reset, please ignore this email</li>
        <li>Your password will remain unchanged if you don't click the link</li>
        <li>Contact support if you have concerns about your account security</li>
      </ul>
    </div>
    
    <!-- Alternative Link -->
    <div style="border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="color: #2d3748; font-size: 14px; margin: 0 0 10px 0;"><strong>Can't click the button?</strong></p>
      <p style="color: #4a5568; font-size: 12px; margin: 0; word-break: break-all;">Copy and paste this link: {{resetLink}}</p>
    </div>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
      Need help? Contact our support team at <a href="mailto:{{supportEmail}}" style="color: #667eea;">{{supportEmail}}</a>
    </p>
  </div>
  
  <!-- Footer -->
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>This email was sent from Mediczy Healthcare Platform</p>
    <p>© 2024 Mediczy. All rights reserved.</p>
  </div>
</div>`,
      textContent: `Password Reset Request - Mediczy

Hello {{userName}},

We received a request to reset the password for your Mediczy account.

Account: {{userEmail}}
Request Time: {{requestTime}}
Link expires in: {{expirationTime}} hours

To reset your password, click here: {{resetLink}}

If you can't click the link, copy and paste this URL into your browser:
{{resetLink}}

IMPORTANT SECURITY INFORMATION:
- This link will expire in {{expirationTime}} hours
- If you didn't request this reset, please ignore this email
- Your password will remain unchanged if you don't use the link
- Contact support if you have concerns about account security

Need help? Contact us at {{supportEmail}}

Best regards,
Mediczy Team`,
      variables: ['userName', 'userEmail', 'resetLink', 'requestTime', 'expirationTime', 'supportEmail']
    },
    
    {
      name: 'Team Member Welcome',
      category: 'welcome',
      subject: 'Welcome to the Mediczy Team! 👩‍⚕️👨‍⚕️',
      htmlContent: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to the Team! 👩‍⚕️👨‍⚕️</h1>
    <p style="color: #e2e8f0; margin: 10px 0 0 0;">Join the Mediczy healthcare revolution</p>
  </div>
  
  <!-- Content -->
  <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h2 style="color: #2d3748; margin: 0 0 15px 0;">Welcome {{memberName}}!</h2>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0;">
      Congratulations! Your Mediczy team member account has been created. We are thrilled to have you join our dedicated healthcare team as a <strong>{{role}}</strong>.
    </p>
    
    <!-- Account Details -->
    <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2d3748; margin: 0 0 10px 0; font-size: 16px;">Team Member Details:</h3>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;"><strong>Email:</strong> {{memberEmail}}</p>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;"><strong>Role:</strong> {{role}}</p>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;"><strong>Department:</strong> {{department}}</p>
      <p style="color: #4a5568; margin: 5px 0; font-size: 14px;"><strong>Start Date:</strong> {{startDate}}</p>
    </div>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{loginUrl}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Access Team Portal
      </a>
    </div>
    
    <!-- Features for Team -->
    <h3 style="color: #2d3748; margin: 25px 0 15px 0;">Your team access includes:</h3>
    <ul style="color: #4a5568; line-height: 1.6; padding-left: 20px;">
      <li>Patient management dashboard</li>
      <li>Appointment scheduling system</li>
      <li>Medical records access</li>
      <li>Team communication tools</li>
      <li>Analytics and reporting</li>
      <li>Continuing education resources</li>
    </ul>
    
    <!-- Next Steps -->
    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <h4 style="color: #0c4a6e; margin: 0 0 10px 0; font-size: 14px;">🚀 Next Steps:</h4>
      <ol style="color: #4a5568; font-size: 14px; margin: 0; padding-left: 15px;">
        <li>Complete your profile setup</li>
        <li>Review team policies and procedures</li>
        <li>Join the team orientation session</li>
        <li>Set up your patient schedules</li>
      </ol>
    </div>
    
    <p style="color: #4a5568; line-height: 1.6; margin: 20px 0 0 0;">
      Questions? Contact your team lead at <a href="mailto:{{teamLeadEmail}}" style="color: #667eea;">{{teamLeadEmail}}</a> or our HR team at <a href="mailto:{{hrEmail}}" style="color: #667eea;">{{hrEmail}}</a>
    </p>
  </div>
  
  <!-- Footer -->
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>This email was sent from Mediczy Healthcare Platform</p>
    <p>© 2024 Mediczy. All rights reserved.</p>
  </div>
</div>`,
      textContent: `Welcome to the Mediczy Team!

Welcome {{memberName}},

Congratulations! Your Mediczy team member account has been created.

Team Member Details:
Email: {{memberEmail}}
Role: {{role}}
Department: {{department}}
Start Date: {{startDate}}

Access your team portal at: {{loginUrl}}

Your team access includes:
- Patient management dashboard
- Appointment scheduling system  
- Medical records access
- Team communication tools
- Analytics and reporting
- Continuing education resources

Next Steps:
1. Complete your profile setup
2. Review team policies and procedures
3. Join the team orientation session
4. Set up your patient schedules

Questions? Contact:
Team Lead: {{teamLeadEmail}}
HR Team: {{hrEmail}}

Welcome to the team!
Mediczy Management`,
      variables: ['memberName', 'memberEmail', 'role', 'department', 'startDate', 'loginUrl', 'teamLeadEmail', 'hrEmail']
    }
  ];
  
  try {
    const results = [];
    
    for (const templateData of templates) {
      console.log(`📝 Creating template: ${templateData.name}`);
      const template = await EmailTemplate.create(templateData);
      results.push(template);
      console.log(`✅ Created: ${template.name} (ID: ${template.id})`);
    }
    
    console.log(`\n🎉 Successfully created ${results.length} email templates!`);
    
    // Verify by listing all templates
    const allTemplates = await EmailTemplate.find();
    console.log(`\n📊 Total templates in system: ${allTemplates.length}`);
    allTemplates.forEach(t => console.log(`   - ${t.name} (${t.category})`));
    
    return results;
    
  } catch (error) {
    console.error('❌ Error creating templates:', error);
  }
}

createUserTemplates();