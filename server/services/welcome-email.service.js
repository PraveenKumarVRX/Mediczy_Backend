import crypto from 'crypto';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { postgresSequelize } from '../db/postgres-sequelize.js';

dotenv.config();

// Zoho SMTP transporter (uses existing SMTP_* env vars)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtppro.zoho.in',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Normalize SendGrid-style msg object → nodemailer format and send
async function sendMail(msg) {
  const from = typeof msg.from === 'object'
    ? `"${msg.from.name}" <${process.env.SMTP_USER}>`
    : (process.env.SMTP_USER || msg.from);
  return transporter.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  });
}

/**
 * Look up a custom email template from the DB for the given event type.
 * Uses email_event_assignments to find the assigned template_id, then fetches its content.
 * Returns { subject, html_content } if found, otherwise null (use default).
 */
async function getCustomTemplate(eventType) {
  try {
    const rows = await postgresSequelize.query(
      `SELECT wet.subject, wet.html_content
       FROM email_event_assignments eea
       JOIN welcome_email_templates wet ON wet.id = eea.template_id
       WHERE eea.event_type = :eventType
       ORDER BY eea.updated_at DESC LIMIT 1`,
      { replacements: { eventType }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null; // Fall through to hardcoded default
  }
}

/**
 * Render template variables in subject/html using a values map.
 */
function renderTemplate(template, values) {
  let result = template;
  for (const [key, val] of Object.entries(values)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), val ?? '');
  }
  return result;
}

/**
 * Export for test-send from the API route
 */
export async function sendTestEmail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"Mediqzy Team" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  });
}

/**
 * Generate a secure random password
 * @param {number} length - Password length (default: 12)
 * @returns {string} Generated password
 */
export function generateSecurePassword(length = 12) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  
  const allChars = uppercase + lowercase + numbers + special;
  
  // Ensure at least one of each type
  let password = [
    uppercase[crypto.randomInt(0, uppercase.length)],
    lowercase[crypto.randomInt(0, lowercase.length)],
    numbers[crypto.randomInt(0, numbers.length)],
    special[crypto.randomInt(0, special.length)]
  ];
  
  // Fill remaining length with random characters
  for (let i = password.length; i < length; i++) {
    password.push(allChars[crypto.randomInt(0, allChars.length)]);
  }
  
  // Shuffle the password
  password = password.sort(() => crypto.randomInt(-1, 2));
  
  return password.join('');
}

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Send welcome email to new doctor
 * @param {Object} doctorData
 * @param {string} temporaryPassword
 */
