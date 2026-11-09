import express from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import { authTeam } from '../middleware/team.middleware.js';
import inboundEmailService from '../services/inboundEmailService.js';
import emailService from '../services/emailService.js';
import { Op } from 'sequelize';

const attachUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

// Graceful multer wrapper:
//  • Normal multipart with boundary → multer parses files + fields as usual.
//  • Multipart WITHOUT boundary (old cached frontend) → buffer body, auto-detect
//    boundary from first line, repair Content-Type header, then re-pipe to multer
//    so req.body fields AND req.files are both populated correctly.
//  • Non-multipart (JSON etc.) → skip multer, proceed with express-parsed body.
function optionalAttachUpload(req, res, next) {
  const ct = req.headers['content-type'] || '';

  if (!ct.includes('multipart/form-data')) {
    // JSON or urlencoded — express already parsed req.body, no files
    req.files = [];
    return next();
  }

  if (ct.includes('boundary=')) {
    // Normal multipart — let multer handle everything
    return attachUpload.array('attachments', 10)(req, res, (err) => {
      if (err) {
        console.warn('[send] multer warning:', err.message);
        req.files = [];
      }
      next();
    });
  }

  // Multipart without boundary (browser stripped it via explicit Content-Type override):
  // Buffer the raw body, extract the real boundary from the first line, fix the
  // header, then override req.pipe so multer's internal req.pipe(busboy) call
  // reads from our buffered Readable instead of the already-drained stream.
  const chunks = [];
  req.on('error', () => { req.files = []; next(); });
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);

    // First line of a multipart body is "--<boundary>\r\n"
    const crlfIdx = rawBody.indexOf('\r\n');
    const firstLine = rawBody.slice(0, crlfIdx > 2 ? crlfIdx : 256).toString('latin1');
    if (firstLine.startsWith('--') && firstLine.length > 2) {
      const boundary = firstLine.slice(2).replace(/\s+$/, '');
      req.headers['content-type'] = `multipart/form-data; boundary=${boundary}`;
    }

    // Multer calls req.pipe(busboy) — override it to pipe our buffered data
    const savedPipe = req.pipe.bind(req);
    req.pipe = (dest, opts) => Readable.from([rawBody]).pipe(dest, opts);

    attachUpload.array('attachments', 10)(req, res, (err) => {
      req.pipe = savedPipe; // restore
      if (err) {
        console.warn('[send] multer boundary-patch warning:', err.message);
        req.files = [];
      }
      next();
    });
  });
}
import EmailInbox from '../models/emailInbox.model.js';
import EmailSettings from '../models/emailSettings.model.js';
import TeamMember from '../models/postgres/team-member.model.postgres.js';
import TeamEmailTemplate from '../models/teamEmailTemplate.model.js';
import { processEmailFull, batchProcessInbox } from '../services/emailAutoProcessService.js';
import llmProvider from '../services/ai-brain/llm-provider.js';

async function callGroq(prompt, maxTokens = 400, temperature = 0.7) {
  try {
    const sibResult = await llmProvider.chat({
      messages: [{ role: 'user', content: prompt }],
      maxTokens,
      temperature,
      forceProvider: 'sib',
      skipCache: true,
    });
    if (sibResult?.content?.trim()) return sibResult.content.trim();
  } catch (err) {
    console.warn('[TeamEmail] SIB path failed, falling back to Groq cascade:', err.message);
  }

  const fallbackResult = await llmProvider.chat({
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    temperature,
    forceProvider: 'groq',
    skipCache: true,
  });
  return fallbackResult?.content?.trim() || '';
}

const router = express.Router();

const resolveTeamMemberId = async (user) => {
  const directId = user?.teamMemberId || user?.team_member_id;
  if (directId) return directId;

  if (user?.id) {
    const byPk = await TeamMember.findByPk(user.id, { attributes: ['id'] });
    if (byPk) return byPk.id;

    const byUserId = await TeamMember.findOne({
      where: { userId: user.id },
      attributes: ['id']
    });
    if (byUserId) return byUserId.id;
  }

  if (user?.email) {
    const byEmail = await TeamMember.findOne({
      where: { email: user.email },
      attributes: ['id']
    });
    if (byEmail) return byEmail.id;
  }

  return user?.id;
};

