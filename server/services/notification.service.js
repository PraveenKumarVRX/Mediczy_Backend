/**
 * Notification Service for Mediczy
 * Handles multi-channel notifications for consultation events
 * Channels: Push (FCM), Email, SMS, WhatsApp, In-App, Kafka Events
 */

import { sendAppointmentNotification, sendSystemNotification, sendDoctorCallingNotification, isFirebaseInitialized } from '../utils/firebase-admin.js';
import emailService from './emailService.js';
import { SMSService } from './sms.service.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';
import { Notification } from '../models/index.js';
import { DataTypes } from 'sequelize';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import whatsappService from './whatsapp.service.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { generateICalFile, generateDoctorICalFile, generateICalFilename } from '../utils/icalGenerator.js';

// Initialize SMS service
const smsService = new SMSService();

// ── Activity log helper (fire-and-forget, never throws) ─────────────────────
function _logChannelActivity(action, resource, details, recipientInfo, result) {
  try {
    if (!global.activityLogs) global.activityLogs = [];
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      userId: recipientInfo?.userId || null,
      userType: 'system',
      userEmail: recipientInfo?.email || null,
      activity: action,
      action: 'send',
      resource,
      result: result ? 'success' : 'failure',
      details,
      ipAddress: 'internal',
      path: '/internal/notification-service',
      method: 'INTERNAL',
      metadata: { channel: resource, recipient: recipientInfo }
    };
    global.activityLogs.unshift(entry);
    if (global.activityLogs.length > 10000) global.activityLogs = global.activityLogs.slice(0, 10000);
  } catch (_) { /* never let logging break the caller */ }
}

// ============================================
// FCM TOKEN MODEL
// ============================================

// FCM Token Storage Model
const FCMToken = postgresSequelize.define('FCMToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userType: {
    type: DataTypes.ENUM('patient', 'doctor', 'admin'),
    defaultValue: 'patient'
  },
  token: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  deviceType: {
    type: DataTypes.ENUM('web', 'android', 'ios'),
    defaultValue: 'web'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true,
  tableName: 'fcm_tokens',
  indexes: [
    { fields: ['userId', 'userType'] },
    { fields: ['token'], unique: true }
  ]
});

// ============================================
// NOTIFICATION SERVICE CLASS
// ============================================

class NotificationService {
  constructor() {
    this.templates = this.initTemplates();
  }

