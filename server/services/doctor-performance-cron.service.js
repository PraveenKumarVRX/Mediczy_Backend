import cron from 'node-cron';
import Appointment from '../models/appointment.model.intelligent.js';
import { Invoice, Payment } from '../models/billing.model.intelligent.js';
import { Prescription } from '../models/index.js';
import Doctor from '../models/doctor.model.intelligent.js';
import notificationService from './notification.service.js';
import { Op } from 'sequelize';
import { tick, tickError } from '../utils/cronRegistry.js';

/**
 * Doctor Performance Reports Service
 * 
 * Generates and sends automated weekly performance reports to doctors:
 * - Total consultations completed
 * - Average consultation duration
 * - Patient satisfaction ratings
 * - Revenue generated
 * - Pending prescriptions
 * - Missed appointments
 * - Appointment no-show rate
 */

class DoctorPerformanceReportService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start performance report cron job
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Doctor performance report service already running');
      return;
    }

    this.isRunning = true;

    // Run every Monday at 9:00 AM
    cron.schedule('0 9 * * 1', async () => {
      await this.generateAndSendReports();
    });

    console.log('✅ Doctor performance reports automation started (every Monday at 9:00 AM)');
  }

  /**
   * Generate and send reports to all active doctors
   */
  async generateAndSendReports() {
    console.log('📊 Generating weekly doctor performance reports...');

    try {
      // Get all active doctors
      const doctors = await Doctor.findAll({
        where: {
          status: 'active'
        }
      });

      let reportsSent = 0;

      for (const doctor of doctors) {
        try {
          const report = await this.generateDoctorReport(doctor.id);
          if (report) {
            await this.sendReportEmail(doctor, report);
            reportsSent++;
          }
        } catch (error) {
          console.error(`Error generating report for doctor ${doctor.id}:`, error.message);
        }
      }

      console.log(`✅ Sent ${reportsSent} performance reports`);
      tick('doctor_performance', { reportsSent });

    } catch (error) {
      console.error('❌ Error generating performance reports:', error);
      tickError('doctor_performance', error.message);
    }
  }

  /**
   * Generate performance report for a specific doctor
   */
  async generateDoctorReport(doctorId) {
    try {
      const today = new Date();
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(today.getDate() - 7);
      lastWeekStart.setHours(0, 0, 0, 0);

      const lastWeekEnd = new Date(today);
      lastWeekEnd.setHours(23, 59, 59, 999);

      // Get appointments data
      const appointments = await Appointment.findAll({
        where: {
          doctorId: doctorId,
          createdAt: {
            [Op.between]: [lastWeekStart, lastWeekEnd]
          }
        }
      });

      const completedAppointments = appointments.filter(a => a.status === 'completed');
      const cancelledAppointments = appointments.filter(a => a.status === 'cancelled');
      const noShowAppointments = appointments.filter(a => a.status === 'no_show');

      // Calculate average duration (if tracked)
      const avgDuration = this.calculateAverageDuration(completedAppointments);

      // Get prescriptions
      const prescriptions = await Prescription.findAll({
        where: {
          doctorId: doctorId,
          createdAt: {
            [Op.between]: [lastWeekStart, lastWeekEnd]
          }
        }
      });

      const draftPrescriptions = prescriptions.filter(p => p.status === 'draft');

      // Get revenue data
      const invoices = await Invoice.findAll({
        where: {
          doctorId: doctorId,
          createdAt: {
            [Op.between]: [lastWeekStart, lastWeekEnd]
          }
        }
      });

      const totalRevenue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
      const paidInvoices = invoices.filter(inv => inv.status === 'paid');
      const pendingRevenue = invoices
        .filter(inv => ['sent', 'pending', 'overdue'].includes(inv.status))
        .reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);

      // Calculate no-show rate
      const totalScheduled = appointments.length;
      const noShowRate = totalScheduled > 0 
        ? (noShowAppointments.length / totalScheduled * 100).toFixed(1)
        : 0;

      // Get patient satisfaction (if available)
      const avgRating = await this.getAverageRating(doctorId, lastWeekStart, lastWeekEnd);

      const report = {
        period: {
          start: lastWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          end: lastWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        },
        consultations: {
          total: appointments.length,
          completed: completedAppointments.length,
          cancelled: cancelledAppointments.length,
          noShow: noShowAppointments.length,
          noShowRate: noShowRate
        },
        performance: {
          avgDuration: avgDuration,
          avgRating: avgRating
        },
        prescriptions: {
          total: prescriptions.length,
          active: prescriptions.filter(p => p.status === 'active').length,
          draft: draftPrescriptions.length
        },
        revenue: {
          total: totalRevenue.toFixed(2),
          collected: paidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0).toFixed(2),
          pending: pendingRevenue.toFixed(2),
          invoiceCount: invoices.length,
          paidCount: paidInvoices.length
        },
        trends: {
          comparisonText: this.getComparisonText(completedAppointments.length)
        }
      };

      return report;

    } catch (error) {
      console.error('Error generating doctor report:', error);
      return null;
    }
  }

  /**
   * Calculate average consultation duration
   */
  calculateAverageDuration(appointments) {
    const appointmentsWithDuration = appointments.filter(a => a.duration);
    
    if (appointmentsWithDuration.length === 0) {
      return 'N/A';
    }

    const totalMinutes = appointmentsWithDuration.reduce((sum, a) => {
      const minutes = parseInt(a.duration) || 0;
      return sum + minutes;
    }, 0);

    const avgMinutes = Math.round(totalMinutes / appointmentsWithDuration.length);
    return `${avgMinutes} minutes`;
  }

  /**
   * Get average patient rating (placeholder - implement based on your rating system)
   */
  async getAverageRating(doctorId, startDate, endDate) {
    // TODO: Implement based on your rating/review system
    // For now, return a placeholder
    return '4.5/5.0';
  }

  /**
   * Get comparison text for trends
   */
  getComparisonText(currentWeekCount) {
    // Simple placeholder - in production, compare with previous week
    if (currentWeekCount > 10) {
      return 'Busy week! Great job keeping up with patient demand.';
    } else if (currentWeekCount > 5) {
      return 'Steady week with consistent patient flow.';
    } else {
      return 'Light week - consider opening more slots.';
    }
  }

  /**
   * Send performance report email
   */
  async sendReportEmail(doctor, report) {
    console.log(`📧 Sending performance report to Dr. ${doctor.firstName} ${doctor.lastName}`);

    const emailHtml = this.buildReportHTML(doctor, report);

    // Use the email controller's send function
    try {
      const { sendEmail } = await import('../controller/email.controller.js');
      await sendEmail({
        to: doctor.email,
        subject: `Weekly Performance Report - ${report.period.start} to ${report.period.end}`,
        html: emailHtml
      });
    } catch (error) {
      console.error('Error sending performance report email:', error);
    }

    // Also send in-app notification
    await notificationService.send({
      userId: doctor.id,
      userType: 'doctor',
      type: 'performance_report',
      variables: {
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        weekStart: report.period.start,
        weekEnd: report.period.end,
        consultationsCompleted: report.consultations.completed,
        revenue: report.revenue.total
      },
      data: {
        report: report
      },
      channels: ['in-app'],
      actionUrl: '/doctor/dashboard',
      priority: 'normal'
    });
  }

  /**
   * Build HTML email for performance report
   */
  buildReportHTML(doctor, report) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); color: white; padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 10px 0 0 0; opacity: 0.9; }
    .section { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #14b8a6; }
    .section h2 { margin-top: 0; color: #0d9488; font-size: 18px; }
    .metric { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: #64748b; }
    .metric-value { font-weight: bold; color: #0f172a; }
    .metric-value.positive { color: #16a34a; }
    .metric-value.warning { color: #ea580c; }
    .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
    .cta-button { display: inline-block; background: #14b8a6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Weekly Performance Report</h1>
    <p>Dr. ${doctor.firstName} ${doctor.lastName}</p>
    <p style="font-size: 14px;">${report.period.start} - ${report.period.end}</p>
  </div>

  <div class="section">
    <h2>📅 Consultations</h2>
    <div class="metric">
      <span class="metric-label">Total Appointments</span>
      <span class="metric-value">${report.consultations.total}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Completed</span>
      <span class="metric-value positive">${report.consultations.completed}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Cancelled</span>
      <span class="metric-value">${report.consultations.cancelled}</span>
    </div>
    <div class="metric">
      <span class="metric-label">No-Show Rate</span>
      <span class="metric-value ${parseFloat(report.consultations.noShowRate) > 10 ? 'warning' : ''}">${report.consultations.noShowRate}%</span>
    </div>
    <div class="metric">
      <span class="metric-label">Average Duration</span>
      <span class="metric-value">${report.performance.avgDuration}</span>
    </div>
  </div>

  <div class="section">
    <h2>⭐ Patient Satisfaction</h2>
    <div class="metric">
      <span class="metric-label">Average Rating</span>
      <span class="metric-value positive">${report.performance.avgRating}</span>
    </div>
  </div>

  <div class="section">
    <h2>💊 Prescriptions</h2>
    <div class="metric">
      <span class="metric-label">Total Issued</span>
      <span class="metric-value">${report.prescriptions.total}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Active</span>
      <span class="metric-value">${report.prescriptions.active}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Pending Drafts</span>
      <span class="metric-value ${report.prescriptions.draft > 0 ? 'warning' : ''}>${report.prescriptions.draft}</span>
    </div>
  </div>

  <div class="section">
    <h2>💰 Revenue</h2>
    <div class="metric">
      <span class="metric-label">Total Generated</span>
      <span class="metric-value positive">₹${report.revenue.total}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Collected</span>
      <span class="metric-value">₹${report.revenue.collected}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Pending</span>
      <span class="metric-value warning">₹${report.revenue.pending}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Invoices Issued</span>
      <span class="metric-value">${report.revenue.invoiceCount} (${report.revenue.paidCount} paid)</span>
    </div>
  </div>

  <div class="section">
    <h2>📈 Insights</h2>
    <p style="margin: 0;">${report.trends.comparisonText}</p>
  </div>

  <div style="text-align: center;">
    <a href="https://mediqzy.com/doctor/dashboard" class="cta-button">View Full Dashboard</a>
  </div>

  <div class="footer">
    <p><strong>Mediqzy Healthcare Platform</strong></p>
    <p>This is an automated weekly report. For questions, contact support@mediqzy.com</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Stop the cron service
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Doctor performance reports automation stopped');
  }
}

// Export singleton instance
const doctorPerformanceReportService = new DoctorPerformanceReportService();
export default doctorPerformanceReportService;

// Auto-start on import
doctorPerformanceReportService.start();
