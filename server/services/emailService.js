import nodemailer from 'nodemailer';
import { EmailConfig, EmailTemplate, EmailLog } from '../models/email.model.simple.js';

class EmailService {
  constructor() {
    this.transporters = new Map();
  }

  // Get default email configuration
  async getDefaultConfig() {
    try {
      const defaultConfig = await EmailConfig.findOne({ 
        where: { isDefault: true, isActive: true } 
      });
      return defaultConfig;
    } catch (error) {
      console.error('Error fetching default email config:', error);
      return null;
    }
  }

  // Create and cache SMTP transporter
  async getTransporter(config) {
    const configKey = config.id.toString();
    
    if (this.transporters.has(configKey)) {
      return this.transporters.get(configKey);
    }

    const transportConfig = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password
      },
      connectionTimeout: 10000, // 10 seconds connection timeout
      greetingTimeout: 5000, // 5 seconds greeting timeout
      socketTimeout: 15000, // 15 seconds socket timeout
      pool: true, // Use connection pooling
      maxConnections: 5, // Maximum number of simultaneous connections
      maxMessages: 100, // Maximum number of messages per connection
      rateDelta: 1000, // Time frame for rate limiting
      rateLimit: 5, // Number of messages allowed in timeframe
      tls: {
        rejectUnauthorized: false, // For development - set to true in production
        minVersion: 'TLSv1.2', // Ensure modern TLS version
        ciphers: 'SSLv3' // Allow legacy ciphers for compatibility
      },
      // Additional auth options for problematic providers
      authMethod: 'PLAIN',
      debug: true, // Enable debug logging
      logger: true // Enable detailed logging
    };

    const transporter = nodemailer.createTransport(transportConfig);

    // Cache the transporter
    this.transporters.set(configKey, transporter);

    return transporter;
  }

  // Test SMTP configuration
  async testSMTPConfig(config, testEmail) {
    try {
      // Check if password is set
      if (!config.password || config.password === '***********' || config.password.length === 0) {
        throw new Error('Password not configured - please set your Zoho mail password in the configuration');
      }

      console.log('Testing SMTP connection:', {
        host: config.host,
        port: config.port,
        secure: config.secure,
        username: config.username,
        fromEmail: config.fromEmail
      });

      const transporter = await this.getTransporter(config);

      // Verify connection
      console.log('Verifying SMTP connection...');
      await transporter.verify();
      console.log('SMTP connection verified successfully');

      // Send test email
      const testResult = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: testEmail,
        subject: `Test Email from ${config.name} - ${new Date().toLocaleString()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0; font-size: 24px;">✅ SMTP Test Successful</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Mediqzy Email System</p>
            </div>
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
              <h2 style="color: #2c3e50; margin-top: 0;">Configuration Details</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 12px 0; color: #6c757d; font-weight: 500;">Configuration Name:</td>
                  <td style="padding: 12px 0; font-weight: 600;">${config.name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 12px 0; color: #6c757d; font-weight: 500;">SMTP Host:</td>
                  <td style="padding: 12px 0; font-weight: 600;">${config.host}:${config.port}</td>
                </tr>
                <tr style="border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 12px 0; color: #6c757d; font-weight: 500;">From Email:</td>
                  <td style="padding: 12px 0; font-weight: 600;">${config.fromEmail}</td>
                </tr>
                <tr style="border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 12px 0; color: #6c757d; font-weight: 500;">Security:</td>
                  <td style="padding: 12px 0; font-weight: 600;">${config.secure ? 'SSL/TLS' : 'STARTTLS'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; color: #6c757d; font-weight: 500;">Test Time:</td>
                  <td style="padding: 12px 0; font-weight: 600;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
              <div style="margin-top: 30px; padding: 20px; background: #d4edda; border-left: 4px solid #28a745; border-radius: 4px;">
                <p style="margin: 0; color: #155724;"><strong>✅ Success!</strong> Your SMTP configuration is working correctly and ready for production use.</p>
              </div>
            </div>
          </div>
        `,
        text: `
SMTP Test Successful - Mediqzy Email System

Configuration Details:
- Name: ${config.name}
- SMTP Host: ${config.host}:${config.port}
- From Email: ${config.fromEmail}
- Security: ${config.secure ? 'SSL/TLS' : 'STARTTLS'}
- Test Time: ${new Date().toLocaleString()}

✅ Success! Your SMTP configuration is working correctly and ready for production use.
        `
      });

      return {
        success: true,
        message: `Test email sent successfully to ${testEmail}`,
        messageId: testResult.messageId,
        response: testResult.response
      };
    } catch (error) {
      console.error('SMTP Test Error:', error);
      
      let errorMessage = 'Unknown SMTP error';
      
      if (error.code === 'EAUTH') {
        errorMessage = 'Authentication failed - check username/password';
      } else if (error.code === 'ECONNECTION') {
        errorMessage = 'Connection failed - check host/port settings';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout - check firewall/network settings';
      } else if (error.responseCode >= 500) {
        errorMessage = 'SMTP server error - try again later';
      } else if (error.responseCode >= 400) {
        errorMessage = 'Client error - check configuration settings';
      } else {
        errorMessage = error.message || 'SMTP configuration test failed';
      }

      throw new Error(errorMessage);
    }
  }

  // Render email template with variables
  renderTemplate(template, variables = {}) {
    try {
      let subject = template.subject;
      let htmlContent = template.htmlContent;
      let textContent = template.textContent;

      // Replace variables in template
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value || '');
        htmlContent = htmlContent.replace(regex, value || '');
        textContent = textContent.replace(regex, value || '');
      }

      return {
        subject,
        htmlContent,
        textContent
      };
    } catch (error) {
      console.error('Template Rendering Error:', error);
      throw new Error('Failed to render email template');
    }
  }

  // Validate template variables
  validateTemplate(template, variables = {}) {
    const errors = [];
    const warnings = [];
    const missingVariables = [];

    // Check for required variables
    if (template.variables && Array.isArray(template.variables)) {
      for (const variable of template.variables) {
        if (variable.required && !variables[variable.name]) {
          missingVariables.push(variable.name);
          errors.push(`Missing required variable: ${variable.name}`);
        }
      }
    }

    // Find variables in template content
    const variablePattern = /\{\{(\w+)\}\}/g;
    const templateVars = new Set();
    
    [template.subject, template.htmlContent, template.textContent].forEach(content => {
      let match;
      while ((match = variablePattern.exec(content)) !== null) {
        templateVars.add(match[1]);
      }
    });

    // Check for unused variables
    for (const varName of Object.keys(variables)) {
      if (!templateVars.has(varName)) {
        warnings.push(`Variable '${varName}' provided but not used in template`);
      }
    }

    // Check for undefined variables in template
    for (const varName of templateVars) {
      if (!variables[varName]) {
        warnings.push(`Variable '${varName}' used in template but not provided`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingVariables,
      templateVariables: Array.from(templateVars),
      providedVariables: Object.keys(variables)
    };
  }

  // Send email using queue processor
  async sendEmailFromQueue(jobData) {
    try {
      const { emailLogId, isRetry = false } = jobData;

      // Get email log
      const emailLog = await EmailLog.findById(emailLogId);

      if (!emailLog) {
        throw new Error('Email log not found');
      }

      if (emailLog.status === 'sent' || emailLog.status === 'delivered') {
        console.log(`Email ${emailLogId} already sent, skipping`);
        return { alreadySent: true };
      }

      // Manually fetch the config since we don't have populate
      const config = await EmailConfig.findById(emailLog.configId);
      if (!config || !config.isActive) {
        throw new Error('Email configuration not available or inactive');
      }

      // Check rate limits
      await this.checkRateLimits(config);

      // Get transporter
      const transporter = await this.getTransporter(config);

      // Prepare email content
      let subject = emailLog.subject;
      let htmlContent = emailLog.htmlContent || emailLog.content?.html;
      let textContent = emailLog.textContent || emailLog.content?.text;

      // If using template, render it
      if (emailLog.templateId) {
        const template = emailLog.templateId;
        const variables = emailLog.variables ? Object.fromEntries(emailLog.variables) : {};
        
        const rendered = this.renderTemplate(template, variables);
        subject = rendered.subject;
        htmlContent = rendered.htmlContent;
        textContent = rendered.textContent;

        // Update template usage
        template.usage.totalSent += 1;
        template.usage.lastUsed = new Date();
        await template.save();
      }

      // Prepare mail options
      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: emailLog.to,
        cc: emailLog.cc,
        bcc: emailLog.bcc,
        subject,
        html: htmlContent,
        text: textContent,
        headers: {
          'X-Email-Log-ID': emailLogId,
          'X-Mediqzy-System': 'true'
        }
      };

      // Add tracking pixels and links
      const trackingPixelUrl = `${process.env.BASE_URL || 'http://localhost:8000'}/api/email/track/open/${emailLogId}`;
      if (htmlContent) {
        const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
        mailOptions.html = htmlContent + trackingPixel;
      }

      // Send email
      console.log(`📧 Sending email ${emailLogId} to ${emailLog.to}`);
      const result = await transporter.sendMail(mailOptions);

      // Update email log with success
      emailLog.status = 'sent';
      emailLog.sentAt = new Date().toISOString();
      emailLog.trackingPixelUrl = trackingPixelUrl;
      emailLog.messageId = result.messageId;
      
      console.log(`✅ Email ${emailLogId} sent successfully to ${emailLog.to}`);
      console.log(`📊 Tracking URL: ${trackingPixelUrl}`);
      console.log(`📧 Message ID: ${result.messageId}`);
      
      await emailLog.save();

      // Store rendered content for future reference
      if (emailLog.templateId) {
        emailLog.content = {
          html: htmlContent,
          text: textContent
        };
      }

      await emailLog.save();

      console.log(`✅ Email ${emailLogId} sent successfully to ${emailLog.to}`);
      
      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };

    } catch (error) {
      console.error(`❌ Failed to send email ${jobData.emailLogId}:`, error);

      // Update email log with error
      try {
        const emailLog = await EmailLog.findById(jobData.emailLogId);
        if (emailLog) {
          emailLog.status = 'failed';
          emailLog.errorMessage = error.message;
          await emailLog.save();
        }
      } catch (saveError) {
        console.error('Failed to update email log with error:', saveError);
      }

      throw error;
    }
  }

  // Check rate limits for a configuration
  async checkRateLimits(config) {
    const now = new Date();
    
    // Check hourly limit
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const sentThisHour = await EmailLog.countDocuments({
      configId: config.id,
      sentAt: { $gte: hourAgo },
      status: { $in: ['sent', 'delivered'] }
    });

    if (sentThisHour >= config.rateLimits.perHour) {
      throw new Error('Hourly rate limit exceeded');
    }

    // Check daily limit
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = await EmailLog.countDocuments({
      configId: config.id,
      sentAt: { $gte: dayStart },
      status: { $in: ['sent', 'delivered'] }
    });

    if (sentToday >= config.rateLimits.perDay) {
      throw new Error('Daily rate limit exceeded');
    }
  }

  // Track email opens
  async trackEmailOpen(emailLogId, req) {
    try {
      const emailLog = await EmailLog.findById(emailLogId);
      if (emailLog && !emailLog.openedAt) {
        emailLog.openedAt = new Date();
        emailLog.metadata = {
          ...emailLog.metadata,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip
        };
        await emailLog.save();
      }
    } catch (error) {
      console.error('Error tracking email open:', error);
    }
  }

  // Track email clicks
  async trackEmailClick(emailLogId, req, url) {
    try {
      const emailLog = await EmailLog.findById(emailLogId);
      if (emailLog && !emailLog.clickedAt) {
        emailLog.clickedAt = new Date();
        emailLog.metadata = {
          ...emailLog.metadata,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
          clickedUrl: url
        };
        await emailLog.save();
      }
    } catch (error) {
      console.error('Error tracking email click:', error);
    }
  }

  // Clear transporter cache
  clearTransporterCache(configId = null) {
    if (configId) {
      this.transporters.delete(configId.toString());
    } else {
      this.transporters.clear();
    }
  }

  // Get delivery status from webhook (for services like SendGrid, Mailgun)
  async handleDeliveryWebhook(data) {
    try {
      // Extract email log ID from headers or metadata
      const emailLogId = data.emailLogId || data.headers?.['X-Email-Log-ID'];
      
      if (!emailLogId) {
        throw new Error('Email log ID not found in webhook data');
      }

      const emailLog = await EmailLog.findById(emailLogId);
      if (!emailLog) {
        throw new Error('Email log not found');
      }

      // Update status based on webhook event
      switch (data.event) {
        case 'delivered':
          emailLog.status = 'delivered';
          emailLog.deliveredAt = new Date(data.timestamp || Date.now());
          break;
        case 'bounced':
          emailLog.status = 'bounced';
          emailLog.bouncedAt = new Date(data.timestamp || Date.now());
          emailLog.errorMessage = data.reason || 'Email bounced';
          break;
        case 'failed':
          emailLog.status = 'failed';
          emailLog.errorMessage = data.reason || 'Email failed';
          break;
        case 'opened':
          if (!emailLog.openedAt) {
            emailLog.openedAt = new Date(data.timestamp || Date.now());
          }
          break;
        case 'clicked':
          if (!emailLog.clickedAt) {
            emailLog.clickedAt = new Date(data.timestamp || Date.now());
            emailLog.metadata = {
              ...emailLog.metadata,
              clickedUrl: data.url
            };
          }
          break;
      }

      await emailLog.save();
      return { success: true };
    } catch (error) {
      console.error('Error handling delivery webhook:', error);
      throw error;
    }
  }

  // Email tracking methods
  async trackEmailOpen(emailLogId, req) {
    try {
      const emailLog = await EmailLog.findById(emailLogId);
      if (emailLog && !emailLog.openedAt) {
        emailLog.openedAt = new Date().toISOString();
        emailLog.status = emailLog.status === 'sent' ? 'opened' : emailLog.status;
        await emailLog.save();
        
        console.log(`📖 Email opened: ${emailLog.to} - ${emailLog.subject}`);
        console.log(`🕐 Opened at: ${emailLog.openedAt}`);
        
        return emailLog;
      }
    } catch (error) {
      console.error('Error tracking email open:', error);
    }
  }

  async trackEmailClick(emailLogId, req, url) {
    try {
      const emailLog = await EmailLog.findById(emailLogId);
      if (emailLog && !emailLog.clickedAt) {
        emailLog.clickedAt = new Date().toISOString();
        emailLog.status = 'clicked';
        await emailLog.save();
        
        console.log(`🖱️ Email clicked: ${emailLog.to} - ${emailLog.subject}`);
        console.log(`🔗 Clicked URL: ${url}`);
        console.log(`🕐 Clicked at: ${emailLog.clickedAt}`);
        
        return emailLog;
      }
    } catch (error) {
      console.error('Error tracking email click:', error);
    }
  }

  // Send outbound email from team member
  async sendOutboundEmail(emailConfigId, emailData) {
    try {
      const { to, cc, bcc, subject, htmlContent, textContent } = emailData;

      if (!to || !subject) {
        throw new Error('Recipient email and subject are required');
      }

      const config = await EmailConfig.findOne({ where: { id: emailConfigId } });
      
      if (!config || !config.isActive) {
        throw new Error('Email configuration not found or inactive');
      }

      const transporter = await this.getTransporter(config);

      const mailOptions = {
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        html: htmlContent || textContent,
        text: textContent || undefined,
        headers: {
          'X-Mediqzy-System': 'true',
          'X-Sender-Type': 'team-member'
        }
      };

      console.log(`📧 Sending outbound email to ${to}`);
      const result = await transporter.sendMail(mailOptions);

      // Log sent email
      const emailLog = await EmailLog.create({
        to,
        cc: cc || null,
        bcc: bcc || null,
        subject,
        htmlContent: htmlContent || null,
        textContent: textContent || null,
        status: 'sent',
        sentAt: new Date(),
        messageId: result.messageId,
        configId: emailConfigId
      });

      console.log(`✅ Email sent successfully to ${to}`);
      console.log(`📧 Message ID: ${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
        emailLogId: emailLog.id
      };
    } catch (error) {
      console.error('Error sending outbound email:', error);
      throw error;
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

export default emailService;