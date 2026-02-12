import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import inboundEmailService from '../services/inboundEmailService.js';
import EmailInbox from '../models/emailInbox.model.js';

const router = express.Router();

/**
 * GET /api/team/emails/inbox
 * Get team member's email inbox
 */
router.get('/inbox', authUser, async (req, res) => {
  try {
    const teamMemberId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false, search = '' } = req.query;

    const inbox = await inboundEmailService.getInbox(teamMemberId, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true',
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
 * GET /api/team/emails/:id
 * Get single email details
 */
router.get('/:id', authUser, async (req, res) => {
  try {
    const email = await EmailInbox.findOne({
      where: {
        id: req.params.id,
        teamMemberId: req.user.id
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
 * POST /api/team/emails/sync
 * Manually sync emails (admin only)
 */
router.post('/sync', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { imapConfig } = req.body;

    if (!imapConfig) {
      return res.status(400).json({
        success: false,
        message: 'IMAP configuration is required'
      });
    }

    const result = await inboundEmailService.scheduledSync(req.user.id, imapConfig);

    res.json({
      success: true,
      data: result,
      message: `Synced ${result.newEmails} new emails`
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync emails',
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
    const teamMemberId = req.user.id;

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
 * GET /api/team/emails/priority/:level
 * Get emails by priority
 */
router.get('/priority/:level', authUser, async (req, res) => {
  try {
    const emails = await EmailInbox.findAll({
      where: {
        teamMemberId: req.user.id,
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

export default router;
