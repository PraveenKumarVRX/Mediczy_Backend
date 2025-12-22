/**
 * 📦 BULLMQ INTEGRATION LAYER - Node.js Backend
 * Job queue management for background processing and task orchestration
 * Integrates with Kafka for event streaming and database operations
 */

const Queue = require('bullmq').Queue;
const Worker = require('bullmq').Worker;
const QueueScheduler = require('bullmq').QueueScheduler;
const { Redis } = require('ioredis');
const IntelligentDatabaseClient = require('../database_clients/intelligentDatabaseClient');

// Queue Configuration
const QUEUE_CONFIG = {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        maxRetriesPerRequest: 3,
        lazyConnect: true
    },
    defaultJobOptions: {
        removeOnComplete: 100,  // Keep last 100 completed jobs
        removeOnFail: 50,       // Keep last 50 failed jobs
        attempts: 3,            // Retry failed jobs 3 times
        backoff: {
            type: 'exponential',
            delay: 2000
        }
    }
};

// Queue Names
const QUEUE_NAMES = {
    PATIENT_PROCESSING: 'mediczy:patient-processing',
    AI_ANALYSIS: 'mediczy:ai-analysis', 
    APPOINTMENTS: 'mediczy:appointments',
    NOTIFICATIONS: 'mediczy:notifications',
    HEALTH_METRICS: 'mediczy:health-metrics',
    INSURANCE_CLAIMS: 'mediczy:insurance-claims',
    DATA_SYNC: 'mediczy:data-sync',
    ANALYTICS: 'mediczy:analytics',
    CLEANUP: 'mediczy:cleanup'
};

class MediczyQueueService {
    constructor() {
        this.redis = new Redis(QUEUE_CONFIG.connection);
        this.queues = {};
        this.workers = {};
        this.schedulers = {};
        this.dbClient = new IntelligentDatabaseClient();
        
        // Metrics tracking
        this.metrics = {
            jobsProcessed: 0,
            jobsFailed: 0,
            activeJobs: 0,
            queueSizes: {},
            lastActivity: null
        };

        this.initializeQueues();
        this.setupEventListeners();
        
        console.log('📦 Mediczy Queue Service initialized');
    }

    initializeQueues() {
        // Create queues
        Object.values(QUEUE_NAMES).forEach(queueName => {
            this.queues[queueName] = new Queue(queueName, QUEUE_CONFIG);
            this.schedulers[queueName] = new QueueScheduler(queueName, QUEUE_CONFIG);
        });

        // Initialize workers
        this.initializeWorkers();
    }

    initializeWorkers() {
        // Patient Processing Worker
        this.workers[QUEUE_NAMES.PATIENT_PROCESSING] = new Worker(
            QUEUE_NAMES.PATIENT_PROCESSING,
            this.processPatientJob.bind(this),
            QUEUE_CONFIG
        );

        // AI Analysis Worker
        this.workers[QUEUE_NAMES.AI_ANALYSIS] = new Worker(
            QUEUE_NAMES.AI_ANALYSIS,
            this.processAIAnalysisJob.bind(this),
            QUEUE_CONFIG
        );

        // Appointment Processing Worker
        this.workers[QUEUE_NAMES.APPOINTMENTS] = new Worker(
            QUEUE_NAMES.APPOINTMENTS,
            this.processAppointmentJob.bind(this),
            QUEUE_CONFIG
        );

        // Notification Worker
        this.workers[QUEUE_NAMES.NOTIFICATIONS] = new Worker(
            QUEUE_NAMES.NOTIFICATIONS,
            this.processNotificationJob.bind(this),
            QUEUE_CONFIG
        );

        // Health Metrics Worker
        this.workers[QUEUE_NAMES.HEALTH_METRICS] = new Worker(
            QUEUE_NAMES.HEALTH_METRICS,
            this.processHealthMetricsJob.bind(this),
            QUEUE_CONFIG
        );

        // Insurance Claims Worker
        this.workers[QUEUE_NAMES.INSURANCE_CLAIMS] = new Worker(
            QUEUE_NAMES.INSURANCE_CLAIMS,
            this.processInsuranceClaimJob.bind(this),
            QUEUE_CONFIG
        );

        // Data Sync Worker
        this.workers[QUEUE_NAMES.DATA_SYNC] = new Worker(
            QUEUE_NAMES.DATA_SYNC,
            this.processDataSyncJob.bind(this),
            QUEUE_CONFIG
        );

        // Analytics Worker
        this.workers[QUEUE_NAMES.ANALYTICS] = new Worker(
            QUEUE_NAMES.ANALYTICS,
            this.processAnalyticsJob.bind(this),
            QUEUE_CONFIG
        );

        // Cleanup Worker
        this.workers[QUEUE_NAMES.CLEANUP] = new Worker(
            QUEUE_NAMES.CLEANUP,
            this.processCleanupJob.bind(this),
            QUEUE_CONFIG
        );
    }

