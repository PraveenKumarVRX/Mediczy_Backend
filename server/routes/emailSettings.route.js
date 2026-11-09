import express from 'express';
import { Op } from 'sequelize';
import nodemailer from 'nodemailer';
import Imap from 'imap';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import EmailSettings from '../models/emailSettings.model.js';

const router = express.Router();

/** Provider fallbacks, matching the sync worker's table. */
const PROVIDER_IMAP_DEFAULTS = {
  'zoho-pro': { host: 'imappro.zoho.in', port: 993 },
  'zoho':     { host: 'imap.zoho.in',    port: 993 },
  'gmail':    { host: 'imap.gmail.com',  port: 993 },
  'outlook':  { host: 'outlook.office365.com', port: 993 },
  'custom':   { host: 'imap.zoho.in',    port: 993 },
};

const TEST_TIMEOUT_MS = 15000;

/**
 * Actually open an IMAP session and select INBOX.
 *
 * Selecting the mailbox matters: Zoho accepts the TCP/TLS connection and only
 * then refuses with "You are yet to enable IMAP for your account", so a test
 * that stops at connect still reports a mailbox that can never sync as healthy.
 */
function probeImap({ host, port, secure, username, password }) {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: username, password, host, port, tls: secure !== false,
      tlsOptions: { servername: host },
      authTimeout: TEST_TIMEOUT_MS, connTimeout: TEST_TIMEOUT_MS,
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { imap.end(); } catch { /* already closed */ }
      resolve(result);
    };
    imap.once('ready', () => imap.openBox('INBOX', true, (err, box) => finish(
      err ? { connected: false, status: `INBOX not selectable: ${err.message}` }
          : { connected: true, status: `ready (INBOX: ${box?.messages?.total ?? 0} messages)` }
    )));
    imap.once('error', (e) => finish({ connected: false, status: String(e?.message || e) }));
    setTimeout(() => finish({ connected: false, status: `no response within ${TEST_TIMEOUT_MS / 1000}s` }), TEST_TIMEOUT_MS + 1000);
    try { imap.connect(); } catch (e) { finish({ connected: false, status: e.message }); }
  });
}

