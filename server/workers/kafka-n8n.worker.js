/**
 * Kafka-n8n Notification Worker
 * Consumes Kafka events and triggers n8n workflows for automated notifications
 * Integrates: Kafka → n8n → Firebase/PostgreSQL/DuckDB/VectorDB
 */

import { Kafka } from 'kafkajs';
import axios from 'axios';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { DataTypes } from 'sequelize';
import logger from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Environment configuration
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';
const KAFKA_ENABLED = process.env.KAFKA_ENABLED === 'true';

// Notification Analytics Model for DuckDB-style analytics
const NotificationEvent = sequelize.define('NotificationEvent', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    eventType: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: true
    },
    userType: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    channel: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    status: {
        type: DataTypes.STRING(50),
        defaultValue: 'triggered'
    },
    workflowName: {
        type: DataTypes.STRING(100)
    },
    kafkaTopic: {
        type: DataTypes.STRING(100)
    },
    kafkaPartition: {
        type: DataTypes.INTEGER
    },
    kafkaOffset: {
        type: DataTypes.STRING(50)
    },
    payload: {
        type: DataTypes.JSONB
    },
    responseData: {
        type: DataTypes.JSONB
    },
    processingTimeMs: {
        type: DataTypes.INTEGER
    },
    errorMessage: {
        type: DataTypes.TEXT
    }
}, {
    tableName: 'notification_events',
    timestamps: true,
    indexes: [
        { fields: ['userId'] },
        { fields: ['eventType'] },
        { fields: ['status'] },
        { fields: ['kafkaTopic'] },
        { fields: ['createdAt'] }
    ]
});

// User Notification Preferences with VectorDB support
const UserNotificationPreference = sequelize.define('UserNotificationPreference', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
    },
    userType: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    // Channel preferences
    pushEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    emailEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    smsEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    whatsappEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    inAppEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Timing preferences
    quietHoursStart: { type: DataTypes.TIME, defaultValue: '22:00' },
    quietHoursEnd: { type: DataTypes.TIME, defaultValue: '07:00' },
    timezone: { type: DataTypes.STRING(50), defaultValue: 'Asia/Kolkata' },
    // Event type preferences
    appointmentNotifications: { type: DataTypes.BOOLEAN, defaultValue: true },
    paymentNotifications: { type: DataTypes.BOOLEAN, defaultValue: true },
    reminderNotifications: { type: DataTypes.BOOLEAN, defaultValue: true },
    marketingNotifications: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
    tableName: 'user_notification_preferences',
    timestamps: true
});

// Kafka topic to n8n workflow mapping
const TOPIC_WORKFLOW_MAP = {
    'appointment-events': {
        'appointment.created': 'appointment-created',
        'appointment.confirmed': 'appointment-confirmed',
        'appointment.cancelled': 'appointment-cancelled',
        'appointment.rescheduled': 'appointment-rescheduled',
        'appointment.reminder': 'appointment-reminder'
    },
    'payment-events': {
        'payment.success': 'payment-notification',
        'payment.failed': 'payment-failed',
        'payment.refund': 'payment-refund'
    },
    'video-stream-start': {
        'consultation.started': 'consultation-started'
    },
    'video-stream-end': {
        'consultation.ended': 'consultation-ended'
    },
    'doctor-events': {
        'doctor.online': 'doctor-online',
        'doctor.offline': 'doctor-offline'
    },
    'user-events': {
        'user.registered': 'user-welcome',
        'user.verified': 'user-verified'
    },
    'notification-events': {
        'notification.send': 'notification-direct'
    }
};

class KafkaN8NWorker {
    constructor() {
        this.kafka = null;
        this.consumer = null;
        this.producer = null;
        this.isRunning = false;
        this.processedCount = 0;
        this.errorCount = 0;
    }

    async initialize() {
        if (!KAFKA_ENABLED) {
            logger.info('Kafka is disabled, notification worker not starting');
            return false;
        }

        try {
            // Sync models
            await NotificationEvent.sync({ alter: true });
            await UserNotificationPreference.sync({ alter: true });

            // Initialize Kafka
            this.kafka = new Kafka({
                clientId: 'mediczy-notification-worker',
                brokers: KAFKA_BROKERS,
                retry: {
                    initialRetryTime: 100,
                    retries: 8
                }
            });

            this.consumer = this.kafka.consumer({
                groupId: 'mediczy-notification-group',
                sessionTimeout: 30000,
                heartbeatInterval: 3000
            });

            this.producer = this.kafka.producer();

            await this.consumer.connect();
            await this.producer.connect();

            logger.info('Kafka-n8n notification worker initialized successfully');
            return true;
        } catch (error) {
            logger.error('Failed to initialize Kafka-n8n worker:', error);
            return false;
        }
    }

