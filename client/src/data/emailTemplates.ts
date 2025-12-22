export interface EmailTemplateVariable {
  name: string;
  description: string;
  example: string;
  required: boolean;
}

export interface EmailTemplateData {
  id: string;
  name: string;
  category: 'notification' | 'welcome' | 'reminder' | 'billing' | 'system';
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: EmailTemplateVariable[];
  description: string;
  isDefault: boolean;
}

export const defaultEmailTemplates: EmailTemplateData[] = [
  {
    id: 'welcome-user',
    name: 'User Welcome Email',
    category: 'welcome',
    subject: 'Welcome to Mediczy, {{user_name}}!',
    description: 'Welcome email sent to new users upon registration',
    isDefault: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Mediczy</title>
  <style>
    .email-container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; }
    .content { padding: 40px 20px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>Welcome to Mediczy!</h1>
    </div>
    <div class="content">
      <h2>Hello {{user_name}},</h2>
      <p>Welcome to the Mediczy healthcare platform! We're excited to have you join our community of patients and healthcare providers.</p>
      
      <p><strong>What you can do now:</strong></p>
      <ul>
        <li>Complete your health profile</li>
        <li>Book appointments with doctors</li>
        <li>Track your health metrics</li>
        <li>Access AI-powered health insights</li>
        <li>Connect with healthcare providers</li>
      </ul>
      
      <p>To get started, click the button below:</p>
      <p style="text-align: center;">
        <a href="{{login_url}}" class="button">Get Started</a>
      </p>
      
      <p>If you have any questions, our support team is here to help at support@mediczy.com</p>
      
      <p>Best regards,<br><strong>The Mediczy Team</strong></p>
    </div>
    <div class="footer">
      <p>&copy; 2025 Mediczy. All rights reserved.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Welcome to Mediczy!

Hello {{user_name}},

Welcome to the Mediczy healthcare platform! We're excited to have you join our community.

What you can do now:
- Complete your health profile
- Book appointments with doctors  
- Track your health metrics
- Access AI-powered health insights
- Connect with healthcare providers

To get started, visit: {{login_url}}

If you have any questions, contact us at support@mediczy.com

Best regards,
The Mediczy Team

© 2025 Mediczy. All rights reserved.
    `,
    variables: [
      { name: 'user_name', description: 'User\'s full name', example: 'John Doe', required: true },
      { name: 'login_url', description: 'Login page URL', example: 'https://mediczy.com/login', required: true }
    ]
  },
  {
    id: 'appointment-reminder',
    name: 'Appointment Reminder',
    category: 'reminder',
    subject: 'Appointment Reminder - {{appointment_date}} with Dr. {{doctor_name}}',
    description: 'Reminder email sent 24 hours before scheduled appointments',
    isDefault: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Appointment Reminder</title>
  <style>
    .email-container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
    .header { background: #28a745; color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px 20px; }
    .appointment-card { border: 2px solid #28a745; border-radius: 10px; padding: 20px; margin: 20px 0; background: #f8fff9; }
    .appointment-detail { margin: 10px 0; }
    .button { display: inline-block; padding: 12px 25px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
    .button.secondary { background: #6c757d; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🩺 Appointment Reminder</h1>
    </div>
    <div class="content">
      <h2>Hello {{patient_name}},</h2>
      <p>This is a friendly reminder of your upcoming appointment:</p>
      
      <div class="appointment-card">
        <div class="appointment-detail"><strong>👨‍⚕️ Doctor:</strong> Dr. {{doctor_name}}</div>
        <div class="appointment-detail"><strong>📅 Date:</strong> {{appointment_date}}</div>
        <div class="appointment-detail"><strong>⏰ Time:</strong> {{appointment_time}}</div>
        <div class="appointment-detail"><strong>📍 Location:</strong> {{location}}</div>
        <div class="appointment-detail"><strong>💼 Type:</strong> {{appointment_type}}</div>
      </div>
      
      <p><strong>Important Reminders:</strong></p>
      <ul>
        <li>Please arrive 15 minutes before your scheduled time</li>
        <li>Bring a valid ID and insurance card</li>
        <li>Bring any relevant medical records or reports</li>
        <li>List of current medications you're taking</li>
      </ul>
      
      <p style="text-align: center;">
        <a href="{{reschedule_url}}" class="button secondary">Reschedule</a>
        <a href="{{cancel_url}}" class="button secondary">Cancel</a>
      </p>
      
      <p>If you have any questions, please contact us at {{contact_phone}} or {{contact_email}}</p>
      
      <p>Best regards,<br><strong>Mediczy Healthcare</strong></p>
    </div>
    <div class="footer">
      <p>&copy; 2025 Mediczy. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Appointment Reminder

Hello {{patient_name}},

This is a reminder of your upcoming appointment:

Doctor: Dr. {{doctor_name}}
Date: {{appointment_date}}
Time: {{appointment_time}}
Location: {{location}}
Type: {{appointment_type}}

Important Reminders:
- Arrive 15 minutes early
- Bring ID and insurance card
- Bring medical records/reports
- List current medications

To reschedule: {{reschedule_url}}
To cancel: {{cancel_url}}

Questions? Contact us at {{contact_phone}} or {{contact_email}}

Best regards,
Mediczy Healthcare
    `,
    variables: [
      { name: 'patient_name', description: 'Patient\'s name', example: 'John Doe', required: true },
      { name: 'doctor_name', description: 'Doctor\'s name', example: 'Sarah Johnson', required: true },
      { name: 'appointment_date', description: 'Appointment date', example: 'November 20, 2025', required: true },
      { name: 'appointment_time', description: 'Appointment time', example: '2:30 PM', required: true },
      { name: 'location', description: 'Appointment location', example: 'Mediczy Clinic, Room 201', required: true },
      { name: 'appointment_type', description: 'Type of appointment', example: 'General Consultation', required: true },
      { name: 'reschedule_url', description: 'Reschedule appointment URL', example: 'https://mediczy.com/reschedule/123', required: false },
      { name: 'cancel_url', description: 'Cancel appointment URL', example: 'https://mediczy.com/cancel/123', required: false },
      { name: 'contact_phone', description: 'Contact phone number', example: '+1-555-0123', required: false },
      { name: 'contact_email', description: 'Contact email address', example: 'support@mediczy.com', required: false }
    ]
  },
  {
    id: 'payment-due',
    name: 'Payment Due Notice',
    category: 'billing',
    subject: '💳 Payment Due - Invoice #{{invoice_number}} (₹{{amount}})',
    description: 'Payment reminder email for outstanding invoices',
    isDefault: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Due Notice</title>
  <style>
    .email-container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
    .header { background: #ffc107; color: #212529; padding: 30px 20px; text-align: center; }
    .content { padding: 30px 20px; }
    .invoice-card { border: 2px solid #ffc107; border-radius: 10px; padding: 20px; margin: 20px 0; background: #fffdf0; }
    .amount { font-size: 24px; font-weight: bold; color: #dc3545; }
    .button { display: inline-block; padding: 15px 30px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>💳 Payment Due Notice</h1>
    </div>
    <div class="content">
      <h2>Dear {{client_name}},</h2>
      <p>This is a friendly reminder that payment for the following invoice is due:</p>
      
      <div class="invoice-card">
        <div><strong>📄 Invoice Number:</strong> #{{invoice_number}}</div>
        <div><strong>📅 Due Date:</strong> {{due_date}}</div>
        <div><strong>💰 Amount Due:</strong> <span class="amount">₹{{amount}}</span></div>
        <div><strong>📋 Description:</strong> {{description}}</div>
      </div>
      
      <p><strong>Payment Options:</strong></p>
      <ul>
        <li>Online payment through our secure portal</li>
        <li>Bank transfer to our account</li>
        <li>UPI payment using our QR code</li>
        <li>Credit/Debit card payment</li>
      </ul>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{payment_url}}" class="button">Pay Now - ₹{{amount}}</a>
      </p>
      
      <p><strong>Important:</strong> To avoid any service interruption, please make the payment by {{due_date}}.</p>
      
      <p>If you have already made the payment, please disregard this notice. If you have any questions about this invoice, please contact our billing department at {{billing_email}} or {{billing_phone}}.</p>
      
      <p>Thank you for choosing Mediczy.</p>
      
      <p>Best regards,<br><strong>Mediczy Billing Department</strong></p>
    </div>
    <div class="footer">
      <p>&copy; 2025 Mediczy. All rights reserved.</p>
      <p>This is an automated notice. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Payment Due Notice

Dear {{client_name}},

This is a reminder that payment for the following invoice is due:

Invoice Number: #{{invoice_number}}
Due Date: {{due_date}}
Amount Due: ₹{{amount}}
Description: {{description}}

Payment Options:
- Online payment through our portal
- Bank transfer
- UPI payment
- Credit/Debit card

Pay now: {{payment_url}}

Important: Please make payment by {{due_date}} to avoid service interruption.

If you've already paid, please disregard this notice.

Questions? Contact billing at {{billing_email}} or {{billing_phone}}

Thank you for choosing Mediczy.

Best regards,
Mediczy Billing Department
    `,
    variables: [
      { name: 'client_name', description: 'Client\'s name', example: 'John Doe', required: true },
      { name: 'invoice_number', description: 'Invoice number', example: 'INV-2025-001', required: true },
      { name: 'due_date', description: 'Payment due date', example: 'December 1, 2025', required: true },
      { name: 'amount', description: 'Amount due', example: '5,000', required: true },
      { name: 'description', description: 'Invoice description', example: 'Monthly Healthcare Subscription', required: true },
      { name: 'payment_url', description: 'Payment portal URL', example: 'https://mediczy.com/pay/inv-123', required: true },
      { name: 'billing_email', description: 'Billing contact email', example: 'billing@mediczy.com', required: false },
      { name: 'billing_phone', description: 'Billing contact phone', example: '+1-555-0123', required: false }
    ]
  },
  {
    id: 'password-reset',
    name: 'Password Reset',
    category: 'system',
    subject: '🔐 Password Reset Request for Mediczy',
    description: 'Password reset email with secure reset link',
    isDefault: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Reset</title>
  <style>
    .email-container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
    .header { background: #dc3545; color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px 20px; }
    .security-notice { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0; }
    .button { display: inline-block; padding: 15px 30px; background: #dc3545; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
    .expiry-warning { color: #dc3545; font-weight: bold; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🔐 Password Reset Request</h1>
    </div>
    <div class="content">
      <h2>Hello {{user_name}},</h2>
      <p>We received a request to reset your password for your Mediczy account.</p>
      
      <div class="security-notice">
        <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
      </div>
      
      <p>To reset your password, click the button below:</p>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="{{reset_url}}" class="button">Reset Your Password</a>
      </p>
      
      <p class="expiry-warning">⏰ This link will expire in {{expiry_hours}} hours for security reasons.</p>
      
      <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
      <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px;">{{reset_url}}</p>
      
      <p><strong>Security Tips:</strong></p>
      <ul>
        <li>Choose a strong password with at least 8 characters</li>
        <li>Include uppercase and lowercase letters, numbers, and symbols</li>
        <li>Don't use personal information in your password</li>
        <li>Don't share your password with anyone</li>
      </ul>
      
      <p>If you continue to have trouble, please contact our support team at {{support_email}}</p>
      
      <p>Best regards,<br><strong>Mediczy Security Team</strong></p>
    </div>
    <div class="footer">
      <p>&copy; 2025 Mediczy. All rights reserved.</p>
      <p>This email was sent from a secure server. Please don't reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Password Reset Request

Hello {{user_name}},

We received a request to reset your password for your Mediczy account.

SECURITY NOTICE: If you didn't request this, please ignore this email.

To reset your password, visit: {{reset_url}}

This link expires in {{expiry_hours}} hours.

Security Tips:
- Choose a strong password (8+ characters)
- Include letters, numbers, and symbols
- Don't use personal information
- Keep your password private

Need help? Contact {{support_email}}

Best regards,
Mediczy Security Team

© 2025 Mediczy. All rights reserved.
    `,
    variables: [
      { name: 'user_name', description: 'User\'s name', example: 'John Doe', required: true },
      { name: 'reset_url', description: 'Password reset URL', example: 'https://mediczy.com/reset/abc123', required: true },
      { name: 'expiry_hours', description: 'Link expiry time in hours', example: '24', required: true },
      { name: 'support_email', description: 'Support contact email', example: 'support@mediczy.com', required: false }
    ]
  },
  {
    id: 'system-maintenance',
    name: 'System Maintenance Notice',
    category: 'system',
    subject: '🔧 Scheduled Maintenance - {{maintenance_date}}',
    description: 'Notification about scheduled system maintenance',
    isDefault: true,
    htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>System Maintenance Notice</title>
  <style>
    .email-container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
    .header { background: #6f42c1; color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px 20px; }
    .maintenance-card { border: 2px solid #6f42c1; border-radius: 10px; padding: 20px; margin: 20px 0; background: #f8f7ff; }
    .impact-warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🔧 Scheduled System Maintenance</h1>
    </div>
    <div class="content">
      <h2>Dear {{user_name}},</h2>
      <p>We want to inform you about upcoming scheduled maintenance on the Mediczy platform:</p>
      
      <div class="maintenance-card">
        <div><strong>📅 Date:</strong> {{maintenance_date}}</div>
        <div><strong>⏰ Time:</strong> {{maintenance_time}}</div>
        <div><strong>⏳ Duration:</strong> {{estimated_duration}}</div>
        <div><strong>🎯 Purpose:</strong> {{maintenance_purpose}}</div>
      </div>
      
      <div class="impact-warning">
        <strong>⚠️ Service Impact:</strong> {{service_impact}}
      </div>
      
      <p><strong>What to expect:</strong></p>
      <ul>
        <li>{{impact_detail_1}}</li>
        <li>{{impact_detail_2}}</li>
        <li>{{impact_detail_3}}</li>
      </ul>
      
      <p><strong>What you can do:</strong></p>
      <ul>
        <li>Complete any urgent tasks before the maintenance window</li>
        <li>Download any important reports or data you might need</li>
        <li>Schedule appointments outside the maintenance window</li>
      </ul>
      
      <p>We apologize for any inconvenience and appreciate your patience as we work to improve your experience.</p>
      
      <p>For updates during maintenance, follow us on social media or check our status page at {{status_page_url}}</p>
      
      <p>If you have any questions, please contact us at {{support_email}}</p>
      
      <p>Thank you for your understanding.</p>
      
      <p>Best regards,<br><strong>Mediczy Technical Team</strong></p>
    </div>
    <div class="footer">
      <p>&copy; 2025 Mediczy. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    textContent: `
Scheduled System Maintenance

Dear {{user_name}},

Upcoming scheduled maintenance on the Mediczy platform:

Date: {{maintenance_date}}
Time: {{maintenance_time}}
Duration: {{estimated_duration}}
Purpose: {{maintenance_purpose}}

Service Impact: {{service_impact}}

What to expect:
- {{impact_detail_1}}
- {{impact_detail_2}}
- {{impact_detail_3}}

What you can do:
- Complete urgent tasks beforehand
- Download important data
- Schedule appointments outside maintenance window

For updates: {{status_page_url}}
Questions: {{support_email}}

Thank you for your understanding.

Best regards,
Mediczy Technical Team
    `,
    variables: [
      { name: 'user_name', description: 'User\'s name', example: 'John Doe', required: true },
      { name: 'maintenance_date', description: 'Maintenance date', example: 'December 15, 2025', required: true },
      { name: 'maintenance_time', description: 'Maintenance time', example: '2:00 AM - 4:00 AM IST', required: true },
      { name: 'estimated_duration', description: 'Expected duration', example: '2 hours', required: true },
      { name: 'maintenance_purpose', description: 'Reason for maintenance', example: 'System upgrades and security patches', required: true },
      { name: 'service_impact', description: 'Impact description', example: 'Platform will be temporarily unavailable', required: true },
      { name: 'impact_detail_1', description: 'First impact detail', example: 'Website access will be limited', required: true },
      { name: 'impact_detail_2', description: 'Second impact detail', example: 'Mobile app may show connection errors', required: true },
      { name: 'impact_detail_3', description: 'Third impact detail', example: 'Email notifications may be delayed', required: true },
      { name: 'status_page_url', description: 'Status page URL', example: 'https://status.mediczy.com', required: false },
      { name: 'support_email', description: 'Support email', example: 'support@mediczy.com', required: false }
    ]
  }
];

export const getTemplatesByCategory = (category: string) => {
  return defaultEmailTemplates.filter(template => template.category === category);
};

export const getTemplateById = (id: string) => {
  return defaultEmailTemplates.find(template => template.id === id);
};

export const validateTemplateVariables = (template: EmailTemplateData, variables: Record<string, string>) => {
  const errors: string[] = [];
  
  template.variables.forEach(variable => {
    if (variable.required && !variables[variable.name]) {
      errors.push(`Required variable '${variable.name}' is missing`);
    }
  });
  
  return errors;
};

export const renderTemplate = (template: string, variables: Record<string, string>) => {
  let rendered = template;

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  Object.entries(variables).forEach(([key, value]) => {
    const safeKey = escapeRegExp(key);
    const regex = new RegExp(`{{\\s*${safeKey}\\s*}}`, 'g');
    rendered = rendered.replace(regex, value || '');
  });
  
  return rendered;
};