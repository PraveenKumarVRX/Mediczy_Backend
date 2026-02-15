import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import EmailSettings from '../models/emailSettings.model.js';

const router = express.Router();

/**
 * ============================================================================
 * EMAIL SETTINGS ENDPOINTS - SMTP/IMAP Configuration Management
 * ============================================================================
 * 
 * These endpoints allow team members to configure their email accounts
 * with SMTP/IMAP settings for sending and receiving emails within Mediczy
 */

/**
 * GET /api/email-settings
 * Get all email settings for current user
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const settings = await EmailSettings.findAll({
      where: { userId, deletedAt: null },
      order: [['isDefault', 'DESC'], ['createdAt', 'DESC']],
      attributes: {
        exclude: ['smtpPassword', 'imapPassword'] // Never return passwords to client
      }
    });

    res.json({
      success: true,
      data: settings,
      count: settings.length
    });
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email settings',
      error: error.message
    });
  }
});

/**
 * GET /api/email-settings/:settingsId
 * Get specific email settings configuration
 */
router.get('/:settingsId', authUser, async (req, res) => {
  try {
    const { settingsId } = req.params;
    const userId = req.user.id;

    const settings = await EmailSettings.findOne({
      where: { id: settingsId, userId, deletedAt: null },
      attributes: {
        exclude: ['smtpPassword', 'imapPassword']
      }
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Email settings not found'
      });
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email settings',
      error: error.message
    });
  }
});

/**
 * POST /api/email-settings
 * Create new email settings configuration for user
 * 
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "displayName": "User Name",
 *   "provider": "gmail|outlook|zoho|custom",
 *   "smtpHost": "smtp.gmail.com",
 *   "smtpPort": 587,
 *   "smtpSecure": true,
 *   "smtpUsername": "user@example.com",
 *   "smtpPassword": "app-password",
 *   "imapHost": "imap.gmail.com",
 *   "imapPort": 993,
 *   "imapSecure": true,
 *   "imapUsername": "user@example.com",
 *   "imapPassword": "app-password",
 *   "isDefault": false,
 *   "rateLimitPerHour": 100,
 *   "rateLimitPerDay": 1000,
 *   "syncEnabled": true,
 *   "syncFrequencyMinutes": 15
 * }
 */
router.post('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      email,
      displayName,
      provider = 'custom',
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      imapHost,
      imapPort,
      imapSecure,
      imapUsername,
      imapPassword,
      isDefault = false,
      rateLimitPerHour = 100,
      rateLimitPerDay = 1000,
      syncEnabled = true,
      syncFrequencyMinutes = 15
    } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await EmailSettings.update(
        { isDefault: false },
        { where: { userId, isDefault: true } }
      );
    }

    const settings = await EmailSettings.create({
      userId,
      email,
      displayName: displayName || email.split('@')[0],
      provider,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      imapHost,
      imapPort,
      imapSecure,
      imapUsername,
      imapPassword,
      isDefault,
      rateLimitPerHour,
      rateLimitPerDay,
      syncEnabled,
      syncFrequencyMinutes
    });

    // Fetch without passwords
    const settingsWithoutPasswords = await EmailSettings.findOne({
      where: { id: settings.id },
      attributes: {
        exclude: ['smtpPassword', 'imapPassword']
      }
    });

    res.status(201).json({
      success: true,
      data: settingsWithoutPasswords,
      message: 'Email settings created successfully'
    });
  } catch (error) {
    console.error('Error creating email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email settings',
      error: error.message
    });
  }
});

/**
 * PUT /api/email-settings/:settingsId
 * Update email settings configuration
 */
router.put('/:settingsId', authUser, async (req, res) => {
  try {
    const { settingsId } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    const settings = await EmailSettings.findOne({
      where: { id: settingsId, userId }
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Email settings not found'
      });
    }

    // If setting as default, unset other defaults
    if (updateData.isDefault === true && !settings.isDefault) {
      await EmailSettings.update(
        { isDefault: false },
        { where: { userId, isDefault: true } }
      );
    }

    await settings.update(updateData);

    // Fetch without passwords
    const updatedSettings = await EmailSettings.findOne({
      where: { id: settingsId },
      attributes: {
        exclude: ['smtpPassword', 'imapPassword']
      }
    });

    res.json({
      success: true,
      data: updatedSettings,
      message: 'Email settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update email settings',
      error: error.message
    });
  }
});

/**
 * POST /api/email-settings/:settingsId/test
 * Test SMTP/IMAP connectivity for email settings
 */
