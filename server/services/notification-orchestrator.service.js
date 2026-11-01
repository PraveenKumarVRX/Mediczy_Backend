/**
 * Notification Automation Orchestrator
 * Integrates n8n, Firebase, Kafka, PostgreSQL and VectorDB
 * Provides unified API for automated notification workflows
 */

const axios = require('axios');
const { sequelize } = require('../config/database');
const { sendPushNotification } = require('../utils/firebase-admin');
const { kafkaProducer } = require('../config/kafka');
const { vectorDBService } = require('./vectordb.service');
const logger = require('../config/logger');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';

class NotificationOrchestrator {
    constructor() {
        this.initialized = false;
        this.n8nAvailable = false;
    }

    async initialize() {
        try {
            // Initialize VectorDB
            await vectorDBService.initialize();

            // Check n8n availability
            await this.checkN8NHealth();

            this.initialized = true;
            logger.info('Notification Orchestrator initialized');
            return true;
        } catch (error) {
            logger.error('Failed to initialize Notification Orchestrator:', error);
            return false;
        }
    }

    async checkN8NHealth() {
        try {
            const response = await axios.get(`${N8N_WEBHOOK_URL.replace('/webhook', '')}/healthz`, {
                timeout: 5000
            });
            this.n8nAvailable = response.status === 200;
        } catch (error) {
            this.n8nAvailable = false;
            logger.warn('n8n not available:', error.message);
        }
    }

    /**
     * Send automated notification with full stack integration
     */
    async sendNotification(options) {
        const {
            userId,
            userType = 'patient',
            notificationType,
            title,
            message,
            data = {},
            priority = 'medium',
            useN8N = true,
            useVectorDB = true
        } = options;

        const startTime = Date.now();
        const notificationId = require('uuid').v4();

        try {
            // Get optimal channels using VectorDB
            let channels = options.channels || ['push', 'in-app'];
            let optimalTime = null;

            if (useVectorDB) {
                const recommendedChannels = await vectorDBService.getRecommendedChannels(userId);
                channels = recommendedChannels.length ? recommendedChannels : channels;
                optimalTime = await vectorDBService.getOptimalNotificationTime(userId);
            }

            // Route to n8n workflow if available
            if (useN8N && this.n8nAvailable) {
                const workflowResult = await this.triggerN8NWorkflow(notificationType, {
                    notificationId,
                    userId,
                    userType,
                    title,
                    message,
                    channels,
                    priority,
                    data,
                    optimalTime
                });

                if (workflowResult.success) {
                    await this.logNotificationEvent(notificationId, {
                        userId,
                        userType,
                        notificationType,
                        channels,
                        status: 'n8n_triggered',
                        processingTimeMs: Date.now() - startTime
                    });

                    return {
                        success: true,
                        notificationId,
                        method: 'n8n',
                        workflow: workflowResult.workflow
                    };
                }
            }

            // Fallback to direct send
            const results = await this.sendDirectNotification({
                notificationId,
                userId,
                userType,
                title,
                message,
                channels,
                priority,
                data
            });

            await this.logNotificationEvent(notificationId, {
                userId,
                userType,
                notificationType,
                channels,
                status: 'sent',
                processingTimeMs: Date.now() - startTime
            });

            return {
                success: true,
                notificationId,
                method: 'direct',
                results
            };

        } catch (error) {
            logger.error('Error sending notification:', error);

            await this.logNotificationEvent(notificationId, {
                userId,
                userType,
                notificationType,
                channels: options.channels || ['push'],
                status: 'failed',
                processingTimeMs: Date.now() - startTime,
                errorMessage: error.message
            });

            return {
                success: false,
                notificationId,
                error: error.message
            };
        }
    }

