/**
 * shared/registrationHelpers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Common utilities for entity registration routes:
 *   • multer config (files + id card)
 *   • rate limiter
 *   • magic-bytes validation
 *   • ClamAV scanner
 *   • OTP route installer (addOtpRoutes)
 *   • MinIO document uploader (uploadDocuments)
 *   • Admin lead email sender (sendAdminLeadEmail)
 */

import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { ipKeyGenerator } from 'express-rate-limit';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import OTP from '../../models/otp.model.intelligent.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import emailService from '../../services/emailService.js';
import { EmailLog } from '../../models/email.model.js';
import crypto from 'crypto';

const parsedVerificationTicketTtl = Number.parseInt(
  process.env.REGISTRATION_VERIFICATION_TICKET_TTL_SECONDS || '',
  10
);

// Doctor onboarding can take time (documents, agreement, signature), so keep
// verification proof valid long enough to complete the flow reliably.
const VERIFICATION_TICKET_TTL_SECONDS =
  Number.isFinite(parsedVerificationTicketTtl) && parsedVerificationTicketTtl > 0
    ? parsedVerificationTicketTtl
    : 4 * 60 * 60;

const toBase64Url = (value) => Buffer.from(value).toString('base64url');

const normalizeTicketIdentifier = (type, value) => {
  const raw = String(value || '').trim();
  if (type === 'email') return raw.toLowerCase();
  if (type === 'phone') {
    const digits = raw.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }
  return raw;
};

const getTicketSecret = () =>
  process.env.REGISTRATION_VERIFICATION_TICKET_SECRET
  || process.env.JWT_SECRET
  || process.env.SECRET_TOKEN
  || 'registration-verification-ticket-dev-secret';

const issueRegistrationVerificationTicket = ({ type, identifier, entityLabel }) => {
  const normalizedIdentifier = normalizeTicketIdentifier(type, identifier);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    type,
    identifier: normalizedIdentifier,
    entity: String(entityLabel || ''),
    iat: now,
    exp: now + VERIFICATION_TICKET_TTL_SECONDS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getTicketSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const safeEquals = (a, b) => {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

export const verifyRegistrationVerificationTicket = ({ ticket, type, identifier, entityLabel }) => {
  try {
    if (!ticket || typeof ticket !== 'string' || !ticket.includes('.')) {
      return { success: false, message: 'Missing or invalid verification ticket' };
    }
    const [encodedPayload, signature] = ticket.split('.');
    if (!encodedPayload || !signature) {
      return { success: false, message: 'Malformed verification ticket' };
    }
    const expectedSig = crypto
      .createHmac('sha256', getTicketSecret())
      .update(encodedPayload)
      .digest('base64url');
    if (!safeEquals(signature, expectedSig)) {
      return { success: false, message: 'Verification ticket signature mismatch' };
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.exp || now > Number(payload.exp)) {
      return { success: false, message: 'Verification ticket expired' };
    }
    if (String(payload.type) !== String(type)) {
      return { success: false, message: 'Verification ticket type mismatch' };
    }
    if (String(payload.entity || '') !== String(entityLabel || '')) {
      return { success: false, message: 'Verification ticket entity mismatch' };
    }

    const expectedIdentifier = normalizeTicketIdentifier(type, identifier);
    if (String(payload.identifier || '') !== expectedIdentifier) {
      return { success: false, message: 'Verification ticket does not match submitted contact' };
    }

    return { success: true, payload };
  } catch (error) {
    return { success: false, message: 'Unable to validate verification ticket' };
  }
};

// ── Multer ────────────────────────────────────────────────────────────────────
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const DANGEROUS_EXT = /\.(php|js|exe|sh|bat|cmd|py|rb|pl|asp|aspx|jsp|cgi|msi|dll|so|elf)$/i;

const _storage = multer.memoryStorage();
const _filter = (_, file, cb) => {
  if (!ALLOWED_MIMES.includes(file.mimetype)) return cb(new Error('Invalid file type. Only PDF, JPEG, PNG, WebP allowed.'));
  if (DANGEROUS_EXT.test(file.originalname)) return cb(new Error('Suspicious file name rejected.'));
  cb(null, true);
};

/**
 * Returns a multer `upload.fields` middleware.
 * @param {string} [idCardFieldName='contactIdCard'] - name attribute for optional ID card field
 */
export function createUploadMiddleware(idCardFieldName = 'contactIdCard') {
  const upload = multer({
    storage: _storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 6 },
    fileFilter: _filter,
  });
  const fields = upload.fields([
    { name: 'documents', maxCount: 5 },
    { name: idCardFieldName, maxCount: 1 },
  ]);
  // Ensure req.body is always an object (raw POSTs without Content-Type leave it undefined)
  return (req, res, next) => {
    fields(req, res, err => {
      req.body = req.body || {};
      if (err) return next(err);
      next();
    });
  };
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: req =>
    ipKeyGenerator(req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '0.0.0.0'),
  handler: (_, res) =>
    res.status(429).json({ success: false, message: 'Too many registration attempts. Please try again in an hour.' }),
  skipSuccessfulRequests: true,
});

