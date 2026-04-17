import emailService from './controller/email.controller.js';

(async () => {
  try {
    console.log('📧 Sending welcome emails...\n');

    // Send welcome email to SmartHealth Clinic
    const clinicEmail = await emailService.sendEmail({
      to: 'smarthealthclinics@gmail.com',
      subject: 'Welcome to Mediqzy Healthcare Platform! 🏥',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #0d9488; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Mediqzy! 🎉</h1>
          </div>
          
          <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #0d9488; margin-bottom: 20px;">Dear SmartHealth Clinic Team,</h2>
            
            <p style="font-size: 16px; line-height: 1.6; color: #374151;">
              We're thrilled to welcome <strong>SmartHealth Clinic</strong> to the Mediqzy Healthcare Platform! 🏥
            </p>
            
            <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; padding: 20px; margin: 25px 0; border-radius: 5px;">
              <h3 style="color: #0d9488; margin-top: 0;">Your Clinic Details</h3>
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Clinic Name:</strong> SmartHealth Clinic</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Email:</strong> smarthealthclinics@gmail.com</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Phone:</strong> +91-9876543210</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Registration:</strong> SHC-2026-001</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Location:</strong> Mumbai, Maharashtra</li>
                <li style="padding: 8px 0;"><strong>Status:</strong> ✅ Active & Verified</li>
              </ul>
            </div>
            
            <h3 style="color: #0d9488; margin-top: 30px;">What's Next?</h3>
            <ul style="font-size: 16px; line-height: 1.8; color: #374151;">
              <li>🏥 Complete your clinic profile</li>
              <li>👨‍⚕️ Add your doctors and staff</li>
              <li>📅 Set up appointment schedules</li>
              <li>💳 Configure billing and payment options</li>
              <li>📊 Start managing patient records</li>
            </ul>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="https://app.mediqzy.com/hospital/login" style="background-color: #0d9488; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
                Access Your Dashboard →
              </a>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              Need help getting started? Our support team is here 24/7:<br>
              📧 Email: support@mediqzy.com<br>
              📞 Phone: +91-1234567890<br>
              💬 Live Chat: Available on your dashboard
            </p>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px;">
                Best regards,<br>
                <strong style="color: #0d9488;">The Mediqzy Team</strong>
              </p>
            </div>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>© 2026 Mediqzy Healthcare. All rights reserved.</p>
            <p>
              <a href="https://app.mediqzy.com/privacy" style="color: #0d9488; text-decoration: none;">Privacy Policy</a> | 
              <a href="https://app.mediqzy.com/terms" style="color: #0d9488; text-decoration: none;">Terms of Service</a>
            </p>
          </div>
        </div>
      `
    });

    console.log('✅ Clinic welcome email sent:', clinicEmail);

    // Send welcome email to My SmartHealth Corporate
    const corporateEmail = await emailService.sendEmail({
      to: 'info@mysmarthealth.in',
      subject: 'Welcome to Mediqzy Corporate Health Platform! 🏢',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #7c3aed; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Mediqzy! 🎉</h1>
          </div>
          
          <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #7c3aed; margin-bottom: 20px;">Dear My SmartHealth Team,</h2>
            
            <p style="font-size: 16px; line-height: 1.6; color: #374151;">
              We're excited to welcome <strong>My SmartHealth</strong> to the Mediqzy Corporate Health Platform! 🏢
            </p>
            
            <div style="background-color: #faf5ff; border-left: 4px solid #7c3aed; padding: 20px; margin: 25px 0; border-radius: 5px;">
              <h3 style="color: #7c3aed; margin-top: 0;">Your Corporate Details</h3>
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Company Name:</strong> My SmartHealth</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Email:</strong> info@mysmarthealth.in</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Phone:</strong> +91-9876543211</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Industry:</strong> Technology</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Employees:</strong> 500</li>
                <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Package:</strong> Premium 👑</li>
                <li style="padding: 8px 0;"><strong>Status:</strong> ✅ Active</li>
              </ul>
            </div>
            
            <h3 style="color: #7c3aed; margin-top: 30px;">Premium Benefits</h3>
            <ul style="font-size: 16px; line-height: 1.8; color: #374151;">
              <li>👥 Unlimited employee enrollments</li>
              <li>🏥 Access to 500+ network hospitals</li>
              <li>💊 Pharmacy & lab discounts</li>
              <li>📊 Advanced health analytics</li>
              <li>🎯 Wellness program management</li>
              <li>🚨 24/7 emergency support</li>
            </ul>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="https://app.mediqzy.com/corporate/login" style="background-color: #7c3aed; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
                Access Corporate Portal →
              </a>
            </div>
            
            <div style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 15px; border-radius: 8px; margin: 25px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⚡ Next Steps:</strong> Our onboarding team will contact you within 24 hours to help set up employee access and customize your corporate health plan.
              </p>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              Questions? We're here to help:<br>
              📧 Corporate Support: corporate@mediqzy.com<br>
              📞 Dedicated Hotline: +91-1234567890<br>
              👤 Account Manager: Will be assigned within 24 hours
            </p>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px;">
                Best regards,<br>
                <strong style="color: #7c3aed;">The Mediqzy Corporate Health Team</strong>
              </p>
            </div>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>© 2026 Mediqzy Healthcare. All rights reserved.</p>
            <p>
              <a href="https://app.mediqzy.com/privacy" style="color: #7c3aed; text-decoration: none;">Privacy Policy</a> | 
              <a href="https://app.mediqzy.com/terms" style="color: #7c3aed; text-decoration: none;">Terms of Service</a>
            </p>
          </div>
        </div>
      `
    });

    console.log('✅ Corporate welcome email sent:', corporateEmail);
    
    console.log('\n🎉 All welcome emails sent successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error sending welcome emails:', error);
    process.exit(1);
  }
})();
