import express from 'express';
import nodemailer from 'nodemailer';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

// Strict rate limit: 5 submissions per IP per 15 minutes
const leadSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions. Please try again later.' },
});

async function getAdminEmailConfig() {
  const result = await sharedPool.query(
    `SELECT id, name, host, port, secure, username, password, "fromEmail" AS from_email, "fromName" AS from_name
     FROM email_configs
     WHERE "isActive" = true
     ORDER BY "isDefault" DESC, "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST
     LIMIT 1`
  );

  const row = result.rows[0];
  if (!row || !row.host || !row.password) {
    return null;
  }

  return {
    source: 'admin-email-config',
    host: row.host,
    port: Number(row.port || 587),
    secure: row.secure === true || Number(row.port) === 465,
    user: row.username,
    pass: row.password,
    fromEmail: row.from_email || row.username,
    fromName: row.from_name || 'Mediqzy',
  };
}

async function getTeamEmailSettingsConfig() {
  const result = await sharedPool.query(
    `SELECT email, display_name, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password
     FROM email_settings
     WHERE deleted_at IS NULL AND is_active = true
     ORDER BY is_default DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1`
  );

  const row = result.rows[0];
  if (!row || !row.smtp_host || !row.smtp_password) {
    return null;
  }

  return {
    source: 'team-email-settings',
    host: row.smtp_host,
    port: Number(row.smtp_port || 587),
    secure: row.smtp_secure === true || Number(row.smtp_port) === 465,
    user: row.smtp_username || row.email,
    pass: row.smtp_password,
    fromEmail: row.smtp_username || row.email,
    fromName: row.display_name || 'Mediqzy',
  };
}

function getEnvFallbackConfig() {
  const host = (process.env.MARKETING_LEADS_SMTP_HOST || process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  return {
    source: 'environment',
    host,
    port,
    secure: port === 465,
    user,
    pass,
    fromEmail: (process.env.SMTP_FROM || user).trim(),
    fromName: 'Mediqzy',
  };
}

async function sendLeadNotification(mailOptions) {
  const configs = [
    await getAdminEmailConfig(),
    await getTeamEmailSettingsConfig(),
    getEnvFallbackConfig(),
  ].filter(Boolean);

  let lastError = null;
  for (const config of configs) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      await transporter.sendMail({
        ...mailOptions,
        from: `"${config.fromName}" <${config.fromEmail}>`,
      });

      return { source: config.source };
    } catch (error) {
      lastError = error;
      console.error(`[Marketing Lead] Email send failed via ${config.source}:`, error.message);
    }
  }

  throw lastError || new Error('No email configuration available');
}

router.post(
  '/marketing-leads',
  leadSubmitLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 200 }).withMessage('Name too long'),
    body('phone').trim().notEmpty().withMessage('Phone is required').isLength({ max: 30 }).withMessage('Phone too long'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail().isLength({ max: 254 }).withMessage('Email too long'),
    body('organization').optional({ checkFalsy: true }).trim().isLength({ max: 300 }).withMessage('Organization name too long'),
    body('entityType').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Entity type too long'),
    body('requirements').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Requirements too long'),
    body('sourcePage').optional({ checkFalsy: true }).trim().isURL({ require_protocol: true, protocols: ['http', 'https'] }).withMessage('Invalid source page').isLength({ max: 500 }).withMessage('Source page URL too long'),
    body('_gotcha').optional({ checkFalsy: false }).isString(),
    body('_lt').optional({ checkFalsy: true }).isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    // Honeypot: bots fill this hidden field — silently discard with fake success
    if (req.body._gotcha) {
      console.warn('[Marketing Lead] Honeypot triggered from IP:', req.ip);
      return res.status(200).json({ success: true, stored: false, emailed: false, leadId: null, message: 'Lead captured successfully' });
    }

    // Timing: reject if submitted in under 2.5 s — no human reads and fills a form that fast
    const lt = parseInt(String(req.body._lt || '0'), 10);
    if (lt > 0 && (Date.now() - lt) < 2500) {
      console.warn('[Marketing Lead] Timing check failed (%dms) from IP: %s', Date.now() - lt, req.ip);
      return res.status(200).json({ success: true, stored: false, emailed: false, leadId: null, message: 'Lead captured successfully' });
    }

    const {
      name,
      phone,
      email,
      organization = '',
      entityType = '',
      requirements = '',
      sourcePage = 'https://app.mediqzy.com/#demo',
    } = req.body;

    const cleanPhone = String(phone).replace(/\D/g, '');
    const tags = ['marketing-site', 'demo-request', 'website'];
    const customFields = {
      entityType,
      sourcePage,
      preferredChannel: 'whatsapp',
      submittedAt: new Date().toISOString(),
      referer: req.get('Referer') || null,
      origin: req.get('Origin') || null,
      ip: req.ip,
    };

    let leadId = null;
    let stored = false;
    let emailed = false;

    try {
      const result = await sharedPool.query(
        `INSERT INTO crm_leads (name, email, phone, company, designation, source, status, priority, notes, tags, custom_fields, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          name,
          email,
          cleanPhone || phone,
          organization || null,
          entityType ? `${entityType} Demo Request` : 'Website Demo Request',
          'marketing-website',
          'new',
          'high',
          requirements || null,
          JSON.stringify(tags),
          JSON.stringify(customFields),
          0,
        ]
      );

      leadId = result.rows[0]?.id || null;
      stored = true;
    } catch (error) {
      console.error('[Marketing Lead] Failed to store CRM lead:', error.message);
    }

    try {
      const toAddress = process.env.MARKETING_LEADS_TO || 'support@mediqzy.com';

      // HTML-escape user-supplied values to prevent HTML injection in email
      const esc = (str) => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');

      await sendLeadNotification({
        to: toAddress,
        replyTo: email,
        subject: `New Mediqzy Demo Lead${organization ? ` - ${organization.substring(0, 80)}` : ''}`,
        text: [
          'New marketing demo lead',
          `Name: ${name}`,
          `Organization: ${organization || '-'}`,
          `Phone: ${cleanPhone || phone}`,
          `Email: ${email}`,
          `Entity Type: ${entityType || '-'}`,
          `Requirements: ${requirements || '-'}`,
          `CRM Lead ID: ${leadId || 'not stored'}`,
          `Source Page: ${sourcePage}`,
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:720px">
            <h2 style="margin:0 0 16px">New Mediqzy Demo Lead</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;font-weight:700">Name</td><td style="padding:8px 0">${esc(name)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Organization</td><td style="padding:8px 0">${esc(organization) || '-'}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Phone</td><td style="padding:8px 0">${esc(cleanPhone || phone)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Email</td><td style="padding:8px 0">${esc(email)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Entity Type</td><td style="padding:8px 0">${esc(entityType) || '-'}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Requirements</td><td style="padding:8px 0">${esc(requirements) || '-'}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">CRM Lead ID</td><td style="padding:8px 0">${esc(leadId || 'not stored')}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Source</td><td style="padding:8px 0">${esc(sourcePage)}</td></tr>
            </table>
          </div>
        `,
      });

      emailed = true;
    } catch (error) {
      console.error('[Marketing Lead] Failed to send email notification:', error.message);
    }

    return res.status(stored || emailed ? 200 : 500).json({
      success: stored || emailed,
      stored,
      emailed,
      leadId,
      message: stored || emailed
        ? 'Lead captured successfully'
        : 'Failed to capture lead',
    });
  }
);

export default router;