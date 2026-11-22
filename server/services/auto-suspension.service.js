/**
 * Auto-Suspension Scheduler Service
 * 
 * Phase 2: Automated tenant suspension for non-payment
 * - Grace period monitoring
 * - Automatic suspension after grace period
 * - Notification before suspension
 * - Reactivation workflow
 * 
 * @module services/auto-suspension.service
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import saasBillingService from './saas-billing.service.js';
import nodemailer from '../integrations/nodemailer.js';
import cron from 'node-cron';
import { tick, tickError, beginJob } from '../utils/cronRegistry.js';

// Configuration
const CONFIG = {
  GRACE_PERIOD_DAYS: 15,
  SUSPENSION_WARNING_DAYS: [7, 3, 1], // Days before suspension to send warnings
  CHECK_INTERVAL: '0 6 * * *', // Run daily at 6 AM
  ENABLE_AUTO_SUSPENSION: true
};

// Email transporter (lazy initialization)
let emailTransporter = null;

async function getEmailTransporter() {
  if (!emailTransporter) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.zoho.in',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: {
        user: process.env.SMTP_USER || process.env.ZOHO_EMAIL,
        pass: process.env.SMTP_PASS || process.env.ZOHO_PASSWORD
      }
    });
  }
  return emailTransporter;
}

class AutoSuspensionService {
  constructor() {
    this.isRunning = false;
    this.lastRunAt = null;
    this.cronJob = null;
  }

  /**
   * Initialize the auto-suspension scheduler
   */
  initialize() {
    if (this.cronJob) {
      console.log('[AutoSuspension] Scheduler already initialized');
      return;
    }

    this.cronJob = cron.schedule(CONFIG.CHECK_INTERVAL, async () => {
      if (!(await beginJob('auto_suspension'))) return;
      console.log('[AutoSuspension] Running scheduled check...');
      await this.runSuspensionCheck();
    });

    console.log('[AutoSuspension] Scheduler initialized, running at:', CONFIG.CHECK_INTERVAL);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[AutoSuspension] Scheduler stopped');
    }
  }

  /**
   * Main suspension check workflow
   */
  async runSuspensionCheck() {
    if (this.isRunning) {
      console.log('[AutoSuspension] Check already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    this.lastRunAt = new Date();

    try {
      console.log('[AutoSuspension] Starting suspension check at', this.lastRunAt.toISOString());

      // 1. Check for overdue invoices and set grace periods
      await this.checkOverdueInvoices();

      // 2. Send warning emails for upcoming suspensions
      await this.sendSuspensionWarnings();

      // 3. Suspend tenants past grace period
      if (CONFIG.ENABLE_AUTO_SUSPENSION) {
        await this.executeSuspensions();
      }

      // 4. Check for reactivation eligibility
      await this.checkReactivationEligibility();

      console.log('[AutoSuspension] Check completed successfully');
      tick('auto_suspension');

    } catch (error) {
      console.error('[AutoSuspension] Check failed:', error);
      tickError('auto_suspension', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check for newly overdue invoices and set grace period
   */
  async checkOverdueInvoices() {
    try {
      // Find invoices that just became overdue (past due date, not paid)
      const [overdueInvoices] = await sequelize.query(`
        SELECT 
          i.id as invoice_id,
          i.invoice_number,
          i.tenant_id,
          i.total_amount,
          i.due_date,
          t.name as tenant_name,
          t.billing_email,
          t.email,
          t.grace_period_end
        FROM saas_invoices i
        JOIN tenants t ON i.tenant_id = t.id
        WHERE i.status = 'pending'
          AND i.due_date < NOW()
          AND t.status = 'active'
          AND t.grace_period_end IS NULL
      `);

      console.log(`[AutoSuspension] Found ${overdueInvoices.length} newly overdue invoices`);

      for (const invoice of overdueInvoices) {
        // Set grace period end date
        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + CONFIG.GRACE_PERIOD_DAYS);

        // Update tenant with grace period
        await sequelize.query(`
          UPDATE tenants 
          SET grace_period_end = $1, updated_at = NOW()
          WHERE id = $2
        `, { bind: [gracePeriodEnd, invoice.tenant_id] });

        // Update invoice status to overdue
        await sequelize.query(`
          UPDATE saas_invoices 
          SET status = 'overdue', updated_at = NOW()
          WHERE id = $1
        `, { bind: [invoice.invoice_id] });

        // Send grace period notification
        await this.sendGracePeriodStartEmail(invoice, gracePeriodEnd);

        // Log the action
        await this.logSuspensionAction(invoice.tenant_id, 'grace_period_started', 
          `Grace period started for invoice ${invoice.invoice_number}`, invoice.invoice_id);

        console.log(`[AutoSuspension] Grace period set for tenant ${invoice.tenant_name} until ${gracePeriodEnd.toISOString()}`);
      }

    } catch (error) {
      console.error('[AutoSuspension] Error checking overdue invoices:', error);
    }
  }

  /**
   * Send warning emails to tenants approaching suspension
   */
  async sendSuspensionWarnings() {
    try {
      for (const daysBeforeSuspension of CONFIG.SUSPENSION_WARNING_DAYS) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysBeforeSuspension);
        
        // Find tenants whose grace period ends on target date
        const [tenantsToWarn] = await sequelize.query(`
          SELECT 
            t.id,
            t.name,
            t.billing_email,
            t.email,
            t.grace_period_end,
            i.invoice_number,
            i.total_amount
          FROM tenants t
          JOIN saas_invoices i ON i.tenant_id = t.id AND i.status = 'overdue'
          WHERE t.status = 'active'
            AND t.grace_period_end IS NOT NULL
            AND DATE(t.grace_period_end) = DATE($1)
        `, { bind: [targetDate] });

        for (const tenant of tenantsToWarn) {
          await this.sendSuspensionWarningEmail(tenant, daysBeforeSuspension);
          console.log(`[AutoSuspension] Sent ${daysBeforeSuspension}-day warning to ${tenant.name}`);
        }
      }

    } catch (error) {
      console.error('[AutoSuspension] Error sending suspension warnings:', error);
    }
  }

  /**
   * Execute suspensions for tenants past grace period
   */
  async executeSuspensions() {
    try {
      // Find tenants past grace period
      const [tenantsToSuspend] = await sequelize.query(`
        SELECT 
          t.id,
          t.name,
          t.billing_email,
          t.email,
          t.grace_period_end,
          i.invoice_number,
          i.total_amount,
          i.id as invoice_id
        FROM tenants t
        JOIN saas_invoices i ON i.tenant_id = t.id AND i.status = 'overdue'
        WHERE t.status = 'active'
          AND t.grace_period_end IS NOT NULL
          AND t.grace_period_end < NOW()
      `);

      console.log(`[AutoSuspension] Found ${tenantsToSuspend.length} tenants to suspend`);

      for (const tenant of tenantsToSuspend) {
        // Suspend the tenant
        await sequelize.query(`
          UPDATE tenants 
          SET status = 'suspended', 
              suspended_at = NOW(),
              suspension_reason = 'Non-payment: Invoice ${tenant.invoice_number} overdue',
              updated_at = NOW()
          WHERE id = $1
        `, { bind: [tenant.id] });

        // Send suspension notification
        await this.sendSuspensionEmail(tenant);

        // Log the action
        await this.logSuspensionAction(tenant.id, 'suspended', 
          `Suspended for non-payment of invoice ${tenant.invoice_number}`, tenant.invoice_id);

        console.log(`[AutoSuspension] Suspended tenant ${tenant.name}`);
      }

    } catch (error) {
      console.error('[AutoSuspension] Error executing suspensions:', error);
    }
  }

  /**
   * Check for suspended tenants eligible for reactivation
   */
  async checkReactivationEligibility() {
    try {
      // Find suspended tenants who have paid their overdue invoices
      const [eligibleForReactivation] = await sequelize.query(`
        SELECT DISTINCT t.id, t.name, t.billing_email, t.email
        FROM tenants t
        WHERE t.status = 'suspended'
          AND NOT EXISTS (
            SELECT 1 FROM saas_invoices i 
            WHERE i.tenant_id = t.id 
            AND i.status IN ('pending', 'overdue')
          )
      `);

      for (const tenant of eligibleForReactivation) {
        console.log(`[AutoSuspension] Tenant ${tenant.name} eligible for reactivation (all invoices paid)`);
        
        // Optionally auto-reactivate or send notification
        await this.sendReactivationEligibleEmail(tenant);
      }

    } catch (error) {
      console.error('[AutoSuspension] Error checking reactivation eligibility:', error);
    }
  }

  /**
   * Manually reactivate a suspended tenant
   */
  async reactivateTenant(tenantId, performedBy) {
    try {
      // Check for outstanding invoices
      const [outstanding] = await sequelize.query(`
        SELECT COUNT(*) as count FROM saas_invoices 
        WHERE tenant_id = $1 AND status IN ('pending', 'overdue')
      `, { bind: [tenantId] });

      if (parseInt(outstanding[0].count) > 0) {
        return {
          success: false,
          error: 'Cannot reactivate: Outstanding invoices exist'
        };
      }

      // Reactivate tenant
      await sequelize.query(`
        UPDATE tenants 
        SET status = 'active',
            suspended_at = NULL,
            suspension_reason = NULL,
            grace_period_end = NULL,
            updated_at = NOW()
        WHERE id = $1
      `, { bind: [tenantId] });

      // Log the action
      await this.logSuspensionAction(tenantId, 'reactivated', 
        `Reactivated by ${performedBy}`, null, performedBy);

      return { success: true };

    } catch (error) {
      console.error('[AutoSuspension] Reactivation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log suspension-related actions
   */
  async logSuspensionAction(tenantId, action, notes, invoiceId = null, performedBy = 'system') {
    try {
      await sequelize.query(`
        INSERT INTO tenant_suspension_history 
        (tenant_id, action, reason, notes, invoice_id, performed_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, { bind: [tenantId, action, action, notes, invoiceId, performedBy] });
    } catch (error) {
      console.error('[AutoSuspension] Failed to log action:', error);
    }
  }

  /**
   * Email: Grace period started
   */
  async sendGracePeriodStartEmail(invoice, gracePeriodEnd) {
    const toEmail = invoice.billing_email || invoice.email;
    if (!toEmail) return;

    const subject = `⚠️ Payment Overdue - Grace Period Started | My SmartHealth`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FF9800; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .warning-box { background: #FFF3E0; border-left: 4px solid #FF9800; padding: 15px; margin: 20px 0; }
          .amount { font-size: 28px; font-weight: bold; color: #E65100; }
          .deadline { background: #FFECB3; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
          .btn { display: inline-block; background: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Payment Overdue</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${invoice.tenant_name}</strong>,</p>
            
            <div class="warning-box">
              <p>Your invoice <strong>${invoice.invoice_number}</strong> is now overdue.</p>
              <p class="amount">Amount Due: ₹${invoice.total_amount.toLocaleString('en-IN')}</p>
            </div>
            
            <div class="deadline">
              <p><strong>Grace Period Ends:</strong></p>
              <p style="font-size: 20px; color: #E65100;">${gracePeriodEnd.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <p>To avoid service interruption, please make payment before the grace period ends.</p>
            
            <p><strong>What happens if payment is not received?</strong></p>
            <ul>
              <li>Your account will be suspended</li>
              <li>Staff will lose access to the system</li>
              <li>Patients cannot book appointments</li>
              <li>Data will be preserved for 30 days</li>
            </ul>
            
            <center>
              <a href="https://app.mediqzy.com/billing/pay/${invoice.invoice_number}" class="btn">Pay Now</a>
            </center>
            
            <p style="margin-top: 20px;">If you've already made the payment, please contact our support team with the payment details.</p>
          </div>
          <div class="footer">
            <p>My SmartHealth</p>
            <p>care@mysmarthealth.in</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const transporter = await getEmailTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_USER || process.env.ZOHO_EMAIL,
        to: toEmail,
        subject,
        html
      });
    } catch (error) {
      console.error('[AutoSuspension] Failed to send grace period email:', error);
    }
  }

  /**
   * Email: Suspension warning
   */
  async sendSuspensionWarningEmail(tenant, daysRemaining) {
    const toEmail = tenant.billing_email || tenant.email;
    if (!toEmail) return;

    const urgencyColor = daysRemaining === 1 ? '#D32F2F' : daysRemaining === 3 ? '#F57C00' : '#FF9800';
    const subject = `🚨 ${daysRemaining} Day${daysRemaining > 1 ? 's' : ''} Until Account Suspension | My SmartHealth`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${urgencyColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .countdown { font-size: 48px; font-weight: bold; color: ${urgencyColor}; text-align: center; margin: 20px 0; }
          .amount { font-size: 24px; font-weight: bold; color: #E65100; text-align: center; }
          .btn { display: inline-block; background: ${urgencyColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 18px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Urgent: Account Suspension Warning</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${tenant.name}</strong>,</p>
            
            <div class="countdown">
              ${daysRemaining} Day${daysRemaining > 1 ? 's' : ''} Remaining
            </div>
            
            <p class="amount">Outstanding: ₹${tenant.total_amount.toLocaleString('en-IN')}</p>
            
            <p style="text-align: center; margin: 30px 0;">
              Your account will be <strong>suspended on ${new Date(tenant.grace_period_end).toLocaleDateString('en-IN')}</strong> if payment is not received.
            </p>
            
            <center>
              <a href="https://app.mediqzy.com/billing/pay/${tenant.invoice_number}" class="btn">Pay Now to Avoid Suspension</a>
            </center>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Need help? Contact us at care@mysmarthealth.in or call our billing team.
            </p>
          </div>
          <div class="footer">
            <p>My SmartHealth</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const transporter = await getEmailTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_USER || process.env.ZOHO_EMAIL,
        to: toEmail,
        subject,
        html
      });
    } catch (error) {
      console.error('[AutoSuspension] Failed to send warning email:', error);
    }
  }

  /**
   * Email: Account suspended
   */
  async sendSuspensionEmail(tenant) {
    const toEmail = tenant.billing_email || tenant.email;
    if (!toEmail) return;

    const subject = `🔴 Account Suspended | My SmartHealth`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #D32F2F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .suspended-box { background: #FFEBEE; border: 2px solid #D32F2F; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
          .amount { font-size: 24px; font-weight: bold; color: #D32F2F; }
          .btn { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 18px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔴 Account Suspended</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${tenant.name}</strong>,</p>
            
            <div class="suspended-box">
              <h2 style="margin: 0; color: #D32F2F;">Your Account Has Been Suspended</h2>
              <p>Due to non-payment of invoice ${tenant.invoice_number}</p>
              <p class="amount">Amount Due: ₹${tenant.total_amount.toLocaleString('en-IN')}</p>
            </div>
            
            <p><strong>What this means:</strong></p>
            <ul>
              <li>❌ All staff accounts are now locked</li>
              <li>❌ Patients cannot access your portal</li>
              <li>❌ New appointments cannot be booked</li>
              <li>✅ Your data is safely preserved</li>
            </ul>
            
            <p><strong>To reactivate your account:</strong></p>
            <ol>
              <li>Pay the outstanding amount</li>
              <li>Contact our support team with payment confirmation</li>
              <li>Your account will be reactivated within 24 hours</li>
            </ol>
            
            <center style="margin: 30px 0;">
              <a href="https://app.mediqzy.com/billing/pay/${tenant.invoice_number}" class="btn">Pay & Reactivate</a>
            </center>
            
            <p style="font-size: 12px; color: #666;">
              Note: Data will be retained for 30 days. After this period, inactive accounts may be archived.
            </p>
          </div>
          <div class="footer">
            <p>My SmartHealth</p>
            <p>Billing Support: care@mysmarthealth.in</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const transporter = await getEmailTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_USER || process.env.ZOHO_EMAIL,
        to: toEmail,
        subject,
        html
      });
    } catch (error) {
      console.error('[AutoSuspension] Failed to send suspension email:', error);
    }
  }

  /**
   * Email: Eligible for reactivation
   */
  async sendReactivationEligibleEmail(tenant) {
    const toEmail = tenant.billing_email || tenant.email;
    if (!toEmail) return;

    const subject = `✅ Payment Received - Account Ready for Reactivation | My SmartHealth`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; border-top: none; }
          .success-box { background: #E8F5E9; border: 2px solid #4CAF50; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
          .btn { display: inline-block; background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Payment Confirmed</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${tenant.name}</strong>,</p>
            
            <div class="success-box">
              <h2 style="margin: 0; color: #4CAF50;">All Invoices Paid</h2>
              <p>Your account is ready for reactivation!</p>
            </div>
            
            <p>We've confirmed that all outstanding invoices have been paid. Your account can now be reactivated.</p>
            
            <p>Our team will reactivate your account within <strong>24 hours</strong>. If you need immediate reactivation, please contact support.</p>
            
            <center>
              <a href="mailto:care@mysmarthealth.in?subject=Reactivation Request - ${tenant.name}" class="btn">Request Immediate Reactivation</a>
            </center>
            
            <p style="margin-top: 20px;">Thank you for your continued trust in My SmartHealth.</p>
          </div>
          <div class="footer">
            <p>My SmartHealth</p>
            <p>care@mysmarthealth.in</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const transporter = await getEmailTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_USER || process.env.ZOHO_EMAIL,
        to: toEmail,
        subject,
        html
      });
    } catch (error) {
      console.error('[AutoSuspension] Failed to send reactivation email:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      schedulerActive: !!this.cronJob,
      config: CONFIG
    };
  }
}

// Export singleton instance
const autoSuspensionService = new AutoSuspensionService();
export default autoSuspensionService;