    setupEventListeners() {
        // Global worker event listeners
        Object.values(this.workers).forEach(worker => {
            worker.on('completed', (job) => {
                this.metrics.jobsProcessed++;
                this.metrics.lastActivity = new Date().toISOString();
                console.log(`✅ Job ${job.id} completed in queue ${job.queueName}`);
            });

            worker.on('failed', (job, err) => {
                this.metrics.jobsFailed++;
                console.error(`❌ Job ${job.id} failed in queue ${job.queueName}:`, err.message);
            });

            worker.on('active', (job) => {
                this.metrics.activeJobs++;
                console.log(`🔄 Job ${job.id} started in queue ${job.queueName}`);
            });

            worker.on('stalled', (job) => {
                console.warn(`⏳ Job ${job.id} stalled in queue ${job.queueName}`);
            });
        });
    }

    // 👤 PATIENT PROCESSING JOBS

    async processPatientJob(job) {
        const { type, data } = job.data;
        
        try {
            switch (type) {
                case 'create_profile':
                    return await this.createPatientProfile(data);
                case 'update_profile':
                    return await this.updatePatientProfile(data);
                case 'sync_health_data':
                    return await this.syncPatientHealthData(data);
                case 'generate_insights':
                    return await this.generatePatientInsights(data);
                default:
                    throw new Error(`Unknown patient job type: ${type}`);
            }
        } catch (error) {
            console.error(`❌ Patient job processing failed:`, error);
            throw error;
        }
    }

    async createPatientProfile(data) {
        // Create comprehensive patient profile with intelligent analysis
        const result = await this.dbClient.createPatientProfile({
            ...data,
            created_via: 'background_job',
            enhanced_profile: true
        });

        // Trigger welcome workflow
        await this.addNotificationJob({
            type: 'welcome_patient',
            patient_id: result.patient_id,
            template: 'patient_welcome'
        });

        return result;
    }

    async updatePatientProfile(data) {
        const result = await this.dbClient.updatePatientProfile(data.patient_id, data.updates);
        
        // If critical health info changed, trigger health analysis
        if (data.updates.medical_conditions || data.updates.medications) {
            await this.addAIAnalysisJob({
                type: 'health_risk_assessment',
                patient_id: data.patient_id,
                trigger: 'profile_update'
            });
        }

        return result;
    }

    // 🤖 AI ANALYSIS JOBS

    async processAIAnalysisJob(job) {
        const { type, data } = job.data;
        
        try {
            switch (type) {
                case 'symptom_analysis':
                    return await this.analyzeSymptoms(data);
                case 'health_risk_assessment':
                    return await this.assessHealthRisks(data);
                case 'treatment_recommendations':
                    return await this.generateTreatmentRecommendations(data);
                case 'drug_interaction_check':
                    return await this.checkDrugInteractions(data);
                default:
                    throw new Error(`Unknown AI analysis job type: ${type}`);
            }
        } catch (error) {
            console.error(`❌ AI analysis job failed:`, error);
            throw error;
        }
    }