const findOwnedEmail = async (req) => {
  const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
  if (!teamMemberId) return null;
  return EmailInbox.findOne({ where: { id: req.params.id, teamMemberId } });
};

/**
 * GET /api/team/emails/inbox
 * Get team member's email inbox
 */
router.get('/inbox', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const { page = 1, limit = 20, unreadOnly = false, search = '', folder = 'inbox' } = req.query;

    const inbox = await inboundEmailService.getInbox(teamMemberId, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true',
      labels: folder && folder !== 'all' ? folder : null,
      search
    });

    res.json({
      success: true,
      data: inbox
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inbox',
      error: error.message
    });
  }
});

/**
 * GET /api/team/emails/stats
 * Get email statistics
 */
router.get('/stats', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);

    const stats = {
      total: await EmailInbox.count({ where: { teamMemberId } }),
      unread: await EmailInbox.count({ where: { teamMemberId, isRead: false } }),
      starred: await EmailInbox.count({ where: { teamMemberId, isStarred: true } }),
      byIntent: {},
      bySentiment: {}
    };

    // Count by intent
    const intents = ['appointment_request', 'patient_query', 'test_result', 'prescription', 'billing', 'feedback', 'other'];
    for (const intent of intents) {
      stats.byIntent[intent] = await EmailInbox.count({
        where: { teamMemberId, aiIntent: intent }
      });
    }

    // Count by sentiment
    const sentiments = ['positive', 'neutral', 'negative'];
    for (const sentiment of sentiments) {
      stats.bySentiment[sentiment] = await EmailInbox.count({
        where: { teamMemberId, aiSentiment: sentiment }
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/team/emails/templates – list all templates for the current user */
router.get('/templates', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const templates = await TeamEmailTemplate.findAll({
      where: { teamMemberId },
      order: [['createdAt', 'DESC']],
    });
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/team/emails/templates – create a new template */
router.post('/templates', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const { name, subject, body, category = 'general', isShared = false } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Template name is required' });
    const template = await TeamEmailTemplate.create({ teamMemberId, name, subject, body, category, isShared });
    res.status(201).json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** PUT /api/team/emails/templates/:id – update a template */
router.put('/templates/:id', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const template = await TeamEmailTemplate.findOne({ where: { id: req.params.id, teamMemberId } });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    const { name, subject, body, category, isShared } = req.body;
    await template.update({ name, subject, body, category, isShared });
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** DELETE /api/team/emails/templates/:id – delete a template */
router.delete('/templates/:id', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const template = await TeamEmailTemplate.findOne({ where: { id: req.params.id, teamMemberId } });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    await template.destroy();
    res.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOT AUTO-REPLY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/team/emails/:id/bot-reply
 * Generate an AI-suggested reply for an email using Groq.
 */
router.post('/:id(\\d+)/bot-reply', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const email = await EmailInbox.findOne({ where: { id: req.params.id, teamMemberId } });
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });

    const rawBody = email.body || (email.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '');
    const intent  = email.aiIntent ? `\nDetected intent: ${email.aiIntent.replace(/_/g, ' ')}` : '';
    const prompt  =
      `You are a professional healthcare team member at Mediqzy. Write a helpful, empathetic, concise reply (3–5 sentences) to the following email. ` +
      `Sound warm and professional. End with "Best regards,\\nMediqzy Team".${intent}\n\n` +
      `From: ${email.fromName || email.from}\nSubject: ${email.subject}\n\n${rawBody.slice(0, 2000)}`;

    const suggestedReply = await callGroq(prompt, 450, 0.7);
    res.json({ success: true, data: { suggestedReply } });
  } catch (err) {
    console.error('[bot-reply]', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate reply', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI TICKET SUGGESTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/team/emails/:id/ai-ticket
 * Use AI to suggest ticket fields from an email.
 */
router.post('/:id(\\d+)/ai-ticket', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const email = await EmailInbox.findOne({ where: { id: req.params.id, teamMemberId } });
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });

    const rawBody = email.body || (email.htmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '');
    const prompt =
      `Analyze this healthcare email and return ONLY a JSON object (no markdown, no explanation) with exactly these fields:\n` +
      `{\n` +
      `  "title": "short descriptive ticket title max 80 chars",\n` +
      `  "description": "2-3 sentence description for the support team",\n` +
      `  "category": "one of: appointment-cancellation, appointment-reschedule, doctor-consultation, health-checkup, prescription, health-report, billing, complaint, other",\n` +
      `  "priority": "one of: low, medium, high, critical"\n` +
      `}\n\n` +
      `Email from: ${email.fromName || email.from}\nSubject: ${email.subject}\n\n${rawBody.slice(0, 1500)}`;

    const raw        = await callGroq(prompt, 350, 0.3);
    const jsonMatch  = raw.match(/\{[\s\S]*\}/);
    const suggestion = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    res.json({ success: true, data: suggestion });
  } catch (err) {
    console.error('[ai-ticket]', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate ticket suggestion', error: err.message });
  }
});

/**
 * GET /api/team/emails/:id
 * Get single email details
 */
router.get('/:id(\\d+)', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const email = await EmailInbox.findOne({
      where: {
        id: req.params.id,
        teamMemberId
      }
    });

    if (!email) {
      return res.status(404).json({
        success: false,
        message: 'Email not found'
      });
    }

    // Mark as read
    if (!email.isRead) {
      await inboundEmailService.markAsRead(email.id);
      email.isRead = true;
    }

    res.json({
      success: true,
      data: email
    });
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email',
      error: error.message
    });
  }
});

