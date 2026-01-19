import { validationResult } from 'express-validator';
import { JWT_CONFIG } from '../config/auth.config.js';
import { EmailConfig, EmailTemplate, EmailLog } from '../models/email.model.js';
import { addJob, getQueueStats } from '../config/queues.js';
import emailService from '../services/emailService.js';
import { Op } from 'sequelize';

// SMTP Configuration Controllers
export const getEmailConfigs = async (req, res) => {
  try {
    const configs = await EmailConfig.findAll();
    
    // Add runtime stats for each config
    const configsWithStats = await Promise.all(
      configs.map(async (config) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const sentToday = await EmailLog.count({
          where: {
            configId: config.id,
            sentAt: { $gte: today }
          }
        });
        
        const rateLimits = config.rateLimits || { perDay: 1000 };
        
        return {
          ...config.toJSON(),
          dailyUsage: sentToday,
          usagePercentage: (sentToday / rateLimits.perDay) * 100
        };
      })
    );

    res.json({
      success: true,
      data: configsWithStats,
      total: configs.length
    });
  } catch (error) {
    console.error('Error fetching email configs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email configurations'
    });
  }
};

export const createEmailConfig = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      console.log('Request body:', req.body);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      name, 
      host, 
      port, 
      secure, 
      username, 
      password, 
      fromEmail, 
      fromName, 
      encryption,
      isDefault,
      isActive,
      replyTo,
      dailyLimit,
      monthlyLimit,
      provider
    } = req.body;

    // Check if this is the first config (make it default)
    const existingCount = await EmailConfig.count();
    const shouldBeDefault = existingCount === 0 || isDefault;

    // If setting as default, remove default from others
    if (shouldBeDefault) {
      await EmailConfig.update({ isDefault: false }, { where: {} });
    }

    const config = await EmailConfig.create({
      name,
      host,
      port: port || 587,
      secure: secure ?? (port === 465),
      username,
      password,
      fromEmail,
      fromName,
      isDefault: shouldBeDefault,
      isActive: isActive !== undefined ? isActive : true,
      replyTo: replyTo || '',
      rateLimits: { 
        perHour: 100, 
        perDay: dailyLimit || 1000,
        perMonth: monthlyLimit || 30000 
      },
      provider: provider || 'Custom SMTP',
      testResult: { success: true, message: 'Not tested yet' },
      createdBy: req.user?.email || 'admin'
    });

    res.status(201).json({
      success: true,
      message: 'Email configuration created successfully',
      data: {
        ...config.toJSON(),
        password: undefined // Don't return password
      }
    });
  } catch (error) {
    console.error('Error creating email config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email configuration'
    });
  }
};

export const updateEmailConfig = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updates = { ...req.body };

    // Remove password if empty (keep existing password)
    if (updates.password === '') {
      delete updates.password;
    }

    // Find the config first
    const config = await EmailConfig.findByPk(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found'
      });
    }

    // If setting as default, remove default from others
    if (updates.isDefault) {
      await EmailConfig.update(
        { isDefault: false }, 
        { where: { id: { [Op.ne]: id } } }
      );
    }

    // Update the config
    await config.update(updates);

    res.json({
      success: true,
      message: 'Email configuration updated successfully',
      data: {
        ...config.toJSON(),
        password: undefined // Don't return password
      }
    });
  } catch (error) {
    console.error('Error updating email config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update email configuration'
    });
  }
};

export const deleteEmailConfig = async (req, res) => {
  try {
    const { id } = req.params;

    const config = await EmailConfig.findByPk(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found'
      });
    }

    // Check if this config is being used by any pending emails
    const pendingEmails = await EmailLog.count({
      where: {
        configId: id,
        status: ['pending', 'sent']
      }
    });

    if (pendingEmails > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete configuration with pending emails'
      });
    }

    const wasDefault = config.isDefault;
    await config.destroy();

    // If deleted config was default, make another one default
    if (wasDefault) {
      const nextConfig = await EmailConfig.findOne({ where: { isActive: true } });
      if (nextConfig) {
        await nextConfig.update({ isDefault: true });
      }
    }

    res.json({
      success: true,
      message: 'Email configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting email config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete email configuration'
    });
  }
};

