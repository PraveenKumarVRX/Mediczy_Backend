import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import inboundEmailService from '../services/inboundEmailService.js';
import emailService from '../services/emailService.js';
import EmailInbox from '../models/emailInbox.model.js';
import EmailSettings from '../models/emailSettings.model.js';
import TeamMember from '../models/postgres/team-member.model.postgres.js';
import { processEmailFull, batchProcessInbox } from '../services/emailAutoProcessService.js';

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

/**
 * GET /api/team/emails/inbox
 * Get team member's email inbox
 */
router.get('/inbox', authUser, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.user);
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
router.get('/stats', authUser, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.user);

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

/**
 * GET /api/team/emails/:id
 * Get single email details
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.user);
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
router.put('/:id/mark-read', authUser, async (req, res) => {
  try {
    await inboundEmailService.markAsRead(req.params.id);

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
router.put('/:id/toggle-star', authUser, async (req, res) => {
  try {
    const email = await inboundEmailService.toggleStar(req.params.id);

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
router.delete('/:id', authUser, async (req, res) => {
  try {
    await inboundEmailService.deleteEmail(req.params.id);

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
router.post('/:id/label', authUser, async (req, res) => {
  try {
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({
        success: false,
        message: 'Label is required'
      });
    }

    const email = await inboundEmailService.addLabel(req.params.id, label);

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
router.get('/priority/:level', authUser, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.user);
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
router.post('/send', authUser, async (req, res) => {
  try {
    const { to, cc, bcc, subject, htmlContent, textContent } = req.body;
    const authUserId = req.user.id;
    const teamMemberId = await resolveTeamMemberId(req.user);

    // Validate input
    if (!to || !subject || (!htmlContent && !textContent)) {
      return res.status(400).json({
        success: false,
        message: 'Email recipient, subject, and content are required'
      });
    }

    // Get user's active email settings
    const emailSettings = await EmailSettings.findOne({
      where: {
        userId: authUserId,
        isActive: true,
        isDefault: true
      }
    });

    if (!emailSettings) {
      return res.status(400).json({
        success: false,
        message: 'No active email configuration found. Please configure SMTP settings first.'
      });
    }

    // Send the email using the user's SMTP settings directly
    const result = await emailService.sendOutboundEmail(emailSettings.id, {
      to,
      cc,
      bcc,
      subject,
      htmlContent,
      textContent
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
router.post('/sync', authUser, async (req, res) => {
  try {
    console.log('📧 SYNC ENDPOINT - User:', { id: req.user?.id, role: req.user?.role, type: typeof req.user });
    const authUserId = req.user?.id;
    const teamMemberId = await resolveTeamMemberId(req.user);
    
    if (!authUserId || !teamMemberId) {
      console.error('❌ SYNC: No user ID found in req.user');
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

    const emailSettings = activeSettings.find((config) => {
      const username = config.imapUsername || config.smtpUsername || config.email;
      const password = config.imapPassword || config.smtpPassword;
      return Boolean(username && password);
    });

    if (!emailSettings) {
      return res.status(400).json({
        success: false,
        message: 'Email configuration is incomplete. Please edit and save your SMTP/IMAP settings again.'
      });
    }

    console.log('✅ SYNC: Found email settings, starting sync...');
    
    const providerImapDefaults = {
      'zoho-pro': { host: 'imappro.zoho.in', port: 993, tls: true },
      'zoho': { host: 'imap.zoho.in', port: 993, tls: true },
      'gmail': { host: 'imap.gmail.com', port: 993, tls: true },
      'outlook': { host: 'outlook.office365.com', port: 993, tls: true },
      'custom': { host: 'imap.zoho.in', port: 993, tls: true }
    };

    const providerDefaults = providerImapDefaults[emailSettings.provider] || providerImapDefaults.custom;

    // Parse stored credentials for IMAP
    const imapConfig = {
      email: emailSettings.email,
      username: emailSettings.imapUsername || emailSettings.smtpUsername || emailSettings.email,
      password: emailSettings.imapPassword || emailSettings.smtpPassword,
      host: emailSettings.imapHost || providerDefaults.host,
      port: emailSettings.imapPort || providerDefaults.port,
      tls: emailSettings.imapSecure !== false ? true : providerDefaults.tls
    };

    if (!imapConfig.username || !imapConfig.password) {
      return res.status(400).json({
        success: false,
        message: 'Email configuration is incomplete. Please edit and save your SMTP/IMAP settings again.'
      });
    }

    // Sync emails — manual syncs default to 60 days; caller can pass daysBack
    const daysBack = Math.min(parseInt(req.body?.daysBack || req.query?.daysBack || 60, 10), 180);
    const result = await inboundEmailService.scheduledSync(teamMemberId, imapConfig, daysBack);

    console.log('✅ SYNC COMPLETE: Synced', result.newEmails, 'emails');
    res.json({
      success: true,
      data: result,
      message: `Successfully synced ${result.newEmails} new emails`
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
router.post('/process-all', authUser, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.user);
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
router.post('/:id/process', authUser, async (req, res) => {
  try {
    const teamMemberId = await resolveTeamMemberId(req.user);

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