export async function sendDoctorWelcomeEmail(doctorData, temporaryPassword) {
  const { email, firstName, lastName, specialization } = doctorData;
  
  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'Mediqzy Healthcare Platform'
    },
    subject: 'Welcome to Mediqzy - Doctor Portal Access 🏥',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #0d9488; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Mediqzy! 🎉</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #0d9488; margin-bottom: 20px;">Dear Dr. ${firstName} ${lastName},</h2>
          
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            Your doctor account has been successfully created on the Mediqzy Healthcare Platform! 🏥
          </p>
          
          <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; padding: 20px; margin: 25px 0; border-radius: 5px;">
            <h3 style="color: #0d9488; margin-top: 0;">Your Account Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Name:</strong> Dr. ${firstName} ${lastName}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Email:</strong> ${email}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Specialization:</strong> ${specialization || 'General Medicine'}</li>
              <li style="padding: 8px 0;"><strong>Role:</strong> Doctor</li>
            </ul>
          </div>
          
          <div style="background-color: #fef3c7; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #92400e; margin-top: 0;">🔐 Login Credentials</h3>
            <p style="margin: 10px 0; color: #78350f;">
              <strong>Email:</strong> ${email}<br>
              <strong>Temporary Password:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px; color: #dc2626;">${temporaryPassword}</code>
            </p>
            <p style="margin: 15px 0 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>Important:</strong> You will be required to change this password upon first login for security reasons.
            </p>
          </div>
          
          <h3 style="color: #0d9488; margin-top: 30px;">What's Next?</h3>
          <ul style="font-size: 16px; line-height: 1.8; color: #374151;">
            <li>🔐 Login with your credentials</li>
            <li>🔑 Change your password (required on first login)</li>
            <li>👤 Complete your doctor profile</li>
            <li>📅 Set your availability schedule</li>
            <li>👥 Start managing patient appointments</li>
            <li>💊 Prescribe medications and treatments</li>
          </ul>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="https://app.mediqzy.com/doctor/login" style="background-color: #0d9488; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
              Login to Doctor Portal →
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Need assistance? Our support team is available 24/7:<br>
            📧 Email: support@mediqzy.com<br>
            📞 Phone: +91-1234567890
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
        </div>
      </div>
    `
  };

  // Apply custom template override if configured
  const customTplDoctor = await getCustomTemplate('doctor_welcome');
  if (customTplDoctor) {
    const vars = { '{{firstName}}': firstName, '{{lastName}}': lastName, '{{email}}': email, '{{specialization}}': specialization || 'General Medicine', '{{temporaryPassword}}': temporaryPassword };
    msg.subject = renderTemplate(customTplDoctor.subject, vars);
    msg.html = renderTemplate(customTplDoctor.html_content, vars);
  }

  try {
    await sendMail(msg);
    console.log(`✅ Welcome email sent to doctor: ${email}`);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('❌ Error sending doctor welcome email:', error);
    throw error;
  }
}

/**
 * Send welcome email to new hospital/clinic
 * @param {Object} hospitalData
 * @param {string} temporaryPassword
 */
export async function sendHospitalWelcomeEmail(hospitalData, temporaryPassword) {
  const { email, hospital_name, registration_number } = hospitalData;
  
  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'Mediqzy Healthcare Platform'
    },
    subject: 'Welcome to Mediqzy - Hospital Portal Access 🏥',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #0d9488; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Mediqzy! 🎉</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #0d9488; margin-bottom: 20px;">Dear ${hospital_name} Team,</h2>
          
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            Your hospital/clinic has been successfully registered on the Mediqzy Healthcare Platform! 🏥
          </p>
          
          <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; padding: 20px; margin: 25px 0; border-radius: 5px;">
            <h3 style="color: #0d9488; margin-top: 0;">Your Facility Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Facility Name:</strong> ${hospital_name}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Email:</strong> ${email}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Registration:</strong> ${registration_number || 'Pending'}</li>
              <li style="padding: 8px 0;"><strong>Status:</strong> ✅ Active</li>
            </ul>
          </div>
          
          <div style="background-color: #fef3c7; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #92400e; margin-top: 0;">🔐 Login Credentials</h3>
            <p style="margin: 10px 0; color: #78350f;">
              <strong>Email:</strong> ${email}<br>
              <strong>Temporary Password:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px; color: #dc2626;">${temporaryPassword}</code>
            </p>
            <p style="margin: 15px 0 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>Important:</strong> You must change this password upon first login for security.
            </p>
          </div>
          
          <h3 style="color: #0d9488; margin-top: 30px;">Getting Started</h3>
          <ul style="font-size: 16px; line-height: 1.8; color: #374151;">
            <li>🔐 Login with your credentials</li>
            <li>🔑 Change your password immediately</li>
            <li>🏥 Complete facility profile</li>
            <li>👨‍⚕️ Add doctors and staff</li>
            <li>📅 Configure appointment schedules</li>
            <li>💳 Set up billing and payment options</li>
          </ul>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="https://app.mediqzy.com/hospital/login" style="background-color: #0d9488; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
              Access Hospital Portal →
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Need help? Contact us:<br>
            📧 Email: support@mediqzy.com<br>
            📞 Phone: +91-1234567890
          </p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2026 Mediqzy Healthcare. All rights reserved.</p>
        </div>
      </div>
    `
  };

  // Apply custom template override if configured
  const customTplHospital = await getCustomTemplate('hospital_welcome');
  if (customTplHospital) {
    const vars = { '{{hospitalName}}': hospital_name, '{{email}}': email, '{{contactPerson}}': hospital_name, '{{temporaryPassword}}': temporaryPassword };
    msg.subject = renderTemplate(customTplHospital.subject, vars);
    msg.html = renderTemplate(customTplHospital.html_content, vars);
  }

  try {
    await sendMail(msg);
    console.log(`✅ Welcome email sent to hospital: ${email}`);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('❌ Error sending hospital welcome email:', error);
    throw error;
  }
}

/**
 * Send welcome email to new corporate
 * @param {Object} corporateData
 * @param {string} temporaryPassword
 */