export const testEmailConfig = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors in testEmailConfig:', errors.array());
      console.log('Request body:', req.body);
      console.log('Request params:', req.params);
      
      const emailError = errors.array().find(e => e.path === 'testEmail');
      const errorMessage = emailError?.msg || 'Please provide a valid email address';
      
      return res.status(400).json({
        success: false,
        message: errorMessage,
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { testEmail } = req.body;

    const config = await EmailConfig.findByPk(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found'
      });
    }

    console.log('Testing SMTP config:', {
      id: config.id,
      name: config.name,
      hasPassword: !!config.password,
      passwordLength: config.password?.length,
      password: config.password
    });

    try {
      const result = await emailService.testSMTPConfig(config, testEmail);
      
      // Update config with test result
      await config.update({
        testResult: {
          success: result.success,
          message: result.message,
          testedAt: new Date()
        },
        lastTested: new Date()
      });

      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      // Update config with failure
      config.testResult = {
        success: false,
        message: error.message,
        testedAt: new Date()
      };
      config.lastTested = new Date();
      await config.save();

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  } catch (error) {
    console.error('Error testing email config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test email configuration'
    });
  }
};

export const setDefaultConfig = async (req, res) => {
  try {
    const { id } = req.params;

    // Remove default from all configs
    await EmailConfig.update({ isDefault: false }, { where: {} });

    // Set new default
    const config = await EmailConfig.findByPk(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Email configuration not found'
      });
    }

    await config.update({ isDefault: true, isActive: true });

    res.json({
      success: true,
      message: 'Default email configuration updated',
      data: {
        ...config.toJSON(),
        password: undefined
      }
    });
  } catch (error) {
    console.error('Error setting default config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default configuration'
    });
  }
};

// Email Template Controllers
export const getEmailTemplates = async (req, res) => {
  try {
    const { category, isActive, search, page = 1, limit = 20 } = req.query;
    const where = {};

    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { subject: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: templates, count: total } = await EmailTemplate.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: templates,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email templates'
    });
  }
};

export const createEmailTemplate = async (req, res) => {
  try {
    console.log('🔥 createEmailTemplate called with body:', JSON.stringify(req.body, null, 2));
    console.log('🔥 Request user:', req.user);
    
    const errors = validationResult(req);
    console.log('🔥 Validation errors:', errors.array());
    
    if (!errors.isEmpty()) {
      console.log('❌ Validation failed:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    console.log('✅ Validation passed, creating template...');
    const template = await EmailTemplate.create({
      ...req.body,
      createdBy: req.user?.email || 'system'
    });

    console.log('✅ Template saved successfully');

    res.status(201).json({
      success: true,
      message: 'Email template created successfully',
      data: template
    });
  } catch (error) {
    console.error('❌ Error creating email template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email template',
      error: error.message
    });
  }
};

export const updateEmailTemplate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const template = await EmailTemplate.findByPk(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    await template.update(req.body);

    res.json({
      success: true,
      message: 'Email template updated successfully',
      data: template
    });
  } catch (error) {
    console.error('Error updating email template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update email template'
    });
  }
};

export const deleteEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await EmailTemplate.findByPk(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    // Check if template is being used by pending emails
    const pendingEmails = await EmailLog.count({
      where: {
        templateId: id,
        status: { [Op.in]: ['pending', 'sent'] }
      }
    });

    if (pendingEmails > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete template with pending emails'
      });
    }

    await template.destroy();

    res.json({
      success: true,
      message: 'Email template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting email template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete email template'
    });
  }
};

