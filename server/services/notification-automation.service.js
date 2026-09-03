/**
 * Notification Automation Service
 * Integrates: n8n, Firebase, Kafka, PostgreSQL, DuckDB, VectorDB
 * 
 * Flow:
 * 1. Event triggers (appointment, payment, etc.)
 * 2. Kafka publishes event
 * 3. n8n orchestrates workflow
 * 4. Firebase sends push notifications
 * 5. PostgreSQL stores notification record
 * 6. DuckDB logs analytics
 * 7. VectorDB enables intelligent routing
 *
 * DANGER — DB-RDS-PLAN-2026-09-01 Workstream A-07: this file calls
 * .sync({ alter: true }) on two models, mutating production schema
 * every time it runs. Confirmed (2026-09-03) this file has zero
 * importers anywhere in the codebase — dead code, not part of the live
 * startup path. Keep it that way: do not wire this into a live
 * route/cron without replacing sync({alter:true}) with a real
 * migration first.
 */

import { publishEvent, KAFKA_TOPICS, kafkaConsumer } from '../config/kafka.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { sendPushNotification, sendAppointmentNotification } from '../utils/firebase-admin.js';
import n8nService from './n8n.service.js';
import notificationService from './notification.service.js';
import { DataTypes, Op } from 'sequelize';

// ============================================
// NOTIFICATION ANALYTICS MODEL (DuckDB-ready)
// ============================================
const NotificationAnalytics = postgresSequelize.define('NotificationAnalytics', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  notificationId: DataTypes.INTEGER,
  userId: DataTypes.INTEGER,
  userType: DataTypes.STRING(20),
  notificationType: DataTypes.STRING(50),
  channel: DataTypes.STRING(20), // push, email, sms, whatsapp
  status: DataTypes.STRING(20),  // sent, delivered, read, failed
  sentAt: DataTypes.DATE,
  deliveredAt: DataTypes.DATE,
  readAt: DataTypes.DATE,
  responseTime: DataTypes.INTEGER, // milliseconds
  metadata: DataTypes.JSON
}, {
  timestamps: true,
  tableName: 'notification_analytics'
});

// ============================================
// USER NOTIFICATION PREFERENCES (VectorDB routing)
// ============================================
const NotificationPreference = postgresSequelize.define('NotificationPreference', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userType: DataTypes.STRING(20),
  preferredChannels: {
    type: DataTypes.JSON,
    defaultValue: ['push', 'email']
  },
  quietHoursStart: DataTypes.TIME,
  quietHoursEnd: DataTypes.TIME,
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'Asia/Kolkata'
  },
  urgentOnly: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  categories: {
    type: DataTypes.JSON, // enabled notification categories
    defaultValue: ['appointment', 'payment', 'consultation', 'prescription']
  },
  embedding: {
    type: DataTypes.ARRAY(DataTypes.FLOAT), // Vector for intelligent routing
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'notification_preferences'
});

// ============================================
// NOTIFICATION AUTOMATION CLASS
// ============================================
class NotificationAutomationService {
  constructor() {
    this.kafkaEnabled = process.env.KAFKA_ENABLED === 'true';
    this.n8nEnabled = process.env.N8N_ENABLED !== 'false';
    this.initialized = false;
  }