export async function sendCorporateWelcomeEmail(corporateData, temporaryPassword) {
  const { email, companyName, employeeCount, packageType } = corporateData;
  
  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'Mediqzy Corporate Health Platform'
    },
    subject: 'Welcome to Mediqzy - Corporate Portal Access 🏢',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #7c3aed; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Mediqzy! 🎉</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #7c3aed; margin-bottom: 20px;">Dear ${companyName} Team,</h2>
          
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            Your corporate account has been successfully created on Mediqzy Corporate Health Platform! 🏢
          </p>
          
          <div style="background-color: #faf5ff; border-left: 4px solid #7c3aed; padding: 20px; margin: 25px 0; border-radius: 5px;">
            <h3 style="color: #7c3aed; margin-top: 0;">Your Corporate Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Company:</strong> ${companyName}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Email:</strong> ${email}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Employees:</strong> ${employeeCount || 'Not specified'}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #f3e8ff;"><strong>Package:</strong> ${packageType || 'Standard'} ${packageType === 'Premium' ? '👑' : ''}</li>
              <li style="padding: 8px 0;"><strong>Status:</strong> ✅ Active</li>
            </ul>
          </div>
          
          <div style="background-color: #fef3c7; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #92400e; margin-top: 0;">🔐 Login Credentials</h3>
            <p style="margin: 10px 0; color: #78350f;">
              <strong>Email:</strong> ${email}<br>
              <strong>Temporary Password:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px; color: #dc2626;">${temporaryPassword}</code>
            </p>
            <p style="margin: 15px 0 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>Security Notice:</strong> Change this password immediately upon first login.
            </p>
          </div>
          
          <h3 style="color: #7c3aed; margin-top: 30px;">Premium Benefits</h3>
          <ul style="font-size: 16px; line-height: 1.8; color: #374151;">
            <li>👥 Employee health management</li>
            <li>🏥 Access to network hospitals</li>
            <li>💊 Pharmacy & lab discounts</li>
            <li>📊 Advanced health analytics</li>
            <li>🎯 Wellness program tracking</li>
            <li>🚨 24/7 emergency support</li>
          </ul>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="https://app.mediqzy.com/corporate/login" style="background-color: #7c3aed; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
              Access Corporate Portal →
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Questions? We're here to help:<br>
            📧 Corporate Support: corporate@mediqzy.com<br>
            📞 Dedicated Hotline: +91-1234567890
          </p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2026 Mediqzy Healthcare. All rights reserved.</p>
        </div>
      </div>
    `
  };

  // Apply custom template override if configured
  const customTplCorp = await getCustomTemplate('corporate_welcome');
  if (customTplCorp) {
    const vars = { '{{companyName}}': companyName, '{{email}}': email, '{{contactPerson}}': companyName, '{{temporaryPassword}}': temporaryPassword };
    msg.subject = renderTemplate(customTplCorp.subject, vars);
    msg.html = renderTemplate(customTplCorp.html_content, vars);
  }

  try {
    await sendMail(msg);
    console.log(`✅ Welcome email sent to corporate: ${email}`);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('❌ Error sending corporate welcome email:', error);
    throw error;
  }
}

export async function sendCorporateEmployeeWelcomeEmail(employeeData, temporaryPassword) {
  const { email, firstName, lastName, companyName, employeeId, department } = employeeData;

  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'Mediqzy Corporate Health'
    },
    subject: `Welcome to ${companyName} Employee Health Portal – Your Login Details`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #0f766e; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 26px;">Welcome to Mediqzy Employee Health Portal 🏥</h1>
        </div>
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #0f766e; margin-bottom: 20px;">Dear ${firstName} ${lastName},</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            Your employee health account has been created by <strong>${companyName}</strong> on the Mediqzy platform. You can now access healthcare benefits, book appointments, and manage your health records.
          </p>
          <div style="background-color: #f0fdfa; border-left: 4px solid #0f766e; padding: 20px; margin: 25px 0; border-radius: 5px;">
            <h3 style="color: #0f766e; margin-top: 0;">Your Account Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Name:</strong> ${firstName} ${lastName}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Email:</strong> ${email}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #ccfbf1;"><strong>Employee ID:</strong> ${employeeId || '—'}</li>
              <li style="padding: 8px 0;"><strong>Department:</strong> ${department || '—'}</li>
            </ul>
          </div>
          <div style="background-color: #fef3c7; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #92400e; margin-top: 0;">🔐 Your Login Credentials</h3>
            <p style="margin: 10px 0; color: #78350f;">
              <strong>Login Email:</strong> ${email}<br>
              <strong>Temporary Password:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px; color: #dc2626;">${temporaryPassword}</code>
            </p>
            <p style="margin: 15px 0 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>Please change this password after your first login.</strong>
            </p>
          </div>
          <h3 style="color: #0f766e; margin-top: 30px;">What You Can Do</h3>
          <ul style="font-size: 15px; line-height: 1.8; color: #374151;">
            <li>📅 Book doctor appointments</li>
            <li>🧪 Schedule lab tests at network labs</li>
            <li>💊 Access pharmacy benefits</li>
            <li>📋 View your health records</li>
            <li>🏥 Access corporate health plan</li>
          </ul>
          <div style="text-align: center; margin: 35px 0;">
            <a href="https://app.mediqzy.com/login" style="background-color: #0f766e; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
              Login to Health Portal →
            </a>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Need help? Contact your HR team or reach us at:<br>
            📧 support@mediqzy.com &nbsp;|&nbsp; 📞 +91-1234567890
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2026 Mediqzy Healthcare. All rights reserved.</p>
        </div>
      </div>
    `
  };

  // Apply custom template override if configured
  const customTplEmp = await getCustomTemplate('corporate_employee_welcome');
  if (customTplEmp) {
    const vars = { '{{firstName}}': firstName, '{{lastName}}': lastName, '{{email}}': email, '{{companyName}}': companyName, '{{temporaryPassword}}': temporaryPassword };
    msg.subject = renderTemplate(customTplEmp.subject, vars);
    msg.html = renderTemplate(customTplEmp.html_content, vars);
  }

  try {
    await sendMail(msg);
    console.log(`✅ Welcome email sent to corporate employee: ${email}`);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('❌ Error sending corporate employee welcome email:', error);
    throw error;
  }
}