export const previewTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { variables = {} } = req.body;

    const template = await EmailTemplate.findByPk(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    const renderedContent = emailService.renderTemplate(template, variables);

    res.json({
      success: true,
      data: {
        subject: renderedContent.subject,
        htmlContent: renderedContent.htmlContent,
        textContent: renderedContent.textContent,
        variables: template.variables
      }
    });
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview template'
    });
  }
};

export const validateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { variables = {} } = req.body;

    const template = await EmailTemplate.findByPk(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Email template not found'
      });
    }

    const validation = emailService.validateTemplate(template, variables);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate template'
    });
  }
};

// Email Sending Controllers
export const sendEmail = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { to, cc, bcc, subject, templateId, configId, variables, priority = 'normal' } = req.body;

    // Get default config if not specified
    let config;
    if (configId) {
      config = await EmailConfig.findByPk(configId);
    } else {
      config = await EmailConfig.findOne({ isDefault: true, isActive: true });
    }

    if (!config) {
      return res.status(400).json({
        success: false,
        message: 'No email configuration available'
      });
    }

    // Create email log entry
    const emailLog = await EmailLog.create({
      to,
      cc,
      bcc,
      subject: templateId ? undefined : subject,
      templateId,
      configId: config.id,
      priority,
      variables: new Map(Object.entries(variables || {})),
      sentBy: req.user.email
    });

    await emailLog.save();

    // Queue email for sending
    await addJob('email', 'send-email', {
      emailLogId: emailLog.id.toString(),
      to,
      cc,
      bcc,
      subject,
      templateId,
      configId: config.id.toString(),
      variables,
      priority
    }, {
      priority: priority === 'urgent' ? 1 : priority === 'high' ? 2 : priority === 'normal' ? 3 : 4,
      delay: priority === 'urgent' ? 0 : 1000 // Urgent emails sent immediately
    });

    res.status(201).json({
      success: true,
      message: 'Email queued for sending',
      data: {
        emailId: emailLog.id,
        status: 'pending',
        queuedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue email'
    });
  }
};

export const sendBulkEmail = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { recipients, templateId, configId, priority = 'normal' } = req.body;

    // Validate recipients count
    if (recipients.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 1000 recipients allowed per batch'
      });
    }

    // Get config
    let config;
    if (configId) {
      config = await EmailConfig.findByPk(configId);
    } else {
      config = await EmailConfig.findOne({ isDefault: true, isActive: true });
    }

    if (!config) {
      return res.status(400).json({
        success: false,
        message: 'No email configuration available'
      });
    }

    // Check daily limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await EmailLog.countDocuments({
      configId: config.id,
      createdAt: { $gte: today },
      status: { $in: ['sent', 'delivered'] }
    });

    if (sentToday + recipients.length > config.rateLimits.perDay) {
      return res.status(400).json({
        success: false,
        message: 'Bulk email exceeds daily sending limit'
      });
    }

    const emailLogs = [];

    // Create email log entries
    for (const recipient of recipients) {
      const emailLog = await EmailLog.create({
        to: recipient.to,
        cc: recipient.cc,
        bcc: recipient.bcc,
        templateId,
        configId: config.id,
        priority,
        variables: new Map(Object.entries(recipient.variables || {})),
        sentBy: req.user.email
      });

      await emailLog.save();
      emailLogs.push(emailLog);

      // Queue each email
      await addJob('email', 'send-email', {
        emailLogId: emailLog.id.toString(),
        to: recipient.to,
        cc: recipient.cc,
        bcc: recipient.bcc,
        templateId,
        configId: config.id.toString(),
        variables: recipient.variables,
        priority
      }, {
        priority: priority === 'urgent' ? 1 : priority === 'high' ? 2 : priority === 'normal' ? 3 : 4,
        delay: Math.random() * 5000 // Spread over 5 seconds to avoid overwhelming
      });
    }

    res.status(201).json({
      success: true,
      message: `${recipients.length} emails queued for sending`,
      data: {
        batchSize: recipients.length,
        emailIds: emailLogs.map(log => log.id),
        queuedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error sending bulk email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue bulk emails'
    });
  }
};