    async analyzeSymptoms(data) {
        const analysis = await this.dbClient.analyzeMedicalQuery({
            query: data.symptoms,
            patient_id: data.patient_id,
            context: data.context || {},
            analysis_type: 'comprehensive'
        });

        // If urgent, trigger immediate notification
        if (analysis.urgency_level === 'emergency') {
            await this.addNotificationJob({
                type: 'emergency_alert',
                patient_id: data.patient_id,
                analysis_result: analysis,
                priority: 'critical'
            });
        }

        return analysis;
    }

    // 📅 APPOINTMENT PROCESSING JOBS

    async processAppointmentJob(job) {
        const { type, data } = job.data;
        
        try {
            switch (type) {
                case 'schedule_appointment':
                    return await this.scheduleAppointment(data);
                case 'send_reminders':
                    return await this.sendAppointmentReminders(data);
                case 'process_cancellation':
                    return await this.processAppointmentCancellation(data);
                case 'generate_follow_up':
                    return await this.generateFollowUpAppointment(data);
                default:
                    throw new Error(`Unknown appointment job type: ${type}`);
            }
        } catch (error) {
            console.error(`❌ Appointment job failed:`, error);
            throw error;
        }
    }

    async scheduleAppointment(data) {
        const appointment = await this.dbClient.scheduleAppointment({
            ...data,
            status: 'scheduled',
            created_via: 'background_job'
        });

        // Schedule reminder notifications
        const reminderTimes = ['24h', '2h', '30min'];
        for (const time of reminderTimes) {
            await this.scheduleJob(
                QUEUE_NAMES.NOTIFICATIONS,
                {
                    type: 'appointment_reminder',
                    appointment_id: appointment.appointment_id,
                    reminder_type: time
                },
                { delay: this.calculateReminderDelay(appointment.appointment_time, time) }
            );
        }

        return appointment;
    }

    // 📱 NOTIFICATION JOBS

    async processNotificationJob(job) {
        const { type, data } = job.data;
        
        try {
            switch (type) {
                case 'send_sms':
                    return await this.sendSMS(data);
                case 'send_email':
                    return await this.sendEmail(data);
                case 'send_push_notification':
                    return await this.sendPushNotification(data);
                case 'appointment_reminder':
                    return await this.sendAppointmentReminder(data);
                case 'health_alert':
                    return await this.sendHealthAlert(data);
                default:
                    throw new Error(`Unknown notification job type: ${type}`);
            }
        } catch (error) {
            console.error(`❌ Notification job failed:`, error);
            throw error;
        }
    }

    async sendSMS(data) {
        // Integration with SMS service (Twilio, etc.)
        console.log(`📱 Sending SMS to ${data.phone}: ${data.message}`);
        
        // Record notification in database
        await this.dbClient.recordNotification({
            type: 'sms',
            recipient_id: data.recipient_id,
            content: data.message,
            status: 'sent',
            sent_at: new Date().toISOString()
        });
        
        return { status: 'sent', method: 'sms' };
    }

    // 📊 HEALTH METRICS JOBS

    async processHealthMetricsJob(job) {
        const { type, data } = job.data;
        
        try {
            switch (type) {
                case 'analyze_trends':
                    return await this.analyzeHealthTrends(data);
                case 'detect_anomalies':
                    return await this.detectHealthAnomalies(data);
                case 'generate_reports':
                    return await this.generateHealthReports(data);
                default:
                    throw new Error(`Unknown health metrics job type: ${type}`);
            }
        } catch (error) {
            console.error(`❌ Health metrics job failed:`, error);
            throw error;
        }
    }

    // 🔄 DATA SYNCHRONIZATION JOBS

