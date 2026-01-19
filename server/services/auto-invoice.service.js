import Appointment from '../models/appointment.model.intelligent.js';
import { Invoice } from '../models/billing.model.intelligent.js';
import invoiceService from './invoice.service.js';
import notificationService from './notification.service.js';
import { paymentReminderService } from './payment-reminder-cron.service.js';

/**
 * Auto-Invoice Generation Service
 * 
 * Automatically generates invoices when appointments are completed:
 * - Triggered on appointment completion
 * - Uses doctor's fee schedule
 * - Emails PDF invoice to patient
 * - Tracks payment status
 * - Integrates with payment reminder system
 */

class AutoInvoiceService {
  /**
   * Generate invoice automatically on appointment completion
   */
  async generateInvoiceForAppointment(appointmentId) {
    try {
      const appointment = await Appointment.findByPk(appointmentId);
      
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Check if appointment is completed
      if (appointment.status !== 'completed') {
        console.log(`Appointment ${appointmentId} not completed yet, skipping invoice generation`);
        return null;
      }

      // Check if invoice already exists
      const existingInvoice = await Invoice.findOne({
        where: { appointmentId: appointmentId }
      });

      if (existingInvoice) {
        console.log(`Invoice already exists for appointment ${appointmentId}`);
        return existingInvoice;
      }

      // Get consultation fee from appointment
      const consultationFee = parseFloat(appointment.consultationFee) || 500;

      // Build invoice items
      const items = [
        {
          description: `Consultation - ${appointment.consultationType || 'General'}`,
          quantity: 1,
          unitPrice: consultationFee,
          total: consultationFee
        }
      ];

      // Add any additional charges if present
      if (appointment.additionalCharges && Array.isArray(appointment.additionalCharges)) {
        appointment.additionalCharges.forEach(charge => {
          items.push({
            description: charge.description || 'Additional Service',
            quantity: charge.quantity || 1,
            unitPrice: charge.amount || 0,
            total: (charge.quantity || 1) * (charge.amount || 0)
          });
        });
      }

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + item.total, 0);
      const tax = subtotal * 0.18; // 18% GST
      const total = subtotal + tax;

      // Generate unique invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate due date (7 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      // Create invoice
      const invoice = await Invoice.create({
        invoiceNumber: invoiceNumber,
        userId: appointment.userId,
        doctorId: appointment.doctorId,
        appointmentId: appointmentId,
        type: 'consultation',
        status: 'sent',
        items: items,
        subtotal: subtotal,
        tax: tax,
        discount: 0,
        total: total,
        currency: 'INR',
        dueDate: dueDate,
        notes: `Invoice for consultation on ${appointment.appointmentDate}`,
        billingDetails: {
          doctorName: appointment.doctorName,
          consultationType: appointment.consultationType,
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime
        },
        patientDetails: {
          name: appointment.patientName,
          email: appointment.patientEmail,
          phone: appointment.patientPhone
        }
      });

      console.log(`✅ Auto-generated invoice ${invoiceNumber} for appointment ${appointmentId}`);

      // Send invoice notification
      await this.sendInvoiceNotification(invoice, appointment);

      // Trigger immediate invoice created notification
      await paymentReminderService.sendInvoiceCreatedNotification(invoice);

      return invoice;

    } catch (error) {
      console.error('Error generating auto-invoice:', error);
      throw error;
    }
  }

  /**
   * Generate unique invoice number
   */
  async generateInvoiceNumber() {
    const prefix = 'INV';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    // Find the last invoice number for this month
    const lastInvoice = await Invoice.findOne({
      where: {
        invoiceNumber: {
          [Op.like]: `${prefix}-${year}${month}%`
        }
      },
      order: [['createdAt', 'DESC']]
    });

    let sequence = 1;
    if (lastInvoice) {
      const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-')[2]) || 0;
      sequence = lastSequence + 1;
    }

    return `${prefix}-${year}${month}-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Send invoice notification to patient
   */
  async sendInvoiceNotification(invoice, appointment) {
    try {
      await notificationService.send({
        userId: appointment.userId,
        userType: 'patient',
        type: 'invoice_generated',
        variables: {
          patientName: appointment.patientName,
          doctorName: appointment.doctorName,
          invoiceNumber: invoice.invoiceNumber,
          amount: `₹${invoice.total.toFixed(2)}`,
          dueDate: this.formatDate(invoice.dueDate)
        },
        data: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          appointmentId: appointment.id
        },
        channels: ['in-app', 'email'],
        actionUrl: `/billing/invoice/${invoice.id}`,
        priority: 'normal'
      });

      console.log(`✅ Invoice notification sent for ${invoice.invoiceNumber}`);

    } catch (error) {
      console.error('Error sending invoice notification:', error);
    }
  }

  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateStr;
    }
  }
}

// Export singleton instance
const autoInvoiceService = new AutoInvoiceService();
export default autoInvoiceService;

// Also export for use in appointment controller
export { autoInvoiceService };
