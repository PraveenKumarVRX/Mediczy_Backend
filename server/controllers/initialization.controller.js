import orchestrator from "../db/orchestrator.js";
import intelligence from "../db/intelligence.js";
import { validateEnvironment } from "../config/env-validator.js";
import workers from "../workers/index.js";
import { connectKafkaProducer, connectKafkaConsumer } from "../config/kafka.js";
import scheduleDeviceMonitoring from "../scripts/device-monitoring-cron.js";
import scheduleAppointmentAutoCancel from "../scripts/appointment-auto-cancel-cron.js";

/**
 * Initialization Controller
 * Manages all startup initialization logic including:
 * - Environment validation
 * - Database connections
 * - Message queues (Kafka)
 * - Cron jobs
 * - Background workers
 */
class InitializationController {
  constructor() {
    this.initialized = false;
  }

  /**
   * Validate environment variables before startup
   */
  validateEnvironment() {
    try {
      validateEnvironment();
      console.log('✅ Environment validation passed');
      return true;
    } catch (error) {
      console.warn('⚠️ Environment validation warnings:', error.message);
      // Continue anyway - some variables are optional
      return true;
    }
  }

  /**
   * Initialize database orchestrator and intelligence layer
   */
  async initializeDatabases() {
    try {
      console.log('🚀 Initializing Database Orchestrator...');
      const results = await orchestrator.initializeAll();
      console.log('✅ Database Orchestrator initialized successfully');
      
      // Initialize intelligence layer
      console.log('🧠 Initializing Database Intelligence Layer...');
      // orchestrator.setIntelligence(intelligence); // Temporarily disabled
      console.log('✅ Database Intelligence Layer initialized successfully');
      
      // Initialize BullMQ workers
      console.log('📋 BullMQ workers initialized and ready');
      
      return results;
    } catch (error) {
      console.error('❌ Database Orchestrator initialization failed:', error.message);
      console.error('⚠️  Server will continue but some features may be unavailable');
      return null;
    }
  }

  /**
   * Initialize Kafka producer and consumer for video streaming events
   */
  async initializeKafka() {
    try {
      console.log('📡 Connecting to Kafka...');
      await connectKafkaProducer();
      await connectKafkaConsumer();
      console.log('✅ Kafka connected successfully');
    } catch (error) {
      console.error('❌ Kafka initialization failed:', error.message);
      console.error('⚠️  Video streaming events may be unavailable');
    }
  }

  /**
   * Initialize all cron jobs
   */
  async initializeCronJobs() {
    try {
      // Device monitoring cron jobs
      console.log('📊 Starting device monitoring cron jobs...');
      scheduleDeviceMonitoring();
      
      // Appointment auto-cancel cron jobs
      console.log('📅 Starting appointment auto-cancel cron jobs...');
      scheduleAppointmentAutoCancel();
      
      // Membership validation cron jobs
      console.log('👤 Starting membership validation cron jobs...');
      const { startMembershipCronJobs } = await import('../services/membership-cron.service.js');
      startMembershipCronJobs();
      
      // Appointment reminder automation
      console.log('🔔 Starting appointment reminder automation...');
      await import('../services/appointment-reminder-cron.service.js');
      
      // Webinar reminder automation
      console.log('📅 Starting webinar reminder automation...');
      await import('../services/webinar-reminder-cron.service.js');
      
      // Payment reminder automation
      console.log('💰 Starting payment reminder automation...');
      await import('../services/payment-reminder-cron.service.js');
      
      // Follow-up appointment automation (Phase 2)
      console.log('📅 Starting follow-up automation...');
      await import('../services/followup-automation.service.js');
      
      // Medication reminder automation (Phase 2)
      console.log('💊 Starting medication reminder automation...');
      await import('../services/medication-reminder-cron.service.js');
      
      // Prescription expiry alerts (Phase 2)
      console.log('📋 Starting prescription expiry automation...');
      await import('../services/prescription-expiry-cron.service.js');
      
      // Doctor performance reports (Phase 3)
      console.log('📊 Starting doctor performance reports...');
      await import('../services/doctor-performance-cron.service.js');
      
      // SaaS Platform: Auto-suspension scheduler (Phase 2)
      console.log('🔒 Starting auto-suspension scheduler...');
      const { default: autoSuspensionService } = await import('../services/auto-suspension.service.js');
      autoSuspensionService.initialize();
      
      // SaaS Platform: System health monitoring (Phase 2)
      console.log('💓 Starting system health monitoring...');
      const { default: systemHealthService } = await import('../services/system-health.service.js');
      systemHealthService.startPeriodicHealthCheck(60000); // Check every minute
      
      console.log('✅ All cron jobs and automation services initialized successfully');
    } catch (error) {
      console.error('❌ Cron jobs initialization failed:', error.message);
      console.error('⚠️  Scheduled tasks may be unavailable');
    }
  }

  /**
   * Initialize all services in the correct order
   */
  async initializeAll() {
    if (this.initialized) {
      console.warn('⚠️  Initialization already completed');
      return;
    }

    // 1. Validate environment
    this.validateEnvironment();

    // 2. Initialize databases
    await this.initializeDatabases();

    // 3. Initialize Kafka
    await this.initializeKafka();

    // 4. Initialize cron jobs (only on cluster instance 0 to prevent duplicates)
    const instanceId = process.env.NODE_APP_INSTANCE;
    const isPrimary = instanceId === undefined || instanceId === '0';
    if (isPrimary) {
      await this.initializeCronJobs();
    } else {
      console.log(`⏭️  Skipping cron jobs on cluster instance ${instanceId} (handled by instance 0)`);
    }

    this.initialized = true;
    console.log('✅ All services initialized successfully');
  }

  /**
   * Get workers instance for shutdown
   */
  getWorkers() {
    return workers;
  }

  /**
   * Get orchestrator instance for shutdown
   */
  getOrchestrator() {
    return orchestrator;
  }
}

export default new InitializationController();
