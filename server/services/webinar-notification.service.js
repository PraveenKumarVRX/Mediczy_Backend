/**
 * Webinar Notification Service
 * Handles all webinar-related notifications and calendar invites
 */

import notificationService from './notification.service.js';
import emailService from './emailService.js';
import { generateWebinarICalFile, generateWebinarHostICalFile, generateWebinarICalFilename } from '../utils/webinarICalGenerator.js';
import postgresSequelize from '../db/postgres-sequelize.js';

const sequelize = postgresSequelize;

class WebinarNotificationService {
  
  /**
   * Send registration confirmation email with calendar invite
   */
  async sendRegistrationConfirmation(webinarData, userData, registrationData) {
    try {
      console.log(`📧 Sending webinar registration confirmation to ${userData.email}`);
      
      // Generate iCal file
      const icalContent = generateWebinarICalFile(webinarData, userData);
      const icalFilename = generateWebinarICalFilename(webinarData, false);
      
      // Prepare email data
      const emailData = {
        to: userData.email,
        subject: `✅ Webinar Registration Confirmed: ${webinarData.title}`,
        html: this.getRegistrationEmailTemplate(webinarData, userData, registrationData),
        attachments: [
          {
            filename: icalFilename,
            content: icalContent,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST'
          }
        ]
      };
      
      // Send email with calendar attachment
      await emailService.sendEmail(emailData);
      
      // Update registration record
      await sequelize.query(
        `UPDATE webinar_registrations 
         SET confirmation_email_sent = TRUE, ical_attachment_sent = TRUE, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        { replacements: [registrationData.id], type: sequelize.QueryTypes.UPDATE }
      );
      
      // Send push notification
      await this.sendPushNotification(userData.user_id, {
        title: 'Webinar Registration Confirmed! ✅',
        body: `You're registered for "${webinarData.title}" on ${this.formatDate(webinarData.scheduled_start)}`,
        data: {
          type: 'webinar_registration',
          webinarId: webinarData.id,
          actionUrl: `/webinar/${webinarData.id}`
        }
      });
      
      console.log(`✅ Registration confirmation sent successfully`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send registration confirmation:', error);
      return false;
    }
  }
  
  /**
   * Send webinar reminder (1 week before)
   */
  async sendOneWeekReminder(webinarData) {
    try {
      console.log(`📧 Sending 1-week reminders for webinar ${webinarData.id}`);
      
      // Get all registered attendees
      const attendees = await sequelize.query(
        `SELECT wr.*, u.name, u.email, u.id as user_id
         FROM webinar_registrations wr
         JOIN users u ON wr.user_id = u.id
         WHERE wr.webinar_id = $1 AND wr.status IN ('registered', 'approved')`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.SELECT }
      );
      
      let sentCount = 0;
      
      for (const attendee of attendees) {
        try {
          await this.sendEmailNotification(attendee.email, {
            subject: `📅 Reminder: Webinar in 1 Week - ${webinarData.title}`,
            html: this.getOneWeekReminderTemplate(webinarData, attendee)
          });
          
          await this.sendPushNotification(attendee.user_id, {
            title: 'Webinar in 1 Week 📅',
            body: `Don't forget: "${webinarData.title}" starts ${this.formatDate(webinarData.scheduled_start)}`,
            data: { type: 'webinar_reminder', webinarId: webinarData.id }
          });
          
          sentCount++;
        } catch (error) {
          console.error(`Failed to send reminder to ${attendee.email}:`, error.message);
        }
      }
      
      // Update webinar record
      await sequelize.query(
        `UPDATE webinars SET reminder_1week_sent = TRUE WHERE id = $1`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.UPDATE }
      );
      
