import express from 'express';
import { isFirebaseInitialized } from '../utils/firebase-admin.js';

const router = express.Router();

import { sendSystemNotification } from '../utils/firebase-admin.js';

router.get('/status', (req, res) => {
  res.json({
    success: true,
    initialized: isFirebaseInitialized,
    message: isFirebaseInitialized 
      ? 'Firebase is initialized and ready' 
      : 'Firebase is not initialized - check credentials'
  });
});

router.post('/test-notification', async (req, res) => {
  try {
    if (!isFirebaseInitialized) {
      return res.status(503).json({
        success: false,
        message: 'Firebase not initialized'
      });
    }

    const { token, title, message } = req.body;

    if (!token || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: token, title, message'
      });
    }

    const systemData = {
      title,
      message,
      category: 'test'
    };

    const result = await sendSystemNotification(token, systemData);

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      messageId: result
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
});

export default router;
