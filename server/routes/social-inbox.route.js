import express from 'express';
import { authTeam, requirePermission } from '../middleware/team.middleware.js';
import {
  getSocialInboxStatus,
  listConversations,
  getConversationMessages,
  markConversationRead,
  sendReply,
} from '../services/social-inbox.service.js';

const router = express.Router();

// GET /api/social-inbox/status — which channels are connected (Meta app credentials present)
router.get('/status', authTeam, requirePermission('Chat Dashboard Access'), async (req, res) => {
  return res.status(200).json({ success: true, ...getSocialInboxStatus() });
});

// GET /api/social-inbox/conversations?channel=instagram|facebook&status=open|closed|all
router.get('/conversations', authTeam, requirePermission('Chat Dashboard Access'), async (req, res) => {
  try {
    const { channel, status, limit } = req.query;
    const conversations = await listConversations({ channel, status, limit });
    return res.status(200).json({ success: true, conversations });
  } catch (error) {
    console.error('[Social Inbox] list conversations error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load conversations' });
  }
});

// GET /api/social-inbox/conversations/:id/messages
router.get('/conversations/:id/messages', authTeam, requirePermission('Chat Dashboard Access'), async (req, res) => {
  try {
    const messages = await getConversationMessages(req.params.id);
    markConversationRead(req.params.id).catch(() => {});
    return res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error('[Social Inbox] get messages error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
});

// POST /api/social-inbox/conversations/:id/reply  body: { text }
router.post('/conversations/:id/reply', authTeam, requirePermission('Chat Dashboard Access'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }
    const result = await sendReply({ conversationId: req.params.id, text: text.trim(), teamUserId: req.teamUser.id });
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[Social Inbox] send reply error:', error.message);
    return res.status(502).json({ success: false, message: error.message || 'Failed to send message' });
  }
});

export default router;