    async processDataSyncJob(job) {
        const { type, data } = job.data;
        
        try {
            switch (type) {
                case 'sync_patient_data':
                    return await this.syncPatientDataAcrossServices(data);
                case 'backup_critical_data':
                    return await this.backupCriticalData(data);
                case 'sync_with_external_systems':
                    return await this.syncWithExternalSystems(data);
                default:
                    throw new Error(`Unknown data sync job type: ${type}`);
            }
        } catch (error) {
            console.error(`❌ Data sync job failed:`, error);
            throw error;
        }
    }

    // 🎯 PUBLIC API METHODS FOR ADDING JOBS

    async addPatientJob(type, data, options = {}) {
        return this.addJob(QUEUE_NAMES.PATIENT_PROCESSING, { type, data }, options);
    }

    async addAIAnalysisJob(type, data, options = {}) {
        return this.addJob(QUEUE_NAMES.AI_ANALYSIS, { type, data }, options);
    }

    async addAppointmentJob(type, data, options = {}) {
        return this.addJob(QUEUE_NAMES.APPOINTMENTS, { type, data }, options);
    }

    async addNotificationJob(type, data, options = {}) {
        return this.addJob(QUEUE_NAMES.NOTIFICATIONS, { type, data }, options);
    }

    async addHealthMetricsJob(type, data, options = {}) {
        return this.addJob(QUEUE_NAMES.HEALTH_METRICS, { type, data }, options);
    }

    async addDataSyncJob(type, data, options = {}) {
        return this.addJob(QUEUE_NAMES.DATA_SYNC, { type, data }, options);
    }

    async addJob(queueName, jobData, options = {}) {
        try {
            const queue = this.queues[queueName];
            if (!queue) {
                throw new Error(`Queue ${queueName} not found`);
            }

            const job = await queue.add(
                jobData.type || 'default',
                jobData,
                {
                    ...QUEUE_CONFIG.defaultJobOptions,
                    ...options
                }
            );

            console.log(`📦 Job ${job.id} added to queue ${queueName}`);
            return job;

        } catch (error) {
            console.error(`❌ Failed to add job to ${queueName}:`, error);
            throw error;
        }
    }

    async scheduleJob(queueName, jobData, scheduleOptions) {
        return this.addJob(queueName, jobData, scheduleOptions);
    }

    // 📊 MONITORING AND METRICS

    async getQueueMetrics() {
        const metrics = {};
        
        for (const [name, queue] of Object.entries(this.queues)) {
            try {
                const waiting = await queue.getWaiting();
                const active = await queue.getActive();
                const completed = await queue.getCompleted();
                const failed = await queue.getFailed();

                metrics[name] = {
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length
                };
            } catch (error) {
                metrics[name] = { error: error.message };
            }
        }

        return {
            ...this.metrics,
            queues: metrics,
            timestamp: new Date().toISOString()
        };
    }

    async healthCheck() {
        try {
            await this.redis.ping();
            const metrics = await this.getQueueMetrics();
            
            return {
                status: 'healthy',
                redis_connection: 'connected',
                active_workers: Object.keys(this.workers).length,
                metrics
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    // 🛠️ UTILITY METHODS

    calculateReminderDelay(appointmentTime, reminderType) {
        const appointment = new Date(appointmentTime);
        const now = new Date();
        
        const delays = {
            '24h': 24 * 60 * 60 * 1000,
            '2h': 2 * 60 * 60 * 1000,
            '30min': 30 * 60 * 1000
        };
        
        const reminderTime = new Date(appointment.getTime() - delays[reminderType]);
        return Math.max(0, reminderTime.getTime() - now.getTime());
    }

    async gracefulShutdown() {
        console.log('📦 Shutting down queue service...');
        
        // Close workers
        await Promise.all(Object.values(this.workers).map(worker => worker.close()));
        
        // Close schedulers
        await Promise.all(Object.values(this.schedulers).map(scheduler => scheduler.close()));
        
        // Close Redis connection
        await this.redis.quit();
        
        console.log('✅ Queue service shutdown complete');
    }
}

module.exports = MediczyQueueService;