    /**
     * Trigger n8n workflow
     */
    async triggerN8NWorkflow(workflowName, data) {
        try {
            const webhookUrl = `${N8N_WEBHOOK_URL}/${workflowName}`;
            
            const response = await axios.post(webhookUrl, {
                ...data,
                timestamp: new Date().toISOString(),
                source: 'notification-orchestrator'
            }, {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            });

            return {
                success: true,
                workflow: workflowName,
                data: response.data
            };
        } catch (error) {
            logger.warn(`n8n workflow ${workflowName} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notification directly (bypass n8n)
     */
    async sendDirectNotification(options) {
        const { notificationId, userId, userType, title, message, channels, priority, data } = options;
        const results = {};

        for (const channel of channels) {
            try {
                switch (channel) {
                    case 'push':
                        results.push = await this.sendPushNotification(userId, userType, { title, message, data });
                        break;
                    case 'in-app':
                        results.inApp = await this.saveInAppNotification(userId, userType, { title, message, data, priority });
                        break;
                    case 'email':
                        results.email = await this.sendEmailNotification(userId, { title, message, data });
                        break;
                    case 'sms':
                        results.sms = await this.sendSMSNotification(userId, { message });
                        break;
                    case 'whatsapp':
                        results.whatsapp = await this.sendWhatsAppNotification(userId, { message });
                        break;
                    case 'kafka':
                        results.kafka = await this.publishToKafka(notificationId, { userId, userType, title, message, data });
                        break;
                }
            } catch (error) {
                results[channel] = { success: false, error: error.message };
            }
        }

        return results;
    }

    async sendPushNotification(userId, userType, notification) {
        try {
            // Get FCM tokens for user
            const [tokens] = await sequelize.query(`
                SELECT token FROM fcm_tokens 
                WHERE user_id = :userId AND user_type = :userType AND is_active = true
            `, {
                replacements: { userId, userType }
            });

            if (!tokens.length) {
                return { success: false, reason: 'No FCM tokens' };
            }

            const results = await Promise.all(
                tokens.map(t => sendPushNotification(t.token, notification.title, notification.message, notification.data))
            );

            return { success: true, sentCount: results.filter(r => r).length };
        } catch (error) {
            logger.error('Push notification error:', error);
            return { success: false, error: error.message };
        }
    }

    async saveInAppNotification(userId, userType, notification) {
        try {
            await sequelize.query(`
                INSERT INTO notifications (user_id, user_type, title, message, data, priority, is_read, created_at)
                VALUES (:userId, :userType, :title, :message, :data, :priority, false, NOW())
            `, {
                replacements: {
                    userId,
                    userType,
                    title: notification.title,
                    message: notification.message,
                    data: JSON.stringify(notification.data || {}),
                    priority: notification.priority || 'medium'
                }
            });

            return { success: true };
        } catch (error) {
            logger.error('In-app notification error:', error);
            return { success: false, error: error.message };
        }
    }

    async sendEmailNotification(userId, notification) {
        // Use email queue
        try {
            const { emailQueue } = require('../config/queues');
            await emailQueue.add('sendNotificationEmail', {
                userId,
                subject: notification.title,
                message: notification.message,
                data: notification.data
            });
            return { success: true, queued: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async sendSMSNotification(userId, notification) {
        // Placeholder for SMS integration
        logger.info(`SMS notification queued for user ${userId}`);
        return { success: true, queued: true };
    }

    async sendWhatsAppNotification(userId, notification) {
        // Placeholder for WhatsApp integration
        logger.info(`WhatsApp notification queued for user ${userId}`);
        return { success: true, queued: true };
    }

    async publishToKafka(notificationId, data) {
        if (!kafkaProducer) {
            return { success: false, reason: 'Kafka not available' };
        }

        try {
            await kafkaProducer.send({
                topic: 'notification-events',
                messages: [{
                    key: notificationId,
                    value: JSON.stringify({
                        ...data,
                        notificationId,
                        timestamp: new Date().toISOString()
                    })
                }]
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Log notification event for analytics
     */
    async logNotificationEvent(notificationId, event) {
        try {
            // Log to PostgreSQL
            await sequelize.query(`
                INSERT INTO notification_events 
                (id, user_id, user_type, event_type, channel, status, processing_time_ms, error_message, created_at)
                VALUES (:id, :userId, :userType, :eventType, :channel, :status, :processingTimeMs, :errorMessage, NOW())
            `, {
                replacements: {
                    id: notificationId,
                    userId: event.userId,
                    userType: event.userType,
                    eventType: event.notificationType,
                    channel: event.channels.join(','),
                    status: event.status,
                    processingTimeMs: event.processingTimeMs,
                    errorMessage: event.errorMessage || null
                }
            });

            // Publish to Kafka for real-time streaming
            if (kafkaProducer) {
                await kafkaProducer.send({
                    topic: 'analytics-events',
                    messages: [{
                        key: 'notification_event',
                        value: JSON.stringify({
                            type: 'NOTIFICATION_EVENT',
                            ...event,
                            notificationId,
                            timestamp: new Date().toISOString()
                        })
                    }]
                });
            }
        } catch (error) {
            logger.error('Error logging notification event:', error);
        }
    }

    /**
     * Appointment notification triggers
     */
    async notifyAppointmentCreated(appointment) {
        return this.sendNotification({
            userId: appointment.doctorId,
            userType: 'doctor',
            notificationType: 'appointment-created',
            title: 'New Appointment Request',
            message: `New appointment request from ${appointment.patientName}`,
            data: { appointmentId: appointment.id },
            channels: ['push', 'in-app', 'kafka'],
            priority: 'high'
        });
    }

    async notifyAppointmentConfirmed(appointment) {
        return this.sendNotification({
            userId: appointment.patientId,
            userType: 'patient',
            notificationType: 'appointment-confirmed',
            title: 'Appointment Confirmed ✓',
            message: `Your appointment with Dr. ${appointment.doctorName} is confirmed for ${appointment.dateTime}`,
            data: { appointmentId: appointment.id },
            channels: ['push', 'email', 'sms', 'in-app'],
            priority: 'high'
        });
    }

    async notifyAppointmentReminder(appointment, reminderType = '1hour') {
        const message = reminderType === '1hour'
            ? `Your appointment with Dr. ${appointment.doctorName} starts in 1 hour`
            : `Reminder: You have an appointment with Dr. ${appointment.doctorName} tomorrow`;

        return this.sendNotification({
            userId: appointment.patientId,
            userType: 'patient',
            notificationType: 'appointment-reminder',
            title: '⏰ Appointment Reminder',
            message,
            data: { appointmentId: appointment.id, reminderType },
            channels: ['push', 'sms', 'whatsapp', 'in-app'],
            priority: reminderType === '1hour' ? 'critical' : 'high'
        });
    }

    /**
     * Payment notification triggers
     */
    async notifyPaymentSuccess(payment) {
        // Notify patient
        await this.sendNotification({
            userId: payment.patientId,
            userType: 'patient',
            notificationType: 'payment-success',
            title: 'Payment Successful ✅',
            message: `Payment of ₹${payment.amount} received. Your consultation is confirmed.`,
            data: { paymentId: payment.id, amount: payment.amount },
            channels: ['push', 'email', 'sms', 'in-app'],
            priority: 'high'
        });

        // Notify doctor
        await this.sendNotification({
            userId: payment.doctorId,
            userType: 'doctor',
            notificationType: 'payment-received',
            title: 'Payment Received',
            message: `Payment of ₹${payment.amount} received for appointment with ${payment.patientName}`,
            data: { paymentId: payment.id },
            channels: ['push', 'in-app'],
            priority: 'medium'
        });
    }

    async notifyPaymentFailed(payment) {
        return this.sendNotification({
            userId: payment.patientId,
            userType: 'patient',
            notificationType: 'payment-failed',
            title: 'Payment Failed ❌',
            message: `Payment of ₹${payment.amount} failed. Please try again.`,
            data: { paymentId: payment.id, amount: payment.amount },
            channels: ['push', 'email', 'in-app'],
            priority: 'high'
        });
    }

    /**
     * Consultation notification triggers
     */
    async notifyConsultationStarted(consultation) {
        return this.sendNotification({
            userId: consultation.patientId,
            userType: 'patient',
            notificationType: 'consultation-started',
            title: '🩺 Doctor is Ready!',
            message: `Dr. ${consultation.doctorName} is ready for your consultation. Click to join now!`,
            data: { 
                appointmentId: consultation.appointmentId,
                joinUrl: consultation.joinUrl 
            },
            channels: ['push', 'sms', 'whatsapp', 'in-app'],
            priority: 'critical'
        });
    }

    async notifyConsultationEnded(consultation) {
        return this.sendNotification({
            userId: consultation.patientId,
            userType: 'patient',
            notificationType: 'consultation-ended',
            title: 'Consultation Completed',
            message: 'Your consultation has ended. Please rate your experience.',
            data: { appointmentId: consultation.appointmentId },
            channels: ['push', 'in-app'],
            priority: 'medium'
        });
    }

    /**
     * Get notification analytics
     */
    async getAnalytics(options = {}) {
        const [notificationStats] = await sequelize.query(`
            SELECT 
                DATE_TRUNC('day', created_at) as date,
                status,
                COUNT(*) as count,
                AVG(processing_time_ms) as avg_time
            FROM notification_events
            WHERE created_at >= NOW() - INTERVAL '7 days'
            GROUP BY DATE_TRUNC('day', created_at), status
            ORDER BY date DESC
        `);

        return {
            postgres: notificationStats,
            vectordb: vectorDBService.getStatus()
        };
    }

    getStatus() {
        return {
            initialized: this.initialized,
            n8nAvailable: this.n8nAvailable,
            vectordb: vectorDBService.getStatus()
        };
    }
}

// Export singleton
const notificationOrchestrator = new NotificationOrchestrator();

module.exports = {
    NotificationOrchestrator,
    notificationOrchestrator
};
