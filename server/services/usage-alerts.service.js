/**
 * Usage Alerts Service for SaaS HIS Platform
 * 
 * Sends email notifications when tenants approach or exceed usage limits:
 * - 80% Warning: Heads up, you're approaching your limit
 * - 95% Critical: Upgrade now or face restrictions
 * - 100% Exceeded: Overage charges will apply
 * 
 * @module services/usage-alerts.service
 */

import { usageMeteringEvents } from './usage-metering.service.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';

// Try to import email service
let emailService = null;
try {
  const module = await import('./email.service.js');
  emailService = module.default || module;
} catch (e) {
  console.log('[UsageAlerts] Email service not available, alerts will be logged only');
}

// Alert email templates
const ALERT_TEMPLATES = {
  warning: {
    subject: '⚠️ Usage Alert: {{usageTypeName}} at {{percentUsed}}% - {{tenantName}}',
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f0ad4e, #ec971f); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .usage-bar { background: #e0e0e0; border-radius: 10px; height: 24px; margin: 20px 0; overflow: hidden; }
    .usage-fill { background: linear-gradient(90deg, #f0ad4e, #ec971f); height: 100%; transition: width 0.3s; }
    .stats { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .btn { display: inline-block; padding: 12px 24px; background: #0066cc; color: white !important; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Usage Warning</h1>
      <p>{{usageTypeName}} at {{percentUsed}}%</p>
    </div>
    <div class="content">
      <p>Hello {{tenantName}} Team,</p>
      <p>This is a friendly reminder that your <strong>{{usageTypeName}}</strong> usage is approaching the limit for your current plan.</p>
      
      <div class="usage-bar">
        <div class="usage-fill" style="width: {{percentUsed}}%"></div>
      </div>
      
      <div class="stats">
        <div class="stat-row">
          <span>Current Usage:</span>
          <strong>{{currentUsage}} / {{limit}}</strong>
        </div>
        <div class="stat-row">
          <span>Remaining:</span>
          <strong>{{remaining}}</strong>
        </div>
        <div class="stat-row">
          <span>Percentage Used:</span>
          <strong>{{percentUsed}}%</strong>
        </div>
      </div>
      
      <p><strong>What happens next?</strong></p>
      <ul>
        <li>At 95%: You'll receive a critical alert</li>
        <li>At 100%: Overage charges may apply based on your plan</li>
      </ul>
      
      <p>To avoid disruption, consider upgrading your plan or reviewing your usage patterns.</p>
      
      <a href="{{dashboardUrl}}" class="btn">View Usage Dashboard</a>
    </div>
    <div class="footer">
      <p>This is an automated message from My SmartHealth</p>
      <p>© {{year}} My SmartHealth. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `
  },
  
  critical: {
    subject: '🚨 Critical: {{usageTypeName}} at {{percentUsed}}% - Immediate Action Required',
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #d9534f, #c9302c); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #fff5f5; padding: 30px; border: 2px solid #d9534f; }
    .usage-bar { background: #e0e0e0; border-radius: 10px; height: 24px; margin: 20px 0; overflow: hidden; }
    .usage-fill { background: linear-gradient(90deg, #d9534f, #c9302c); height: 100%; }
    .stats { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #d9534f; }
    .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .btn-urgent { display: inline-block; padding: 14px 28px; background: #d9534f; color: white !important; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: bold; }
    .btn-secondary { display: inline-block; padding: 12px 24px; background: #5bc0de; color: white !important; text-decoration: none; border-radius: 6px; margin: 10px 10px 0 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 Critical Usage Alert</h1>
      <p>{{usageTypeName}} at {{percentUsed}}%</p>
    </div>
    <div class="content">
      <p>Dear {{tenantName}} Administrator,</p>
      <p><strong>Your {{usageTypeName}} usage has reached critical levels.</strong> Immediate action is recommended to avoid service disruption.</p>
      
      <div class="usage-bar">
        <div class="usage-fill" style="width: {{percentUsed}}%"></div>
      </div>
      
      <div class="stats">
        <div class="stat-row">
          <span>Current Usage:</span>
          <strong style="color: #d9534f;">{{currentUsage}} / {{limit}}</strong>
        </div>
        <div class="stat-row">
          <span>Remaining:</span>
          <strong style="color: #d9534f;">{{remaining}}</strong>
        </div>
        <div class="stat-row">
          <span>Percentage Used:</span>
          <strong style="color: #d9534f;">{{percentUsed}}%</strong>
        </div>
      </div>
      
      <p><strong>⚠️ What happens when you exceed the limit?</strong></p>
      <ul>
        <li><strong>Basic Plan:</strong> New registrations will be temporarily blocked</li>
        <li><strong>Professional Plan:</strong> Overage charges at ₹{{overageRate}} per additional unit</li>
        <li><strong>Enterprise Plan:</strong> No hard limits, but overage billing applies</li>
      </ul>
      
      <a href="{{upgradeUrl}}" class="btn-urgent">🚀 Upgrade Plan Now</a>
      <a href="{{dashboardUrl}}" class="btn-secondary">View Dashboard</a>
    </div>
    <div class="footer">
      <p>Need help? Contact care@mysmarthealth.in</p>
      <p>© {{year}} My SmartHealth. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `
  },
  
  exceeded: {
    subject: '🔴 LIMIT EXCEEDED: {{usageTypeName}} - Overage Charges Active',
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #292b2c, #1a1a1a); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 30px; border: 2px solid #292b2c; }
    .alert-box { background: #d9534f; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .stats { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; }
    .overage-box { background: #fcf8e3; border: 1px solid #faebcc; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .btn { display: inline-block; padding: 12px 24px; background: #0066cc; color: white !important; text-decoration: none; border-radius: 6px; margin: 10px 10px 0 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔴 Usage Limit Exceeded</h1>
      <p>{{usageTypeName}} - Overage Mode Active</p>
    </div>
    <div class="content">
      <div class="alert-box">
        <h2 style="margin: 0;">{{percentUsed}}% of Limit Used</h2>
        <p style="margin: 5px 0 0;">You have exceeded your {{usageTypeName}} allocation</p>
      </div>
      
      <p>Dear {{tenantName}} Administrator,</p>
      <p>Your organization has exceeded the allocated {{usageTypeName}} limit. Based on your plan, the following applies:</p>
      
      <div class="stats">
        <div class="stat-row">
          <span>Plan Limit:</span>
          <strong>{{limit}}</strong>
        </div>
        <div class="stat-row">
          <span>Current Usage:</span>
          <strong style="color: #d9534f;">{{currentUsage}}</strong>
        </div>
        <div class="stat-row">
          <span>Overage:</span>
          <strong style="color: #d9534f;">+{{overage}} units</strong>
        </div>
      </div>
      
      <div class="overage-box">
        <h3 style="margin-top: 0;">💰 Overage Charges</h3>
        <p><strong>Rate:</strong> ₹{{overageRate}} per additional unit</p>
        <p><strong>Current Overage Bill:</strong> ₹{{overageCharge}}</p>
        <p style="font-size: 12px; color: #666;">Overage charges will be added to your next invoice</p>
      </div>
      
      <p><strong>Recommendations:</strong></p>
      <ul>
        <li>Upgrade to a higher plan to increase limits</li>
        <li>Review usage patterns to optimize</li>
        <li>Contact our team for a custom enterprise plan</li>
      </ul>
      
      <a href="{{upgradeUrl}}" class="btn">🚀 Upgrade Plan</a>
      <a href="{{dashboardUrl}}" class="btn" style="background: #5cb85c;">View Usage Report</a>
    </div>
    <div class="footer">
      <p>Questions about billing? Contact care@mysmarthealth.in</p>
      <p>© {{year}} My SmartHealth. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `
  }
};

// Overage rates for each usage type
const OVERAGE_RATES = {
  opd_patients: 3,
  ipd_admissions: 50,
  storage_gb: 100,
  voice_minutes: 0.5,
  users: 500,
  doctors: 1000
};

/**
 * Usage Alerts Service class
 */
class UsageAlertsService {
  constructor() {
    this.initialized = false;
    this.alertHistory = new Map(); // Track alerts to prevent spam
    this.alertCooldownMs = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Initialize service and set up event listeners
   */
  initialize() {
    if (this.initialized) return;

    // Listen for usage alert events
    usageMeteringEvents.on('usage:alert', async (alertData) => {
      try {
        await this.sendAlert(alertData);
      } catch (error) {
        console.error('[UsageAlerts] Failed to send alert:', error);
      }
    });

    this.initialized = true;
    console.log('[UsageAlerts] Service initialized');
  }

  /**
   * Send usage alert email
   * @param {object} alertData - Alert data from metering service
   */
  async sendAlert(alertData) {
    const {
      tenantId,
      tenantName,
      tenantEmail,
      usageType,
      usageTypeName,
      currentUsage,
      limit,
      percentUsed,
      alertLevel
    } = alertData;

    // Check cooldown
    const alertKey = `${tenantId}-${usageType}-${alertLevel}`;
    const lastAlert = this.alertHistory.get(alertKey);
    if (lastAlert && Date.now() - lastAlert < this.alertCooldownMs) {
      console.log(`[UsageAlerts] Skipping (cooldown): ${alertKey}`);
      return;
    }

    // Get template
    const template = ALERT_TEMPLATES[alertLevel];
    if (!template) {
      console.error(`[UsageAlerts] Unknown alert level: ${alertLevel}`);
      return;
    }

    // Calculate values for template
    const overage = Math.max(0, currentUsage - limit);
    const overageRate = OVERAGE_RATES[usageType] || 0;
    const overageCharge = overage * overageRate;
    const remaining = Math.max(0, limit - currentUsage);

    // Prepare template variables
    const variables = {
      tenantName,
      usageTypeName,
      usageType,
      currentUsage: currentUsage.toLocaleString(),
      limit: limit.toLocaleString(),
      percentUsed,
      remaining: remaining.toLocaleString(),
      overage: overage.toLocaleString(),
      overageRate: overageRate.toLocaleString(),
      overageCharge: overageCharge.toLocaleString(),
      dashboardUrl: `https://app.mediqzy.com/admin/usage?tenant=${tenantId}`,
      upgradeUrl: `https://app.mediqzy.com/admin/billing/upgrade?tenant=${tenantId}`,
      year: new Date().getFullYear()
    };

    // Replace template variables
    let subject = template.subject;
    let html = template.html;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      html = html.replace(regex, value);
    }

    // Determine recipients
    const recipients = [tenantEmail];
    
    // Add super admin for critical/exceeded
    if (alertLevel === 'critical' || alertLevel === 'exceeded') {
      recipients.push('info@mysmarthealth.in');
    }

    // Send email
    try {
      if (emailService && typeof emailService.sendEmail === 'function') {
        await emailService.sendEmail({
          to: recipients.join(', '),
          subject,
          html
        });
        console.log(`[UsageAlerts] Email sent: ${alertLevel} to ${recipients.join(', ')}`);
      } else {
        // Fallback: Log the alert
        console.log(`[UsageAlerts] Would send email to ${recipients.join(', ')}`);
        console.log(`[UsageAlerts] Subject: ${subject}`);
      }

      // Record alert time
      this.alertHistory.set(alertKey, Date.now());

      // Log to database
      await this.logAlert(alertData);
    } catch (error) {
      console.error('[UsageAlerts] Failed to send email:', error);
    }
  }

  /**
   * Log alert to database for audit trail
   * @param {object} alertData - Alert data
   */
  async logAlert(alertData) {
    try {
      const [result] = await sequelize.query(`
        INSERT INTO usage_alerts (
          tenant_id, 
          alert_type, 
          usage_type, 
          current_usage, 
          "limit", 
          percent_used, 
          alert_level,
          sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `, {
        bind: [
          alertData.tenantId,
          'usage_threshold',
          alertData.usageType,
          alertData.currentUsage,
          alertData.limit,
          alertData.percentUsed,
          alertData.alertLevel
        ]
      });
      
      return result?.[0]?.id;
    } catch (error) {
      // Table might not exist yet, just log
      console.log('[UsageAlerts] Could not log alert to DB:', error.message);
    }
  }

  /**
   * Get alert history for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} days - Number of days to look back
   */
  async getAlertHistory(tenantId, days = 30) {
    try {
      const [alerts] = await sequelize.query(`
        SELECT * FROM usage_alerts 
        WHERE tenant_id = $1 
          AND sent_at > NOW() - INTERVAL '${days} days'
        ORDER BY sent_at DESC
        LIMIT 100
      `, { bind: [tenantId] });
      
      return alerts;
    } catch (error) {
      console.log('[UsageAlerts] Could not fetch alert history:', error.message);
      return [];
    }
  }

  /**
   * Send a custom alert
   * @param {object} options - Alert options
   */
  async sendCustomAlert(options) {
    const {
      tenantId,
      tenantEmail,
      tenantName,
      subject,
      message,
      alertType = 'custom'
    } = options;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066cc;">My SmartHealth Alert</h2>
        <p>Dear ${tenantName},</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          ${message}
        </div>
        <p>If you have questions, please contact care@mysmarthealth.in</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">© ${new Date().getFullYear()} My SmartHealth</p>
      </div>
    `;

    if (emailService && typeof emailService.sendEmail === 'function') {
      await emailService.sendEmail({
        to: tenantEmail,
        subject,
        html
      });
    }

    // Log alert
    await this.logAlert({
      tenantId,
      usageType: alertType,
      alertLevel: 'custom',
      currentUsage: 0,
      limit: 0,
      percentUsed: 0
    });
  }
}

// Create and export singleton
const usageAlertsService = new UsageAlertsService();

// Initialize on import
usageAlertsService.initialize();

export default usageAlertsService;
export { UsageAlertsService, ALERT_TEMPLATES };