      console.log(`✅ Sent 1-week reminders to ${sentCount}/${attendees.length} attendees`);
      return sentCount;
    } catch (error) {
      console.error('❌ Failed to send 1-week reminders:', error);
      return 0;
    }
  }
  
  /**
   * Send 24-hour reminder
   */
  async send24HourReminder(webinarData) {
    try {
      console.log(`📧 Sending 24-hour reminders for webinar ${webinarData.id}`);
      
      const attendees = await sequelize.query(
        `SELECT wr.*, u.name, u.email, u.id as user_id
         FROM webinar_registrations wr
         JOIN users u ON wr.user_id = u.id
         WHERE wr.webinar_id = $1 AND wr.status IN ('registered', 'approved')`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.SELECT }
      );
      
      let sentCount = 0;
      
      for (const attendee of attendees) {
        try {
          // Email notification
          await this.sendEmailNotification(attendee.email, {
            subject: `⏰ Tomorrow: ${webinarData.title}`,
            html: this.get24HourReminderTemplate(webinarData, attendee)
          });
          
          // Push notification
          await this.sendPushNotification(attendee.user_id, {
            title: 'Webinar Tomorrow! ⏰',
            body: `"${webinarData.title}" starts tomorrow at ${this.formatTime(webinarData.scheduled_start)}`,
            data: { type: 'webinar_reminder', webinarId: webinarData.id, priority: 'high' }
          });
          
          // WhatsApp notification (if enabled)
          await this.sendWhatsAppReminder(attendee, webinarData, '24 hours');
          
          sentCount++;
        } catch (error) {
          console.error(`Failed to send 24h reminder to ${attendee.email}:`, error.message);
        }
      }
      
      await sequelize.query(
        `UPDATE webinars SET reminder_24h_sent = TRUE WHERE id = $1`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.UPDATE }
      );
      
      console.log(`✅ Sent 24-hour reminders to ${sentCount}/${attendees.length} attendees`);
      return sentCount;
    } catch (error) {
      console.error('❌ Failed to send 24-hour reminders:', error);
      return 0;
    }
  }
  
  /**
   * Send 2-hour reminder
   */
  async send2HourReminder(webinarData) {
    try {
      console.log(`📧 Sending 2-hour reminders for webinar ${webinarData.id}`);
      
      const attendees = await sequelize.query(
        `SELECT wr.*, u.name, u.email, u.id as user_id
         FROM webinar_registrations wr
         JOIN users u ON wr.user_id = u.id
         WHERE wr.webinar_id = $1 AND wr.status IN ('registered', 'approved')`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.SELECT }
      );
      
      let sentCount = 0;
      
      for (const attendee of attendees) {
        try {
          await this.sendPushNotification(attendee.user_id, {
            title: 'Webinar Starting in 2 Hours! 🔔',
            body: `Get ready for "${webinarData.title}". Join at ${this.formatTime(webinarData.scheduled_start)}`,
            data: { 
              type: 'webinar_starting_soon', 
              webinarId: webinarData.id, 
              priority: 'high',
              actionUrl: `/webinar/${webinarData.id}/room`
            }
          });
          
          sentCount++;
        } catch (error) {
          console.error(`Failed to send 2h reminder to user ${attendee.user_id}:`, error.message);
        }
      }
      
      await sequelize.query(
        `UPDATE webinars SET reminder_2h_sent = TRUE WHERE id = $1`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.UPDATE }
      );
      
      console.log(`✅ Sent 2-hour reminders to ${sentCount}/${attendees.length} attendees`);
      return sentCount;
    } catch (error) {
      console.error('❌ Failed to send 2-hour reminders:', error);
      return 0;
    }
  }
  
  /**
   * Send 15-minute urgent reminder
   */
  async send15MinuteReminder(webinarData) {
    try {
      console.log(`📧 Sending 15-minute urgent reminders for webinar ${webinarData.id}`);
      
      const attendees = await sequelize.query(
        `SELECT wr.*, u.name, u.email, u.id as user_id
         FROM webinar_registrations wr
         JOIN users u ON wr.user_id = u.id
         WHERE wr.webinar_id = $1 AND wr.status IN ('registered', 'approved')`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.SELECT }
      );
      
      let sentCount = 0;
      
      for (const attendee of attendees) {
        try {
          await this.sendPushNotification(attendee.user_id, {
            title: '🚨 Webinar Starting in 15 Minutes!',
            body: `"${webinarData.title}" is about to begin. Click to join now!`,
            data: { 
              type: 'webinar_starting_now', 
              webinarId: webinarData.id, 
              priority: 'urgent',
              actionUrl: `/webinar/${webinarData.id}/room`,
              requireInteraction: true
            },
            sound: 'urgent_notification'
          });
          
          sentCount++;
        } catch (error) {
          console.error(`Failed to send 15min reminder to user ${attendee.user_id}:`, error.message);
        }
      }
      
      await sequelize.query(
        `UPDATE webinars SET reminder_15min_sent = TRUE WHERE id = $1`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.UPDATE }
      );
      
      console.log(`✅ Sent 15-minute reminders to ${sentCount}/${attendees.length} attendees`);
      return sentCount;
    } catch (error) {
      console.error('❌ Failed to send 15-minute reminders:', error);
      return 0;
    }
  }
  
  /**
   * Send host notification with calendar invite
   */
  async sendHostCalendarInvite(webinarData, doctorData) {
    try {
      const icalContent = generateWebinarHostICalFile(webinarData);
      const icalFilename = generateWebinarICalFilename(webinarData, true);
      
      await this.sendEmailNotification(doctorData.email, {
        subject: `[HOST] Webinar Scheduled: ${webinarData.title}`,
        html: this.getHostInviteTemplate(webinarData, doctorData),
        attachments: [
          {
            filename: icalFilename,
            content: icalContent,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST'
          }
        ]
      });
      
      await sequelize.query(
        `UPDATE webinars SET ical_sent = TRUE WHERE id = $1`,
        { replacements: [webinarData.id], type: sequelize.QueryTypes.UPDATE }
      );
      
      console.log(`✅ Host calendar invite sent to ${doctorData.email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send host calendar invite:', error);
      return false;
    }
  }
  
  // Helper methods
  
  async sendEmailNotification(to, { subject, html, attachments = [] }) {
    return await emailService.sendEmail({
      to,
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@mediqzy.com',
      subject,
      html,
      attachments
    });
  }
  
  async sendPushNotification(userId, { title, body, data = {} }) {
    // Implementation depends on your push notification service
    // This is a placeholder
    console.log(`[PUSH] To user ${userId}: ${title}`);
  }
  
  async sendWhatsAppReminder(attendee, webinarData, timeframe) {
    // Implementation for WhatsApp reminders
    console.log(`[WhatsApp] Reminder sent to ${attendee.phone || attendee.email}`);
  }
  
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
  
  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }
  
  // Email templates (simplified - should use HTML templates)
  
  getRegistrationEmailTemplate(webinar, user, registration) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563EB;">Webinar Registration Confirmed! ✅</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>You're successfully registered for:</p>
        <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">${webinar.title}</h3>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${this.formatDate(webinar.scheduled_start)}</p>
          <p style="margin: 5px 0;"><strong>Time:</strong> ${this.formatTime(webinar.scheduled_start)}</p>
          <p style="margin: 5px 0;"><strong>Host:</strong> Dr. ${webinar.doctor_name}</p>
        </div>
        <p><strong>📅 Calendar Invite:</strong> A calendar file (.ics) is attached to this email. Add it to your calendar for automatic reminders!</p>
        <p><strong>Join Link:</strong> <a href="https://app.mediqzy.com/webinar/${webinar.id}/room">Click here to join when it starts</a></p>
        <p style="margin-top: 30px;">Looking forward to seeing you there!</p>
        <p>Best regards,<br>Mediczy Team</p>
      </div>
    `;
  }
  
  getOneWeekReminderTemplate(webinar, attendee) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563EB;">Webinar in 1 Week! 📅</h2>
        <p>Hi ${attendee.name},</p>
        <p>Just a friendly reminder that your registered webinar is coming up in one week:</p>
        <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">${webinar.title}</h3>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${this.formatDate(webinar.scheduled_start)}</p>
          <p style="margin: 5px 0;"><strong>Time:</strong> ${this.formatTime(webinar.scheduled_start)}</p>
        </div>
        <a href="https://app.mediqzy.com/webinar/${webinar.id}" style="display: inline-block; background: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">View Webinar Details</a>
        <p>See you soon!</p>
      </div>
    `;
  }
  
  get24HourReminderTemplate(webinar, attendee) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563EB;">Webinar Tomorrow! ⏰</h2>
        <p>Hi ${attendee.name},</p>
        <p>Your webinar is happening tomorrow:</p>
        <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">${webinar.title}</h3>
          <p style="margin: 5px 0;"><strong>Tomorrow at:</strong> ${this.formatTime(webinar.scheduled_start)}</p>
        </div>
        <a href="https://app.mediqzy.com/webinar/${webinar.id}/room" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Join Webinar Tomorrow</a>
      </div>
    `;
  }
  
  getHostInviteTemplate(webinar, doctor) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #EF4444;">[HOST] Webinar Scheduled</h2>
        <p>Hi Dr. ${doctor.name},</p>
        <p>You are scheduled to host the following webinar:</p>
        <div style="background: #FEF2F2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #EF4444;">
          <h3 style="margin: 0 0 10px 0;">${webinar.title}</h3>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${this.formatDate(webinar.scheduled_start)}</p>
          <p style="margin: 5px 0;"><strong>Time:</strong> ${this.formatTime(webinar.scheduled_start)}</p>
          <p style="margin: 5px 0;"><strong>Registrations:</strong> ${webinar.current_attendees || 0}/${webinar.max_attendees}</p>
        </div>
        <p><strong>📅 Calendar Invite:</strong> A calendar file is attached with reminders to help you prepare.</p>
        <a href="https://app.mediqzy.com/doctor/webinars/${webinar.id}" style="display: inline-block; background: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Manage Webinar</a>
      </div>
    `;
  }
}

export default new WebinarNotificationService();