  // Initialize notification templates
  initTemplates() {
    return {
      // Doctor receives new appointment request
      appointment_request: {
        title: 'New Appointment Request',
        message: '{{patientName}} has requested an appointment on {{date}} at {{time}}',
        channels: ['push', 'email', 'whatsapp', 'in-app'],
        priority: 'high'
      },

      // Patient receives appointment booking confirmation
      appointment_booked: {
        title: 'Appointment Booked Successfully! ✅',
        message: 'Your appointment with Dr. {{doctorName}} is scheduled for {{date}} at {{time}}. Payment status: {{paymentStatus}}',
        channels: ['push', 'email', 'whatsapp', 'in-app'],
        priority: 'high'
      },

      // Patient receives appointment acceptance
      appointment_accepted: {
        title: 'Appointment Confirmed! 🎉',
        message: 'Dr. {{doctorName}} has accepted your appointment. Please complete payment to confirm.',
        channels: ['push', 'email', 'in-app'],
        priority: 'high'
      },

      // Patient receives appointment rejection
      appointment_rejected: {
        title: 'Appointment Not Available',
        message: 'Dr. {{doctorName}} is unable to accommodate your appointment. Reason: {{reason}}',
        channels: ['push', 'email', 'in-app'],
        priority: 'normal'
      },

      // Payment reminder
      payment_pending: {
        title: 'Payment Pending',
        message: 'Complete payment of ₹{{amount}} to confirm your appointment with Dr. {{doctorName}}',
        channels: ['push', 'in-app'],
        priority: 'high'
      },

      // Payment received - to both patient and doctor
      payment_received: {
        title: 'Payment Successful ✅',
        message: 'Payment of ₹{{amount}} received. Your consultation with Dr. {{doctorName}} is confirmed for {{date}} at {{time}}',
        channels: ['push', 'email', 'sms', 'in-app'],
        priority: 'high'
      },

      // Payment failed
      payment_failed: {
        title: 'Payment Failed',
        message: 'Payment for your appointment with Dr. {{doctorName}} failed. Please try again.',
        channels: ['push', 'in-app'],
        priority: 'high'
      },

      // Consultation reminder (1 hour before)
      consultation_reminder: {
        title: 'Consultation in 1 Hour',
        message: 'Your video consultation with {{doctorName}} starts in 1 hour at {{time}}',
        channels: ['push', 'sms', 'in-app'],
        priority: 'high'
      },

      // Consultation starting (15 mins before)
      consultation_starting: {
        title: 'Consultation Starting Soon! 🔔',
        message: 'Your video consultation is starting in 15 minutes. Click to join.',
        channels: ['push', 'in-app'],
        priority: 'urgent'
      },

      // Doctor initiated call
      consultation_started: {
        title: '📞 {{doctorName}} is calling',
        message: 'Your doctor has started the video consultation. Tap to join now!',
        channels: ['push', 'in-app'],
        priority: 'urgent'
      },

      // Video call ready
      video_ready: {
        title: 'Video Call Ready',
        message: 'Dr. {{doctorName}} is ready. Click to join your video consultation.',
        channels: ['push', 'in-app'],
        priority: 'urgent'
      },

      // Consultation completed
      consultation_completed: {
        title: 'Consultation Completed',
        message: 'Your consultation with Dr. {{doctorName}} has been completed. View prescription and notes.',
        channels: ['push', 'email', 'in-app'],
        priority: 'normal'
      },

      // Prescription issued
      prescription_issued: {
        title: 'Prescription Ready 💊',
        message: 'Dr. {{doctorName}} has issued your prescription. View and download it now.',
        channels: ['push', 'email', 'in-app'],
        priority: 'high'
      },

      // Doctor calling patient (new)
      doctor_calling: {
        title: '📞 {{doctorName}} is calling',
        message: 'Your doctor has started the video consultation. Tap to join now!',
        channels: ['push', 'in-app'],
        priority: 'critical',
        sound: 'call_ringtone',
        requireInteraction: true
      }
    };
  }

  // Parse template with variables
  parseTemplate(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return result;
  }

  // ============================================
  // MAIN NOTIFICATION METHODS
  // ============================================