// Per-email/phone OTP limiter for registration — 5 per 15 min per identifier
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase().trim();
    const phone = req.body?.phone?.replace(/\s+/g, '');
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '0.0.0.0';
    const ip = ipKeyGenerator(rawIp);
    return `otp:reg:${email || phone || ip}`;
  },
  handler: (_, res) =>
    res.status(429).json({ success: false, message: 'Too many OTP requests. Please wait 15 minutes before trying again.' }),
  skipSuccessfulRequests: false,
});

// ── Magic bytes validator ─────────────────────────────────────────────────────
export function validateMagicBytes(buffer, mimetype) {
  if (!buffer || buffer.length < 12) return false;
  const b = buffer;
  switch (mimetype) {
    case 'application/pdf':      return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    case 'image/jpeg':
    case 'image/jpg':            return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
    case 'image/png':            return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    case 'image/webp':           return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                                        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    default:                     return false;
  }
}

// ── ClamAV virus scanner ──────────────────────────────────────────────────────
export async function scanWithClamAV(buffer, filename) {
  const tmpPath = path.join(tmpdir(), `mediczy_scan_${randomBytes(12).toString('hex')}`);
  try {
    await writeFile(tmpPath, buffer);
    return await new Promise(resolve => {
      const scanner = process.env.CLAMAV_SCANNER || '/usr/bin/clamdscan';
      const fallbackScanner = '/usr/bin/clamscan';
      const runScan = (bin, allowFallback = true) => execFile(bin, ['--no-summary', '--stdout', tmpPath], { timeout: 10000 }, (err, stdout) => {
        if (err?.code === 1) {
          const line = stdout?.split('\n').find(l => l.includes('FOUND')) || 'Malware detected';
          resolve({ clean: false, threat: line.trim() });
        } else if (err && allowFallback && bin !== fallbackScanner) {
          runScan(fallbackScanner, false);
        } else {
          if (err?.code === 2) console.warn('ClamAV scan error for ' + filename + ':', err.message);
          resolve({ clean: true });
        }
      });
      runScan(scanner);
    });
  } finally {
    unlink(tmpPath).catch(() => {});
  }
}

// ── Helper: validate and upload files to MinIO ────────────────────────────────
export async function uploadDocuments({ files, emailKey, entityKey, req }) {
  const docs = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const docType = req.body[`docType_${i}`] || 'other';
    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      throw { status: 400, message: `File "${file.originalname}" failed content validation. Ensure it is a genuine PDF or image.` };
    }
    const scan = await scanWithClamAV(file.buffer, file.originalname);
    if (!scan.clean) {
      console.error(`Malware detected in upload from IP ${req.ip}: ${scan.threat}`);
      throw { status: 400, message: `File "${file.originalname}" was rejected by our virus scanner.` };
    }
    try {
      const { uploadToMinio } = await import('../../services/minio-upload.service.js');
      const result = await uploadToMinio({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        keyPrefix: `registrations/${entityKey}/${emailKey}`,
      });
      docs.push({ docType, originalName: file.originalname, url: result.url, key: result.key, bucket: result.bucket, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() });
    } catch (uploadErr) {
      console.warn(`MinIO upload failed for "${file.originalname}" (non-critical, registration will proceed):`, uploadErr.message);
      docs.push({ docType, originalName: file.originalname, url: null, key: null, bucket: null, mimeType: file.mimetype, size: file.size, uploadedAt: new Date(), uploadFailed: true });
    }
  }
  return docs;
}

