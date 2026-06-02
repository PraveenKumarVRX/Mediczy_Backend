import express from 'express';

export const createDoctorMessagesRouter = ({
  authDoctor,
  MESSAGE_PREFIX,
  MESSAGE_TTL,
  localMessages,
  getCachedValue,
  setCachedValue,
}) => {
  const router = express.Router();

  router.get('/messages', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const messagesKey = `${MESSAGE_PREFIX}${doctorId}`;
      const existing = await getCachedValue(messagesKey, localMessages, null);

      if (existing) {
        return res.json({ success: true, messages: existing });
      }

      const now = new Date().toISOString();
      const seed = [
        {
          id: `msg-${doctorId}-1`,
          from: 'Patient Support',
          subject: 'New patient inquiry',
          message: 'A patient has requested a follow-up appointment. Please review the request.',
          timestamp: now,
          status: 'new',
          priority: 'medium',
          senderType: 'patient',
        },
        {
          id: `msg-${doctorId}-2`,
          from: 'Hospital Admin',
          subject: 'Updated policy notice',
          message: 'Please review the updated consultation guidelines effective this week.',
          timestamp: now,
          status: 'read',
          priority: 'low',
          senderType: 'admin',
        },
      ];

      await setCachedValue(messagesKey, seed, MESSAGE_TTL, localMessages);
      return res.json({ success: true, messages: seed });
    } catch (error) {
      console.error('Get doctor messages error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages',
        error: error.message,
      });
    }
  });

  router.patch('/messages/:messageId/read', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { messageId } = req.params;
      const messagesKey = `${MESSAGE_PREFIX}${doctorId}`;
      const existing = await getCachedValue(messagesKey, localMessages, []);

      const updated = existing.map((item) => {
        if (item.id === messageId && item.status === 'new') {
          return { ...item, status: 'read' };
        }
        return item;
      });

      await setCachedValue(messagesKey, updated, MESSAGE_TTL, localMessages);
      res.json({ success: true, message: 'Message marked as read' });
    } catch (error) {
      console.error('Mark message read error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark message as read',
        error: error.message,
      });
    }
  });

  router.post('/messages/reply', authDoctor, async (req, res) => {
    try {
      const { conversationId, message, recipientId, messageId, reply } = req.body;
      const doctorId = req.doctor.id;
      const content = reply || message;

      if (!content || (!recipientId && !messageId)) {
        return res.status(400).json({
          success: false,
          message: 'Reply content and message ID or recipient ID are required',
        });
      }

      if (messageId) {
        const messagesKey = `${MESSAGE_PREFIX}${doctorId}`;
        const existing = await getCachedValue(messagesKey, localMessages, []);
        const updated = existing.map((item) => {
          if (item.id === messageId) {
            return { ...item, status: 'replied', reply: content, repliedAt: new Date().toISOString() };
          }
          return item;
        });
        await setCachedValue(messagesKey, updated, MESSAGE_TTL, localMessages);
      }

      res.json({
        success: true,
        message: 'Reply sent successfully',
        data: {
          id: Date.now(),
          conversationId: conversationId || `conv_${doctorId}_${recipientId}`,
          senderId: doctorId,
          recipientId,
          content,
          sentAt: new Date(),
          status: 'sent',
        },
      });
    } catch (error) {
      console.error('Reply message error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send reply',
        error: error.message,
      });
    }
  });

  return router;
};
