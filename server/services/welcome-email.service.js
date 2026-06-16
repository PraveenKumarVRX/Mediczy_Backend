import crypto from 'crypto';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { postgresSequelize } from '../db/postgres-sequelize.js';

dotenv.config();

// ── AWS SES v2 transport (used when SES_ENABLED=true or AWS_REGION is set and SMTP fails) ──
let sesClient = null;
async function getSesClient() {
  if (sesClient) return sesClient;
  try {
    const { SESv2Client } = await import('@aws-sdk/client-sesv2');
    sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });
    return sesClient;
  } catch {
    return null;
  }
}

function isZohoHost(host) {
  return String(host || '').toLowerCase().includes('zoho');
}

function isBrevoHost(host) {
  const value = String(host || '').toLowerCase();
  return value.includes('brevo') || value.includes('sendinblue');
}

async function sendViaSes(msg) {
  const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');
  const client = await getSesClient();
  if (!client) throw new Error('SES client unavailable');
  const fromAddress = typeof msg.from === 'object'
    ? `"${msg.from.name}" <${msg.from.email}>`
    : (msg.from || `"Mediqzy Corporate Health" <hello@mysmarthealth.in>`);
  await client.send(new SendEmailCommand({
    FromEmailAddress: fromAddress,
    Destination: { ToAddresses: [msg.to] },
    Content: {
      Simple: {
        Subject: { Data: msg.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: msg.html, Charset: 'UTF-8' } },
      },
    },
  }));
}

// SES is used when explicitly enabled or when SMTP is Zoho (which blocks bulk sends)
function shouldUseSes() {
  if (process.env.SES_ENABLED === 'true') return true;
  const host = String(process.env.SMTP_HOST || '').toLowerCase();
  return isZohoHost(host) || process.env.SES_BULK_FALLBACK !== 'false';
}

async function resolveSmtpConfig() {
  const fallbackPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const fallbackConfig = {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: fallbackPort,
    secure: fallbackPort === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
    },
    fromName: process.env.EMAIL_FROM_NAME || 'Mediqzy Team',
    fromEmail: process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER,
  };

  try {
    const rows = await postgresSequelize.query(
      `SELECT host, port, username, password, "fromEmail", "fromName"
       FROM email_configs
       WHERE "isActive" = true
       ORDER BY "isDefault" DESC, id ASC
       LIMIT 1`,
      { type: postgresSequelize.QueryTypes.SELECT }
    );

    const cfg = rows?.[0];
    if (!cfg || !cfg.username || !cfg.password) {
      return fallbackConfig;
    }

    const dbPort = parseInt(String(cfg.port || '465'), 10);
    return {
      host: cfg.host || fallbackConfig.host,
      port: Number.isNaN(dbPort) ? fallbackConfig.port : dbPort,
      secure: (Number.isNaN(dbPort) ? fallbackConfig.port : dbPort) === 465,
      auth: {
        user: cfg.username,
        pass: cfg.password,
      },
      fromName: cfg.fromName || fallbackConfig.fromName,
      fromEmail: cfg.fromEmail || cfg.username || fallbackConfig.fromEmail,
    };
  } catch {
    return fallbackConfig;
  }
}

async function createSmtpTransport() {
  const smtp = await resolveSmtpConfig();
  return {
    smtp,
    transporter: nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.auth.user,
        pass: smtp.auth.pass,
      },
    }),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientMailError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  const message = String(error?.message || '').toLowerCase();

  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EAI_AGAIN', 'ECONNRESET'].includes(code)) {
    return true;
  }

  if (responseCode >= 500 && responseCode < 600) {
    return true;
  }

  return (
    message.includes('temporar') ||
    message.includes('timeout') ||
    message.includes('try again') ||
    message.includes('too many') ||
    message.includes('rate limit') ||
    message.includes('unusual sending activity')
  );
}

function buildFromAddress(msg, smtp = null) {
  if (typeof msg.from === 'object') {
    const fromName = msg.from.name || smtp?.fromName || 'Mediqzy Corporate Health';
    const fromEmail = msg.from.email || smtp?.fromEmail || smtp?.auth?.user || 'hello@mysmarthealth.in';
    return `"${fromName}" <${fromEmail}>`;
  }

  if (String(msg.from || '').trim()) {
    return msg.from;
  }

  if (smtp) {
    return `"${smtp.fromName}" <${smtp.fromEmail || smtp.auth.user}>`;
  }

  return '"Mediqzy Corporate Health" <hello@mysmarthealth.in>';
}