  /**
   * Send notification through multiple channels
   */
  async send({ userId, userType, type, variables, channels, data = {}, actionUrl, appointmentData = null }) {
    try {
      const template = this.templates[type];
      if (!template) {
        console.error(`Unknown notification type: ${type}`);
        return { success: false, error: 'Unknown notification type' };
      }

      const title = this.parseTemplate(template.title, variables);
      const message = this.parseTemplate(template.message, variables);
      const notificationChannels = channels || template.channels;
      const priority = template.priority;

      // Create in-app notification record
      const notification = await Notification.create({
        userId,
        userType, // Add userType to the notification record
        type,
        title,
        message,
        data: { ...data, variables, userType },
        channels: notificationChannels,
        priority,
        webRoute: actionUrl,
        deepLink: actionUrl,
        status: 'pending',
        isRead: false
      });

      const results = {
        notificationId: notification.id,
        channels: {}
      };

      // Send through each channel
      for (const channel of notificationChannels) {
        try {
          switch (channel) {
            case 'push':
              results.channels.push = await this.sendPush(userId, userType, title, message, data, actionUrl);
              break;
            case 'email':
              results.channels.email = await this.sendEmail(userId, userType, title, message, type, variables, appointmentData);
              break;
            case 'sms':
              results.channels.sms = await this.sendSMS(userId, userType, message);
              break;
            case 'whatsapp':
              results.channels.whatsapp = await this.sendWhatsApp(userId, userType, title, message, data);
              break;
            case 'in-app':
              results.channels.inApp = { success: true }; // Already created
              break;
          }
        } catch (channelError) {
          console.error(`Error sending ${channel} notification:`, channelError);
          results.channels[channel] = { success: false, error: channelError.message };
        }
      }

      // Publish to Kafka for real-time streaming and analytics
      try {
        await this.publishToKafka(type, {
          notificationId: notification.id,
          userId,
          userType,
          title,
          message,
          data,
          channels: notificationChannels,
          priority,
          timestamp: new Date().toISOString()
        });
        results.channels.kafka = { success: true };
      } catch (kafkaError) {
        console.error('Kafka publish error:', kafkaError.message);
        results.channels.kafka = { success: false, error: kafkaError.message };
      }

      // Update notification status
      const allSuccessful = Object.values(results.channels).every(r => r.success);
      await notification.update({
        status: allSuccessful ? 'sent' : 'failed',
        sentAt: new Date(),
        deliveryStatus: results.channels
      });

      return { success: true, ...results };
    } catch (error) {
      console.error('Notification send error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Publish notification event to Kafka
   */
  async publishToKafka(type, payload) {
    const kafkaMessage = {
      key: `notification-${payload.notificationId}`,
      type: `NOTIFICATION_${type.toUpperCase()}`,
      action: 'notification_sent',
      ...payload
    };

    await publishEvent(KAFKA_TOPICS.NOTIFICATION_EVENTS, kafkaMessage);
  }

  /**
   * Send Push Notification via FCM
   */
  async sendPush(userId, userType, title, message, data = {}, actionUrl) {
    try {
      if (!isFirebaseInitialized) {
        return { success: false, error: 'Firebase not initialized' };
      }

      // Get ALL active FCM tokens for user.
      // Try both the canonical userType and common aliases ('patient' ↔ 'user')
      // to handle tokens registered under an older schema.
      const aliasMap = { patient: ['patient', 'user'], user: ['user', 'patient'], doctor: ['doctor'], admin: ['admin'] };
      const userTypeVariants = aliasMap[userType] || [userType];

      const tokenRecords = await FCMToken.findAll({
        where: { userId, userType: userTypeVariants, isActive: true }
      });

      if (!tokenRecords || tokenRecords.length === 0) {
        return { success: false, error: 'No FCM token found' };
      }

      // Convert data values to strings for FCM compatibility
      const stringData = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          stringData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
      }
      if (actionUrl) {
        stringData.actionUrl = actionUrl;
        stringData.click_action = actionUrl;
      }

      // Use dedicated call notification only for active video/voice call events
      const isCallNotification = data.action === 'join_call';

      // Send to ALL registered devices for this user
      const results = await Promise.allSettled(
        tokenRecords.map(tokenRecord => {
          if (isCallNotification && data.appointmentId) {
            return sendDoctorCallingNotification(
              tokenRecord.token,
              {
                doctorName: stringData.doctorName || title.replace('📞 ', '').replace(' is calling', ''),
                appointmentId: stringData.appointmentId,
                meetingLink: stringData.meetingLink || actionUrl || '',
                doctorId: stringData.doctorId || '',
                callInitiatedAt: stringData.callInitiatedAt || new Date().toISOString()
              }
            );
          } else {
            return sendSystemNotification(
              tokenRecord.token,
              { title, message, category: 'appointment', clickAction: actionUrl, extraData: stringData }
            );
          }
        })
      );

      const anySuccess = results.some(r => r.status === 'fulfilled');
      return { success: anySuccess, result: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send Email Notification
   */
  async sendEmail(userId, userType, title, message, type, variables, appointmentData = null) {
    try {
      // Get user email
      let email;
      if (userType === 'doctor') {
        const { Doctor } = await import('../models/index.js');
        const doctor = await Doctor.findByPk(userId);
        email = doctor?.email;
      } else {
        const { default: userModel } = await import('../models/user.model.intelligent.js');
        const user = await userModel.findByPk(userId);
        email = user?.email;
      }

      if (!email) {
        return { success: false, error: 'No email found for user' };
      }

      // Build HTML email
      const htmlContent = this.buildEmailHTML(title, message, type, variables);

      // Prepare email options
      const emailOptions = {
        to: email,
        subject: title,
        html: htmlContent
      };

      // Attach iCal file for appointment notifications
      if (appointmentData && (type === 'appointment_request' || type === 'appointment_booked')) {
        try {
          // Generate iCal content based on user role
          const icalContent = userType === 'doctor'
            ? generateDoctorICalFile(appointmentData)
            : generateICalFile(appointmentData);

          // Generate filename
          const filename = generateICalFilename(appointmentData, userType);

          // Add attachment
          emailOptions.attachments = [{
            filename: filename,
            content: icalContent,
            contentType: 'text/calendar; charset=utf-8'
          }];

          console.log(`📅 Attached calendar file: ${filename}`);
        } catch (icalError) {
          console.error('Error generating iCal attachment:', icalError);
          // Continue without attachment if iCal generation fails
        }
      }

      const result = await emailService.sendEmail(emailOptions);

      _logChannelActivity(
        `Email sent — ${title}`,
        'email',
        `To: ${email} | Subject: ${title} | Type: ${type || 'notification'}`,
        { userId, email },
        true
      );

      return { success: true, email, result };
    } catch (error) {
      _logChannelActivity(
        `Email failed — ${title}`,
        'email',
        `Failed to ${email || 'unknown'} | Error: ${error.message}`,
        { userId, email },
        false
      );
      return { success: false, error: error.message };
    }
  }
  async sendSMS(userId, userType, message) {
    try {
      // Get user phone
      let phone;
      if (userType === 'doctor') {
        const { Doctor } = await import('../models/index.js');
        const doctor = await Doctor.findByPk(userId);
        phone = doctor?.phoneNumber;
      } else {
        const { default: userModel } = await import('../models/user.model.intelligent.js');
        const user = await userModel.findByPk(userId);
        phone = user?.phoneNumber || user?.phone;
      }

      if (!phone) {
        return { success: false, error: 'No phone number found' };
      }

      const result = await smsService.sendSMS({
        to: phone,
        message: `Mediczy: ${message}`
      });

      return { success: true, phone, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send WhatsApp Notification
   */
  async sendWhatsApp(userId, userType, title, message, data = {}) {
    try {
      // Get user phone
      let phone, userName;
      if (userType === 'doctor') {
        const { Doctor } = await import('../models/index.js');
        const doctor = await Doctor.findByPk(userId);
        phone = doctor?.phoneNumber;
        userName = `Dr. ${doctor?.firstName} ${doctor?.lastName}`;
      } else {
        const { default: userModel } = await import('../models/user.model.intelligent.js');
        const user = await userModel.findByPk(userId);
        phone = user?.phoneNumber || user?.phone;
        userName = `${user?.firstName} ${user?.lastName}`;
      }

      if (!phone) {
        return { success: false, error: 'No phone number found for WhatsApp' };
      }

      // Format phone for WhatsApp (add country code if not present)
      let formattedPhone = phone.replace(/[^0-9+]/g, '');
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+91' + formattedPhone; // India country code
      }

      // Send WhatsApp message via production service (real Twilio API)
      const waBody = `*${title}*\n\n${message}\n\n_Mediczy Healthcare Platform_`;
      const result = await whatsappProductionService.sendSessionMessage({
        to: formattedPhone,
        body: waBody
      });

      _logChannelActivity(
        `WhatsApp sent — ${title}`,
        'whatsapp',
        `To: ${formattedPhone} (${userName}) | Title: ${title} | Type: ${data?.type || 'notification'}`,
        { userId, phone: formattedPhone },
        true
      );

      return { success: true, phone: formattedPhone, result };
    } catch (error) {
      _logChannelActivity(
        `WhatsApp failed — ${title}`,
        'whatsapp',
        `Failed to ${formattedPhone || phone} | Error: ${error.message}`,
        { userId },
        false
      );
      console.error('WhatsApp notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build HTML email template
   */
  buildEmailHTML(title, message, type, variables) {
    const actionButton = this.getEmailActionButton(type, variables);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Mediczy</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Healthcare at your fingertips</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #1a73e8; margin: 0 0 20px 0; font-size: 22px;">${title}</h2>
                    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">${message}</p>
                    ${actionButton}
                    ${this.getAppointmentDetails(type, variables)}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8f9fa; padding: 25px 30px; text-align: center; border-top: 1px solid #e9ecef;">
                    <p style="color: #6c757d; font-size: 12px; margin: 0;">
                      This is an automated message from Mediczy Healthcare Platform.<br>
                      Please do not reply to this email.
                    </p>
                    <p style="color: #6c757d; font-size: 12px; margin: 15px 0 0 0;">
                      © ${new Date().getFullYear()} Mediczy. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  getEmailActionButton(type, variables) {
    const baseUrl = process.env.FRONTEND_URL || 'https://mediczy.com';
    let buttonText = 'View Details';
    let buttonUrl = baseUrl;

    switch (type) {
      case 'appointment_request':
        buttonText = 'View Appointment';
        buttonUrl = `${baseUrl}/doctor/appointments`;
        break;
      case 'appointment_booked':
        buttonText = 'View My Bookings';
        buttonUrl = `${baseUrl}/my-bookings`;
        break;
      case 'appointment_accepted':
      case 'payment_pending':
        buttonText = 'Complete Payment';
        buttonUrl = `${baseUrl}/appointments/${variables.appointmentId}/pay`;
        break;
      case 'payment_received':
      case 'consultation_reminder':
      case 'consultation_starting':
      case 'video_ready':
        buttonText = 'Join Video Call';
        buttonUrl = variables.meetingLink || `${baseUrl}/consultation/${variables.appointmentId}`;
        break;
      case 'prescription_issued':
        buttonText = 'View Prescription';
        buttonUrl = `${baseUrl}/prescriptions/${variables.prescriptionId}`;
        break;
      case 'appointment_request':
        buttonText = 'View Request';
        buttonUrl = `${baseUrl}/doctor/appointments`;
        break;
    }

    return `
      <div style="text-align: center; margin: 25px 0;">
        <a href="${buttonUrl}" style="display: inline-block; background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: #ffffff; text-decoration: none; padding: 14px 35px; border-radius: 25px; font-weight: 600; font-size: 16px;">${buttonText}</a>
      </div>
    `;
  }

  getAppointmentDetails(type, variables) {
    if (!variables.date && !variables.doctorName) return '';

    return `
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-top: 25px;">
        <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">Appointment Details</h3>
        <table width="100%" style="font-size: 14px;">
          ${variables.doctorName ? `<tr><td style="color: #6c757d; padding: 5px 0;">Doctor:</td><td style="color: #333; font-weight: 500;">Dr. ${variables.doctorName}</td></tr>` : ''}
          ${variables.patientName ? `<tr><td style="color: #6c757d; padding: 5px 0;">Patient:</td><td style="color: #333; font-weight: 500;">${variables.patientName}</td></tr>` : ''}
          ${variables.date ? `<tr><td style="color: #6c757d; padding: 5px 0;">Date:</td><td style="color: #333; font-weight: 500;">${variables.date}</td></tr>` : ''}
          ${variables.time ? `<tr><td style="color: #6c757d; padding: 5px 0;">Time:</td><td style="color: #333; font-weight: 500;">${variables.time}</td></tr>` : ''}
          ${variables.amount ? `<tr><td style="color: #6c757d; padding: 5px 0;">Amount:</td><td style="color: #333; font-weight: 500;">₹${variables.amount}</td></tr>` : ''}
        </table>
      </div>
    `;
  }

  // ============================================
  // CONSULTATION EVENT HANDLERS
  // ============================================

  /**
   * Notify doctor of new appointment request
   */
  async notifyAppointmentRequest(appointment, appointmentData = null) {
    // Publish to Kafka for real-time appointment event tracking
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
      type: 'APPOINTMENT_REQUESTED',
      appointmentId: appointment.id,
      patientId: appointment.userId,
      doctorId: appointment.doctorId,
      date: appointment.appointmentDate,
      time: appointment.appointmentTime,
      timestamp: new Date().toISOString()
    });

    return this.send({
      userId: appointment.doctorId,
      userType: 'doctor',
      type: 'appointment_request',
      variables: {
        patientName: appointment.patientName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        appointmentId: appointment.id
      },
      data: { appointmentId: appointment.id },
      actionUrl: '/doctor/appointments',
      appointmentData: appointmentData
    });
  }

  /**
   * Notify patient that appointment was accepted
   */
  async notifyAppointmentAccepted(appointment, doctor) {
    // Publish to Kafka
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
      type: 'APPOINTMENT_ACCEPTED',
      appointmentId: appointment.id,
      patientId: appointment.userId,
      doctorId: appointment.doctorId,
      timestamp: new Date().toISOString()
    });

    return this.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'appointment_accepted',
      variables: {
        doctorName: doctor.firstName + ' ' + doctor.lastName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        amount: appointment.consultationFee,
        appointmentId: appointment.id
      },
      data: { appointmentId: appointment.id },
      actionUrl: `/appointments/${appointment.id}/pay`
    });
  }

  /**
   * Notify patient that appointment was rejected
   */
  async notifyAppointmentRejected(appointment, doctor, reason) {
    // Publish to Kafka
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
      type: 'APPOINTMENT_REJECTED',
      appointmentId: appointment.id,
      patientId: appointment.userId,
      doctorId: appointment.doctorId,
      reason,
      timestamp: new Date().toISOString()
    });

    return this.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'appointment_rejected',
      variables: {
        doctorName: doctor.firstName + ' ' + doctor.lastName,
        reason: reason,
        appointmentId: appointment.id
      },
      data: { appointmentId: appointment.id }
    });
  }

  /**
   * Notify both patient and doctor of payment received
   */
  async notifyPaymentReceived(appointment, doctor) {
    // Publish to Kafka
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
      type: 'PAYMENT_RECEIVED',
      appointmentId: appointment.id,
      patientId: appointment.userId,
      doctorId: appointment.doctorId,
      amount: appointment.consultationFee,
      timestamp: new Date().toISOString()
    });