/**
 * PUT /api/team/emails/:id/mark-read
 * Mark email as read
 */
router.put('/:id(\\d+)/mark-read', authTeam, async (req, res) => {
  try {
    const email = await findOwnedEmail(req);
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });

    await inboundEmailService.markAsRead(email.id);

    res.json({
      success: true,
      message: 'Email marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark email as read',
      error: error.message
    });
  }
});

/**
 * PUT /api/team/emails/:id/toggle-star
 * Star/unstar email
 */
router.put('/:id(\\d+)/toggle-star', authTeam, async (req, res) => {
  try {
    const ownedEmail = await findOwnedEmail(req);
    if (!ownedEmail) return res.status(404).json({ success: false, message: 'Email not found' });

    const email = await inboundEmailService.toggleStar(ownedEmail.id);

    res.json({
      success: true,
      data: email,
      message: `Email ${email.isStarred ? 'starred' : 'unstarred'}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle star',
      error: error.message
    });
  }
});

/**
 * DELETE /api/team/emails/:id
 * Delete email
 */
router.delete('/:id(\\d+)', authTeam, async (req, res) => {
  try {
    const email = await findOwnedEmail(req);
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });

    await inboundEmailService.deleteEmail(email.id);

    res.json({
      success: true,
      message: 'Email deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete email',
      error: error.message
    });
  }
});

/**
 * POST /api/team/emails/:id/label
 * Add label to email
 */
router.post('/:id(\\d+)/label', authTeam, async (req, res) => {
  try {
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({
        success: false,
        message: 'Label is required'
      });
    }

    const ownedEmail = await findOwnedEmail(req);
    if (!ownedEmail) return res.status(404).json({ success: false, message: 'Email not found' });

    const email = await inboundEmailService.addLabel(ownedEmail.id, label);

    res.json({
      success: true,
      data: email,
      message: 'Label added'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add label',
      error: error.message
    });
  }
});

/**
 * GET /api/team/emails/priority/:level
 * Get emails by priority
 */
router.get('/priority/:level', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const emails = await EmailInbox.findAll({
      where: {
        teamMemberId,
        priority: req.params.level
      },
      order: [['receivedAt', 'DESC']],
      limit: 50
    });

    res.json({
      success: true,
      data: emails,
      count: emails.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emails',
      error: error.message
    });
  }
});

/**
 * POST /api/team/emails/send
 * Send email using user's configured SMTP settings
 */
router.post('/send', authTeam, optionalAttachUpload, async (req, res) => {
  try {
    const { to, cc, bcc, subject, htmlContent, textContent } = req.body;
    const authUserId = (req.teamUser || req.user)?.id;
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const emailAttachments = (req.files || []).map(f => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype,
    }));

    // Validate input
    if (!to || !subject || (!htmlContent && !textContent)) {
      return res.status(400).json({
        success: false,
        message: 'Email recipient, subject, and content are required'
      });
    }

    // Get user's active email settings — prefer one with SMTP credentials configured
    let emailSettings = await EmailSettings.findOne({
      where: {
        userId: authUserId,
        isActive: true,
        isDefault: true,
        smtpUsername: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
      }
    });

    // Fall back to any active default if none with credentials
    if (!emailSettings) {
      emailSettings = await EmailSettings.findOne({
        where: {
          userId: authUserId,
          isActive: true,
          isDefault: true
        }
      });
    }

    if (!emailSettings) {
      return res.status(400).json({
        success: false,
        message: 'No active email configuration found. Please configure SMTP settings first.'
      });
    }

    if (!emailSettings.smtpUsername || !emailSettings.smtpPassword) {
      return res.status(400).json({
        success: false,
        message: 'SMTP credentials not configured. Please update your email settings with username and password.'
      });
    }

    // Send the email using the user's SMTP settings directly
    const result = await emailService.sendOutboundEmail(emailSettings.id, {
      to,
      cc,
      bcc,
      subject,
      htmlContent,
      textContent,
      attachments: emailAttachments,
    }, {
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpSecure,
      username: emailSettings.smtpUsername,
      password: emailSettings.smtpPassword,
      fromEmail: emailSettings.email,
      fromName: emailSettings.displayName || emailSettings.email,
      isActive: emailSettings.isActive
    });

    // Save to sent folder for team inbox view
    await EmailInbox.create({
      teamMemberId,
      messageId: result.messageId || `${Date.now()}-${Math.random()}`,
      from: emailSettings.email,
      fromName: emailSettings.displayName || emailSettings.email,
      to: Array.isArray(to) ? to : String(to).split(',').map((item) => item.trim()).filter(Boolean),
      cc: cc ? String(cc).split(',').map((item) => item.trim()).filter(Boolean) : [],
      bcc: bcc ? String(bcc).split(',').map((item) => item.trim()).filter(Boolean) : [],
      subject,
      body: textContent || htmlContent || '',
      htmlBody: htmlContent || null,
      isRead: true,
      labels: ['sent'],
      priority: 'normal',
      receivedAt: new Date()
    });

    res.json({
      success: true,
      data: result,
      message: 'Email sent successfully'
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: error.message
    });
  }
});

/**
 * POST /api/team/emails/sync
 * Manually sync emails from configured inbox
 */
router.post('/sync', authTeam, async (req, res) => {
  try {
    console.log('📧 SYNC ENDPOINT - User:', { id: req.teamUser?.id || req.user?.id, role: req.teamUser?.role || req.user?.role, type: typeof (req.teamUser || req.user) });
    const authUserId = (req.teamUser || req.user)?.id;
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    
    if (!authUserId || !teamMemberId) {
      console.error('❌ SYNC: No user ID found in team auth context');
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Get user's active email settings (prefer default first)
    const activeSettings = await EmailSettings.findAll({
      where: {
        userId: authUserId,
        isActive: true,
        deletedAt: null
      },
      order: [['isDefault', 'DESC'], ['updatedAt', 'DESC'], ['createdAt', 'DESC']]
    });

    if (!activeSettings || activeSettings.length === 0) {
      console.log('⚠️ SYNC: No email settings found for user:', teamMemberId);
      return res.status(400).json({
        success: false,
        message: 'No email configuration found. Please configure IMAP settings first.'
      });
    }

    // Sync EVERY configured mailbox, not just the first one.
    //
    // This used to .find() a single settings row and sync that alone, so a team
    // working a shared inbox (care@) plus a second address saw only whichever
    // row happened to sort first by isDefault. Pressing Sync appeared to work
    // while an entire mailbox was never polled.
    const syncable = activeSettings.filter((config) => {
      const username = config.imapUsername || config.smtpUsername || config.email;
      const password = config.imapPassword || config.smtpPassword;
      return Boolean(username && password);
    });

    if (syncable.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Email configuration is incomplete. Please edit and save your SMTP/IMAP settings again.'
      });
    }

    console.log(`✅ SYNC: ${syncable.length} configured mailbox(es), starting sync...`);
    
    const providerImapDefaults = {
      'zoho-pro': { host: 'imappro.zoho.in', port: 993, tls: true },
      'zoho': { host: 'imap.zoho.in', port: 993, tls: true },
      'gmail': { host: 'imap.gmail.com', port: 993, tls: true },
      'outlook': { host: 'outlook.office365.com', port: 993, tls: true },
      'custom': { host: 'imap.zoho.in', port: 993, tls: true }
    };

    // Sync emails — manual syncs default to 60 days; caller can pass daysBack
    const daysBack = Math.min(parseInt(req.body?.daysBack || req.query?.daysBack || 60, 10), 180);

    const perMailbox = [];
    let newEmails = 0;
    let failed = 0;

    for (const config of syncable) {
      const providerDefaults = providerImapDefaults[config.provider] || providerImapDefaults.custom;
      const imapConfig = {
        email: config.email,
        username: config.imapUsername || config.smtpUsername || config.email,
        password: config.imapPassword || config.smtpPassword,
        host: config.imapHost || providerDefaults.host,
        port: config.imapPort || providerDefaults.port,
        tls: config.imapSecure !== false ? true : providerDefaults.tls
      };

      try {
        const result = await inboundEmailService.scheduledSync(teamMemberId, imapConfig, daysBack);
        newEmails += result?.newEmails || 0;
        perMailbox.push({ email: config.email, ok: true, newEmails: result?.newEmails || 0 });
        try { await config.update({ lastSyncAt: new Date(), lastSyncStatus: `ok: ${result?.newEmails || 0} new` }); } catch { /* status is best-effort */ }
      } catch (error) {
        failed += 1;
        // One unreachable mailbox must not hide the others' results, which is what
        // a single throw out of this handler used to do.
        perMailbox.push({ email: config.email, ok: false, error: error.message });
        try { await config.update({ lastSyncAt: new Date(), lastSyncStatus: `error: ${String(error.message || 'unknown')}`.slice(0, 255) }); } catch { /* status is best-effort */ }
        console.error(`❌ SYNC failed for ${config.email}:`, error.message);
      }
    }

    // Every mailbox failed — report it as a failure, with each reason.
    if (failed === syncable.length) {
      const imapDisabled = perMailbox.some((m) => /enable imap/i.test(m.error || ''));
      return res.status(imapDisabled ? 400 : 500).json({
        success: false,
        ...(imapDisabled ? { code: 'IMAP_DISABLED' } : {}),
        data: { newEmails: 0, mailboxes: perMailbox },
        message: imapDisabled
          ? 'IMAP is disabled for this mailbox. Please enable IMAP in Zoho Mail settings or ask your organization admin.'
          : `Failed to sync ${failed} mailbox(es): ${perMailbox.map((m) => `${m.email}: ${m.error}`).join('; ')}`
      });
    }

    console.log(`✅ SYNC COMPLETE: ${newEmails} new emails across ${syncable.length - failed}/${syncable.length} mailbox(es)`);
    res.json({
      success: true,
      data: { newEmails, mailboxes: perMailbox },
      message: failed
        ? `Synced ${newEmails} new emails; ${failed} mailbox(es) failed`
        : `Successfully synced ${newEmails} new emails`
    });
  } catch (error) {
    console.error('❌ Error syncing emails:', error.message);

    const errorMessage = (error?.message || '').toLowerCase();
    if (errorMessage.includes('enable imap') || errorMessage.includes('yet to enable imap')) {
      return res.status(400).json({
        success: false,
        code: 'IMAP_DISABLED',
        message: 'IMAP is disabled for this mailbox. Please enable IMAP in Zoho Mail settings or ask your organization admin.',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to sync emails',
      error: error.message
    });
  }
});

/**
 * POST /api/team/emails/process-all
 * Batch-process all inbox emails:
 *   – auto-create tickets for unprocessed emails
 *   – save health reports from lab-domain emails
 *   – update employee real email addresses
 */
router.post('/process-all', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);
    const { limit = 500 } = req.body;

    const stats = await batchProcessInbox(teamMemberId, { limit: parseInt(limit) });

    res.json({
      success: true,
      message: `Processed ${stats.total} emails`,
      stats,
    });
  } catch (error) {
    console.error('[process-all] error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/team/emails/:id/process
 * Process a single email through the full pipeline.
 */
router.post('/:id(\\d+)/process', authTeam, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.teamUser || req.user);

    const email = await EmailInbox.findOne({
      where: { id: req.params.id, teamMemberId },
    });

    if (!email) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const result = await processEmailFull(email);

    res.json({ success: true, result });
  } catch (error) {
    console.error('[/process] error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