/** Authenticate against SMTP via nodemailer's verify(). */
async function probeSmtp({ host, port, secure, username, password }) {
  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: secure !== false,
      auth: { user: username, pass: password },
      connectionTimeout: TEST_TIMEOUT_MS, greetingTimeout: TEST_TIMEOUT_MS, socketTimeout: TEST_TIMEOUT_MS,
    });
    await transporter.verify();
    try { transporter.close(); } catch { /* best effort */ }
    return { connected: true, status: 'ready (authenticated)' };
  } catch (e) {
    return { connected: false, status: String(e?.message || e) };
  }
}

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
router.get('/', async (req, res) => {
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
router.get('/:settingsId', async (req, res) => {
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
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      email,
      fromEmail,
      displayName,
      fromName,
      name,
      provider = 'custom',
      smtpHost,
      host,
      smtpPort,
      port,
      smtpSecure,
      encryption,
      smtpUsername,
      username,
      smtpPassword,
      password,
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

    const resolvedEmail = email || fromEmail;
    const resolvedDisplayName = displayName || fromName || name;
    const resolvedSmtpHost = smtpHost || host;
    const resolvedSmtpPort = smtpPort || port;
    const resolvedSmtpSecure = typeof smtpSecure === 'boolean' ? smtpSecure : encryption === 'ssl';
    const resolvedSmtpUsername = smtpUsername || username || resolvedEmail;
    const resolvedSmtpPassword = smtpPassword || password;
    const resolvedImapUsername = imapUsername || resolvedSmtpUsername;
    const resolvedImapPassword = imapPassword || resolvedSmtpPassword;

    // Validate required fields
    if (!resolvedEmail) {
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
      email: resolvedEmail,
      displayName: resolvedDisplayName || resolvedEmail.split('@')[0],
      provider,
      smtpHost: resolvedSmtpHost,
      smtpPort: resolvedSmtpPort,
      smtpSecure: resolvedSmtpSecure,
      smtpUsername: resolvedSmtpUsername,
      smtpPassword: resolvedSmtpPassword,
      imapHost,
      imapPort,
      imapSecure,
      imapUsername: resolvedImapUsername,
      imapPassword: resolvedImapPassword,
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
router.put('/:settingsId', async (req, res) => {
  try {
    const { settingsId } = req.params;
    const userId = req.user.id;
    const {
      email,
      fromEmail,
      displayName,
      fromName,
      name,
      smtpHost,
      host,
      smtpPort,
      port,
      smtpSecure,
      encryption,
      smtpUsername,
      username,
      smtpPassword,
      password,
      imapUsername,
      imapPassword,
      ...rest
    } = req.body;

    const updateData = {
      ...rest,
      ...(email || fromEmail ? { email: email || fromEmail } : {}),
      ...(displayName || fromName || name ? { displayName: displayName || fromName || name } : {}),
      ...(smtpHost || host ? { smtpHost: smtpHost || host } : {}),
      ...(smtpPort || port ? { smtpPort: smtpPort || port } : {}),
      ...(typeof smtpSecure === 'boolean' || encryption ? { smtpSecure: typeof smtpSecure === 'boolean' ? smtpSecure : encryption === 'ssl' } : {}),
      ...(smtpUsername || username ? { smtpUsername: smtpUsername || username } : {}),
      ...(smtpPassword || password ? { smtpPassword: smtpPassword || password } : {}),
      ...(imapUsername || smtpUsername || username ? { imapUsername: imapUsername || smtpUsername || username } : {}),
      ...(imapPassword || smtpPassword || password ? { imapPassword: imapPassword || smtpPassword || password } : {})
    };

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
router.post('/:settingsId/test', async (req, res) => {
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

    // A real connection test.
    //
    // This used to set smtpConnected/imapConnected to true whenever the host,
    // port and username FIELDS were non-empty, label it "ready (validation
    // only)" and store testResult:'success'. It never opened a socket, so the
    // screen reported a healthy mailbox for a configuration that could not sync
    // at all -- hello@mysmarthealth.in has IMAP disabled at the provider and
    // still tested green. A test that cannot fail is worse than no test,
    // because it is believed.
    const testResult = {
      smtpConnected: false,
      imapConnected: false,
      errors: []
    };

    const defaults = PROVIDER_IMAP_DEFAULTS[settings.provider] || PROVIDER_IMAP_DEFAULTS.custom;
    const imapPassword = settings.imapPassword || settings.smtpPassword;
    const smtpPassword = settings.smtpPassword || settings.imapPassword;

    if (settings.smtpHost && smtpPassword) {
      const smtp = await probeSmtp({
        host: settings.smtpHost,
        port: settings.smtpPort || 465,
        secure: settings.smtpSecure,
        username: settings.smtpUsername || settings.email,
        password: smtpPassword,
      });
      testResult.smtpConnected = smtp.connected;
      testResult.smtpStatus = smtp.status;
      if (!smtp.connected) testResult.errors.push(`SMTP: ${smtp.status}`);
    } else {
      testResult.smtpStatus = 'not configured (host or password missing)';
      testResult.errors.push('SMTP: not configured');
    }

    if (imapPassword) {
      const imap = await probeImap({
        host: settings.imapHost || defaults.host,
        port: settings.imapPort || defaults.port,
        secure: settings.imapSecure,
        username: settings.imapUsername || settings.email,
        password: imapPassword,
      });
      testResult.imapConnected = imap.connected;
      testResult.imapStatus = imap.status;
      if (!imap.connected) testResult.errors.push(`IMAP: ${imap.status}`);
    } else {
      testResult.imapStatus = 'not configured (password missing)';
      testResult.errors.push('IMAP: not configured');
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
      message: testResult.errors.length > 0
        ? testResult.errors.join('; ')
        : `Connected: SMTP ${testResult.smtpStatus}; IMAP ${testResult.imapStatus}`
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
router.delete('/:settingsId', async (req, res) => {
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
        where: { userId, isActive: true, deletedAt: null, id: { [Op.ne]: settingsId } },
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
router.put('/:settingsId/set-default', async (req, res) => {
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
router.get('/default', async (req, res) => {
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