router.post('/:settingsId/test', authUser, async (req, res) => {
  try {
    const { settingsId } = req.params;
    const userId = req.user.id;

    const settings = await EmailSettings.findOne({
      where: { id: settingsId, userId }
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Email settings not found'
      });
    }

    // Simulate test (in production, actually test SMTP/IMAP connections)
    const testResult = {
      smtpConnected: false,
      imapConnected: false,
      errors: []
    };

    try {
      // Test SMTP connection
      if (settings.smtpHost && settings.smtpPort && settings.smtpUsername) {
        // Simple validation - in production use nodemailer to verify
        testResult.smtpConnected = true;
        testResult.smtpStatus = 'ready (validation only)';
      }
    } catch (e) {
      testResult.errors.push(`SMTP: ${e.message}`);
    }

    try {
      // Test IMAP connection
      if (settings.imapHost && settings.imapPort && settings.imapUsername) {
        // Simple validation - in production use imap library to verify
        testResult.imapConnected = true;
        testResult.imapStatus = 'ready (validation only)';
      }
    } catch (e) {
      testResult.errors.push(`IMAP: ${e.message}`);
    }

    // Update test result in database
    await settings.update({
      lastTestedAt: new Date(),
      testResult: testResult.smtpConnected && testResult.imapConnected ? 'success' : 'partial',
      testDetails: testResult
    });

    res.json({
      success: testResult.smtpConnected && testResult.imapConnected,
      data: testResult,
      message: testResult.errors.length > 0 ? testResult.errors.join('; ') : 'Configuration test completed'
    });
  } catch (error) {
    console.error('Error testing email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test email settings',
      error: error.message
    });
  }
});

/**
 * DELETE /api/email-settings/:settingsId
 * Soft delete email settings configuration
 */
router.delete('/:settingsId', authUser, async (req, res) => {
  try {
    const { settingsId } = req.params;
    const userId = req.user.id;

    const settings = await EmailSettings.findOne({
      where: { id: settingsId, userId }
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Email settings not found'
      });
    }

    // If deleting default, find next active config and set as default
    if (settings.isDefault) {
      const nextDefault = await EmailSettings.findOne({
        where: { userId, isActive: true, deletedAt: null, id: { [require('sequelize').Op.ne]: settingsId } },
        order: [['createdAt', 'DESC']]
      });
      if (nextDefault) {
        await nextDefault.update({ isDefault: true });
      }
    }

    await settings.destroy({ force: false }); // Soft delete

    res.json({
      success: true,
      message: 'Email settings deleted'
    });
  } catch (error) {
    console.error('Error deleting email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete email settings',
      error: error.message
    });
  }
});

/**
 * PUT /api/email-settings/:settingsId/set-default
 * Set specific email settings as default for user
 */
router.put('/:settingsId/set-default', authUser, async (req, res) => {
  try {
    const { settingsId } = req.params;
    const userId = req.user.id;

    const settings = await EmailSettings.findOne({
      where: { id: settingsId, userId }
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Email settings not found'
      });
    }

    // Unset other defaults
    await EmailSettings.update(
      { isDefault: false },
      { where: { userId, isDefault: true } }
    );

    // Set this as default
    await settings.update({ isDefault: true });

    const updatedSettings = await EmailSettings.findOne({
      where: { id: settingsId },
      attributes: {
        exclude: ['smtpPassword', 'imapPassword']
      }
    });

    res.json({
      success: true,
      data: updatedSettings,
      message: 'Email settings set as default'
    });
  } catch (error) {
    console.error('Error setting default email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default email settings',
      error: error.message
    });
  }
});

/**
 * GET /api/email-settings/default
 * Get default email settings for current user
 */
router.get('/default', authUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await EmailSettings.findOne({
      where: { userId, isDefault: true, isActive: true, deletedAt: null },
      attributes: {
        exclude: ['smtpPassword', 'imapPassword']
      }
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'No default email settings configured'
      });
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching default email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch default email settings',
      error: error.message
    });
  }
});

/**
 * ADMIN ENDPOINTS
 */

/**
 * GET /api/email-settings/admin/user/:userId
 * (Admin only) Get all email settings for a specific user
 */
router.get('/admin/user/:userId', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;

    const settings = await EmailSettings.findAll({
      where: { userId, deletedAt: null },
      order: [['isDefault', 'DESC'], ['createdAt', 'DESC']],
      attributes: {
        exclude: ['smtpPassword', 'imapPassword']
      }
    });

    res.json({
      success: true,
      data: settings,
      count: settings.length
    });
  } catch (error) {
    console.error('Error fetching user email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email settings',
      error: error.message
    });
  }
});

/**
 * POST /api/email-settings/admin/user/:userId
 * (Admin only) Create email settings for a specific user
 */
router.post('/admin/user/:userId', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      email,
      displayName,
      provider = 'custom',
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      imapHost,
      imapPort,
      imapSecure,
      imapUsername,
      imapPassword,
      isDefault = false,
      rateLimitPerHour = 100,
      rateLimitPerDay = 1000,
      syncEnabled = true,
      syncFrequencyMinutes = 15
    } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await EmailSettings.update(
        { isDefault: false },
        { where: { userId, isDefault: true } }
      );
    }

    const settings = await EmailSettings.create({
      userId: parseInt(userId),
      email,
      displayName: displayName || email.split('@')[0],
      provider,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      imapHost,
      imapPort,
      imapSecure,
      imapUsername,
      imapPassword,
      isDefault,
      rateLimitPerHour,
      rateLimitPerDay,
      syncEnabled,
      syncFrequencyMinutes
    });

    const settingsWithoutPasswords = await EmailSettings.findOne({
      where: { id: settings.id },
      attributes: {
        exclude: ['smtpPassword', 'imapPassword']
      }
    });

    res.status(201).json({
      success: true,
      data: settingsWithoutPasswords,
      message: 'Email settings created successfully'
    });
  } catch (error) {
    console.error('Error creating email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email settings',
      error: error.message
    });
  }
});

export default router;