export const scheduleEmail = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { to, scheduledAt, templateId, configId, variables } = req.body;

    const scheduleDate = new Date(scheduledAt);
    if (scheduleDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled time must be in the future'
      });
    }

    // Get config
    let config;
    if (configId) {
      config = await EmailConfig.findByPk(configId);
    } else {
      config = await EmailConfig.findOne({ isDefault: true, isActive: true });
    }

    if (!config) {
      return res.status(400).json({
        success: false,
        message: 'No email configuration available'
      });
    }

    // Create email log entry
    const emailLog = await EmailLog.create({
      to,
      templateId,
      configId: config.id,
      scheduledAt: scheduleDate,
      variables: new Map(Object.entries(variables || {})),
      sentBy: req.user.email
    });

    await emailLog.save();

    // Schedule email
    const delay = scheduleDate.getTime() - Date.now();
    await addJob('email', 'send-email', {
      emailLogId: emailLog.id.toString(),
      to,
      templateId,
      configId: config.id.toString(),
      variables
    }, { delay });

    res.status(201).json({
      success: true,
      message: 'Email scheduled successfully',
      data: {
        emailId: emailLog.id,
        scheduledAt: scheduleDate.toISOString(),
        status: 'scheduled'
      }
    });
  } catch (error) {
    console.error('Error scheduling email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule email'
    });
  }
};

// Email Logs and Analytics Controllers
export const getEmailLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      startDate,
      endDate,
      to,
      templateId,
      configId
    } = req.query;

    const where = {};

    if (status) where.status = status;
    if (to) where.to = { [Op.like]: `%${to}%` };
    if (templateId) where.templateId = templateId;
    if (configId) where.configId = configId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: logs, count: total } = await EmailLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    const paginatedLogs = logs;

    res.json({
      success: true,
      data: paginatedLogs,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching email logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email logs'
    });
  }
};

export const getEmailStats = async (req, res) => {
  try {
    const { period = 'day', startDate, endDate } = req.query;

    let dateWhere = {};
    if (startDate || endDate) {
      dateWhere.createdAt = {};
      if (startDate) dateWhere.createdAt[Op.gte] = new Date(startDate);
      if (endDate) dateWhere.createdAt[Op.lte] = new Date(endDate);
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateWhere.createdAt = { [Op.gte]: thirtyDaysAgo };
    }

    const [
      totalSent,
      totalDelivered,
      totalFailed,
      totalBounced,
      totalOpened,
      totalClicked,
      queueStats
    ] = await Promise.all([
      EmailLog.count({ where: { ...dateWhere, status: { [Op.in]: ['sent', 'delivered'] } } }),
      EmailLog.count({ where: { ...dateWhere, status: 'delivered' } }),
      EmailLog.count({ where: { ...dateWhere, status: 'failed' } }),
      EmailLog.count({ where: { ...dateWhere, status: 'bounced' } }),
      EmailLog.count({ where: { ...dateWhere, openedAt: { [Op.ne]: null } } }),
      EmailLog.count({ where: { ...dateWhere, clickedAt: { [Op.ne]: null } } }),
      getQueueStats('email')
    ]);

    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent * 100).toFixed(2) : 0;
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered * 100).toFixed(2) : 0;
    const clickRate = totalOpened > 0 ? (totalClicked / totalOpened * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        totalSent,
        totalDelivered,
        totalFailed,
        totalBounced,
        deliveryRate: parseFloat(deliveryRate),
        openRate: parseFloat(openRate),
        clickRate: parseFloat(clickRate),
        queue: queueStats
      }
    });
  } catch (error) {
    console.error('Error fetching email stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email statistics'
    });
  }
};

