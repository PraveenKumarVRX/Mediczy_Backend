/** CRM forgot-password flow for the dedicated runtime. Deliberately self-contained:
 * no shared SES/Twilio/Gupshup senders, no cross-product models. Email delivery
 * uses this tenant's own Email/SMTP integration record (Communication Hub settings). */
import crypto from 'node:crypto';
import nodemailer from '../integrations/nodemailer.js';
import sharedPool from '../db/pgPool.js';
import userModel from '../models/user.model.intelligent.js';
import OTP from '../models/otp.model.intelligent.js';

const OTP_PURPOSE = 'crm_password_reset';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = 'If a CRM account exists for that email, a reset code has been sent.';

const normalizeEmail = email => (email ? String(email).trim().toLowerCase() : null);

function hasCrmAccess(account) {
  const metadata = typeof account.metadata === 'string' ? JSON.parse(account.metadata || '{}') : (account.metadata || {});
  return Boolean(account.isAdmin || account.isTeam || account.role === 'team' || account.role === 'admin' || metadata.isCRM === true || metadata.crmAccess === true);
}

function decryptCredentials(value) {
  const raw = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/i.test(raw || '')) return {};
  const [iv, tag, bytes] = String(value).split(':');
  try {
    const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(raw, 'hex'), Buffer.from(iv, 'hex'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(bytes, 'hex')), cipher.final()]).toString('utf8'));
  } catch { return {}; }
}

async function getSmtpConfig(tenantId) {
  const { rows } = await sharedPool.query(
    `SELECT config, encrypted_credentials FROM crm_marketing_integrations
     WHERE tenant_id = $1 AND provider = 'email' AND integration_type = 'communication' AND status = 'configured' LIMIT 1`,
    [tenantId]
  );
  const row = rows[0];
  if (!row) return null;
  const config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
  if (config.provider !== 'smtp' || !config.smtpHost || !config.smtpPort) return null;
  const credentials = row.encrypted_credentials ? decryptCredentials(row.encrypted_credentials) : {};
  if (!config.username || !credentials.password) return null;
  return { host: config.smtpHost, port: Number(config.smtpPort), fromEmail: config.fromEmail, fromName: config.fromName, username: config.username, password: credentials.password };
}

function otpEmail(name, code) {
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#4338ca">Medstar CRM password reset</h2>
    <p>Hello ${name},</p>
    <p>Use this code to reset your CRM password. It expires in 10 minutes.</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;background:#f4f4f8;padding:16px;border-radius:8px">${code}</p>
    <p>If you didn't request this, you can ignore this email.</p>
  </div>`;
  const text = `Medstar CRM password reset\n\nHello ${name},\n\nYour reset code: ${code}\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  return { html, text };
}

async function sendOtpEmail(tenantId, account, code) {
  const smtp = await getSmtpConfig(tenantId);
  if (!smtp) { const error = new Error('EMAIL_NOT_CONFIGURED'); error.code = 'EMAIL_NOT_CONFIGURED'; throw error; }
  const transport = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.port === 465,
    auth: { user: smtp.username, pass: smtp.password },
  });
  const { html, text } = otpEmail(account.firstName || account.email, code);
  await transport.sendMail({
    from: smtp.fromName ? `"${smtp.fromName}" <${smtp.fromEmail || smtp.username}>` : (smtp.fromEmail || smtp.username),
    to: account.email,
    subject: 'Password Reset Code - Medstar CRM',
    html, text,
  });
}

export async function requestPasswordReset({ email, tenantId }) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { success: true, message: GENERIC_MESSAGE };
  const { rows } = await sharedPool.query(
    `SELECT id, email, "firstName", "lastName", role, "isAdmin", "isTeam", metadata, status
     FROM users WHERE tenant_id = $1 AND lower(email) = $2 LIMIT 1`,
    [tenantId, normalized]
  );
  const account = rows[0];
  if (!account || account.status !== 'active' || !hasCrmAccess(account)) return { success: true, message: GENERIC_MESSAGE };
  const otp = await OTP.generate({ email: normalized, purpose: OTP_PURPOSE, expiryMinutes: 10, userId: account.id });
  try {
    await sendOtpEmail(tenantId, account, otp.code);
  } catch (error) {
    if (error.code === 'EMAIL_NOT_CONFIGURED') {
      return { success: false, code: 'EMAIL_NOT_CONFIGURED', message: 'Password reset email could not be sent: configure Email/SMTP under Communication Hub settings first.' };
    }
    return { success: false, message: 'Password reset email could not be sent. Try again shortly.' };
  }
  return { success: true, message: GENERIC_MESSAGE, data: { expiresIn: '10 minutes' } };
}

export async function verifyOtpAndIssueResetToken({ email, code, tenantId }) {
  const normalized = normalizeEmail(email);
  const otpResult = await OTP.verify({ email: normalized, code, purpose: OTP_PURPOSE });
  if (!otpResult.success) return { success: false, message: otpResult.message };
  const { rows } = await sharedPool.query(
    `SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = $2 LIMIT 1`, [tenantId, normalized]
  );
  const account = rows[0];
  if (!account) return { success: false, message: 'Account not found' };
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await sharedPool.query(
    `UPDATE users SET "passwordResetToken" = $1, "passwordResetExpires" = $2 WHERE id = $3`,
    [resetTokenHash, expiresAt, account.id]
  );
  return { success: true, message: 'OTP verified successfully', data: { resetToken, expiresAt } };
}

export async function resetPassword({ resetToken, newPassword, tenantId }) {
  if (!resetToken || typeof resetToken !== 'string') return { success: false, message: 'Invalid reset token provided' };
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) return { success: false, message: 'Invalid password provided' };
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const { rows } = await sharedPool.query(
    `SELECT id FROM users WHERE "passwordResetToken" = $1 AND tenant_id = $2 AND "passwordResetExpires" > NOW() LIMIT 1`,
    [resetTokenHash, tenantId]
  );
  const row = rows[0];
  if (!row) return { success: false, message: 'Invalid or expired reset token' };
  const account = await userModel.findByPk(row.id);
  account.password = newPassword;
  account.passwordResetToken = null;
  account.passwordResetExpires = null;
  await account.save();
  return { success: true, message: 'Password reset successfully' };
}