    // Notify patient
    await this.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'payment_received',
      variables: {
        doctorName: doctor.firstName + ' ' + doctor.lastName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        amount: appointment.consultationFee,
        appointmentId: appointment.id,
        meetingLink: appointment.meetingLink
      },
      data: { appointmentId: appointment.id, meetingLink: appointment.meetingLink },
      actionUrl: `/consultation/${appointment.id}`
    });

    // Notify doctor
    await this.send({
      userId: appointment.doctorId,
      userType: 'doctor',
      type: 'payment_received',
      variables: {
        patientName: appointment.patientName,
        date: appointment.appointmentDate,
        time: appointment.appointmentTime,
        amount: appointment.consultationFee,
        appointmentId: appointment.id
      },
      data: { appointmentId: appointment.id }
    });
  }

  /**
   * Send reminder 1 hour before consultation
   */
  async notifyConsultationReminder(appointment, doctor) {
    // Remind patient
    await this.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'consultation_reminder',
      variables: {
        doctorName: doctor.firstName + ' ' + doctor.lastName,
        time: appointment.appointmentTime,
        appointmentId: appointment.id
      },
      data: { appointmentId: appointment.id }
    });

    // Remind doctor
    await this.send({
      userId: appointment.doctorId,
      userType: 'doctor',
      type: 'consultation_reminder',
      variables: {
        patientName: appointment.patientName,
        time: appointment.appointmentTime,
        appointmentId: appointment.id
      },
      data: { appointmentId: appointment.id }
    });
  }

  /**
   * Notify when consultation is starting (15 mins before)
   */
  async notifyConsultationStarting(appointment) {
    // Publish to Kafka
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
      type: 'CONSULTATION_STARTING',
      appointmentId: appointment.id,
      patientId: appointment.userId,
      doctorId: appointment.doctorId,
      meetingLink: appointment.meetingLink,
      timestamp: new Date().toISOString()
    });

    await this.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'consultation_starting',
      variables: {
        appointmentId: appointment.id,
        meetingLink: appointment.meetingLink
      },
      data: { appointmentId: appointment.id, meetingLink: appointment.meetingLink },
      actionUrl: appointment.meetingLink
    });
  }

  /**
   * Notify patient when consultation is completed
   */
  async notifyConsultationCompleted(appointment, doctor) {
    // Publish to Kafka
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
      type: 'CONSULTATION_COMPLETED',
      appointmentId: appointment.id,
      patientId: appointment.userId,
      doctorId: appointment.doctorId,
      timestamp: new Date().toISOString()
    });

    return this.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'consultation_completed',
      variables: {
        doctorName: doctor.firstName + ' ' + doctor.lastName,
        appointmentId: appointment.id
      },
      data: { appointmentId: appointment.id },
      actionUrl: `/appointments/${appointment.id}`
    });
  }

  /**
   * Notify patient when prescription is issued
   */
  async notifyPrescriptionIssued(prescription, doctor) {
    // Publish to Kafka
    await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, {
      type: 'PRESCRIPTION_ISSUED',
      prescriptionId: prescription.id,
      patientId: prescription.patientId,
      doctorId: doctor.id,
      timestamp: new Date().toISOString()
    });

    return this.send({
      userId: prescription.patientId,
      userType: 'patient',
      type: 'prescription_issued',
      variables: {
        doctorName: doctor.firstName + ' ' + doctor.lastName,
        prescriptionId: prescription.id
      },
      data: { prescriptionId: prescription.id },
      actionUrl: `/prescriptions/${prescription.id}`
    });
  }

  // ============================================
  // IN-APP NOTIFICATION METHODS
  // ============================================

  /**
   * Get user's notifications
   */
  async getNotifications(userId, userType, options = {}) {
    const { page = 1, limit = 20, unreadOnly = false, type } = options;

    const where = { userId };
    // Only filter by userType if provided and not null
    if (userType) {
      where.userType = userType;
    }
    if (unreadOnly) where.status = { [postgresSequelize.Sequelize.Op.ne]: 'read' };
    if (type) where.type = type;

    const notifications = await Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    // Build unread count query
    const unreadWhere = { userId, status: { [postgresSequelize.Sequelize.Op.ne]: 'read' } };
    if (userType) {
      unreadWhere.userType = userType;
    }

    return {
      notifications: notifications.rows,
      total: notifications.count,
      unread: await Notification.count({ where: unreadWhere }),
      page: parseInt(page),
      totalPages: Math.ceil(notifications.count / limit)
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      where: { id: notificationId, userId }
    });

    if (notification) {
      await notification.update({ isRead: true, readAt: new Date() });
      return { success: true };
    }

    return { success: false, error: 'Notification not found' };
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId, userType) {
    const where = { userId, isRead: false };
    // Only filter by userType if provided
    if (userType) {
      where.userType = userType;
    }
    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where }
    );
    return { success: true };
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId, userType) {
    const where = { userId, isRead: false };
    // Only filter by userType if provided
    if (userType) {
      where.userType = userType;
    }
    const count = await Notification.count({ where });
    return count;
  }

  /**
   * Register FCM token
   */
  async registerFCMToken(userId, userType, token, deviceType = 'web') {
    try {
      // Deactivate old tokens for this user
      await FCMToken.update(
        { isActive: false },
        { where: { userId, userType } }
      );

      // Create or update token
      await FCMToken.upsert({
        userId,
        userType,
        token,
        deviceType,
        isActive: true
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // CONVENIENCE METHODS (ALIAS)
  // These methods provide a simpler interface for the consultation routes
  // ============================================

  /**
   * Send appointment requested notification to doctor
   */
  async sendAppointmentRequested({ appointmentId, doctor, patient, appointmentDate, appointmentTime, symptoms }) {
    return this.send({
      userId: doctor.id,
      userType: 'doctor',
      type: 'appointment_request',
      variables: {
        patientName: patient.name,
        date: appointmentDate,
        time: appointmentTime,
        symptoms: symptoms || 'Not specified',
        appointmentId
      },
      data: { appointmentId },
      actionUrl: '/doctor/appointments'
    });
  }

  /**
   * Send appointment accepted notification to patient
   */
  async sendAppointmentAccepted({ appointmentId, patient, doctor, appointmentDate, appointmentTime, consultationFee, paymentLink }) {
    return this.send({
      userId: patient.id,
      userType: 'patient',
      type: 'appointment_accepted',
      variables: {
        doctorName: doctor.name,
        date: appointmentDate,
        time: appointmentTime,
        amount: consultationFee,
        appointmentId
      },
      data: { appointmentId, paymentLink },
      actionUrl: paymentLink || `/appointments/${appointmentId}/pay`
    });
  }

  /**
   * Send appointment rejected notification to patient
   */
  async sendAppointmentRejected({ appointmentId, patient, doctor, appointmentDate, appointmentTime, reason }) {
    return this.send({
      userId: patient.id,
      userType: 'patient',
      type: 'appointment_rejected',
      variables: {
        doctorName: doctor.name,
        date: appointmentDate,
        time: appointmentTime,
        reason: reason,
        appointmentId
      },
      data: { appointmentId }
    });
  }

  /**
   * Send payment received notification to both patient and doctor
   */
  async sendPaymentReceived({ appointmentId, patient, doctor, appointmentDate, appointmentTime, meetingLink, amount }) {
    // Notify patient
    await this.send({
      userId: patient.id,
      userType: 'patient',
      type: 'payment_received',
      variables: {
        doctorName: doctor.name,
        date: appointmentDate,
        time: appointmentTime,
        amount: amount,
        appointmentId,
        meetingLink
      },
      data: { appointmentId, meetingLink },
      actionUrl: `/consultation/${appointmentId}`
    });

    // Notify doctor
    await this.send({
      userId: doctor.id,
      userType: 'doctor',
      type: 'payment_received',
      variables: {
        patientName: patient.name,
        date: appointmentDate,
        time: appointmentTime,
        amount: amount,
        appointmentId
      },
      data: { appointmentId }
    });

    return { success: true };
  }

  /**
   * Send consultation started notification
   */
  async sendConsultationStarted({ appointmentId, patient, doctor, meetingLink }) {
    // Notify patient
    await this.send({
      userId: patient.id,
      userType: 'patient',
      type: 'video_ready',
      variables: {
        doctorName: doctor.name,
        appointmentId,
        meetingLink
      },
      data: { appointmentId, meetingLink },
      actionUrl: meetingLink
    });

    // Notify doctor
    await this.send({
      userId: doctor.id,
      userType: 'doctor',
      type: 'video_ready',
      variables: {
        patientName: patient.name,
        appointmentId,
        meetingLink
      },
      data: { appointmentId, meetingLink },
      actionUrl: meetingLink
    });

    return { success: true };
  }

  /**
   * Send consultation completed notification
   */
  async sendConsultationCompleted({ appointmentId, patient, doctor, hasPrescription }) {
    return this.send({
      userId: patient.id,
      userType: 'patient',
      type: 'consultation_completed',
      variables: {
        doctorName: doctor.name,
        appointmentId,
        hasPrescription: hasPrescription ? 'Yes - check your prescriptions' : 'No'
      },
      data: { appointmentId, hasPrescription },
      actionUrl: `/appointments/${appointmentId}`
    });
  }
}

// Export singleton instance
const notificationService = new NotificationService();

const sendNotification = (payload) => notificationService.send(payload);

export { Notification, FCMToken, notificationService, sendNotification };
export default notificationService;
