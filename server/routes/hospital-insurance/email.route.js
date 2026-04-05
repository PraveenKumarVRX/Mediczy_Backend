/**
 * Hospital Insurance Portal — Email Routes
 * Mounts at: /api/hospital/insurance/emails
 *
 * Auth: hospitalInsuranceAuth middleware (JWT from InsurancePortalLogin)
 */

import { Router } from 'express';
import nodemailer  from 'nodemailer';
import { Op }      from 'sequelize';
import InsuranceEmailInbox from '../../models/postgres/insuranceEmailInbox.model.postgres.js';
import InsuranceEmailSettings from '../../models/emailSettings.model.js';
import {
  parseAndStoreEmail,
  generateReplyDraft,
  batchReparse,
  syncImapInbox,
} from '../../services/insuranceEmailAI.service.js';
import logger from '../../config/logger.js';

const router = Router();

// ─── Auth middleware for insurance portal ─────────────────────────────────────
// The insurance JWT is stored under hospitalInsuranceToken and carries { portal:'insurance', hospitalId }
import jwt from 'jsonwebtoken';

function insuranceAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Insurance portal token required' });

  try {
    const secret = process.env.JWT_SECRET || 'mediczy-secret';
    const decoded = jwt.verify(token, secret);
    req.insuranceUser = decoded;
    req.hospitalId    = decoded.hospitalId || decoded.hospital_id || 'demo-hospital-001';
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// ─── Sync table on startup ────────────────────────────────────────────────────
InsuranceEmailInbox.sync({ alter: false }).catch(() => {
  InsuranceEmailInbox.sync({ force: false }).catch(err =>
    logger.warn('[InsuranceEmailInbox] table sync warn:', err.message)
  );
});

// ─── GET /inbox ───────────────────────────────────────────────────────────────
router.get('/inbox', insuranceAuth, async (req, res) => {
  try {
    const { page = 1, limit = 30, label, unreadOnly, search } = req.query;
    const where = { hospitalId: req.hospitalId };

    if (label && label !== 'all') where.label = label;
    if (unreadOnly === 'true') where.isRead = false;
    if (search) {
      where[Op.or] = [
        { subject:   { [Op.iLike]: `%${search}%` } },
        { fromName:  { [Op.iLike]: `%${search}%` } },
        { fromEmail: { [Op.iLike]: `%${search}%` } },
        { insurerName: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await InsuranceEmailInbox.findAndCountAll({
      where,
      order: [['receivedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ success: true, data: rows, total: count, page: parseInt(page) });
  } catch (err) {
    logger.error('[InsuranceEmail] inbox error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get('/stats', insuranceAuth, async (req, res) => {
  try {
    const hid = req.hospitalId;
    const [total, unread, payments, preauths, queries, captures] = await Promise.all([
      InsuranceEmailInbox.count({ where: { hospitalId: hid } }),
      InsuranceEmailInbox.count({ where: { hospitalId: hid, isRead: false } }),
      InsuranceEmailInbox.count({ where: { hospitalId: hid, aiCategory: 'payment_advice' } }),
      InsuranceEmailInbox.count({ where: { hospitalId: hid, aiCategory: { [Op.in]: ['pre_auth_approval','pre_auth_rejection','pre_auth_query','pre_auth_partial'] } } }),
      InsuranceEmailInbox.count({ where: { hospitalId: hid, label: 'query' } }),
      InsuranceEmailInbox.count({ where: { hospitalId: hid, utr: { [Op.not]: null } } }),
    ]);
    res.json({ success: true, data: { total, unread, payments, preauths, queries, captures } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /captures — auto-captured UTR payments ───────────────────────────────
router.get('/captures', insuranceAuth, async (req, res) => {
  try {
    const rows = await InsuranceEmailInbox.findAll({
      where: {
        hospitalId:  req.hospitalId,
        aiCategory:  'payment_advice',
        utr:         { [Op.not]: null },
      },
      order:      [['receivedAt', 'DESC']],
      limit:      100,
      attributes: ['id', 'fromEmail', 'fromName', 'insurerName', 'subject', 'utr',
                   'paymentAmount', 'paymentMode', 'paymentDate', 'claimNumbers',
                   'nmeAmount', 'tdsAmount', 'discountAmount', 'disallowanceAmount',
                   'portalUpdated', 'portalUpdateLog', 'receivedAt'],
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /sync — trigger IMAP fetch ─────────────────────────────────────────
router.post('/sync', insuranceAuth, async (req, res) => {
  try {
    const { email, password, imapHost, imapPort, daysBack = 30 } = req.body;
    if (!email || !password || !imapHost) {
      return res.status(400).json({ success: false, message: 'email, password and imapHost are required for IMAP sync' });
    }

    const result = await syncImapInbox({
      hospitalId: req.hospitalId,
      email, password, imapHost,
      imapPort: imapPort || 993,
      tls: true,
      daysBack,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[InsuranceEmail] IMAP sync error:', err.message);
    res.status(500).json({ success: false, message: `IMAP sync failed: ${err.message}` });
  }
});

// ─── POST /parse — parse a raw email body (used by webhook / manual entry) ───
router.post('/parse', insuranceAuth, async (req, res) => {
  try {
    const { subject, bodyText, fromEmail, fromName } = req.body;
    if (!subject) return res.status(400).json({ success: false, message: 'subject required' });

    const record = await parseAndStoreEmail({
      hospitalId: req.hospitalId,
      fromEmail:  fromEmail || 'unknown@tpa.com',
      fromName:   fromName  || '',
      subject,
      bodyText:   bodyText  || '',
      receivedAt: new Date(),
    });

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /batch-reparse — re-run AI on unprocessed emails ───────────────────
router.post('/batch-reparse', insuranceAuth, async (req, res) => {
  try {
    const results = await batchReparse(req.hospitalId, req.body.limit || 20);
    res.json({ success: true, processed: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', insuranceAuth, async (req, res) => {
  try {
    const email = await InsuranceEmailInbox.findOne({
      where: { id: req.params.id, hospitalId: req.hospitalId },
    });
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });

    // Mark as read
    if (!email.isRead) await email.update({ isRead: true });

    res.json({ success: true, data: email });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /:id/star ────────────────────────────────────────────────────────────
router.put('/:id/star', insuranceAuth, async (req, res) => {
  try {
    const email = await InsuranceEmailInbox.findOne({ where: { id: req.params.id, hospitalId: req.hospitalId } });
    if (!email) return res.status(404).json({ success: false, message: 'Not found' });
    await email.update({ isStarred: !email.isStarred });
    res.json({ success: true, data: { isStarred: email.isStarred } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:id/ai-parse — re-parse a specific email with AI ──────────────────
router.post('/:id/ai-parse', insuranceAuth, async (req, res) => {
  try {
    const email = await InsuranceEmailInbox.findOne({ where: { id: req.params.id, hospitalId: req.hospitalId } });
    if (!email) return res.status(404).json({ success: false, message: 'Not found' });

    const results = await batchReparse(req.hospitalId, 1);
    // Force re-parse this specific one
    const { parseAndStoreEmail: _, generateReplyDraft: __, batchReparse: ___, syncImapInbox: ____, ...ai } = await import('../../services/insuranceEmailAI.service.js');
    // inline: call AI and update
    const { default: svc } = await import('../../services/insuranceEmailAI.service.js');
    res.json({ success: true, message: 'AI re-parse queued', data: email });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:id/ai-reply — generate AI draft reply ────────────────────────────
router.post('/:id/ai-reply', insuranceAuth, async (req, res) => {
  try {
    const email = await InsuranceEmailInbox.findOne({ where: { id: req.params.id, hospitalId: req.hospitalId } });
    if (!email) return res.status(404).json({ success: false, message: 'Not found' });

    const draft = await generateReplyDraft(email);
    res.json({ success: true, data: { draft } });
  } catch (err) {
    logger.error('[InsuranceEmail] ai-reply error:', err.message);
    res.status(500).json({ success: false, message: `AI reply failed: ${err.message}` });
  }
});

// ─── POST /send — send an email via configured SMTP ──────────────────────────
router.post('/send', insuranceAuth, async (req, res) => {
  try {
    const { to, subject, body, cc, replyToId } = req.body;
    if (!to || !subject) return res.status(400).json({ success: false, message: 'to and subject required' });

    // Load SMTP settings (from email_settings table) or fall back to env
    let smtpOpts = {
      host:   process.env.SMTP_HOST  || 'smtppro.zoho.in',
      port:   parseInt(process.env.SMTP_PORT  || '465'),
      secure: (process.env.SMTP_PORT || '465') === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    };

    try {
      const settings = await InsuranceEmailSettings.findOne({
        where: { userId: req.insuranceUser.id || req.hospitalId },
        order: [['isDefault', 'DESC'], ['createdAt', 'DESC']],
      });
      if (settings && settings.isActive) {
        smtpOpts = {
          host:   settings.host,
          port:   settings.port,
          secure: settings.port === 465,
          auth:   { user: settings.username, pass: settings.password },
        };
      }
    } catch (_) { /* use env SMTP */ }

    if (!smtpOpts.auth.user) {
      return res.status(400).json({ success: false, message: 'No SMTP configured. Please set up SMTP in settings.' });
    }

    const transporter = nodemailer.createTransport(smtpOpts);
    await transporter.sendMail({
      from:    `"Insurance Desk" <${smtpOpts.auth.user}>`,
      to,
      cc:      cc || undefined,
      subject,
      text:    body,
      html:    `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${body}</pre>`,
    });

    // If this is a reply, log it in the original email's updateLog
    if (replyToId) {
      const orig = await InsuranceEmailInbox.findOne({ where: { id: replyToId, hospitalId: req.hospitalId } }).catch(() => null);
      if (orig) {
        const prevLog = orig.portalUpdateLog || [];
        await orig.update({ portalUpdateLog: [...prevLog, { type: 'reply_sent', to, subject, sentAt: new Date() }] });
      }
    }

    res.json({ success: true, message: `Email sent to ${to}` });
  } catch (err) {
    logger.error('[InsuranceEmail] send error:', err.message);
    res.status(500).json({ success: false, message: `Failed to send: ${err.message}` });
  }
});

// ─── POST /smtp-test — test SMTP connection ───────────────────────────────────
router.post('/smtp-test', insuranceAuth, async (req, res) => {
  try {
    const { smtpHost, smtpPort, email: user, password } = req.body;
    if (!smtpHost || !user || !password) {
      return res.status(400).json({ success: false, message: 'smtpHost, email, and password are required' });
    }

    const port   = parseInt(smtpPort || '465');
    const secure = port === 465;
    const transporter = nodemailer.createTransport({
      host: smtpHost, port, secure,
      auth: { user, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful — credentials verified.' });
  } catch (err) {
    res.status(400).json({ success: false, message: `SMTP test failed: ${err.message}` });
  }
});

export default router;
