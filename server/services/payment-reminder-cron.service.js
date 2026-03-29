import cron from 'node-cron';
import { Invoice, Payment } from '../models/billing.model.intelligent.js';
import notificationService from './notification.service.js';
import { Op } from 'sequelize';
import { tick, tickError } from '../utils/cronRegistry.js';
import n8nService from './n8n.service.js';

/**
 * Payment Reminder Automation Service
 * 
 * Automatically sends payment reminders and manages overdue invoices:
 * - On invoice creation: Immediate notification
 * - 3 days before due: First reminder
 * - 1 day before due: Second reminder
 * - On due date: Final reminder
 * - 3 days overdue: Escalation warning
 * - 7 days overdue: Service restriction warning
 */

class PaymentReminderService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start payment reminder cron job
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Payment reminder service already running');
      return;
    }

    this.isRunning = true;

    // Run daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      await this.checkAndSendPaymentReminders();
    });

    console.log('✅ Payment reminder automation started (daily at 9:00 AM)');
  }

  /**
   * Check invoices and send appropriate reminders
   */
  async checkAndSendPaymentReminders() {
    console.log('💰 Checking payment reminders...');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const threeDaysFromNow = new Date(today);
      threeDaysFromNow.setDate(today.getDate() + 3);

      const oneDayFromNow = new Date(today);
      oneDayFromNow.setDate(today.getDate() + 1);

      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);

      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);

      // Get all unpaid/partially paid invoices
      const pendingInvoices = await Invoice.findAll({
        where: {
          status: {
            [Op.in]: ['sent', 'pending', 'overdue', 'partially_paid']
          },
          dueDate: {
            [Op.gte]: sevenDaysAgo.toISOString().split('T')[0]
          }
        }
      });

      let remindersSent = {
        immediate: 0,
        threeDaysBefore: 0,
        oneDayBefore: 0,
        dueDate: 0,
        threeDaysOverdue: 0,
        sevenDaysOverdue: 0
      };

      for (const invoice of pendingInvoices) {
        try {
          const dueDate = new Date(invoice.dueDate);
          dueDate.setHours(0, 0, 0, 0);

          const daysDifference = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));

          // 3 days before due date
          if (daysDifference === 3 && !invoice.reminder3DaysSent) {
            await this.sendPreDueReminder(invoice, '3 days');
            await invoice.update({ reminder3DaysSent: true });
            remindersSent.threeDaysBefore++;
          }

          // 1 day before due date
          if (daysDifference === 1 && !invoice.reminder1DaySent) {
            await this.sendPreDueReminder(invoice, '1 day');
            await invoice.update({ reminder1DaySent: true });
            remindersSent.oneDayBefore++;
          }

          // Due date
          if (daysDifference === 0 && !invoice.reminderDueDateSent) {
            await this.sendDueDateReminder(invoice);
            await invoice.update({ 
              reminderDueDateSent: true,
              status: 'overdue'
            });
            remindersSent.dueDate++;
          }

          // 3 days overdue
          if (daysDifference === -3 && !invoice.reminder3DaysOverdueSent) {
            await this.sendOverdueReminder(invoice, 3);
            await invoice.update({ 
              reminder3DaysOverdueSent: true,
              status: 'overdue'
            });
            remindersSent.threeDaysOverdue++;
          }

          // 7 days overdue (final warning)
          if (daysDifference === -7 && !invoice.reminder7DaysOverdueSent) {
            await this.sendFinalOverdueWarning(invoice);
            await invoice.update({ 
              reminder7DaysOverdueSent: true,
              status: 'overdue'
            });
            remindersSent.sevenDaysOverdue++;
          }

        } catch (error) {
          console.error(`Error processing invoice ${invoice.invoiceNumber}:`, error.message);
        }
      }

      const total = Object.values(remindersSent).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log('✅ Payment reminders sent:', remindersSent);
      } else {
        console.log('ℹ️  No payment reminders to send today');
      }
      tick('payment_reminders', remindersSent);

    } catch (error) {
      tickError('payment_reminders', error.message);
      console.error('❌ Error in payment reminder check:', error);
    }
  }

  /**
   * Send immediate notification when invoice is created
   */
  async sendInvoiceCreatedNotification(invoice) {
    console.log(`📧 Sending invoice created notification: ${invoice.invoiceNumber}`);

    const dueDate = this.formatDate(invoice.dueDate);

    await notificationService.send({
      userId: invoice.userId,
      userType: 'patient',
      type: 'invoice_created',
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        amount: this.formatCurrency(invoice.total),
        dueDate: dueDate,
        patientName: invoice.patientDetails?.name || 'Valued Patient'
      },
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.total
      },
      channels: ['in-app', 'email'],
      actionUrl: `/billing/invoice/${invoice.id}`,
      priority: 'normal'
    });
  }

  /**
   * Send reminder before due date (3 days or 1 day)
   */
  async sendPreDueReminder(invoice, timeframe) {
    console.log(`💳 Sending ${timeframe} reminder for invoice ${invoice.invoiceNumber}`);

    const dueDate = this.formatDate(invoice.dueDate);

    n8nService.trigger('payment-reminder', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      patientId: invoice.userId,
      patientName: invoice.patientDetails?.name || 'Patient',
      amount: invoice.total,
      dueDate: invoice.dueDate,
      timeframe,
    }).catch(() => {});

    await notificationService.send({
      userId: invoice.userId,
      userType: 'patient',
      type: 'payment_reminder_pre_due',
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        amount: this.formatCurrency(invoice.total),
        dueDate: dueDate,
        timeframe: timeframe,
        patientName: invoice.patientDetails?.name || 'Valued Patient'
      },
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        daysUntilDue: parseInt(timeframe)
      },
      channels: ['in-app', 'email', 'sms'],
      actionUrl: `/billing/invoice/${invoice.id}`,
      priority: 'high'
    });
  }

  /**
   * Send reminder on due date
   */
  async sendDueDateReminder(invoice) {
    console.log(`⏰ Sending due date reminder for invoice ${invoice.invoiceNumber}`);

    await notificationService.send({
      userId: invoice.userId,
      userType: 'patient',
      type: 'payment_due_today',
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        amount: this.formatCurrency(invoice.total),
        patientName: invoice.patientDetails?.name || 'Valued Patient'
      },
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        urgent: true
      },
      channels: ['in-app', 'email', 'sms', 'whatsapp'],
      actionUrl: `/billing/invoice/${invoice.id}`,
      priority: 'critical'
    });
  }

  /**
   * Send overdue reminder (3 days past due)
   */
  async sendOverdueReminder(invoice, daysOverdue) {
    console.log(`🚨 Sending ${daysOverdue} days overdue reminder for ${invoice.invoiceNumber}`);

    const lateFee = this.calculateLateFee(invoice.total, daysOverdue);

    await notificationService.send({
      userId: invoice.userId,
      userType: 'patient',
      type: 'payment_overdue',
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        amount: this.formatCurrency(invoice.total),
        daysOverdue: daysOverdue,
        lateFee: this.formatCurrency(lateFee),
        patientName: invoice.patientDetails?.name || 'Valued Patient'
      },
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        daysOverdue: daysOverdue,
        critical: true
      },
      channels: ['in-app', 'email', 'sms', 'whatsapp'],
      actionUrl: `/billing/invoice/${invoice.id}`,
      priority: 'critical'
    });

    // Also notify admin/doctor
    if (invoice.doctorId) {
      await this.notifyProviderOfOverdue(invoice, daysOverdue);
    }
  }

  /**
   * Send final warning (7 days overdue)
   */
  async sendFinalOverdueWarning(invoice) {
    console.log(`⚠️  Sending final overdue warning for ${invoice.invoiceNumber}`);

    const lateFee = this.calculateLateFee(invoice.total, 7);
    const totalDue = invoice.total + lateFee;

    await notificationService.send({
      userId: invoice.userId,
      userType: 'patient',
      type: 'payment_final_warning',
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        originalAmount: this.formatCurrency(invoice.total),
        lateFee: this.formatCurrency(lateFee),
        totalDue: this.formatCurrency(totalDue),
        patientName: invoice.patientDetails?.name || 'Valued Patient'
      },
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        daysOverdue: 7,
        serviceRestriction: true
      },
      channels: ['in-app', 'email', 'sms', 'whatsapp'],
      actionUrl: `/billing/invoice/${invoice.id}`,
      priority: 'critical'
    });

    // Escalate to admin
    await this.escalateToAdmin(invoice);
  }

  /**
   * Notify provider (doctor) of overdue payment
   */
  async notifyProviderOfOverdue(invoice, daysOverdue) {
    await notificationService.send({
      userId: invoice.doctorId,
      userType: 'doctor',
      type: 'patient_payment_overdue',
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        patientName: invoice.patientDetails?.name || 'Patient',
        amount: this.formatCurrency(invoice.total),
        daysOverdue: daysOverdue
      },
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber
      },
      channels: ['in-app', 'email'],
      actionUrl: `/doctor/billing/invoices/${invoice.id}`,
      priority: 'normal'
    });
  }

  /**
   * Escalate to admin for collection
   */
  async escalateToAdmin(invoice) {
    console.log(`📢 Escalating invoice ${invoice.invoiceNumber} to admin`);

    // In a real system, you'd send this to admin users
    // For now, just log the escalation
    console.log(`Admin Escalation:
      Invoice: ${invoice.invoiceNumber}
      Patient: ${invoice.patientDetails?.name}
      Amount: ${this.formatCurrency(invoice.total)}
      Days Overdue: 7+
      Action Required: Collection or service restriction
    `);
  }

  /**
   * Calculate late fee (e.g., 2% per week)
   */
  calculateLateFee(amount, daysOverdue) {
    const weeklyRate = 0.02; // 2% per week
    const weeks = Math.ceil(daysOverdue / 7);
    return amount * weeklyRate * weeks;
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    return `₹${parseFloat(amount).toFixed(2)}`;
  }

  /**
   * Format date
   */
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateStr;
    }
  }

  /**
   * Stop the cron service
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Payment reminder automation stopped');
  }
}

// Export singleton instance
const paymentReminderService = new PaymentReminderService();
export default paymentReminderService;

// Named export for invoice creation notification
export { paymentReminderService };

// Auto-start on import
paymentReminderService.start();