async function sendViaSmtp(msg) {
  const { smtp, transporter } = await createSmtpTransport();
  if (isZohoHost(smtp.host)) {
    throw new Error('Zoho SMTP is disabled for welcome emails. Use SES or Brevo SMTP.');
  }
  if (!isBrevoHost(smtp.host)) {
    throw new Error(`Unsupported SMTP host for welcome emails: ${smtp.host}. Allowed: Brevo SMTP.`);
  }

  return transporter.sendMail({
    from: buildFromAddress(msg, smtp),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  });
}

// Normalize SendGrid-style msg object → nodemailer format and send.
// Prefers SES when Zoho SMTP is configured (Zoho blocks bulk sends).
// options.provider: 'ses' | 'brevo' | 'auto' (default: auto)
async function sendMail(msg, options = {}) {
  const { provider = 'auto' } = options;
  const normalizedProvider = ['ses', 'brevo', 'auto'].includes(String(provider || '').toLowerCase())
    ? String(provider).toLowerCase()
    : 'auto';
  const retryAttempts = Math.max(1, Math.min(parseInt(String(process.env.WELCOME_EMAIL_RETRY_ATTEMPTS || '2'), 10) || 2, 5));
  const retryDelayMs = Math.max(250, parseInt(String(process.env.WELCOME_EMAIL_RETRY_DELAY_MS || '700'), 10) || 700);

  const providerOrder = normalizedProvider === 'ses'
    ? ['ses']
    : normalizedProvider === 'brevo'
      ? ['smtp']
      : (shouldUseSes() ? ['ses', 'smtp'] : ['smtp', 'ses']);

  const attemptErrors = [];

  for (const channel of providerOrder) {
    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
      try {
        if (channel === 'ses') {
          await sendViaSes({
            ...msg,
            from: buildFromAddress(msg),
          });
        } else {
          await sendViaSmtp(msg);
        }
        return;
      } catch (error) {
        const transient = isTransientMailError(error);
        attemptErrors.push(`[${channel} attempt ${attempt}] ${error?.message || error}`);

        const canRetrySameChannel = transient && attempt < retryAttempts;
        if (canRetrySameChannel) {
          await wait(retryDelayMs * attempt);
          continue;
        }

        const canTryNextChannel = normalizedProvider === 'auto' && providerOrder.indexOf(channel) < providerOrder.length - 1;
        if (canTryNextChannel) {
          console.warn(`[email] ${channel.toUpperCase()} failed, trying fallback channel:`, error?.message || error);
          break;
        }

        throw new Error(`Welcome email delivery failed: ${attemptErrors.join(' | ')}`);
      }
    }
  }

  throw new Error(`Welcome email delivery failed: ${attemptErrors.join(' | ') || 'no provider attempted'}`);
}

/**
 * Look up a custom email template from the DB for the given event type.
 * Uses email_event_assignments to find the assigned template_id, then fetches its content.
 * Returns { subject, html_content } if found, otherwise null (use default).
 */
