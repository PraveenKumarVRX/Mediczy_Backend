import orchestrator from "../db/orchestrator.js";
import intelligence from "../db/intelligence.js";
import { validateEnvironment } from "../config/env-validator.js";
import workers from "../workers/index.js";
import { connectKafkaProducer, connectKafkaConsumer, ensureTopics, KAFKA_TOPICS } from "../config/kafka.js";
import { initDuckDBEtl, runNightlyETL, startKafkaETLConsumer } from "../services/duckdb-etl.service.js";
import { startAllKafkaConsumers } from "../services/kafka-consumers.service.js";
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
    const kafkaDisabled =
      String(process.env.DISABLE_KAFKA || '').toLowerCase() === 'true' ||
      String(process.env.KAFKA_ENABLED || '').toLowerCase() === 'false';

    if (kafkaDisabled) {
      console.log('⏭️  Kafka initialization skipped (DISABLE_KAFKA/KAFKA_ENABLED flag)');
      return;
    }

    try {
      console.log('📡 Connecting to Kafka...');
      await connectKafkaProducer();
      // Ensure all topic definitions exist (idempotent, skips existing topics)
      await ensureTopics();
      // Start all domain Kafka consumers
      await startAllKafkaConsumers();
      console.log('✅ Kafka producer connected, topics verified, consumers started');
    } catch (error) {
      console.error('❌ Kafka initialization failed:', error.message);
      console.error('⚠️  Running with in-memory event fallback');
    }
  }

  async initializeDuckDBEtl() {
    try {
      console.log('🦆 Initializing DuckDB ETL pipeline...');
      await initDuckDBEtl();
      // Start Kafka consumer for near-real-time ETL updates
      await startKafkaETLConsumer();
      console.log('✅ DuckDB ETL pipeline ready');
    } catch (error) {
      console.error('❌ DuckDB ETL initialization failed:', error.message);
      console.error('⚠️  Analytics dashboards will be unavailable');
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

      // Lab critical value escalation automation
      console.log('🚨 Starting lab critical alert escalation automation...');
      const { default: labCriticalAlertCronService } = await import('../services/lab-critical-alert-cron.service.js');
      labCriticalAlertCronService.start();
      
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
      
      // AI Intelligence: Health Risk Score computation (every 6 hours)
      console.log('🏥 Starting AI health risk score cron...');
      const { default: healthRiskCron } = await import('../services/ai-health-risk-cron.service.js');
      healthRiskCron.start();

      // AI Intelligence: Smart Notifications (every 2 hours)
      console.log('🔔 Starting AI smart notifications cron...');
      const { default: smartNotifCron } = await import('../services/ai-smart-notifications-cron.service.js');
      smartNotifCron.start();

      // AI Intelligence: Clinical Insights (every 8 hours)
      console.log('🔬 Starting AI clinical insights cron...');
      const { default: clinicalInsightsCron } = await import('../services/ai-clinical-insights-cron.service.js');
      clinicalInsightsCron.start();

      // Feedback Intelligence: run all feedback table migrations (idempotent)
      console.log('🎫 Running feedback intelligence migrations...');
      const { up: runUnifiedFeedbackMigration } = await import('../migrations/unified-feedback-signals.migration.js');
      await runUnifiedFeedbackMigration().catch(e =>
        console.warn('⚠️  unified-feedback-signals migration skipped:', e.message)
      );
      const { runTicketSlaMigration } = await import('../migrations/ticket-sla.migration.js');
      await runTicketSlaMigration().catch(e =>
        console.warn('⚠️  ticket_sla migration skipped:', e.message)
      );
      const { runDicomInstitutionPatternsMigration } = await import('../migrations/dicom-institution-patterns.migration.js');
      await runDicomInstitutionPatternsMigration().catch(e =>
        console.warn('⚠️  dicom_institution_patterns migration skipped:', e.message)
      );
      const { runMrdModuleMigration } = await import('../migrations/mrd-module.migration.js');
      await runMrdModuleMigration().catch(e =>
        console.warn('⚠️  mrd-module migration skipped:', e.message)
      );
      const { runSpecialtyModuleMigration } = await import('../migrations/specialty-module.migration.js');
      await runSpecialtyModuleMigration().catch(e =>
        console.warn('⚠️  specialty-module migration skipped:', e.message)
      );
      const { runSpecialtyPrescriptionsExpansionMigration } = await import('../migrations/specialty-prescriptions-expansion.migration.js');
      await runSpecialtyPrescriptionsExpansionMigration().catch(e =>
        console.warn('⚠️  specialty-prescriptions-expansion migration skipped:', e.message)
      );
      const { runAiPromptVersionsMigration } = await import('../migrations/ai-prompt-versions.migration.js');
      await runAiPromptVersionsMigration().catch(e =>
        console.warn('⚠️  ai-prompt-versions migration skipped:', e.message)
      );

      const { runPatientVitalsMigration } = await import('../migrations/patient-vitals.migration.js');
      await runPatientVitalsMigration().catch(e =>
        console.warn('⚠️  patient_vitals migration skipped:', e.message)
      );

      // Feedback Aggregator — bridges patient_feedback, ai_cdss_feedback, tickets
      // into unified_feedback_signals (every 15 min).  Must start before the
      // self-learning pipeline so the first pipeline run finds data ready.
      console.log('📊 Starting Feedback Aggregator...');
      const { default: feedbackAggregator } = await import('../services/feedback-aggregator.service.js');
      feedbackAggregator.start();

      // SLA Breach Checker — monitors ticket_sla deadlines (every 5 min)
      console.log('⏱️  Starting SLA Breach Checker...');
      const { default: slaTracker } = await import('../services/sla-tracker.service.js');
      slaTracker.start();

      // Feedback Router — proposes governance changes for degrading components (every 30 min)
      console.log('🔀 Starting Feedback Router...');
      const { default: feedbackRouter } = await import('../services/feedback-router.service.js');
      feedbackRouter.start();

      // Closed-Loop Notifier — sends post-resolution rating requests (every 30 min)
      console.log('📬 Starting Closed-Loop Notifier...');
      const { default: closedLoopNotifier } = await import('../services/closed-loop-notifier.service.js');
      closedLoopNotifier.start();

      // AI Intelligence: Self-Learning Pipeline (every 4 hours)
      console.log('🧠 Starting AI self-learning pipeline...');
      const { default: selfLearningPipeline } = await import('../services/ai-self-learning-pipeline.service.js');
      selfLearningPipeline.start();

      // Prompt Optimization Executor — shadow tests → canary rollout (daily 02:00 IST)
      console.log('🔬 Starting Prompt Optimization Executor...');
      const { default: promptOptimizer } = await import('../services/prompt-optimization-executor.service.js');
      promptOptimizer.start();

      // A/B Experiments migration (idempotent)
      console.log('🧪 Running A/B experiments migration...');
      const { runAbExperimentsMigration } = await import('../migrations/ab-experiments.migration.js');
      await runAbExperimentsMigration().catch(e =>
        console.warn('⚠️  A/B experiments migration skipped:', e.message)
      );

      // Weekly digest email to medical director (Monday 08:00 IST)
      console.log('📧 Starting Feedback Digest service...');
      const { default: feedbackDigest } = await import('../services/feedback-digest.service.js');
      feedbackDigest.start();

      // DeepTech: Health Intelligence Score (every 6 hours, offset +30min from healthRiskCron)
      console.log('🧬 Starting HIS (Health Intelligence Score) cron...');
      const { default: hisScoreService } = await import('../services/ai-his-score.service.js');
      hisScoreService.start();

      // DeepTech: Federated Learning weekly aggregation
      console.log('🌐 Starting Federated Learning pipeline...');
      const { default: federatedLearning } = await import('../services/ai-federated-learning.service.js');
      // Weekly aggregation scheduled via setTimeout to not delay startup
      setTimeout(() => {
        const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
        federatedLearning.runWeeklyCron().catch(e => console.error('[FL] Cron error:', e.message));
        setInterval(() => {
          federatedLearning.runWeeklyCron().catch(e => console.error('[FL] Cron error:', e.message));
        }, WEEKLY_MS);
      }, 60 * 1000); // first run after 1 minute startup grace

      // DeepTech: Agent context bridge — cleanup expired sessions nightly
      console.log('🔗 Starting Agent Context Bridge cleanup...');
      const { default: agentContextBridge } = await import('../services/ai-agent-context.service.js');
      setInterval(() => {
        agentContextBridge.cleanupExpired().catch(e => console.error('[AgentCtx] Cleanup error:', e.message));
      }, 60 * 60 * 1000); // every hour

      // Scheduler dependency for cron-based jobs
      const { default: nodeCron } = await import('node-cron');

      // Doctor slot auto-generation — runs at 01:00 every day
      // Generates concrete availability slots 30 days ahead for all active doctors
      console.log('📅 Scheduling doctor slot auto-generation...');
      nodeCron.schedule('0 1 * * *', async () => {
        console.log('📅 Doctor slot auto-generation starting...');
        try {
          const { getPool } = await import('../db/postgres.js');
          const pool = getPool();
          const { rows: doctors } = await pool.query(
            `SELECT id FROM doctors WHERE status = 'active' AND EXISTS (
              SELECT 1 FROM doctor_schedules WHERE doctor_id = doctors.id AND is_active = TRUE
            ) LIMIT 500`
          );
          for (const doc of doctors) {
            await pool.query(
              `SELECT generate_doctor_slots($1, CURRENT_DATE + 1, CURRENT_DATE + 31)`,
              [doc.id]
            ).catch(() => {});
          }
          console.log(`✅ Doctor slots generated for ${doctors.length} doctors`);
        } catch (e) {
          console.error('[SlotGen] Error:', e.message);
        }
      }, { timezone: 'Asia/Kolkata' });

      // DuckDB nightly ETL — runs at 02:00 every day
      console.log('🦆 Scheduling DuckDB nightly ETL sync...');
      nodeCron.schedule('0 2 * * *', async () => {
        console.log('🦆 DuckDB nightly ETL starting...');
        await runNightlyETL().catch(e => console.error('[DuckDB ETL] Nightly sync error:', e.message));
      }, { timezone: 'Asia/Kolkata' });

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

    // 3a. Initialize DuckDB ETL (analytics pipeline)
    await this.initializeDuckDBEtl();

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