export const getEmailAnalytics = async (req, res) => {
  try {
    const { period = 'day', templateId, configId } = req.query;

    let groupBy;
    switch (period) {
      case 'hour':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' }
        };
        break;
      case 'day':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        break;
      case 'week':
        groupBy = {
          year: { $year: '$createdAt' },
          week: { $week: '$createdAt' }
        };
        break;
      case 'month':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        break;
    }

    const match = {};
    if (templateId) match.templateId = templateId;
    if (configId) match.configId = configId;

    // Last 30 days of data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    match.createdAt = { $gte: thirtyDaysAgo };

    const analytics = await EmailLog.aggregate([
      { $match: match },
      {
        $group: {
          id: groupBy,
          sent: {
            $sum: {
              $cond: [{ $in: ['$status', ['sent', 'delivered']] }, 1, 0]
            }
          },
          delivered: {
            $sum: {
              $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0]
            }
          },
          failed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
            }
          },
          opened: {
            $sum: {
              $cond: [{ $ne: ['$openedAt', null] }, 1, 0]
            }
          },
          clicked: {
            $sum: {
              $cond: [{ $ne: ['$clickedAt', null] }, 1, 0]
            }
          }
        }
      },
      { $sort: { 'id': 1 } }
    ]);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching email analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email analytics'
    });
  }
};

export const retryFailedEmail = async (req, res) => {
  try {
    const { id } = req.params;

    const emailLog = await EmailLog.findByPk(id);
    if (!emailLog) {
      return res.status(404).json({
        success: false,
        message: 'Email log not found'
      });
    }

    if (emailLog.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Only failed emails can be retried'
      });
    }

    if (emailLog.retryCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum retry attempts reached'
      });
    }

    // Update retry count and status
    emailLog.retryCount += 1;
    emailLog.status = 'pending';
    emailLog.errorMessage = undefined;
    await emailLog.save();

    // Re-queue email
    await addJob('email', 'send-email', {
      emailLogId: emailLog.id.toString(),
      isRetry: true
    });

    res.json({
      success: true,
      message: 'Email queued for retry',
      data: {
        emailId: emailLog.id,
        retryCount: emailLog.retryCount
      }
    });
  } catch (error) {
    console.error('Error retrying email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry email'
    });
  }
};

export const cancelPendingEmail = async (req, res) => {
  try {
    const { id } = req.params;

    const emailLog = await EmailLog.findByPk(id);
    if (!emailLog) {
      return res.status(404).json({
        success: false,
        message: 'Email log not found'
      });
    }

    if (emailLog.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending emails can be cancelled'
      });
    }

    emailLog.status = 'cancelled';
    await emailLog.save();

    res.json({
      success: true,
      message: 'Email cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel email'
    });
  }
};

export const exportEmailLogs = async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.query;

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const logs = await EmailLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 10000 // Limit export to 10k records
    });

    if (format === 'csv') {
      const csvData = logs.map(log => ({
        'Email ID': log.id,
        'To': log.to,
        'CC': log.cc?.join(';') || '',
        'BCC': log.bcc?.join(';') || '',
        'Subject': log.subject,
        'Template': log.templateId || 'N/A',
        'Config': log.configId || 'N/A',
        'Status': log.status,
        'Priority': log.priority,
        'Sent At': log.sentAt?.toISOString() || '',
        'Delivered At': log.deliveredAt?.toISOString() || '',
        'Opened At': log.openedAt?.toISOString() || '',
        'Clicked At': log.clickedAt?.toISOString() || '',
        'Error Message': log.errorMessage || '',
        'Retry Count': log.retryCount,
        'Created At': log.createdAt.toISOString()
      }));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="email-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      
      // Simple CSV generation (you might want to use a library like csv-writer for production)
      const csvHeader = Object.keys(csvData[0]).join(',');
      const csvRows = csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','));
      const csv = [csvHeader, ...csvRows].join('\n');
      
      res.send(csv);
    } else {
      res.json({
        success: true,
        message: 'Only CSV format supported currently',
        data: logs
      });
    }
  } catch (error) {
    console.error('Error exporting email logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export email logs'
    });
  }
};