/**
 * Send welcome email to team/staff user
 * @param {Object} userData
 * @param {string} temporaryPassword
 */
export async function sendTeamWelcomeEmail(userData, temporaryPassword) {
  const { email, firstName, lastName, role, department } = userData;
  
  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'Mediqzy Healthcare Platform'
    },
    subject: 'Welcome to Mediqzy - Team Portal Access 👥',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #2563eb; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Mediqzy! 🎉</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2563eb; margin-bottom: 20px;">Dear ${firstName} ${lastName},</h2>
          
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            Your team account has been created on the Mediqzy Healthcare Platform! Welcome aboard! 👥
          </p>
          
          <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 20px; margin: 25px 0; border-radius: 5px;">
            <h3 style="color: #2563eb; margin-top: 0;">Your Account Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; border-bottom: 1px solid #dbeafe;"><strong>Name:</strong> ${firstName} ${lastName}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #dbeafe;"><strong>Email:</strong> ${email}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #dbeafe;"><strong>Role:</strong> ${role || 'Team Member'}</li>
              <li style="padding: 8px 0;"><strong>Department:</strong> ${department || 'General'}</li>
            </ul>
          </div>
          
          <div style="background-color: #fef3c7; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #92400e; margin-top: 0;">🔐 Login Credentials</h3>
            <p style="margin: 10px 0; color: #78350f;">
              <strong>Email:</strong> ${email}<br>
              <strong>Temporary Password:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px; color: #dc2626;">${temporaryPassword}</code>
            </p>
            <p style="margin: 15px 0 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>Security Required:</strong> You must change this password on your first login.
            </p>
          </div>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="https://app.mediqzy.com/login" style="background-color: #2563eb; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
              Login to Portal →
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Need help? Contact support:<br>
            📧 Email: support@mediqzy.com<br>
            📞 Phone: +91-1234567890
          </p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p>© 2026 Mediqzy Healthcare. All rights reserved.</p>
        </div>
      </div>
    `
  };

  // Apply custom template override if configured
  const customTplTeam = await getCustomTemplate('team_welcome');
  if (customTplTeam) {
    const vars = { '{{firstName}}': firstName, '{{lastName}}': lastName, '{{email}}': email, '{{role}}': role || 'Team Member', '{{department}}': department || 'General', '{{temporaryPassword}}': temporaryPassword };
    msg.subject = renderTemplate(customTplTeam.subject, vars);
    msg.html = renderTemplate(customTplTeam.html_content, vars);
  }

  try {
    await sendMail(msg);
    console.log(`✅ Welcome email sent to team member: ${email}`);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('❌ Error sending team welcome email:', error);
    throw error;
  }
}

export default {
  generateSecurePassword,
  hashPassword,
  sendDoctorWelcomeEmail,
  sendHospitalWelcomeEmail,
  sendCorporateWelcomeEmail,
  sendCorporateEmployeeWelcomeEmail,
  sendTeamWelcomeEmail
};