    async start() {
        if (!this.consumer) {
            logger.warn('Consumer not initialized, cannot start worker');
            return;
        }

        // Subscribe to notification-related topics
        const topics = [
            'appointment-events',
            'payment-events',
            'video-stream-start',
            'video-stream-end',
            'doctor-events',
            'user-events',
            'notification-events'
        ];

        for (const topic of topics) {
            try {
                await this.consumer.subscribe({ topic, fromBeginning: false });
                logger.info(`Subscribed to Kafka topic: ${topic}`);
            } catch (error) {
                logger.warn(`Could not subscribe to topic ${topic}:`, error.message);
            }
        }

        this.isRunning = true;

        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                await this.processMessage(topic, partition, message);
            }
        });

        logger.info('Kafka-n8n notification worker started, listening for events...');
    }

    async processMessage(topic, partition, message) {
        const startTime = Date.now();
        let eventData = null;

        try {
            const messageValue = message.value.toString();
            eventData = JSON.parse(messageValue);

            logger.debug(`Processing message from ${topic}:`, {
                partition,
                offset: message.offset,
                eventType: eventData.type || eventData.eventType
            });

            // Get user preferences if userId exists
            const userId = eventData.userId || eventData.patientId || eventData.doctorId;
            const preferences = userId ? await this.getUserPreferences(userId) : null;

            // Check if user has notifications enabled for this event type
            if (!this.shouldSendNotification(eventData, preferences)) {
                logger.info(`Notification skipped for user ${userId} based on preferences`);
                return;
            }

            // Get the appropriate n8n workflow
            const eventType = eventData.type || eventData.eventType || 'default';
            const workflowMap = TOPIC_WORKFLOW_MAP[topic] || {};
            const workflowName = workflowMap[eventType] || this.getDefaultWorkflow(topic);

            if (!workflowName) {
                logger.warn(`No workflow mapped for topic ${topic}, event type ${eventType}`);
                return;
            }

            // Determine notification channels based on preferences
            const channels = this.determineChannels(eventData, preferences);

            // Trigger n8n workflow
            const response = await this.triggerN8NWorkflow(workflowName, {
                ...eventData,
                channels,
                kafkaMetadata: {
                    topic,
                    partition,
                    offset: message.offset,
                    timestamp: message.timestamp
                }
            });

            const processingTimeMs = Date.now() - startTime;

            // Log event to PostgreSQL
            await this.logNotificationEvent({
                eventType,
                userId,
                userType: eventData.userType || 'patient',
                channel: channels.join(','),
                status: response.success ? 'sent' : 'failed',
                workflowName,
                kafkaTopic: topic,
                kafkaPartition: partition,
                kafkaOffset: message.offset,
                payload: eventData,
                responseData: response,
                processingTimeMs,
                errorMessage: response.error || null
            });

            // Publish analytics event
            await this.publishAnalyticsEvent({
                type: 'NOTIFICATION_PROCESSED',
                workflowName,
                processingTimeMs,
                success: response.success,
                channels
            });

            this.processedCount++;

        } catch (error) {
            this.errorCount++;
            logger.error('Error processing Kafka message:', {
                topic,
                partition,
                offset: message.offset,
                error: error.message
            });

            // Log failed event
            if (eventData) {
                await this.logNotificationEvent({
                    eventType: eventData.type || 'unknown',
                    userId: eventData.userId || eventData.patientId || null,
                    userType: eventData.userType || 'patient',
                    channel: 'unknown',
                    status: 'failed',
                    kafkaTopic: topic,
                    kafkaPartition: partition,
                    kafkaOffset: message.offset,
                    payload: eventData,
                    processingTimeMs: Date.now() - startTime,
                    errorMessage: error.message
                });
            }
        }
    }

    async getUserPreferences(userId) {
        try {
            let preference = await UserNotificationPreference.findOne({
                where: { userId }
            });

            if (!preference) {
                // Create default preferences
                preference = await UserNotificationPreference.create({
                    userId,
                    userType: 'patient'
                });
            }

            return preference;
        } catch (error) {
            logger.error('Error getting user preferences:', error);
            return null;
        }
    }

    shouldSendNotification(eventData, preferences) {
        if (!preferences) return true; // Default to sending if no preferences

        const eventType = eventData.type || eventData.eventType || '';

        // Check event type preferences
        if (eventType.includes('appointment') && !preferences.appointmentNotifications) {
            return false;
        }
        if (eventType.includes('payment') && !preferences.paymentNotifications) {
            return false;
        }
        if (eventType.includes('reminder') && !preferences.reminderNotifications) {
            return false;
        }
        if (eventType.includes('marketing') && !preferences.marketingNotifications) {
            return false;
        }

        // Check quiet hours
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            timeZone: preferences.timezone || 'Asia/Kolkata' 
        });
        
        if (preferences.quietHoursStart && preferences.quietHoursEnd) {
            if (this.isInQuietHours(currentTime, preferences.quietHoursStart, preferences.quietHoursEnd)) {
                // Allow critical notifications even during quiet hours
                if (!eventData.priority || eventData.priority !== 'critical') {
                    logger.info(`Notification delayed due to quiet hours for user ${preferences.userId}`);
                    return false;
                }
            }
        }

        return true;
    }

    isInQuietHours(currentTime, start, end) {
        const current = currentTime.replace(':', '');
        const startTime = start.replace(':', '');
        const endTime = end.replace(':', '');

        if (startTime > endTime) {
            // Quiet hours span midnight
            return current >= startTime || current <= endTime;
        }
        return current >= startTime && current <= endTime;
    }

    determineChannels(eventData, preferences) {
        const requestedChannels = eventData.channels || ['push', 'in-app'];
        const enabledChannels = [];

        if (!preferences) return requestedChannels;

        for (const channel of requestedChannels) {
            switch (channel) {
                case 'push':
                    if (preferences.pushEnabled) enabledChannels.push('push');
                    break;
                case 'email':
                    if (preferences.emailEnabled) enabledChannels.push('email');
                    break;
                case 'sms':
                    if (preferences.smsEnabled) enabledChannels.push('sms');
                    break;
                case 'whatsapp':
                    if (preferences.whatsappEnabled) enabledChannels.push('whatsapp');
                    break;
                case 'in-app':
                    if (preferences.inAppEnabled) enabledChannels.push('in-app');
                    break;
                default:
                    enabledChannels.push(channel);
            }
        }

        return enabledChannels.length > 0 ? enabledChannels : ['in-app'];
    }

    getDefaultWorkflow(topic) {
        const defaultWorkflows = {
            'appointment-events': 'appointment-created',
            'payment-events': 'payment-notification',
            'video-stream-start': 'consultation-started',
            'video-stream-end': 'consultation-ended',
            'doctor-events': 'doctor-status',
            'user-events': 'user-welcome',
            'notification-events': 'notification-direct'
        };
        return defaultWorkflows[topic];
    }

    async triggerN8NWorkflow(workflowName, data) {
        try {
            const webhookUrl = `${N8N_WEBHOOK_URL}/${workflowName}`;
            
            const response = await axios.post(webhookUrl, {
                data,
                timestamp: new Date().toISOString(),
                source: 'kafka-worker'
            }, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                data: response.data,
                statusCode: response.status
            };
        } catch (error) {
            logger.error(`Failed to trigger n8n workflow ${workflowName}:`, error.message);
            
            // If n8n is not available, send notification directly
            return await this.sendDirectNotification(workflowName, data);
        }
    }

    async sendDirectNotification(workflowName, data) {
        try {
            // Fallback to direct notification API
            const response = await axios.post('http://localhost:8000/api/notifications/send', {
                userId: data.userId || data.patientId || data.doctorId,
                userType: data.userType || 'patient',
                type: data.type || workflowName,
                title: data.title || 'Notification',
                message: data.message || 'You have a new notification',
                channels: data.channels || ['push', 'in-app'],
                metadata: data
            }, {
                timeout: 15000
            });

            return {
                success: true,
                data: response.data,
                fallback: true
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                fallback: true
            };
        }
    }

    async logNotificationEvent(eventData) {
        try {
            await NotificationEvent.create(eventData);
        } catch (error) {
            logger.error('Failed to log notification event:', error);
        }
    }

    async publishAnalyticsEvent(data) {
        if (!this.producer) return;

        try {
            await this.producer.send({
                topic: 'analytics-events',
                messages: [{
                    key: data.type,
                    value: JSON.stringify({
                        ...data,
                        timestamp: new Date().toISOString()
                    })
                }]
            });
        } catch (error) {
            logger.error('Failed to publish analytics event:', error);
        }
    }

    async getAnalytics(timeRange = '24h') {
        try {
            const analytics = {
                totalProcessed: this.processedCount,
                totalErrors: this.errorCount,
                successRate: this.processedCount > 0 
                    ? ((this.processedCount - this.errorCount) / this.processedCount * 100).toFixed(2) 
                    : 0
            };

            // Get from PostgreSQL
            const [results] = await sequelize.query(`
                SELECT 
                    event_type as "eventType",
                    status,
                    COUNT(*) as count,
                    AVG(processing_time_ms) as "avgProcessingTime"
                FROM notification_events
                WHERE created_at >= NOW() - INTERVAL '${timeRange === '24h' ? '24 hours' : '7 days'}'
                GROUP BY event_type, status
                ORDER BY count DESC
            `);

            analytics.byEventType = results;

            return analytics;
        } catch (error) {
            logger.error('Failed to get analytics:', error);
            return null;
        }
    }

    async stop() {
        this.isRunning = false;
        
        if (this.consumer) {
            await this.consumer.disconnect();
        }
        if (this.producer) {
            await this.producer.disconnect();
        }
        
        logger.info('Kafka-n8n notification worker stopped');
    }

    getStatus() {
        return {
            running: this.isRunning,
            processedCount: this.processedCount,
            errorCount: this.errorCount,
            kafkaConnected: !!this.consumer
        };
    }
}

// Export singleton instance
const worker = new KafkaN8NWorker();

export {
    KafkaN8NWorker,
    worker,
    NotificationEvent,
    UserNotificationPreference
};

export default worker;
