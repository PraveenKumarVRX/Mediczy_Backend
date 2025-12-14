import express from 'express';
import { SMSService, SMSTemplateManager } from '../services/sms.service.js';
import { adminAuthMiddleware } from '../middleware/admin.middleware.js';

const router = express.Router();

// In-memory storage for SMS logs (use database in production)
const smsLogs = [];
let smsConfig = {
  provider: 'twilio',
  apiKey: process.env.SMS_API_KEY || '',
  apiSecret: process.env.SMS_API_SECRET || '',
  senderId: process.env.SMS_SENDER_ID || 'MEDICZY',
};

// Initialize SMS service
let smsService = null;
if (smsConfig.apiKey) {
  smsService = new SMSService(smsConfig);
}

// Get SMS configuration
router.get('/config', adminAuthMiddleware, (req, res) => {
  res.json({
    success: true,
    config: {
      ...smsConfig,
      apiKey: smsConfig.apiKey ? '***' + smsConfig.apiKey.slice(-4) : '',
      apiSecret: smsConfig.apiSecret ? '***' + smsConfig.apiSecret.slice(-4) : ''
    }
  });
});

// Update SMS configuration
router.post('/config', adminAuthMiddleware, (req, res) => {
  try {
    const { provider, apiKey, apiSecret, senderId } = req.body;

    smsConfig = {
      provider: provider || smsConfig.provider,
      apiKey: apiKey || smsConfig.apiKey,
      apiSecret: apiSecret || smsConfig.apiSecret,
      senderId: senderId || smsConfig.senderId
    };

    // Reinitialize SMS service with new config
    if (smsConfig.apiKey) {
      smsService = new SMSService(smsConfig);
    }

    res.json({
      success: true,
      message: 'SMS configuration updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send single SMS
router.post('/send', adminAuthMiddleware, async (req, res) => {
  try {
    if (!smsService) {
      return res.status(400).json({
        success: false,
        error: 'SMS service not configured'
      });
    }

    const { to, message, templateId, variables } = req.body;

    let smsText = message;
    if (templateId) {
      smsText = SMSTemplateManager.renderTemplate(templateId, variables || {});
    }

    const result = await smsService.sendSMS({
      to,
      message: smsText
    });

    // Log the SMS
    const logEntry = {
      id: Date.now().toString(),
      to: Array.isArray(to) ? to : [to],
      message: smsText,
      result,
      timestamp: new Date().toISOString(),
      sentBy: req.admin.email,
      templateId: templateId || null,
      variables: variables || null
    };

    smsLogs.push(logEntry);

    // Keep only last 1000 logs
    if (smsLogs.length > 1000) {
      smsLogs.splice(0, smsLogs.length - 1000);
    }

    res.json({
      success: true,
      result,
      logId: logEntry.id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send bulk SMS
router.post('/send-bulk', adminAuthMiddleware, async (req, res) => {
  try {
    if (!smsService) {
      return res.status(400).json({
        success: false,
        error: 'SMS service not configured'
      });
    }

    const { recipients, message, templateId, variables } = req.body;

    if (!Array.isArray(recipients)) {
      return res.status(400).json({
        success: false,
        error: 'Recipients must be an array'
      });
    }

    const messages = recipients.map(recipient => {
      let smsText = message;
      if (templateId && recipient.variables) {
        smsText = SMSTemplateManager.renderTemplate(templateId, {
          ...variables,
          ...recipient.variables
        });
      }

      return {
        to: recipient.phone,
        message: smsText
      };
    });

    const results = await smsService.sendBulkSMS(messages);

    // Log bulk SMS
    const logEntry = {
      id: Date.now().toString(),
      type: 'bulk',
      recipients: recipients.length,
      message,
      templateId: templateId || null,
      results,
      timestamp: new Date().toISOString(),
      sentBy: req.admin.email,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    };

    smsLogs.push(logEntry);

    res.json({
      success: true,
      results,
      summary: {
        total: recipients.length,
        successful: logEntry.successCount,
        failed: logEntry.failureCount
      },
      logId: logEntry.id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get SMS templates
router.get('/templates', adminAuthMiddleware, (req, res) => {
  res.json({
    success: true,
    templates: SMSTemplateManager.getAllTemplates()
  });
});

// Add or update SMS template
router.post('/templates', adminAuthMiddleware, (req, res) => {
  try {
    const { id, template } = req.body;

    if (!id || !template) {
      return res.status(400).json({
        success: false,
        error: 'Template ID and content are required'
      });
    }

    SMSTemplateManager.addTemplate(id, template);

    res.json({
      success: true,
      message: 'Template saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get SMS logs
router.get('/logs', adminAuthMiddleware, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const status = req.query.status || '';

    let filteredLogs = [...smsLogs].reverse();

    // Filter by search
    if (search) {
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(search.toLowerCase()) ||
        (log.to && log.to.some(phone => phone.includes(search))) ||
        log.sentBy.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Filter by status
    if (status) {
      filteredLogs = filteredLogs.filter(log => {
        if (log.type === 'bulk') {
          return status === 'mixed' && log.failureCount > 0 && log.successCount > 0 ||
                 status === 'success' && log.failureCount === 0 ||
                 status === 'failed' && log.successCount === 0;
        } else {
          return log.result.success && status === 'success' ||
                 !log.result.success && status === 'failed';
        }
      });
    }

    const total = filteredLogs.length;
    const startIndex = (page - 1) * limit;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get SMS statistics
router.get('/stats', adminAuthMiddleware, (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayLogs = smsLogs.filter(log => new Date(log.timestamp) >= today);
    const monthLogs = smsLogs.filter(log => new Date(log.timestamp) >= thisMonth);

    const todayStats = calculateStats(todayLogs);
    const monthStats = calculateStats(monthLogs);
    const allTimeStats = calculateStats(smsLogs);

    res.json({
      success: true,
      stats: {
        today: todayStats,
        thisMonth: monthStats,
        allTime: allTimeStats,
        provider: smsConfig.provider,
        isConfigured: !!smsService
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to calculate statistics
function calculateStats(logs) {
  let totalSent = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  logs.forEach(log => {
    if (log.type === 'bulk') {
      totalSent += log.recipients;
      totalSuccess += log.successCount;
      totalFailed += log.failureCount;
    } else {
      totalSent += 1;
      if (log.result.success) {
        totalSuccess += 1;
      } else {
        totalFailed += 1;
      }
    }
  });

  return {
    totalSent,
    totalSuccess,
    totalFailed,
    successRate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0
  };
}

// Test SMS configuration
router.post('/test', adminAuthMiddleware, async (req, res) => {
  try {
    if (!smsService) {
      return res.status(400).json({
        success: false,
        error: 'SMS service not configured'
      });
    }

    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for test'
      });
    }

    const testMessage = `Test SMS from Mediczy Admin Panel. Sent at ${new Date().toLocaleString()}`;
    
    const result = await smsService.sendSMS({
      to: phone,
      message: testMessage
    });

    // Log the test SMS
    const logEntry = {
      id: Date.now().toString(),
      to: [phone],
      message: testMessage,
      result,
      timestamp: new Date().toISOString(),
      sentBy: req.admin.email,
      isTest: true
    };

    smsLogs.push(logEntry);

    res.json({
      success: true,
      result,
      message: 'Test SMS sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;