  /**
   * Initialize the automation service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Sync models
      await NotificationAnalytics.sync({ alter: true });
      await NotificationPreference.sync({ alter: true });
      
      // Start Kafka consumer if enabled
      if (this.kafkaEnabled) {
        await this.startKafkaConsumer();
      }
      
      this.initialized = true;
      console.log('✅ Notification Automation Service initialized');
    } catch (error) {
      console.error('❌ Notification Automation init failed:', error.message);
    }
  }

  /**
   * Start Kafka consumer for notification events
   */
  async startKafkaConsumer() {
    if (!kafkaConsumer) return;

    try {
      await kafkaConsumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const event = JSON.parse(message.value.toString());
          await this.processKafkaEvent(topic, event);
        }
      });
      console.log('✅ Kafka notification consumer started');
    } catch (error) {
      console.error('❌ Kafka consumer error:', error.message);
    }
  }

  /**
   * Process Kafka event and trigger notification flow
   */
  async processKafkaEvent(topic, event) {
    console.log(`📨 Processing Kafka event: ${topic}`, event.type);

    switch (topic) {
      case KAFKA_TOPICS.APPOINTMENT_EVENTS:
        await this.handleAppointmentEvent(event);
        break;
      case KAFKA_TOPICS.NOTIFICATION_EVENTS:
        await this.handleNotificationEvent(event);
        break;
      case KAFKA_TOPICS.USER_EVENTS:
        await this.handleUserEvent(event);
        break;
      default:
        console.log(`Unhandled topic: ${topic}`);
    }
  }

  /**
   * Handle appointment events
   */
  async handleAppointmentEvent(event) {
    const { type, data } = event;

    const notificationMap = {
      'APPOINTMENT_CREATED': {
        template: 'appointment_request',
        recipients: [{ id: data.doctorId, type: 'doctor' }],
        n8nWorkflow: 'appointment-created'
      },
      'APPOINTMENT_ACCEPTED': {
        template: 'appointment_accepted',
        recipients: [{ id: data.patientId, type: 'patient' }],
        n8nWorkflow: 'appointment-accepted'
      },
      'APPOINTMENT_REJECTED': {
        template: 'appointment_rejected',
        recipients: [{ id: data.patientId, type: 'patient' }],
        n8nWorkflow: 'appointment-rejected'
      },
      'APPOINTMENT_REMINDER': {
        template: 'consultation_reminder',
        recipients: [
          { id: data.patientId, type: 'patient' },
          { id: data.doctorId, type: 'doctor' }
        ],
        n8nWorkflow: 'appointment-reminder'
      },
      'APPOINTMENT_STARTED': {
        template: 'consultation_starting',
        recipients: [{ id: data.patientId, type: 'patient' }],
        n8nWorkflow: 'consultation-started'
      }
    };

    const config = notificationMap[type];
    if (!config) return;

    for (const recipient of config.recipients) {
      await this.sendAutomatedNotification({
        userId: recipient.id,
        userType: recipient.type,
        template: config.template,
        data,
        n8nWorkflow: config.n8nWorkflow
      });
    }
  }

  /**
   * Handle notification events
   */
  async handleNotificationEvent(event) {
    const { userId, userType, type, title, message, data, channels } = event;
    
    await this.sendAutomatedNotification({
      userId,
      userType,
      template: type,
      title,
      message,
      data,
      channels
    });
  }

  /**
   * Handle user events (registration, profile update, etc.)
   */
  async handleUserEvent(event) {
    if (event.type === 'USER_REGISTERED') {
      await this.sendAutomatedNotification({
        userId: event.data.userId,
        userType: event.data.userType || 'patient',
        template: 'general',
        title: 'Welcome to Mediczy! 🎉',
        message: 'Your account has been created successfully. Start exploring healthcare services.',
        n8nWorkflow: 'user-welcome'
      });
    }
  }

  /**
   * Main notification automation method
   */
  async sendAutomatedNotification(params) {
    const {
      userId,
      userType,
      template,
      title,
      message,
      data = {},
      channels,
      n8nWorkflow
    } = params;

    const startTime = Date.now();

    try {
      // 1. Get user preferences (VectorDB-powered routing)
      const preferences = await this.getUserPreferences(userId, userType);
      
      // 2. Determine channels based on preferences and priority
      const effectiveChannels = channels || preferences.preferredChannels || ['push', 'in-app'];
      
      // 3. Check quiet hours
      if (this.isQuietHours(preferences) && data.priority !== 'urgent') {
        console.log(`⏰ Quiet hours active for user ${userId}, queueing notification`);
        await this.queueDelayedNotification(params, preferences.quietHoursEnd);
        return { queued: true };
      }

      // 4. Send notification via NotificationService
      const notification = await notificationService.send({
        userId,
        userType,
        type: template,
        title,
        message,
        data,
        channels: effectiveChannels
      });

      // 5. Trigger n8n workflow for external integrations (fire-and-forget)
      if (this.n8nEnabled && n8nWorkflow) {
        n8nService.trigger(n8nWorkflow, {
          notification,
          userId,
          userType,
          template,
          data,
          channels: effectiveChannels,
          timestamp: new Date().toISOString()
        }).catch((n8nError) => {
          console.error('Failed to trigger n8n notification workflow:', n8nError);
        });
      }

      // 6. Publish to Kafka for downstream processing
      if (this.kafkaEnabled) {
        await publishEvent(KAFKA_TOPICS.ANALYTICS_EVENTS, {
          type: 'NOTIFICATION_SENT',
          timestamp: new Date().toISOString(),
          data: {
            notificationId: notification?.id,
            userId,
            userType,
            template,
            channels: effectiveChannels,
            responseTime: Date.now() - startTime
          }
        });
      }

      // 7. Log analytics (DuckDB-ready)
      await this.logAnalytics({
        notificationId: notification?.id,
        userId,
        userType,
        notificationType: template,
        channels: effectiveChannels,
        status: 'sent',
        responseTime: Date.now() - startTime,
        metadata: data
      });

      console.log(`✅ Notification sent to ${userType}:${userId} via ${effectiveChannels.join(', ')}`);
      return { success: true, notification };

    } catch (error) {
      console.error(`❌ Notification automation failed:`, error.message);
      
      // Log failure analytics
      await this.logAnalytics({
        userId,
        userType,
        notificationType: template,
        status: 'failed',
        responseTime: Date.now() - startTime,
        metadata: { error: error.message }
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Get user notification preferences with vector search
   */
  async getUserPreferences(userId, userType) {
    try {
      let preferences = await NotificationPreference.findOne({
        where: { userId, userType }
      });

      if (!preferences) {
        // Create default preferences
        preferences = await NotificationPreference.create({
          userId,
          userType,
          preferredChannels: ['push', 'email', 'in-app'],
          categories: ['appointment', 'payment', 'consultation', 'prescription']
        });
      }

      return preferences;
    } catch (error) {
      console.error('Error getting preferences:', error.message);
      return {
        preferredChannels: ['push', 'in-app'],
        categories: ['appointment', 'payment', 'consultation', 'prescription']
      };
    }
  }

  /**
   * Check if current time is within user's quiet hours
   */
  isQuietHours(preferences) {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) return false;

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: preferences.timezone || 'Asia/Kolkata' 
    });

    return currentTime >= preferences.quietHoursStart && 
           currentTime <= preferences.quietHoursEnd;
  }

  /**
   * Queue notification for delayed delivery
   */
  async queueDelayedNotification(params, deliveryTime) {
    // Use BullMQ for delayed jobs
    const { queues } = await import('../config/queues.js');
    
    await queues.notifications.add('delayed-notification', params, {
      delay: this.calculateDelay(deliveryTime),
      attempts: 3
    });
  }

  /**
   * Calculate delay until delivery time
   */
  calculateDelay(deliveryTime) {
    const now = new Date();
    const [hours, minutes] = deliveryTime.split(':').map(Number);
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    
    return target.getTime() - now.getTime();
  }

  /**
   * Log notification analytics (DuckDB-ready format)
   */
  async logAnalytics(data) {
    try {
      // Store in PostgreSQL (can be synced to DuckDB)
      await NotificationAnalytics.create({
        notificationId: data.notificationId,
        userId: data.userId,
        userType: data.userType,
        notificationType: data.notificationType,
        channel: Array.isArray(data.channels) ? data.channels[0] : data.channels,
        status: data.status,
        sentAt: new Date(),
        responseTime: data.responseTime,
        metadata: data.metadata
      });

      // Publish to Kafka for DuckDB ingestion
      if (this.kafkaEnabled) {
        await publishEvent(KAFKA_TOPICS.ANALYTICS_EVENTS, {
          type: 'NOTIFICATION_ANALYTICS',
          timestamp: new Date().toISOString(),
          data
        });
      }
    } catch (error) {
      console.error('Analytics logging failed:', error.message);
    }
  }

  /**
   * Trigger appointment notification flow
   */
  async triggerAppointmentNotification(appointmentData, eventType) {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: appointmentData
    };

    // Publish to Kafka
    if (this.kafkaEnabled) {
      await publishEvent(KAFKA_TOPICS.APPOINTMENT_EVENTS, event);
    }

    // Also handle directly for immediate delivery
    await this.handleAppointmentEvent(event);

    return { success: true };
  }

  /**
   * Trigger payment notification flow
   */
  async triggerPaymentNotification(paymentData, status) {
    const templateMap = {
      'success': 'payment_received',
      'failed': 'payment_failed',
      'pending': 'payment_pending'
    };

    await this.sendAutomatedNotification({
      userId: paymentData.patientId,
      userType: 'patient',
      template: templateMap[status],
      data: paymentData,
      n8nWorkflow: `payment-${status}`
    });

    // Notify doctor on successful payment
    if (status === 'success') {
      await this.sendAutomatedNotification({
        userId: paymentData.doctorId,
        userType: 'doctor',
        template: 'payment_received',
        title: 'Payment Received',
        message: `Payment of ₹${paymentData.amount} received for appointment`,
        data: paymentData
      });
    }
  }

  /**
   * Get notification analytics summary
   */
  async getAnalyticsSummary(filters = {}) {
    const { startDate, endDate, userType, channel } = filters;

    const where = {};
    if (startDate) where.createdAt = { [Op.gte]: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, [Op.lte]: endDate };
    if (userType) where.userType = userType;
    if (channel) where.channel = channel;

    const [results] = await postgresSequelize.query(`
      SELECT 
        notification_type as "notificationType",
        channel,
        status,
        COUNT(*) as count,
        AVG(response_time) as "avgResponseTime"
      FROM notification_analytics
      WHERE created_at >= :startDate AND created_at <= :endDate
      GROUP BY notification_type, channel, status
      ORDER BY count DESC
    `, {
      replacements: {
        startDate: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: endDate || new Date()
      }
    });

    return results;
  }
}

// Export singleton instance
const notificationAutomation = new NotificationAutomationService();
export default notificationAutomation;
export { NotificationAnalytics, NotificationPreference };