export async function uploadIdCard({ file, emailKey, entityKey, req }) {
  if (!file) return null;
  if (!validateMagicBytes(file.buffer, file.mimetype)) {
    throw { status: 400, message: `ID card failed content validation.` };
  }
  const scan = await scanWithClamAV(file.buffer, file.originalname);
  if (!scan.clean) throw { status: 400, message: `ID card was rejected by our virus scanner.` };
  try {
    const { uploadToMinio } = await import('../../services/minio-upload.service.js');
    const result = await uploadToMinio({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      keyPrefix: `registrations/${entityKey}-id/${emailKey}`,
    });
    return { originalName: file.originalname, url: result.url, key: result.key, bucket: result.bucket, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() };
  } catch (uploadErr) {
    console.warn(`MinIO upload failed for ID card "${file.originalname}" (non-critical, registration will proceed):`, uploadErr.message);
    return { originalName: file.originalname, url: null, key: null, bucket: null, mimeType: file.mimetype, size: file.size, uploadedAt: new Date(), uploadFailed: true };
  }
}

// ── Admin notification email ──────────────────────────────────────────────────
const fmtBytes = b => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

export async function sendAdminLeadEmail({ entityLabel, name, email, phone, city, state, registrationId, extraRows = [], docs = [], idCardMeta = null }) {
  try {
    const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: (process.env.SMTP_USER || '').trim(), pass: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim() },
    });
    const submittedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const docRows = docs.length > 0
      ? docs.map((d, i) => `<tr style="${i % 2 === 0 ? '' : 'background:#f1f5f9'}"><td style="padding:10px 0;color:#64748b;font-weight:600;width:160px">${d.docType}</td><td style="padding:10px 0;color:#0f172a"><a href="${d.url}" style="color:#0d9488">${d.originalName}</a> <span style="color:#94a3b8;font-size:11px">${fmtBytes(d.size)}</span></td></tr>`).join('')
      : '';
    const extraTableRows = extraRows.map((r, i) => `<tr${i % 2 === 0 ? '' : ' style="background:#f1f5f9"'}><td style="padding:10px ${i % 2 === 0 ? '0' : '8px'};color:#64748b;font-weight:600;width:160px">${r[0]}</td><td style="padding:10px ${i % 2 === 0 ? '0' : '8px'};color:#0f172a">${r[1]}</td></tr>`).join('');

    await transporter.sendMail({
      from: `"Mediczy Leads" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'support@mediqzy.com'}>`,
      to: 'info@mysmarthealth.in',
      subject: `🏥 New ${entityLabel} Lead: ${name} — ${city || 'India'}`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:linear-gradient(135deg,#0d9488,#0891b2);padding:28px 32px">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800">🏥 New ${entityLabel} Registration</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Received on ${submittedAt} IST</p>
          </div>
          <div style="padding:28px 32px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:10px 0;color:#64748b;font-weight:600;width:160px">${entityLabel} Name</td><td style="padding:10px 0;color:#0f172a;font-weight:700">${name}</td></tr>
              <tr style="background:#f1f5f9"><td style="padding:10px 8px;color:#64748b;font-weight:600">Email</td><td style="padding:10px 8px;color:#0f172a"><a href="mailto:${email}" style="color:#0d9488">${email}</a></td></tr>
              <tr><td style="padding:10px 0;color:#64748b;font-weight:600">Phone</td><td style="padding:10px 0;color:#0f172a">+91 ${phone}</td></tr>
              <tr style="background:#f1f5f9"><td style="padding:10px 8px;color:#64748b;font-weight:600">Location</td><td style="padding:10px 8px;color:#0f172a">${city}${state ? ', ' + state : ''}</td></tr>
              ${extraTableRows}
            </table>
            ${docs.length > 0 ? `<div style="margin-top:20px"><h3 style="margin:0 0 12px;font-size:13px;font-weight:800;color:#475569;text-transform:uppercase">Documents</h3><table style="width:100%;border-collapse:collapse;font-size:14px">${docRows}</table></div>` : ''}
            ${idCardMeta ? `<div style="margin-top:16px"><p style="margin:0;font-size:14px;color:#64748b">ID Card: <a href="${idCardMeta.url}" style="color:#0d9488">${idCardMeta.originalName}</a></p></div>` : ''}
            <div style="margin-top:24px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
              <p style="margin:0;font-size:13px;color:#166534">✅ Registration ID: <strong>${registrationId}</strong> — Status: <strong>Pending Review</strong></p>
            </div>
          </div>
          <div style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">Mediczy · support@mediqzy.com</p>
          </div>
        </div>`,
    });
    console.log(`Admin lead notification sent for ${entityLabel}: ${name} (${email})`);
  } catch (mailErr) {
    console.warn(`Admin lead email failed (non-critical) for ${entityLabel}:`, mailErr.message);
  }
}

// ── OTP route installer ───────────────────────────────────────────────────────
/**
 * Adds send-email-otp, verify-email-otp, send-phone-otp, verify-phone-otp
 * endpoints to the given Express router.
 * @param {import('express').Router} router
 * @param {string} entityLabel - e.g. 'Lab', 'Pharmacy'
 * @param {string} [accentColor='#0d9488']
 */
export function addOtpRoutes(router, entityLabel, accentColor = '#0d9488') {
  // ─── Send Email OTP ────────────────────────────────────────────────────────
  router.post('/send-email-otp', otpLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    try {
      const otp = await OTP.generate({ email, purpose: 'registration', expiryMinutes: 10 });

      // Use the DB-driven email service (Zoho SMTP, 5k/day, pooled)
      const dbConfig = await emailService.getDefaultConfig();
      let transporter;
      let fromAddress;

      if (dbConfig) {
        transporter = await emailService.getTransporter(dbConfig);
        fromAddress = `"${dbConfig.fromName}" <${dbConfig.fromEmail}>`;
      } else {
        // Env-var fallback (should not normally be reached)
        const port = parseInt(process.env.SMTP_PORT) || 587;
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtppro.zoho.in',
          port,
          secure: port === 465,
          auth: { user: (process.env.SMTP_USER || '').trim(), pass: (process.env.SMTP_PASSWORD || '').trim() },
          tls: { rejectUnauthorized: false },
        });
        fromAddress = process.env.EMAIL_FROM || `"Mediqzy" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
      }

      // Create log entry before sending so we have the ID for the tracking pixel
      const logEntry = await EmailLog.create({
        to: email,
        from: fromAddress,
        subject: `${otp.code} — Your Mediczy Email Verification OTP`,
        status: 'pending',
        priority: 'high',
        configId: dbConfig ? dbConfig.id : null,
        metadata: { entityLabel, purpose: 'otp_verification' },
        sentAt: null,
      });

      const baseUrl = process.env.BASE_URL || 'https://app.mediqzy.com';
      const trackingPixelUrl = `${baseUrl}/api/email/track/open/${logEntry.id}`;

      const htmlBody = `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#07101f;color:#e2e8f0;border-radius:16px;overflow:hidden">
            <div style="background:linear-gradient(135deg,${accentColor},#0891b2);padding:28px 32px">
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">Mediczy ${entityLabel} Portal</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px">Email Verification</p>
            </div>
            <div style="padding:32px">
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">Use the OTP below to verify your email for ${entityLabel.toLowerCase()} registration.</p>
              <div style="background:rgba(13,148,136,0.15);border:1px solid rgba(13,148,136,0.3);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px">Your OTP</p>
                <p style="margin:0;font-size:40px;font-weight:900;letter-spacing:12px;color:#2dd4bf">${otp.code}</p>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;text-align:center">Expires in 10 minutes. Do not share with anyone.</p>
            </div>
          </div>
          <img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;

      const sendResult = await transporter.sendMail({
        from: fromAddress,
        to: email,
        subject: `${otp.code} — Your Mediczy Email Verification OTP`,
        html: htmlBody,
      });

      // Update log to sent
      await logEntry.update({
        status: 'sent',
        sentAt: new Date(),
        metadata: {
          ...logEntry.metadata,
          messageId: sendResult.messageId,
          response: sendResult.response,
        },
      });

      res.json({ success: true, message: 'OTP sent to your email address' });
    } catch (err) {
      console.error(`${entityLabel} email OTP error:`, err.message);
      // Log the failure if we managed to create a log entry
      try {
        const failLog = await EmailLog.findOne({ where: { to: email, status: 'pending' }, order: [['createdAt', 'DESC']] });
        if (failLog) await failLog.update({ status: 'failed', errorMessage: err.message });
      } catch (_) {}
      res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }
  });

  // ─── Verify Email OTP ──────────────────────────────────────────────────────
  router.post('/verify-email-otp', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: 'Email and code required' });
    try {
      const result = await OTP.verify({ email, code, purpose: 'registration' });
      if (result.success) {
        const verificationTicket = issueRegistrationVerificationTicket({
          type: 'email',
          identifier: email,
          entityLabel,
        });
        return res.json({ success: true, message: 'Email verified successfully', verificationTicket });
      }
      return res.status(400).json({ success: false, message: result.message || 'Invalid or expired OTP' });
    } catch (err) {
      console.error(`${entityLabel} email OTP verify error:`, err.message);
      res.status(500).json({ success: false, message: 'Verification failed' });
    }
  });

  // ─── Send Phone OTP via WhatsApp ───────────────────────────────────────────
  router.post('/send-phone-otp', otpLimiter, async (req, res) => {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });
    phone = phone.replace(/\s+/g, '');
    if (!phone.startsWith('+')) phone = `+91${phone.replace(/^0/, '')}`;
    try {
      const otp = await OTP.generate({ phone, purpose: 'registration', expiryMinutes: 10 });
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken  = process.env.TWILIO_AUTH_TOKEN;
      const waFrom     = process.env.TWILIO_WHATSAPP_NUMBER;
      if (accountSid && authToken && waFrom) {
        const client = twilio(accountSid, authToken);
        await client.messages.create({
          from: waFrom,
          to: `whatsapp:${phone}`,
          contentSid: 'HX33ae0014bd63fad4404789d2373b6174',
          contentVariables: JSON.stringify({ 1: otp.code }),
        });
        console.log(`✅ ${entityLabel} WhatsApp OTP → ${phone}`);
      } else {
        console.warn(`⚠️  Twilio not configured — ${entityLabel} OTP generated but not sent`);
      }
      res.json({ success: true, message: 'OTP sent via WhatsApp', phone });
    } catch (err) {
      console.error(`${entityLabel} phone OTP error:`, err.message);
      res.status(500).json({ success: false, message: 'Failed to send OTP. Please verify your phone number.' });
    }
  });

  // ─── Verify Phone OTP ──────────────────────────────────────────────────────
  router.post('/verify-phone-otp', async (req, res) => {
    let { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ success: false, message: 'Phone and code required' });
    phone = phone.replace(/\s+/g, '');
    if (!phone.startsWith('+')) phone = `+91${phone.replace(/^0/, '')}`;
    try {
      const result = await OTP.verify({ phone, code, purpose: 'registration' });
      if (result.success) {
        const verificationTicket = issueRegistrationVerificationTicket({
          type: 'phone',
          identifier: phone,
          entityLabel,
        });
        return res.json({ success: true, message: 'Phone verified successfully', verificationTicket });
      }
      return res.status(400).json({ success: false, message: result.message || 'Invalid or expired OTP' });
    } catch (err) {
      console.error(`${entityLabel} phone OTP verify error:`, err.message);
      res.status(500).json({ success: false, message: 'Verification failed' });
    }
  });
}