async function getCustomTemplate(eventType, options = {}) {
  const { teamUserId } = options;
  try {
    const sql = [
      'SELECT wet.subject, wet.html_content',
      'FROM email_event_assignments eea',
      'JOIN welcome_email_templates wet ON wet.id = eea.template_id',
      'WHERE eea.event_type = :eventType'
    ];
    const replacements = { eventType };

    if (teamUserId) {
      sql.push('  AND eea.team_user_id = :teamUserId');
      replacements.teamUserId = teamUserId;
    }

    sql.push('ORDER BY eea.updated_at DESC LIMIT 1');

    const rows = await postgresSequelize.query(
      sql.join('\n'),
      { replacements, type: postgresSequelize.QueryTypes.SELECT }
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
  const { smtp, transporter } = await createSmtpTransport();
  return transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail || smtp.auth.user}>`,
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

function formatCorporateEmployeePlan(employeeData = {}) {
  const planName = employeeData.planName || employeeData.insurancePlan || employeeData.packageType || `${employeeData.companyName || 'Corporate'} Employee Health Plan`;
  const coverageAmount = employeeData.coverageAmount || employeeData.sumInsured || employeeData.sum_insured || employeeData.coverage || "As per corporate plan eligibility";
  const startDate = employeeData.planStartDate || employeeData.startDate || employeeData.coverageStartDate || "";
  const endDate = employeeData.planEndDate || employeeData.endDate || employeeData.coverageEndDate || "";
  const validity = employeeData.planValidity || employeeData.validity || ([startDate, endDate].filter(Boolean).join(" to ") || "Active as per Nijacart HR policy");
  const sponsor = employeeData.sponsor || employeeData.employerContribution || "Nijacart sponsored corporate health benefit";
  const copay = employeeData.copay || employeeData.employeeShare || "As per approved plan terms";
  const benefits = Array.isArray(employeeData.planBenefits)
    ? employeeData.planBenefits
    : String(employeeData.planBenefits || employeeData.benefits || "Doctor consultations, lab tests, health records, pharmacy benefits, care navigation")
        .split(/[|,;]\s*/)
        .map(item => item.trim())
        .filter(Boolean);

  return { planName, coverageAmount, validity, sponsor, copay, benefits };
}

function renderPlanBenefitsList(benefits = []) {
  return benefits.map(benefit => `<li style="padding: 6px 0; color: #374151;">${benefit}</li>`).join("");
}

export async function buildCorporateEmployeeWelcomeEmail(employeeData, temporaryPassword, options = {}) {
  const { email, firstName, lastName, companyName, employeeId, department } = employeeData;
  const plan = formatCorporateEmployeePlan(employeeData);
  const planBenefitsHtml = renderPlanBenefitsList(plan.benefits);
  const planBenefitsText = plan.benefits.join(", " );
  const loginIdentifier = email || employeeId || "";

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
            Your employee health account has been activated under the <strong>${companyName}</strong> corporate health program on Mediqzy. Your plan details and login credentials are below.
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
          <div style="background-color: #eef2ff; border-left: 4px solid #4f46e5; padding: 20px; margin: 25px 0; border-radius: 5px;">
            <h3 style="color: #4338ca; margin-top: 0;">Your Health Plan Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Plan:</strong> ${plan.planName}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Coverage:</strong> ${plan.coverageAmount}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Validity:</strong> ${plan.validity}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Sponsor:</strong> ${plan.sponsor}</li>
              <li style="padding: 8px 0;"><strong>Employee Share / Co-pay:</strong> ${plan.copay}</li>
            </ul>
            <div style="margin-top: 16px; background: #ffffff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 14px 16px;">
              <p style="margin: 0 0 8px; color: #4338ca; font-weight: bold;">Included benefits</p>
              <ul style="margin: 0; padding-left: 18px;">${planBenefitsHtml}</ul>
            </div>
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
  const customTplEmp = await getCustomTemplate('corporate_employee_welcome', options);
  if (customTplEmp) {
    const vars = {
      "{{firstName}}": firstName,
      "{{lastName}}": lastName,
      "{{email}}": email,
      "{{companyName}}": companyName,
      "{{employeeId}}": employeeId || "",
      "{{department}}": department || "",
      "{{temporaryPassword}}": temporaryPassword,
      "{{password}}": temporaryPassword,
      "{{username}}": loginIdentifier,
      "{{userId}}": loginIdentifier,
      "{{loginIdentifier}}": loginIdentifier,
      "{{loginUrl}}": "https://app.mediqzy.com/login",
      "{{planName}}": plan.planName,
      "{{coverageAmount}}": plan.coverageAmount,
      "{{planValidity}}": plan.validity,
      "{{planSponsor}}": plan.sponsor,
      "{{planCopay}}": plan.copay,
      "{{planBenefits}}": planBenefitsText,

      // Support legacy or manually-written bracket placeholders from HTML editors.
      "[First Name]": firstName,
      "[Last Name]": lastName,
      "[Employee Name]": `${firstName || ""} ${lastName || ""}`.trim(),
      "[Employee Email ID / Mobile Number]": loginIdentifier,
      "[Username]": loginIdentifier,
      "[User ID]": loginIdentifier,
      "[Employee ID]": employeeId || "",
      "[Temporary Password]": temporaryPassword,
      "[Password]": temporaryPassword,
      "[Company Name]": companyName,
      "[Department]": department || "",
      "[Login URL]": "https://app.mediqzy.com/login"
    };
    msg.subject = renderTemplate(customTplEmp.subject, vars);
    msg.html = renderTemplate(customTplEmp.html_content, vars);
  }

  return msg;
}

export async function sendCorporateEmployeeWelcomeEmail(employeeData, temporaryPassword, options = {}) {
  const msg = await buildCorporateEmployeeWelcomeEmail(employeeData, temporaryPassword, options);
  try {
    await sendMail(msg);
    console.log("Welcome email sent to corporate employee: " + msg.to);
    return { success: true, message: "Welcome email sent successfully" };
  } catch (error) {
    console.error("Error sending corporate employee welcome email:", error);
    throw error;
  }
}

/**
 * Build a "reminder" email for a corporate employee who already received the
 * initial welcome email. Same personalization (name, employee ID, login
 * identifier, plan details) as the welcome email, but worded as a nudge to
 * activate/log in rather than a first-time welcome, and carries a freshly
 * generated temporary password.
 */
export async function buildCorporateEmployeeReminderEmail(employeeData, temporaryPassword, options = {}) {
  const { email, firstName, lastName, companyName, employeeId, department } = employeeData;
  const plan = formatCorporateEmployeePlan(employeeData);
  const planBenefitsHtml = renderPlanBenefitsList(plan.benefits);
  const planBenefitsText = plan.benefits.join(", ");
  const loginIdentifier = email || employeeId || "";

  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'Mediqzy Corporate Health'
    },
    subject: `Reminder: Activate Your ${companyName} Health Portal Access`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #b45309; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 26px;">⏰ Reminder: Activate Your Health Portal Access</h1>
        </div>
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #0f766e; margin-bottom: 20px;">Dear ${firstName} ${lastName},</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            This is a friendly reminder that your employee health account under the <strong>${companyName}</strong> corporate health program on Mediqzy is ready and waiting. We've issued a new temporary password below so you can log in right away.
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
          <div style="background-color: #eef2ff; border-left: 4px solid #4f46e5; padding: 20px; margin: 25px 0; border-radius: 5px;">
            <h3 style="color: #4338ca; margin-top: 0;">Your Health Plan Details</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Plan:</strong> ${plan.planName}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Coverage:</strong> ${plan.coverageAmount}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Validity:</strong> ${plan.validity}</li>
              <li style="padding: 8px 0; border-bottom: 1px solid #c7d2fe;"><strong>Sponsor:</strong> ${plan.sponsor}</li>
              <li style="padding: 8px 0;"><strong>Employee Share / Co-pay:</strong> ${plan.copay}</li>
            </ul>
            <div style="margin-top: 16px; background: #ffffff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 14px 16px;">
              <p style="margin: 0 0 8px; color: #4338ca; font-weight: bold;">Included benefits</p>
              <ul style="margin: 0; padding-left: 18px;">${planBenefitsHtml}</ul>
            </div>
          </div>
          <div style="background-color: #fef3c7; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px;">
            <h3 style="color: #92400e; margin-top: 0;">🔐 Your New Login Credentials</h3>
            <p style="margin: 10px 0; color: #78350f;">
              <strong>Login Email:</strong> ${email}<br>
              <strong>Temporary Password:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 4px; font-size: 14px; color: #dc2626;">${temporaryPassword}</code>
            </p>
            <p style="margin: 15px 0 0; color: #92400e; font-size: 14px;">
              ⚠️ <strong>This replaces any password you set previously.</strong> Please change it again after logging in.
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
            <a href="https://app.mediqzy.com/login" style="background-color: #b45309; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
              Activate My Account →
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

  // Apply custom template override if configured (same placeholder set as the welcome email)
  const customTplReminder = await getCustomTemplate('corporate_employee_reminder', options);
  if (customTplReminder) {
    const vars = {
      "{{firstName}}": firstName,
      "{{lastName}}": lastName,
      "{{email}}": email,
      "{{companyName}}": companyName,
      "{{employeeId}}": employeeId || "",
      "{{department}}": department || "",
      "{{temporaryPassword}}": temporaryPassword,
      "{{password}}": temporaryPassword,
      "{{username}}": loginIdentifier,
      "{{userId}}": loginIdentifier,
      "{{loginIdentifier}}": loginIdentifier,
      "{{loginUrl}}": "https://app.mediqzy.com/login",
      "{{planName}}": plan.planName,
      "{{coverageAmount}}": plan.coverageAmount,
      "{{planValidity}}": plan.validity,
      "{{planSponsor}}": plan.sponsor,
      "{{planCopay}}": plan.copay,
      "{{planBenefits}}": planBenefitsText,
      "[First Name]": firstName,
      "[Last Name]": lastName,
      "[Employee Name]": `${firstName || ""} ${lastName || ""}`.trim(),
      "[Employee Email ID / Mobile Number]": loginIdentifier,
      "[Username]": loginIdentifier,
      "[User ID]": loginIdentifier,
      "[Employee ID]": employeeId || "",
      "[Temporary Password]": temporaryPassword,
      "[Password]": temporaryPassword,
      "[Company Name]": companyName,
      "[Department]": department || "",
      "[Login URL]": "https://app.mediqzy.com/login"
    };
    msg.subject = renderTemplate(customTplReminder.subject, vars);
    msg.html = renderTemplate(customTplReminder.html_content, vars);
  }

  return msg;
}

export async function sendCorporateEmployeeReminderEmail(employeeData, temporaryPassword, options = {}) {
  const msg = await buildCorporateEmployeeReminderEmail(employeeData, temporaryPassword, options);
  try {
    await sendMail(msg);
    console.log("Reminder email sent to corporate employee: " + msg.to);
    return { success: true, message: "Reminder email sent successfully" };
  } catch (error) {
    console.error("Error sending corporate employee reminder email:", error);
    throw error;
  }
}

export async function sendPreparedCorporateEmployeeWelcomeEmail({ to, subject, html }, options = {}) {
  if (!to || !subject || !html) {
    throw new Error("to, subject and html are required");
  }
  await sendMail({
    to,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || "noreply@mediqzy.com",
      name: "Mediqzy Corporate Health"
    },
    subject,
    html
  }, options);
  return { success: true, message: "Welcome email sent successfully" };
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

/**
 * Shared transactional email path for corporate outreach and other non-welcome sends.
 */
export async function sendTransactionalEmail({ to, subject, html, text, fromName }) {
  const bodyHtml = html || `<pre style="font-family:Segoe UI,Arial,sans-serif;white-space:pre-wrap;">${String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  await sendMail({
    to,
    subject,
    html: bodyHtml,
    from: fromName ? { name: fromName, email: undefined } : undefined,
  });
  return { success: true };
}

/**
 * Lightweight provider health for communication hub dashboards.
 */
export async function getEmailProviderStatus() {
  try {
    const smtp = await resolveSmtpConfig();
    const hasAuth = Boolean(smtp?.auth?.user && smtp?.auth?.pass);
    if (!hasAuth) {
      return {
        configured: false,
        healthy: false,
        host: smtp?.host || null,
        fromEmail: smtp?.fromEmail || null,
        provider: 'none',
        error: 'SMTP credentials are not configured',
      };
    }

    const { transporter } = await createSmtpTransport();
    await transporter.verify();

    const host = String(smtp.host || '').toLowerCase();
    const provider = isBrevoHost(host) ? 'brevo' : (shouldUseSes() ? 'ses' : 'smtp');

    return {
      configured: true,
      healthy: true,
      host: smtp.host,
      fromEmail: smtp.fromEmail || smtp.auth.user,
      provider,
      error: null,
    };
  } catch (error) {
    return {
      configured: Boolean(process.env.SMTP_USER),
      healthy: false,
      host: process.env.SMTP_HOST || null,
      fromEmail: process.env.SMTP_FROM || process.env.SMTP_USER || null,
      provider: 'smtp',
      error: error?.message || 'Email provider verification failed',
    };
  }
}

export default {
  generateSecurePassword,
  hashPassword,
  sendDoctorWelcomeEmail,
  sendHospitalWelcomeEmail,
  sendCorporateWelcomeEmail,
  buildCorporateEmployeeWelcomeEmail,
  sendCorporateEmployeeWelcomeEmail,
  sendPreparedCorporateEmployeeWelcomeEmail,
  buildCorporateEmployeeReminderEmail,
  sendCorporateEmployeeReminderEmail,
  sendTeamWelcomeEmail,
  sendTransactionalEmail,
  getEmailProviderStatus,
};
