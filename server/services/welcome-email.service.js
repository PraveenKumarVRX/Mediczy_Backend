import crypto from 'crypto';
import bcrypt from 'bcrypt';
import nodemailer from '../integrations/nodemailer.js';
import dotenv from 'dotenv';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import {
  AHC_DATE_NOT_AVAILABLE,
  MISSING_AHC_ENTITLEMENT_MESSAGE,
  buildCorporateEmployeeTemplateVars,
  formatCorporateEmployeePlan,
  renderTemplate,
  templateNeedsAhcEntitlement,
} from './welcome-email-template.util.js';

export { buildCorporateEmployeeTemplateVars, renderTemplate } from './welcome-email-template.util.js';

dotenv.config();

// ── AWS SES v2 transport (used when SES_ENABLED=true or AWS_REGION is set and SMTP fails) ──
let sesClient = null;
async function getSesClient() {
  if (sesClient) return sesClient;
  try {
    const { SESv2Client } = await import('../integrations/ses.js');
    sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'ap-south-1' });
    return sesClient;
  } catch {
    return null;
  }
}

// SES refuses any From that is not a verified identity. On this account (checked 2026-10-04)
// mysmarthealth.in is verified and mediqzy.com is NOT, yet SMTP_FROM/EMAIL_FROM point at
// noreply@mediqzy.com for the Brevo path. With SES as the only transport there is no SMTP
// fallback to absorb that, so the envelope address is pinned to a verified domain while the
// display name the caller chose is preserved.
const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'hello@mysmarthealth.in';
const SES_VERIFIED_DOMAINS = String(process.env.SES_VERIFIED_DOMAINS || 'mysmarthealth.in')
  .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);

function coerceSesFrom(from) {
  const raw = String(from || '').trim();
  const match = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  const name = (match ? match[1] : '').trim();
  const address = (match ? match[2] : raw).trim();
  const domain = address.includes('@') ? address.split('@').pop().toLowerCase() : '';
  if (domain && SES_VERIFIED_DOMAINS.includes(domain)) {
    return raw;
  }
  if (address) {
    console.warn(`[email] From ${address} is not an SES-verified identity; sending as ${SES_FROM_ADDRESS}`);
  }
  return `"${name || 'Mediqzy'}" <${SES_FROM_ADDRESS}>`;
}

function isZohoHost(host) {
  return String(host || '').toLowerCase().includes('zoho');
}

function isBrevoHost(host) {
  const value = String(host || '').toLowerCase();
  return value.includes('brevo') || value.includes('sendinblue');
}

