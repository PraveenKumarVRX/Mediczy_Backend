/**
 * Insert Default Email Templates
 */

export async function up(queryInterface, Sequelize) {
  const defaultTemplates = [
    {
      name: 'Welcome New User',
      category: 'welcome',
      subject: 'Welcome to Mediqzy!',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">Welcome to Mediqzy!</h1>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; color: #2c3e50;">Hi {{userName}},</p>
            <p style="font-size: 16px; color: #2c3e50;">Thank you for joining Mediqzy! We're excited to have you on board.</p>
            <p style="font-size: 16px; color: #2c3e50;">Your account has been successfully created and you can now access all our features.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{loginUrl}}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Get Started</a>
            </div>
            <p style="font-size: 14px; color: #6c757d;">If you have any questions, feel free to reach out to our support team.</p>
          </div>
        </div>
      `,
      textContent: 'Welcome to Mediqzy!\n\nHi {{userName}},\n\nThank you for joining Mediqzy! Your account has been created.\n\nLogin at: {{loginUrl}}',
      variables: JSON.stringify(['platformName', 'userName', 'loginUrl']),
      isActive: true,
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Appointment Confirmation',
      category: 'notification',
      subject: 'Appointment Confirmed - {{appointmentDate}}',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #10b981; padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">✅ Appointment Confirmed</h1>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; color: #2c3e50;">Dear {{patientName}},</p>
            <p style="font-size: 16px; color: #2c3e50;">Your appointment has been confirmed!</p>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <p style="margin: 5px 0;"><strong>Doctor:</strong> {{doctorName}}</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> {{appointmentDate}}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> {{appointmentTime}}</p>
              <p style="margin: 5px 0;"><strong>Location:</strong> {{location}}</p>
            </div>
            <p style="font-size: 14px; color: #6c757d;">Please arrive 10 minutes early. If you need to reschedule, please contact us at least 24 hours in advance.</p>
          </div>
        </div>
      `,
      textContent: 'Appointment Confirmed\n\nDear {{patientName}},\n\nDoctor: {{doctorName}}\nDate: {{appointmentDate}}\nTime: {{appointmentTime}}\nLocation: {{location}}',
      variables: JSON.stringify(['patientName', 'doctorName', 'appointmentDate', 'appointmentTime', 'location']),
      isActive: true,
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Appointment Reminder',
      category: 'reminder',
      subject: 'Reminder: Appointment Tomorrow with {{doctorName}}',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f59e0b; padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🔔 Appointment Reminder</h1>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; color: #2c3e50;">Dear {{patientName}},</p>
            <p style="font-size: 16px; color: #2c3e50;">This is a friendly reminder about your upcoming appointment:</p>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <p style="margin: 5px 0;"><strong>Doctor:</strong> {{doctorName}}</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> {{appointmentDate}}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> {{appointmentTime}}</p>
            </div>
            <p style="font-size: 14px; color: #6c757d;">We look forward to seeing you!</p>
          </div>
        </div>
      `,
      textContent: 'Appointment Reminder\n\nDear {{patientName}},\n\nReminder about your appointment:\nDoctor: {{doctorName}}\nDate: {{appointmentDate}}\nTime: {{appointmentTime}}',
      variables: JSON.stringify(['patientName', 'doctorName', 'appointmentDate', 'appointmentTime']),
      isActive: true,
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Password Reset',
      category: 'system',
      subject: 'Reset Your Password',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #6366f1; padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🔐 Password Reset Request</h1>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; color: #2c3e50;">Hi {{userName}},</p>
            <p style="font-size: 16px; color: #2c3e50;">We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{resetUrl}}" style="background: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
            </div>
            <p style="font-size: 14px; color: #6c757d;">This link will expire in {{expiryTime}}.</p>
            <p style="font-size: 14px; color: #dc2626;">If you didn't request this, please ignore this email or contact support.</p>
          </div>
        </div>
      `,
      textContent: 'Password Reset Request\n\nHi {{userName}},\n\nReset your password: {{resetUrl}}\n\nLink expires in {{expiryTime}}.',
      variables: JSON.stringify(['userName', 'resetUrl', 'expiryTime']),
      isActive: true,
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Invoice/Receipt',
      category: 'billing',
      subject: 'Invoice #{{invoiceNumber}} - {{amount}}',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #059669; padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">💰 Invoice</h1>
          </div>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; color: #2c3e50;">Dear {{customerName}},</p>
            <p style="font-size: 16px; color: #2c3e50;">Thank you for your payment!</p>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> {{invoiceDate}}</p>
              <p style="margin: 5px 0;"><strong>Amount:</strong> {{amount}}</p>
              <p style="margin: 5px 0;"><strong>Payment Method:</strong> {{paymentMethod}}</p>
            </div>
            <p style="font-size: 14px; color: #6c757d;">A copy of your receipt has been attached to this email.</p>
          </div>
        </div>
      `,
      textContent: 'Invoice #{{invoiceNumber}}\n\nDear {{customerName}},\n\nAmount: {{amount}}\nDate: {{invoiceDate}}\nPayment Method: {{paymentMethod}}',
      variables: JSON.stringify(['customerName', 'invoiceNumber', 'invoiceDate', 'amount', 'paymentMethod']),
      isActive: true,
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await queryInterface.bulkInsert('email_templates', defaultTemplates);
  console.log('✅ Inserted 5 default email templates');
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.bulkDelete('email_templates', { createdBy: 'system' });
  console.log('🗑️ Removed default email templates');
}