async function sendViaSes(msg) {
  const { SendEmailCommand } = await import('../integrations/ses.js');
  const client = await getSesClient();
  if (!client) throw new Error('SES client unavailable');
  const fromAddress = coerceSesFrom(typeof msg.from === 'object'
    ? `"${msg.from.name || 'Mediqzy'}" <${msg.from.email || SES_FROM_ADDRESS}>`
    : (msg.from || `"Mediqzy Corporate Health" <${SES_FROM_ADDRESS}>`));
  // bcc is carried on msg and must be honoured by BOTH transports; SES needs it on Destination,
  // nodemailer takes a `bcc` field. Normalised to an array and filtered so an empty value can
  // never produce an empty recipient entry (SES rejects the whole send for that).
  const bccList = (Array.isArray(msg.bcc) ? msg.bcc : [msg.bcc])
    .map((a) => String(a || '').trim()).filter(Boolean);
  await client.send(new SendEmailCommand({
    FromEmailAddress: fromAddress,
    Destination: {
      ToAddresses: [msg.to],
      ...(bccList.length ? { BccAddresses: bccList } : {}),
    },
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

  const bccList = (Array.isArray(msg.bcc) ? msg.bcc : [msg.bcc])
    .map((a) => String(a || '').trim()).filter(Boolean);
  return transporter.sendMail({
    from: buildFromAddress(msg, smtp),
    to: msg.to,
    ...(bccList.length ? { bcc: bccList.join(', ') } : {}),
    subject: msg.subject,
    html: msg.html,
  });
}

// Normalize SendGrid-style msg object → nodemailer format and send.
// Transport policy: SES only. Brevo SMTP is no longer an automatic fallback — a Brevo send
// now has to be asked for explicitly (options.provider='brevo' or EMAIL_PROVIDER=brevo), so a
// transient SES error surfaces as a failure instead of silently re-routing mail to another
// provider with a different From domain and different deliverability reputation.
// options.provider: 'ses' | 'brevo' | 'auto'; default comes from EMAIL_PROVIDER, itself 'ses'.
async function sendMail(msg, options = {}) {
  const configuredProvider = String(process.env.EMAIL_PROVIDER || 'ses').toLowerCase();
  const provider = options.provider || configuredProvider;
  const normalizedProvider = ['ses', 'brevo', 'auto'].includes(String(provider || '').toLowerCase())
    ? String(provider).toLowerCase()
    : 'ses';
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
        if (process.env.EMAIL_TRANSPORT_LOG !== 'false') {
          console.log(`[email] delivered via ${channel.toUpperCase()} -> ${msg.to}`);
        }
        return channel;
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
 * Priority: corporate-specific assignment > team-user assignment > any global assignment.
 * Returns { subject, html_content } if found, otherwise null (use default).
 */
async function getCustomTemplate(eventType, options = {}) {
  const { teamUserId, corporateId } = options;
  try {
    // 1. Try corporate-specific assignment first
    if (corporateId) {
      const corpRows = await postgresSequelize.query(
        `SELECT wet.subject, wet.html_content
         FROM email_event_assignments eea
         JOIN welcome_email_templates wet ON wet.id = eea.template_id
         WHERE eea.event_type = :eventType AND eea.corporate_id = :corporateId
         ORDER BY eea.updated_at DESC LIMIT 1`,
        { replacements: { eventType, corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (Array.isArray(corpRows) && corpRows.length > 0) return corpRows[0];
    }

    // 2. Fall back to team-user-level assignment
    const sql = [
      'SELECT wet.subject, wet.html_content',
      'FROM email_event_assignments eea',
      'JOIN welcome_email_templates wet ON wet.id = eea.template_id',
      'WHERE eea.event_type = :eventType AND eea.corporate_id IS NULL'
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

/** The employee's own open check-up at this corporate, dated in India time as DD/MM/YYYY. */
async function getOpenAhcEntitlement({ userId, corporateId }) {
  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0 || !corporateId) return null;
  try {
    const [row] = await postgresSequelize.query(
      `SELECT "packageName",
              to_char("validTo" AT TIME ZONE 'Asia/Kolkata', 'DD/MM/YYYY') AS "validUntil"
         FROM user_health_packages
        WHERE "userId" = :userId AND corporate_id = :corporateId
          AND LOWER(status) = 'active' AND "usedAt" IS NULL AND "validTo" >= NOW()
        ORDER BY "validTo" DESC
        LIMIT 1`,
      { replacements: { userId: numericUserId, corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return row || null;
  } catch (error) {
    console.error('Could not read the health checkup for a welcome email:', error?.message || error);
    return null;
  }
}

/**
 * Renders a custom template onto msg. A template that quotes the check-up expiry is marked
 * missingAhcEntitlement when the employee has none, so no caller sends it with a blank date.
 */
async function applyCustomTemplate(msg, template, employeeData, temporaryPassword, options) {
  const needsAhc = templateNeedsAhcEntitlement(template);
  const entitlement = needsAhc
    ? await getOpenAhcEntitlement({ userId: employeeData.userId, corporateId: options.corporateId })
    : null;
  const vars = buildCorporateEmployeeTemplateVars({
    ...employeeData,
    ahcValidUntil: entitlement?.validUntil || (needsAhc ? AHC_DATE_NOT_AVAILABLE : ''),
    ahcPackageName: entitlement?.packageName || '',
  }, temporaryPassword);
  msg.subject = renderTemplate(template.subject, vars);
  msg.html = renderTemplate(template.html_content, vars);
  if (needsAhc && !entitlement) msg.missingAhcEntitlement = true;
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
      name: 'My SmartHealth'
    },
    subject: 'Welcome to My SmartHealth - Corporate Portal Access 🏢',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #7c3aed; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to My SmartHealth! 🎉</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #7c3aed; margin-bottom: 20px;">Dear ${companyName} Team,</h2>
          
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            Your corporate account has been successfully created on My SmartHealth! 🏢
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
          <p>© 2026 My SmartHealth. All rights reserved.</p>
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


function renderPlanBenefitsList(benefits = []) {
  return benefits.map(benefit => `<li style="padding: 6px 0; color: #374151;">${benefit}</li>`).join("");
}

export async function buildCorporateEmployeeWelcomeEmail(employeeData, temporaryPassword, options = {}) {
  const { email, firstName, lastName, companyName, employeeId, department, loginUid } = employeeData;
  const employeeName = `${firstName || ''} ${lastName || ''}`.trim() || firstName || 'Employee';
  const plan = formatCorporateEmployeePlan(employeeData);
  const planBenefitsHtml = renderPlanBenefitsList(plan.benefits);
  const planBenefitsText = plan.benefits.join(", " );
  // loginUid (the platform-issued 6-char corporate_employees.unique_id) is the real
  // login identifier for admin/HR-provisioned accounts; email is the fallback.
  const loginIdentifier = loginUid || email || employeeId || "";

  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'My SmartHealth'
    },
    subject: `Welcome to ${companyName} Employee Health Portal – Your Login Details`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #0f766e; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 26px;">Welcome to My SmartHealth 🏥</h1>
        </div>
        <div style="background-color: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #0f766e; margin-bottom: 20px;">Dear ${firstName} ${lastName},</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">
            Your employee health account has been activated under the <strong>${companyName}</strong> corporate health program on My SmartHealth. Your plan details and login credentials are below.
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
              <strong>Login ID:</strong> ${loginIdentifier}<br>
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
          <p>© 2026 My SmartHealth. All rights reserved.</p>
        </div>
      </div>
    `
  };

  // Apply custom template override if configured
  const customTplEmp = await getCustomTemplate('corporate_employee_welcome', options);
  if (customTplEmp) {
    await applyCustomTemplate(msg, customTplEmp, employeeData, temporaryPassword, options);
  }

  return msg;
}

export async function sendCorporateEmployeeWelcomeEmail(employeeData, temporaryPassword, options = {}) {
  const msg = await buildCorporateEmployeeWelcomeEmail(employeeData, temporaryPassword, options);
  if (msg.missingAhcEntitlement) throw new Error(MISSING_AHC_ENTITLEMENT_MESSAGE);
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
  const { email, firstName, lastName, companyName, employeeId, department, loginUid } = employeeData;
  const plan = formatCorporateEmployeePlan(employeeData);
  const planBenefitsHtml = renderPlanBenefitsList(plan.benefits);
  const planBenefitsText = plan.benefits.join(", ");
  const loginIdentifier = loginUid || email || employeeId || "";

  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
      name: 'My SmartHealth'
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
            This is a friendly reminder that your employee health account under the <strong>${companyName}</strong> corporate health program on My SmartHealth is ready and waiting. We've issued a new temporary password below so you can log in right away.
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
              <strong>Login ID:</strong> ${loginIdentifier}<br>
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
          <p>© 2026 My SmartHealth. All rights reserved.</p>
        </div>
      </div>
    `
  };

  // Apply custom template override if configured (same placeholder set as the welcome email)
  const customTplReminder = await getCustomTemplate('corporate_employee_reminder', options);
  if (customTplReminder) {
    await applyCustomTemplate(msg, customTplReminder, employeeData, temporaryPassword, options);
  }

  return msg;
}

export async function sendCorporateEmployeeReminderEmail(employeeData, temporaryPassword, options = {}) {
  const msg = await buildCorporateEmployeeReminderEmail(employeeData, temporaryPassword, options);
  if (msg.missingAhcEntitlement) throw new Error(MISSING_AHC_ENTITLEMENT_MESSAGE);
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
      name: "My SmartHealth"
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
export async function sendTransactionalEmail({ to, subject, html, text, fromName, bcc, provider }) {
  const bodyHtml = html || `<pre style="font-family:Segoe UI,Arial,sans-serif;white-space:pre-wrap;">${String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  const channel = await sendMail({
    to,
    subject,
    html: bodyHtml,
    ...(bcc ? { bcc } : {}),
    from: fromName ? { name: fromName, email: undefined } : undefined,
  }, provider ? { provider } : {});
  return { success: true, provider: channel };
}

/**
 * Lightweight provider health for communication hub dashboards.
 */
export async function getEmailProviderStatus() {
  const configuredProvider = String(process.env.EMAIL_PROVIDER || 'ses').toLowerCase();

  if (configuredProvider === 'ses') {
    try {
      const { GetAccountCommand } = await import('../integrations/ses.js');
      const client = await getSesClient();
      if (!client) throw new Error('SES SDK unavailable');
      const account = await client.send(new GetAccountCommand({}));
      return {
        configured: true,
        healthy: Boolean(account?.SendingEnabled),
        host: `ses:${process.env.AWS_REGION || 'ap-south-1'}`,
        fromEmail: SES_FROM_ADDRESS,
        provider: 'ses',
        sandbox: !account?.ProductionAccessEnabled,
        quota24h: account?.SendQuota?.Max24HourSend ?? null,
        sent24h: account?.SendQuota?.SentLast24Hours ?? null,
        error: account?.SendingEnabled ? null : 'SES sending is disabled for this account',
      };
    } catch (error) {
      return {
        configured: true,
        healthy: false,
        host: `ses:${process.env.AWS_REGION || 'ap-south-1'}`,
        fromEmail: SES_FROM_ADDRESS,
        provider: 'ses',
        error: error?.message || 'SES verification failed',
      };
    }
  }

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
