import './telemetry.js';
// Must load before any router is defined: patches Express so a rejected
// promise inside an async route handler is forwarded to error middleware
// instead of escaping as an unhandled rejection (which was crashing worker
// processes on unexpected DB errors -- confirmed live, Aug 2026).
import 'express-async-errors';
import express from "express";
import dotenv from "dotenv";
if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config();
}

// Run startup safety guards BEFORE any other initialisation.
// In production, exits the process immediately on any violation.
import { runStartupGuards } from './utils/startup-guard.js';
import { sendCriticalAlert } from './utils/alerting.js';
runStartupGuards();
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { credentialStuffingGuard } from './middleware/credentialStuffingGuard.js';
import { ipThreatGate } from './middleware/ipThreatIntelligence.js';
import crypto from 'crypto';
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import fileUpload from 'express-fileupload';
import { usesMulter } from './utils/multer-upload-paths.js';
import compression from 'compression';
import orchestrator from "./db/orchestrator.js";
import userRouter from "./routes/user.route.js";
import addressRouter from "./routes/address.route.js";
import familyMemberRouter from "./routes/family-member.route.js";
import walletRouter from "./routes/wallet.route.js";
import couponRouter from "./routes/coupon.route.js";
import membershipPlansRouter from "./routes/membership-plans.route.js";
import leaderboardRouter from "./routes/leaderboard.route.js";
import passwordResetRouter from "./routes/password-reset.route.js";
import doctorRoutes from './routes/doctor.route.js';
import doctorEnhancedRoutes from './routes/doctor.enhanced.route.js';
import doctorAvailabilityRoutes from './routes/doctor-availability.route.js';
import doctorSettingsRoutes from './routes/doctor-settings.route.js';
import enhancedAppointmentRoutes from './routes/enhanced-appointment.route.js';

// Clinical workflow routes
import clinicalWorkflowRouter from './routes/clinical-workflow.route.js';
import { mountLabRoutes } from './routes/lab/registry.js';
import carePlanRouter from './routes/care-plan.route.js';
import queueManagementRouter from './routes/queue-management.route.js';
import consentManagementRouter from './routes/consent-management.route.js';
import delegationRouter from './routes/delegation.route.js';
import revenueInsightsRouter from './routes/revenue-insights.route.js';
import patientEngagementRouter from './routes/patient-engagement.route.js';
import fitnessRouter from "./routes/fitness.route.js";
import fitnessDataRouter from "./routes/fitnessData.js";
import activityTrackerRouter from "./routes/activityTracker.route.js";
import appleHealthRouter from "./routes/apple-health.route.js";
import aiRouter from "./routes/ai.js";
import medicalAIRouter from "./routes/medical-ai.route.js";
import aiHealthRouter from "./routes/ai-health.route.js";
import aiVisionRouter from "./routes/ai-vision.route.js";
import aiScribeRouter from "./routes/ai-scribe.route.js";
import aiGovernanceRouter from "./routes/ai-governance.route.js";
import aiGpuMetricsRouter from "./routes/ai-gpu-metrics.route.js";
import { CORS_ALLOWED_HEADERS, CORS_EXPOSED_HEADERS } from "./config/cors.config.js";
import clinicalKnowledgeFabricRouter from "./routes/clinical-knowledge-fabric.route.js";
import hospitalBranchRouter from "./routes/hospital-branch.route.js";
import careUnitsRouter from "./routes/care-units.route.js";
import corporateOhcRouter from "./routes/corporate-ohc.route.js";
import ohcWorkspaceRouter from "./routes/ohc-workspace.route.js";
import assetTrackingRouter from "./routes/asset-tracking.route.js";
import dmsRouter from "./routes/dms.route.js";
import housekeepingRouter from "./routes/housekeeping.route.js";
import parkingRouter from "./routes/parking.route.js";
import surveillanceRouter from "./routes/surveillance.route.js";
import pgPool from './db/pgPool.js'; // /healthz round trip
import corporateAccountRouter from "./routes/corporate-account.route.js";
import careSeriesRouter from "./routes/care-series.route.js";
import dialysisRouter from "./routes/dialysis.route.js";
import chemotherapyRouter from "./routes/chemotherapy.route.js";
import specialtyOtExtensionsRouter from "./routes/specialty-ot-extensions.route.js";
import samdRegulatoryRouter from "./routes/samd-regulatory.route.js";
import feedbackIntelligenceRouter from "./routes/feedback-intelligence.route.js";
import telemetryRouter from "./routes/telemetry.route.js";
import scribeRouter from "./routes/scribe.js";
import offlineScribeRouter from "./routes/offline-scribe.route.js";
import voiceAssistantRouter from "./routes/voice-assistant.route.js";
import doctorCopilotRouter from "./routes/doctor-copilot.route.js";
import reportReviewRouter from "./routes/report-review.route.js";
import doctorChatRouter from "./routes/doctor-chat.route.js";
import doctorImagingRouter from "./routes/doctor-imaging.route.js";
import localAiNodeRouter from "./routes/local-ai-node.route.js";
import recordingRouter from "./routes/recording.route.js";
import uploadRouter from "./routes/upload.route.js";
import healthAssessmentRouter from "./routes/health-assessment.route.js";
import healthScoreRouter from "./routes/health-score.route.js";
import reportAnalysisRouter from "./routes/report-analysis.route.js";
import dietRouter from "./routes/diet.route.js";
import ayushmanRouter from "./routes/ayushman.route.js";
import placesRouter from './routes/places.js';
import ttsRouter from './routes/tts.route.js';

import adminRouter from './routes/admin.route.js';
import adminOrdersRevenueRouter from './routes/admin-orders-revenue.route.js';
import fcmRouter from './routes/fcm.route.js';
import callNotificationRouter from './routes/call-notification.route.js';
import firebaseStatusRouter from './routes/firebase-status.route.js';
import crmRouter from './routes/crm.route.js';
import crmTeamRouter from './routes/crm-team.route.js';
import rfqRouter from './routes/rfq.route.js';
import hospitalCrmV2Router from './routes/hospital-crm-v2.route.js';
import hospitalCrmWorldclassRouter from './routes/hospital-crm-worldclass.route.js';
import hospitalCrmGrowthRouter from './routes/hospital-crm-growth.route.js';
import hospitalCrmSpecialtyRouter from './routes/hospital-crm-specialty.route.js';
import hospitalCrmCommunicationHubRouter from './routes/hospital-crm-communication-hub.route.js';
import chatwootWebhookRouter from './routes/chatwoot-webhook.route.js';
import hospitalChatwootRouter from './routes/hospital-chatwoot.route.js';
import { startChatwootWorker } from './services/chatwoot-bridge.service.js';
import crmSegmentsRouter from './routes/crm-segments.route.js';
import crmAutomationsRouter from './routes/crm-automations.route.js';
import crmUnderwritingRouter from './routes/crm-underwriting.route.js';
import asyncRouter from './routes/async.route.js';
import appointmentRouter from './routes/appointment.route.js';
import reportsRouter from './routes/reports.route.js';
import availabilityRouter from './routes/availability.route.js';
import membershipRouter from './routes/membership.route.js';
import wellnessRouter from './routes/wellness.route.js';
import orgMembershipPlansRouter from './routes/org-membership-plans.route.js';
import healthProgramsRouter from './routes/health-programs.route.js';
import teamRouter from './routes/team.route.js';
import teamEmailRouter from './routes/teamEmail.route.js';
import crmEmailRouter from './routes/crmEmail.route.js';
import crmCampaignsRouter from './routes/crmCampaigns.route.js';
import crmCampaignAnalyticsRouter from './routes/crmCampaignAnalytics.route.js';
import crmAIRouter from './routes/crm-ai.route.js';
import crmFlowBuilderRouter from './routes/crm-flow-builder.route.js';
import crmSocialGrowthRouter from './routes/crm-social-growth.route.js';
import crmBrightbeanChatRouter from './routes/crm-brightbean-chat.route.js';
import crmAnalysisRouter from './routes/crm-analysis.route.js';
import crmFieldForceRouter from './routes/crm-field-force.route.js';
import './workers/crm-campaign.worker.js';
import './workers/crm-segment-blast.worker.js';
import welcomeEmailTemplatesRouter from './routes/welcomeEmailTemplates.route.js';
import emailSettingsRouter from './routes/emailSettings.route.js';
import marketingLeadsRouter from './routes/marketing-leads.route.js';
import fbLeadsRouter from './routes/fb-leads.route.js';
import socialInboxRouter from './routes/social-inbox.route.js';
import nurseRouter from './routes/nurse.route.js';
import assistantRouter from './routes/assistant.route.js';
import prometheus from './config/prometheus.js';
import patientRouter from './routes/patient.route.js';
import insuranceRouter from './routes/insurance.route.js';
import insurancePolicyRouter from './routes/insurance-policy.route.js';
import insuranceCompanyRouter from './routes/insurance-company.route.js';
import insuranceBrokerRouter from './routes/insurance-broker.route.js';
import brokerIntegrationRouter from './routes/broker-integration.route.js';
import tpaRouter from './routes/tpa.route.js';
import privacyRouter from './routes/privacy.route.js';
import videoRouter from './routes/video.route.js';
import smsRouter from './routes/sms.route.js';
import videoConfigRouter from './routes/videoConfig.route.js';
import voiceConfigRouter from './routes/voiceConfig.route.js';
import contactCenterRouter, { contactCenterHooks } from './routes/contact-center.route.js';
import whatsappConfigRouter from './routes/whatsapp.config.route.js';
import whatsappBusinessRouter from './routes/whatsapp.business.route.js';
import whatsappProductionRouter from './routes/whatsapp-production.route.js';
import whatsappNumbersRouter from './routes/whatsapp-numbers.route.js';
import whatsappRouter from './routes/whatsapp.route.js';
import chatRouter from './routes/chat.route.js';
import { teamCommunicationWorkspace, adminCommunicationWorkspace } from './routes/communication-workspace-portals.route.mjs';
import crmCommunicationWorkspace from './routes/crm-communication-workspace.route.mjs';
import supportChatRouter from './routes/support-chat.route.js';
import omnichannelJourneyRouter from './routes/omnichannel-journey.route.js';
import ticketsRouter from './routes/tickets.route.js';
import tenantRouter from './routes/tenant.route.js';
import tenantDomainRouter from './routes/tenant-domain.route.js';
import { dedicatedInstallationsRouter } from './routes/dedicated-installations.route.js';
import fieldForceRouter from './routes/field-force.route.js';
import emailRouter from './routes/email.route.js';
import paymentRouter from './routes/payment.route.js';
import orderRouter from './routes/order.route.js';
import videoEventsRouter from './routes/video-events.route.js';
import otpRouter from './routes/otp.route.js';
import otpTestRouter from './routes/otp.test.route.js';
import corporateRouter from './routes/corporate.route.js';
import corporateReferralRouter from './routes/corporate-referral.route.js';
import aggregatorRouter from './routes/aggregator.route.js';
import aggregatorAuthRouter from './routes/aggregator-auth.route.js';
import cartRouter from './routes/cart.route.js';
import employeeNetworkRouter from './routes/employee-network.route.js';
import employeeInsuranceRouter from './routes/employee-insurance.route.js';
import healthPackageKitsRouter from './routes/health-package-kits.route.js';
import adminHealthPackagesRouter from './routes/admin-health-packages.route.js';
import corporateBookingsRouter from './routes/corporate-bookings.route.js';
import healthCheckupRouter from './routes/health-checkup.route.js';
import hospitalRouter from './routes/hospital.route.js';
import hospitalAuthRouter from './routes/hospital-auth.route.js';
import hospitalAuthAliasRouter from './routes/hospital/auth.routes.js';
import hrmsRouter from './routes/hrms.route.js';
import hospitalInsuranceRouter from './routes/hospital-insurance.route.js';
import hospitalInsuranceAuthRouter from './routes/hospital-insurance/auth.routes.js';
import hospitalInsuranceEmailRouter from './routes/hospital-insurance/email.route.js';
import idempotentWebhookRouter from './routes/idempotent-webhook.route.js';
import tpaWebhookRouter from './routes/webhooks/tpa-webhook.route.js';
import clinicRouter from './routes/clinic.route.js';
import pharmacyRouter from './routes/pharmacy.route.js';
import ambulanceRouter from './routes/ambulance.route.js';
import homecareRouter from './routes/homecare.route.js';
import patientPharmacyOrdersRouter from './routes/patient-pharmacy-orders.route.js';
import deviceRouter from './routes/device.route.js';
import wearableRouter from './routes/wearable.route.js';
import pocDeviceRouter from './routes/poc-device.route.js';
import healthDataRouter from './routes/healthData.route.js';
import healthRouter from './routes/health.route.js';
import healthCampRouter from './routes/health-camp.route.js';
import adminStatsRouter from './routes/admin-stats.route.js';
import queueRouter from './routes/queue.route.js';
import prescriptionRouter from './routes/prescription.route.js';
import ehrRouter from './routes/ehr.route.js';
import payrollRouter from './routes/payroll.route.js';
import roadmapIntelligenceRouter from './routes/roadmap-intelligence.route.js';
import clinicalIntelligenceRouter from './routes/clinical-intelligence.route.js';
import hospitalDisplayRouter from './routes/hospital-display.route.js';
import hospitalQueueRouter from './routes/hospital-queue.route.js';
import qmsRouter from './routes/qms.route.js';
import displayKioskRouter from './routes/display-kiosk.route.js';
import abdmKioskRouter from './routes/abdm-kiosk.route.js';
import hospitalDownloadsRouter from './routes/hospital-downloads.route.js';
import hospitalOpenApiRouter from './routes/hospital-openapi.route.js';
import emrRouter from './routes/emr.route.js';
import healthDiaryRouter from './routes/health-diary.route.js';
import mentalHealthRouter from './routes/mental-health.route.js';
import healthIntelligenceRouter from './routes/health-intelligence.route.js';
import sibControlRouter from './routes/sib-control.route.js';
import sibChatbotsRouter from './routes/sib-chatbots.route.js';
import providerNetworkBotRouter from './routes/provider-network-bot.route.js';
import { ringFencingMiddleware } from './middleware/ringFencing.js';
import publicReportRouter from './routes/public-report.route.js';
import publicClaimStatusRouter from './routes/public-claim-status.route.js';
import publicKioskRegisterRouter from './routes/public-kiosk-register.route.js';
import onlineConsultationRouter from './routes/online-consultation.route.js';
import myupcharRouter from './routes/myupchar.route.js';
import notificationRouter from './routes/notification.route.js';
import embeddingsRouter from './routes/embeddings.route.js';
import cdssKnowledgeRouter from './routes/cdss-knowledge.route.js';
import documentationRouter from './routes/documentation.route.js';
import circuitBreakerRouter from './routes/circuit-breaker.route.js';
import adminIntegrationsRouter from './routes/admin-integrations.route.js';
import openapiRouter from './routes/openapi.route.js';
import n8nCallbackRouter from './routes/webhooks/n8n-callback.route.js';
import oauthRouter from './routes/oauth.route.js';
import doctorOAuthRouter from './routes/doctor-oauth.route.js';
import authLoginRouter from './routes/auth.login.route.js';
import { authUser, requireRole } from './middleware/auth.middleware.js';
import { requireAppKey } from './middleware/appAuth.middleware.js';
import communicationRouter from './routes/communication.route.js';
import customerCareRouter from './routes/customer-care.route.js';
import customerCareCrmRouter from './routes/customer-care-crm.route.js';
import assetRouter from './routes/dept/asset.route.js';
import biomedicalRouter from './routes/dept/biomedical.route.js';
import bloodBankRouter from './routes/dept/bloodBank.route.js';
import consentRouter from './routes/dept/consent.route.js';
import cssdRouter from './routes/dept/cssd.route.js';
import dietaryRouter from './routes/dept/dietary.route.js';
import feedbackRouter from './routes/dept/feedback.route.js';
import financeRouter from './routes/dept/finance.route.js';
import infectionControlRouter from './routes/dept/infectionControl.route.js';
import mortuaryRouter from './routes/dept/mortuary.route.js';
import procurementRouter from './routes/dept/procurement.route.js';
import scmRouter from './routes/scm.route.js';
import deptQueueRouter from './routes/dept/queue.route.js';

// API v1 Routes (Multi-tenant wellness platform API)
import apiV1Router from './routes/api-v1-index.js';
import consultationRecordingRouter from './routes/consultation-recording.route.js';
import billingRouter from './routes/billing.route.js';
import moduleAccessRouter from './routes/module-access.route.js';
import roleRouter from './routes/role.route.js';
import hospitalPracticeRouter from './routes/hospital/practice.route.js';
import hospitalBillingRouter from './routes/hospital/billing.route.js';
import hospitalFinanceRouter from './routes/hospital/finance.route.js';
import moduleCopilotRouter from './routes/module-copilot.route.js';
import careosRouter from './routes/careos.route.js';
import { healthosApiKeyOrUser } from './middleware/healthos-api-key.middleware.js';
import hospitalOsRouter from './routes/hospital-os.route.js';
import rwePlatformRouter from './routes/rwe-platform.route.js';
import hospitalClinicalNotesRouter from './routes/hospital-clinical-notes.route.js';
import executiveDashboardRouter from './routes/hospital/executive-dashboard.route.js';
import userAssociationRouter from './routes/userAssociation.route.js';

// Webinar routes
import adminWebinarRouter from './routes/admin/webinar.routes.js';
import adminWebinarModulesRouter from './routes/admin/webinar-modules.routes.js';
import adminPendingRegistrationsRouter from './routes/admin/pending-registrations.route.js';
import featureFlagsAdminRouter, { publicFeatureFlagsRouter } from './routes/feature-flags.route.js';
import doctorWebinarRouter from './routes/doctor/webinar.routes.js';
import demoAccountGuard from './middleware/demo-account-guard.middleware.js';
import publicWebinarRouter from './routes/webinar.routes.js';

// AI Brain intelligence layer
import aiBrainRouter from './routes/ai-brain.route.js';
import aiIntelligenceRouter from './routes/ai-intelligence.route.js';
import aiAnalyticsRouter from './routes/ai-analytics.route.js';
import aiDeepTechRouter from './routes/ai-deeptech.route.js';
import medcoreAdoptionRouter from './routes/medcore-adoption.route.js';

// SIB AI Guard — universal safety middleware for all AI routes
import { sibAIGuard, attachAIReporter } from './middleware/sib-ai-guard.middleware.js';

// Phase 4: FHIR R4 Interoperability
import fhirRouter from './routes/fhir.route.js';
import fhirSubscriptionsRouter from './routes/fhir-subscriptions.route.js';
import fhirSubscriptionService from './services/fhir-subscription.service.js';

// CDS Hooks — HL7 point-of-care clinical decision support
import cdsHooksRouter from './routes/cds-hooks.route.js';

// Interoperability — GAP implementations (all 8 gaps)
import sftpRouter        from './routes/sftp.route.js';
import cdaRouter         from './routes/cda.route.js';
import nabhjciRouter     from './routes/nabh-jci.route.js';
import iso27001Router    from './routes/iso27001.route.js';
import x12nEdiRouter     from './routes/x12n-edi.route.js';
import abdmRouter        from './routes/abdm.route.js';

// HyperGrid — IoT/Interoperability/AI Platform
import hypergridMqttRouter        from './routes/hypergrid-mqtt.route.js';
import hypergridEventsRouter       from './routes/hypergrid-events.route.js';
import hypergridTerminologyRouter  from './routes/hypergrid-terminology.route.js';
import hypergridDicomRouter        from './routes/hypergrid-dicom.route.js';
import orthancWebhookRouter        from './routes/orthanc-webhook.route.js';
import imagingSessionRouter        from './routes/imaging-session.route.js';
import imagingPlatformRouter       from './routes/imaging-platform.route.js';
import hypergridSmartFhirRouter    from './routes/hypergrid-smart-fhir.route.js';
import hypergridTwinsRouter        from './routes/hypergrid-twins.route.js';
import hypergridConnectorRouter    from './routes/hypergrid-connector.route.js';
import hypergridEdgeRouter         from './routes/hypergrid-edge.route.js';
import hypergridMarketplaceRouter  from './routes/hypergrid-marketplace.route.js';
import medicalDeviceGatewayRouter  from './routes/medical-device-gateway.route.js';
import { startMqttBroker }         from './services/hypergrid-mqtt.service.js';
import { startDisplayMqttBridge }  from './services/display-mqtt-bridge.service.js';
import { initEventBus }            from './services/hypergrid-event-bus.service.js';
import { startDeviceAlarmBridge }  from './services/device-alarm-bridge.service.js';
import { startMedicalDeviceMqttIngest } from './services/medical-device-mqtt-ingest.service.js';
import { initTerminologyService }  from './services/hypergrid-terminology.service.js';

// Phase 5: Tenant infrastructure services (AWS-model)
import tenantRegistry from './services/tenant-registry.service.js';
import tenantMeteringMiddleware from './middleware/tenant-metering.middleware.js';

// Admin API routes (API credentials, aggregators, etc.)
import adminApiRouter from './api/admin/index.js';
import authApiRouter from './api/auth/index.js';
import doctorApiRouter from './api/doctors/index.js';

// Load intelligent database models (PostgreSQL-backed)
import "./models/user.model.intelligent.js";
import "./models/doctor.model.intelligent.js";
import "./models/consent.model.intelligent.js";
import "./models/admin.model.intelligent.js";
import "./models/appointment.model.intelligent.js";
import "./models/doctorAvailability.model.intelligent.js";
import "./models/postgres/membershipPlan.model.postgres.js";
import "./models/insurance.model.intelligent.js";
import "./models/auditLog.model.intelligent.js";
import "./models/crm.model.intelligent.js";
import "./models/ticket.model.intelligent.js";
import "./models/FitnessData.model.intelligent.js";
import "./models/chat.model.intelligent.js";
import "./models/consultationRecording.model.intelligent.js";

// Import user hierarchy models
import "./models/postgres/user-association.model.postgres.js";
import "./models/postgres/patient.model.postgres.js";
import "./models/postgres/team-member.model.postgres.js";
import setupUserHierarchyAssociations from "./models/userHierarchy.associations.js";

// Setup user hierarchy associations
setupUserHierarchyAssociations();

// Import async infrastructure (optional - gracefully degrades if services unavailable)
import './config/redis.js';
import { connectKafkaProducer } from './config/kafka.js';
import { metricsMiddleware } from './config/prometheus.js';
import './workers/index.js'; // Initialize workers

// Import compliance middleware
import { auditMiddleware } from './middleware/audit.middleware.js';
import { sessionTimeout } from './middleware/session.middleware.js';
import { activityLogger, activityLogRoutes } from './middleware/activityLogger.js';

// Import compliance services
import { initializeDataRetentionScheduler } from './services/dataRetention.service.js';

// Import multi-tenant middleware
import { extractTenant } from './middleware/tenant.middleware.js';
import { rlsContextMiddleware } from './middleware/rls-context.middleware.js';

const app = express();

// SECURITY: Enhanced error handling for unhandled rejections and uncaught exceptions
import logger from './config/logger.js';  // Default export
// The actual graceful-shutdown implementation (HTTP drain, workers, queues, DB/Redis/Kafka/vector/
// telemetry close, all timeout-bounded) lives in controllers/shutdown.controller.js and is the ONLY
// place allowed to call process.exit() during shutdown. This module used to have its own second,
// independent gracefulShutdown() that raced it on every SIGTERM/SIGINT — and since that duplicate
// checked four `global.*` variables (global.httpServer, global.sequelize, global.redisClient,
// global.kafkaProducer) that are never actually assigned anywhere in the codebase, every one of its
// "close" branches was silently skipped and it fell straight through to process.exit() with no real
// cleanup at all. Because this module is imported before shutdownController.registerHandlers() runs
// (see index.js), this broken handler's listener was registered FIRST — meaning on a real production
// SIGTERM, it consistently won the race and killed the process before shutdown.controller.js's real,
// careful sequence ever got to run. This was the primary cause behind the leaked/orphaned-connection
// pattern found during the 2026-09-22 OOM investigation. Fixed by deleting the duplicate entirely and
// routing through the one real implementation below.
import shutdownController from './controllers/shutdown.controller.js';

// Determine if error is critical and requires shutdown
function isCriticalError(error) {
  const criticalPatterns = [
    'Out of memory',
    'ERR_IPC_CHANNEL_CLOSED',
    'Cannot find module',
    'EADDRINUSE'
  ];
  
  // Don't treat database/cache connection errors as critical during startup
  // Allow app to run in degraded mode if databases are unavailable
  const nonCriticalPatterns = [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'maxRetriesPerRequest'
  ];
  
  const errorString = error?.message || error?.code || String(error);
  
  // First check if it's a non-critical pattern (should NOT exit)
  if (nonCriticalPatterns.some(pattern => errorString.includes(pattern))) {
    return false;
  }
  
  return criticalPatterns.some(pattern => errorString.includes(pattern));
}

// Catch unhandled promise rejections (async errors)
process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString()
  });
  
  // Send alert to monitoring system
  try {
    await sendCriticalAlert('Unhandled Promise Rejection', { reason: reason?.message || String(reason), env: process.env.NODE_ENV });
  } catch (alertError) {
    logger.error('Failed to send alert:', { error: alertError.message });
  }
  
  // Graceful shutdown for critical errors
  if (isCriticalError(reason)) {
    logger.error('Critical error detected in promise rejection, initiating shutdown');
    await shutdownController.gracefulShutdown('UNHANDLED_REJECTION', 1);
  }
});

// Catch uncaught exceptions (sync errors)
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception', {
    error: error?.message,
    stack: error?.stack,
    name: error?.name
  });
  
  // Send alert
  try {
    await sendCriticalAlert('Uncaught Exception', { error: error?.message, name: error?.name, env: process.env.NODE_ENV });
  } catch (alertError) {
    logger.error('Failed to send alert:', { error: alertError.message });
  }
  
  // Always exit on uncaught exceptions (process is in unknown state)
  logger.error('Uncaught exception detected, initiating emergency shutdown');
  await shutdownController.gracefulShutdown('UNCAUGHT_EXCEPTION', 1);
});

// SIGTERM/SIGINT (container orchestration, PM2, Ctrl+C) are handled exclusively by
// shutdownController.registerHandlers(), called once from index.js after startup completes — see the
// comment above this file's shutdownController import for why a second registration here is unsafe.

// Handle warning events (deprecations, MaxListenersExceeded)
process.on('warning', (warning) => {
  logger.warn('Node.js warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

app.use((req, res, next) => {
  if (req.path.includes('/doctors/services')) {
    process.stdout.write(`[${new Date().toISOString()}] 🚨 REQ: ${req.method} ${req.url}\n`);
  }
  next();
});

// Initialize Passport for OAuth2
import passport from './config/oauth.config.js';
app.use(passport.initialize());

// Create upload directories for doctor media
import fs from 'fs';
const uploadDirs = ['./uploads', './uploads/doctors', './uploads/temp', './uploads/chat', './uploads/imaging', './uploads/kiosk'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created upload directory: ${dir}`);
  }
});

// Trust proxy - Required for rate limiting behind nginx proxy
// This allows Express to trust X-Forwarded-* headers from Nginx/Cloudflare
app.set('trust proxy', 1); // Trust first proxy only

// Global rate-limit-abuse guard — Redis-backed (shares credentialStuffingGuard's
// blocklist, cluster-safe, survives restarts), exempts internal/loopback traffic
// and /health, and can be cleared via the existing GET/POST /api/admin/security/
// blocked-ips endpoints without restarting the app. See rateLimiter.middleware.js's
// ipBlocker() docstring for what the original in-memory version got wrong.
import { ipBlocker as _ipBlocker } from './middleware/rateLimiter.middleware.js';
app.use(_ipBlocker());
app.use(cookieParser());

// SSL/HTTPS compatibility middleware
// With trust proxy enabled, Express automatically reads X-Forwarded-Proto
// No need to manually set req.secure or req.protocol (they're read-only)
// The 'trust proxy' setting above handles this correctly

// Connect to Kafka (non-blocking) - skip if disabled
if (process.env.DISABLE_KAFKA !== 'true') {
  connectKafkaProducer().catch(err => {
    console.warn('⚠️  Kafka not available:', err.message);
  });
} else {
  console.log('📝 Kafka disabled by DISABLE_KAFKA environment variable');
}

// ITEM-23: FHIR Subscription table init (non-blocking)
fhirSubscriptionService.start().catch(err =>
  console.warn('⚠️  FHIR Subscription table init failed:', err.message)
);

// HyperGrid service init (non-blocking)
initEventBus().catch(err => console.warn('⚠️  HyperGrid event bus init failed:', err.message));
initTerminologyService().catch(err => console.warn('⚠️  HyperGrid terminology init failed:', err.message));
if (process.env.DISABLE_MQTT !== 'true') {
  if (process.env.ENABLE_LEGACY_EMBEDDED_MQTT === 'true') {
    startMqttBroker().catch(err => console.warn('⚠️  Legacy HyperGrid MQTT broker init failed:', err.message));
  }
  startDeviceAlarmBridge().catch(err => console.warn('⚠️  Device alarm bridge init failed:', err.message));
  startDisplayMqttBridge().catch(err => console.warn('⚠️  Display MQTT vitals bridge init failed:', err.message));
}
if (process.env.ENABLE_MEDICAL_DEVICE_MQTT_INGEST === 'true') {
  startMedicalDeviceMqttIngest();
}

// Initialize compliance schedulers (GDPR/DPDP/HIPAA)
if (process.env.NODE_ENV !== 'test') {
  initializeDataRetentionScheduler();
}

// Purge expired portal refresh tokens daily at 03:30 (runs after data-retention window)
if (process.env.NODE_ENV !== 'test') {
  import('./services/token-revocation.service.js').then(({ purgeExpiredTokens }) => {
    const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h
    // Initial run offset to 03:30 local; subsequent runs every 24 h
    const now = new Date();
    const next330 = new Date(now);
    next330.setHours(3, 30, 0, 0);
    if (next330 <= now) next330.setDate(next330.getDate() + 1);
    const initialDelay = next330 - now;
    setTimeout(() => {
      purgeExpiredTokens().then((n) => console.log(`[token-purge] Purged ${n} expired tokens`)).catch(() => {});
      setInterval(() => {
        purgeExpiredTokens().then((n) => console.log(`[token-purge] Purged ${n} expired tokens`)).catch(() => {});
      }, PURGE_INTERVAL_MS);
    }, initialDelay);
    console.log(`[token-purge] Scheduled: first run at 03:30, then every 24 h`);
  }).catch((err) => console.warn('[token-purge] Could not schedule purge:', err.message));
}

// ==================== SECURITY MIDDLEWARE ====================

// 1. Helmet - Security Headers (XSS, HSTS, etc.)
// Apply core Helmet protections without CSP here; we'll set CSP with per-request nonces below.
app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
}));

// Generate per-request nonces and set strict CSP without unsafe directives
app.use((req, res, next) => {
  const scriptNonce = crypto.randomBytes(16).toString('base64');
  const styleNonce = crypto.randomBytes(16).toString('base64');
  res.locals.scriptNonce = scriptNonce;
  res.locals.styleNonce = styleNonce;

  // Allow self resources, nonced inline where unavoidable; remove unsafe-inline/unsafe-eval
  // Note: Adjust connect-src/frame-src as needed for production endpoints (Cloudflare Tunnel, APIs, sockets)
  const csp = [
    "default-src 'self'",
    // Scripts: app bundles from self + nonced inline (if any) + Cloudflare Insights + Google Sign-In
    `script-src 'self' 'nonce-${scriptNonce}' https://static.cloudflareinsights.com https://accounts.google.com`,
    // Styles: from self + nonced inline (if any)
    `style-src 'self' 'nonce-${styleNonce}'`,
    // Images and fonts
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // Network connections: self, HTTPS, and WebSocket to same-origin; expand if separate API domain is used
    "connect-src 'self' https: wss:",
    // Disallow risky types
    "object-src 'none'",
    // Lock down framing, base URI, and form actions
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  next();
});

// 2. CORS - Strict whitelist (no silent allow-all)
const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const defaultProdOrigins = [
  'https://app.mediqzy.com',
  'https://mediqzy.com',
  'https://www.mediqzy.com',
  'https://mediczy.in',
  'https://www.mediczy.in',
];
const defaultDevOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost',
  'https://localhost',
  'https://localhost:9443',
  'http://localhost:9443',
  'https://192.168.1.72:9443',
  'http://192.168.1.72:9443',
  'https://192.168.1.72',
  'http://192.168.1.72'
];

/** Personalised tenant hosts: https://{subdomain}.mediqzy.com (and mediczy.in). */
const TENANT_ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(mediqzy\.com|mediczy\.in)$/i;

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Tenant personalised domains (hycare / ajdental / …)
  if (TENANT_ORIGIN_RE.test(origin)) return true;
  return false;
}

const baseOrigins = envOrigins.length > 0
  ? envOrigins
  : (process.env.NODE_ENV === 'production' ? defaultProdOrigins : defaultDevOrigins);

// Production: only env-provided or prod domains. Dev: include localhost/LAN.
const allowedOrigins = Array.from(new Set(
  process.env.NODE_ENV === 'production'
    ? [...defaultProdOrigins, ...envOrigins]          // never include dev origins in prod
    : [...baseOrigins, ...defaultProdOrigins, ...defaultDevOrigins]
));

// Debug CORS configuration
console.log('🔒 CORS Configuration:');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   CORS_ORIGIN env:', process.env.CORS_ORIGIN);
console.log('   Allowed Origins:', allowedOrigins);
console.log('   Tenant wildcard: https://*.mediqzy.com / https://*.mediczy.in');

// Block disallowed origins early with 403 (both preflight and actual requests)
app.use((req, res, next) => {
  const origin = req.get('Origin');

  if (origin && !isAllowedCorsOrigin(origin)) {
    console.warn('[CORS] Blocked origin:', origin, req.url);
    if (req.method === 'OPTIONS') {
      return res.status(403).end();
    }
    return res.status(403).json({ error: 'CORS blocked', origin });
  }
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (isAllowedCorsOrigin(origin)) {
      return callback(null, true);
    }

    // Already blocked by the pre-check middleware; return false to skip headers
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: CORS_ALLOWED_HEADERS,
  exposedHeaders: CORS_EXPOSED_HEADERS,
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Handle preflight requests explicitly BEFORE rate limiting
app.options('*', (req, res) => {
  const origin = req.get('Origin');
  if (origin && !isAllowedCorsOrigin(origin)) {
    return res.status(403).end();
  }
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '));
  res.header('Access-Control-Expose-Headers', CORS_EXPOSED_HEADERS.join(', '));
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).end();
});

// 3. Rate Limiting - Global and Authentication-specific
import { identifyRateLimitAccount, accountOrIpRateLimitKey } from './middleware/rate-limit-identity.js';
app.use(identifyRateLimitAccount);
// Every 429 carries Retry-After (audit M21); never overrides a limiter's own value.
import { ensureRetryAfter } from './middleware/retry-after.middleware.js';
app.use(ensureRetryAfter);
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // tighter global cap to reduce abuse
  message: 'Too many requests, please try again later.',
  keyGenerator: accountOrIpRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  // Loopback-only exemption: internal service-to-service calls (e.g. the Orthanc->HyperGrid
  // bridge forwarding one HTTP request per DICOM instance, easily hundreds per study) can't
  // originate from outside this box, so they can't be the abuse this limiter guards against.
  // Docker containers reach the host via host.docker.internal, which resolves to whichever
  // bridge network's gateway IP the container's compose project was assigned — NOT always
  // 172.17.0.1 (Docker's default bridge). A hardcoded single IP here silently stopped
  // exempting the Orthanc bridge the moment its compose project landed on a different
  // bridge subnet (observed 172.18.0.4 in production, not 172.17.0.1) — match the whole
  // RFC1918 172.16.0.0/12 block Docker draws bridge subnets from instead of one address.
  skip: (req) => process.env.DISABLE_RATE_LIMIT === 'true' || req.ip === '127.0.0.1' || req.ip === '::1' || /^172\.(1[6-9]|2\d|3[01])\./.test(req.ip || ''),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // stricter auth attempts to curb brute-force
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: accountOrIpRateLimitKey,
  message: 'Too many AI requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

const aiImageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: accountOrIpRateLimitKey,
  message: 'Image analysis limit reached. Please retry later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const configLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: accountOrIpRateLimitKey,
  message: 'Too many config requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP: 3 attempts per 15 min per IP (stricter than authLimiter)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Too many OTP requests. Please wait 15 minutes before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Password reset: 5 attempts per 15 min per IP
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please wait 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Wallet earn: 10 per hour per IP (prevents rapid coin-farming bypassing service-level checks)
const walletEarnLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: accountOrIpRateLimitKey,
  message: 'Too many reward requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', globalLimiter);
app.use('/api/payments/config', configLimiter);

// ── IP Threat Intelligence Gate — blocks VPN/proxy/Tor/malicious IPs on all login endpoints
const loginThreatGate = ipThreatGate({ proxy: true, tor: true, hosting: false });
app.use('/api/users/login',     loginThreatGate);
app.use('/api/doctors/login',   loginThreatGate);
app.use('/api/nurse/login',     loginThreatGate);
app.use('/api/assistant/login', loginThreatGate);
app.use('/api/admin/login',     loginThreatGate);

// ── Credential Stuffing Guard — tracks failures across windows, auto-blocks persistent attackers
app.use('/api/users/login', credentialStuffingGuard);
app.use('/api/doctors/login', credentialStuffingGuard);
app.use('/api/nurse/login', credentialStuffingGuard);
app.use('/api/assistant/login', credentialStuffingGuard);
app.use('/api/admin/login', credentialStuffingGuard);

app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/doctors/login', authLimiter);
app.use('/api/doctors/register', authLimiter);
app.use('/api/nurse/login', authLimiter);
app.use('/api/assistant/login', authLimiter);

// OTP endpoints — stricter 3/15min limit (brute-force prevention)
app.use('/api/users/login/send-otp',   otpLimiter);
app.use('/api/users/login/verify-otp', otpLimiter);
app.use('/api/users/register/send-otp',otpLimiter);
app.use('/api/auth/send-otp',          otpLimiter);
app.use('/api/auth/verify-otp',        otpLimiter);

// Password reset — 5/15min limit
app.use('/api/password-reset',             resetLimiter);
app.use('/api/users/forgot-password',      resetLimiter);
app.use('/api/users/forgot-password/reset',resetLimiter);
app.use('/api/doctors/forgot-password',    resetLimiter);
app.use('/api/doctor/forgot-password',     resetLimiter);

// Wallet earn — 10/hour limit (prevents rapid coin-farming via race conditions)
app.use('/api/wallet/earn', walletEarnLimiter);

// Shared sales demo logins: refuse real-world actions and run the rest in the demo context, before
// any router (middleware/demo-account-guard.middleware.js).
app.use('/api', demoAccountGuard);
app.use('/v1', demoAccountGuard);

app.use('/api/ai', aiLimiter);
app.use('/api/medical-ai', aiLimiter);
app.use('/api/ai/working-medical-consult', aiLimiter);
app.use('/api/ai/analyze-image', aiImageLimiter);

// SIB AI Guard — universal safety layer for ALL AI routes
// Kill switch, rate limits, circuit breakers, audit logging
app.use('/api/cdss', sibAIGuard, attachAIReporter);
app.use('/api/v3/ai-brain', sibAIGuard, attachAIReporter);
app.use('/api/ai', sibAIGuard, attachAIReporter);
app.use('/api/medical-ai', sibAIGuard, attachAIReporter);
app.use('/api/consultation-recordings', sibAIGuard, attachAIReporter);
app.use('/api/v3/ai-intelligence', sibAIGuard, attachAIReporter);
app.use('/api/ai-intelligence', sibAIGuard, attachAIReporter); // same router, unversioned alias (mobile app)
app.use('/api/sib-chatbots', sibAIGuard, attachAIReporter);
app.use('/api/doctor/clinical-workflow', sibAIGuard, attachAIReporter);
app.use('/api/reports', sibAIGuard, attachAIReporter);

// Prometheus metrics middleware
app.use(metricsMiddleware);

// 4. Response Compression (gzip/deflate)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    // SSE must not be gzip-buffered (Cloudflare/proxy hangs waiting for end-of-stream)
    const accept = String(req.headers.accept || '');
    const path = String(req.path || req.url || '');
    if (accept.includes('text/event-stream') || path.includes('/events')) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between speed and compression ratio
}));

// 5. Body Parsers and File Upload
// Doctor registration currently sends verification documents as base64 JSON.
// Keep this aligned with the public registration document size allowance.
app.use(express.json({
  type: ['application/json', 'application/webhook+json'],
  limit: '50mb',
  verify: (req, _res, buf) => {
    // The WhatsApp webhook is HMAC-signed by Meta over the exact bytes it sent, so the raw body is required to verify it.
    if (req.originalUrl.split('?')[0] === '/api/medical-ai/handoffs/provider/events' || /^\/api\/contact-center\/hooks\/livekit\/[A-Za-z0-9_-]{4,64}$/.test(req.originalUrl.split('?')[0]) || req.originalUrl === '/api/payments/webhook' || req.originalUrl === '/api/hospital/billing/pgi/webhook' || req.originalUrl === '/api/hospital/billing/refunds/webhook' || req.originalUrl.split('?')[0] === '/api/whatsapp-business/webhook' || req.originalUrl.split('?')[0] === '/api/chatwoot/webhook' || /^\/api\/webhooks\/tpa(?:\/|$)/.test(req.originalUrl.split('?')[0])) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Attach OpenTelemetry trace ID to every request as X-Trace-Id / X-Request-Id header.
import { correlationMiddleware } from './telemetry.js';
app.use(correlationMiddleware);

// Backward-compatible alias used by some clients for doctor password reset.
app.post('/api/doctor/forgot-password', async (req, res) => {
  try {
    const { email, phone } = req.body || {};
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required' });
    }

    const passwordResetService = (await import('./services/password-reset.service.js')).default;
    const result = await passwordResetService.requestPasswordReset({ email, phone, userType: 'doctor' });
    return res.json(result);
  } catch (error) {
    console.error('[doctor/forgot-password-alias] error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to process password reset request' });
  }
});

// D-9: honour the Idempotency-Key header the mobile app sends on bookings and
// orders — replay the first successful response for 24h instead of creating a
// duplicate booking/charge. No-op without the header; fails open if Redis is down.
import { idempotency } from './middleware/idempotency.middleware.js';
app.use(idempotency());

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Registration documents are too large. Please upload smaller files or compress the PDFs and try again.',
    });
  }
  return next(err);
});

// Public hospital documentation (Word/PPT) — before static + ring-fencing
app.use('/api/downloads/hospital', hospitalDownloadsRouter);
app.use('/api/docs', hospitalOpenApiRouter);

// Credential-free mobile discovery, before global authentication/ring fencing.
// The API global limiter above still applies. No other mobile path is public.
import mobileDiscoveryRouter from './routes/mobile-discovery.route.js';
app.use('/api/mobile', mobileDiscoveryRouter);

// Serve downloadable app binaries (APKs, etc.)
app.use('/api/downloads', express.static(path.join(__dirname, 'public/downloads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment');
    } else if (filePath.endsWith('.docx')) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment');
    } else if (filePath.endsWith('.pptx')) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
}));

// Kiosk patient photos (device-uploaded, LAN-only displays)
app.use('/uploads/kiosk', express.static(path.join(__dirname, '../uploads/kiosk'), {
  maxAge: '1h',
  fallthrough: true,
}));

const globalFileUploadMiddleware = fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded',
  createParentPath: true,
  tempFileDir: '/tmp/'
});

app.use((req, res, next) => {
  // Routes that parse their own multipart body with multer must not have the
  // stream drained first — see utils/multer-upload-paths.js.
  if (usesMulter(req.path, req.method)) return next();
  return globalFileUploadMiddleware(req, res, next);
});

// Legacy mobile aliases (auth OTP + patient appointments)
const forwardToRouter = (router, targetPath) => (req, res, next) => {
  const originalUrl = req.url;
  req.url = targetPath;

  router.handle(req, res, (err) => {
    req.url = originalUrl;

    if (err) {
      return next(err);
    }

    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'Alias route not found' });
    }
  });
};

app.post('/api/auth/send-otp', authLimiter, forwardToRouter(userRouter, '/login/send-otp'));
app.post('/api/auth/verify-otp', authLimiter, forwardToRouter(userRouter, '/login/verify-otp'));
app.get('/api/patients/appointments', requireAppKey, authUser, forwardToRouter(appointmentRouter, '/'));

// 6. Input Sanitization (HTTP Parameter Pollution protection)
// Note: NoSQL injection protection removed - using PostgreSQL with parameterized queries
app.use(hpp());

// 7. Audit Logging (HIPAA/GDPR/DPDP Compliance)
app.use(auditMiddleware);

// 7. Structured Logging (Production-grade)
// Logger already imported above for error handling
import { requestLogger, errorLogger } from './config/logger.js';
app.use(requestLogger);

// 8. Multi-Tenant Context Extraction
app.use(extractTenant);
import { tenantMobileContext } from './middleware/tenant-mobile-context.js';
app.use(tenantMobileContext);

// 8a. Row-Level Security context — sets app.current_org_id / app.current_user_id
//     Must run after extractTenant so req.user is available for authenticated routes
app.use(rlsContextMiddleware);

// 9. Activity Logging (Track all user activities with timestamps)
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});
app.use(activityLogger({
  includeBody: false, // Set to detailed logging (be careful with sensitive data)
  excludePaths: ['/health', '/healthz', '/api/admin/activity-logs', '/api/admin/activity-stats', '/api/team/activity-logs', '/api/team/activity-stats']
}));

// Twilio WhatsApp Webhook Bypass - MUST RUN FIRST before session/auth checks
// Allow unauthenticated requests for Twilio and Chatwoot webhooks (they verify their own signatures)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/whatsapp-production/webhook') ||
      req.path.startsWith('/api/whatsapp-production/fallback') ||
      req.path.startsWith('/api/whatsapp-production/status-callback') ||
      req.path.startsWith('/api/support/webhook/whatsapp') ||
      req.path === '/api/chatwoot/webhook' ||
      req.path === '/api/chatwoot/channels/twilio' ||
      req.path === '/api/payments/webhook' ||
      req.path === '/api/hospital/billing/pgi/webhook' ||
      req.path === '/api/hospital/billing/refunds/webhook' ||
      req.path === '/api/payments/config' ||
      /^\/api\/webhooks\/tpa(?:\/|$)/.test(req.path.split('?')[0])) {
    req.skipAuth = true;
  }
  next();
});

// Razorpay checkout diagnostic page (for testing payment integration)
app.get('/razorpay-test', (req, res) => {
  res.sendFile(new URL('./routes/razorpay-test.html', import.meta.url).pathname);
});

// 9. Session Timeout (HIPAA 15-minute idle timeout)
app.use(sessionTimeout);

// 10. Response-shape linter — detects HTTP 200 + success:false (anti-pattern).
//     Dev: logs loudly. Prod: logs warning to PM2 for progressive cleanup.
import responseShapeLinter from './middleware/responseShape.middleware.js';
app.use(responseShapeLinter);
// Public signed-token report download (no auth required — handled by JWT verification)
app.use('/api/public', publicReportRouter);
// Public signed-token insurance claim status lookup (QR-code target, no auth required)
app.use('/api/public/claim-status', publicClaimStatusRouter);
app.use('/api/public/kiosk-register', publicKioskRegisterRouter);
// Department login modules must stay before ring-fencing because login is public.
app.use('/api/asset', assetRouter);
app.use('/api/biomedical', biomedicalRouter);
app.use('/api/blood-bank', bloodBankRouter);
app.use('/api/consent', consentRouter);
app.use('/api/cssd', cssdRouter);
app.use('/api/dietary', dietaryRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/finance', financeRouter);
app.use('/api/infection-control', infectionControlRouter);
app.use('/api/mortuary', mortuaryRouter);
app.use('/api/procurement', procurementRouter);
app.use('/api/scm', scmRouter);
app.use('/api/queue', deptQueueRouter);
// 10. Ring-Fencing Middleware (Prevent cross-user privilege escalation)
// Provider callbacks verify their own signatures before accepting any message.
app.use('/api/chatwoot', chatwootWebhookRouter);
startChatwootWorker();
app.use(ringFencingMiddleware);

// Error handling middleware (must be last)
app.use(errorLogger);

// Routes
// Liveness probe - simple check that server is running
app.get('/health/live', authUser, requireRole('admin'), (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// Readiness probe - check if server can handle requests
app.get('/health/ready', authUser, requireRole('admin'), async (req, res) => {
  try {
    const health = await orchestrator.healthCheck();
    const dbStates = health.databases || {
      postgres: health.postgres
    };

    const postgresOnline = Boolean(dbStates.postgres);
    const isReady = postgresOnline;

    const response = {
      status: isReady ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      databases: {
        postgres: postgresOnline ? 'connected' : 'disconnected'
      }
    };

    res.status(isReady ? 200 : 503).json(response);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Minimal liveness/readiness for load balancers and deploy checks: unauthenticated, reveals nothing beyond up/down.
// Does a real (2 s) database round trip so a dead database is reported, not just a live process.
app.get('/healthz', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await Promise.race([
      pgPool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

// Public health summary (monitoring / LB). Deliberately coarse: no version, environment, memory, uptime,
// connection details or error text. Full detail is behind admin login at /health/ready.
app.get('/health', async (req, res) => {
  try {
    const health = await orchestrator.healthCheck();
    const dbStates = health.databases || {
      postgres: health.postgres,
      redis: health.redis
    };
    const normalizedDbStates = Object.fromEntries(
      Object.entries(dbStates).map(([db, isConnected]) => [db, isConnected ? 'connected' : 'disconnected'])
    );
    const criticalHealthy = Boolean(dbStates.postgresSequelize || dbStates.postgres);
    res.status(criticalHealthy ? 200 : 503).json({
      status: criticalHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      databases: normalizedDbStates
    });
  } catch (error) {
    console.error('[health] check failed:', error.message);
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

// Public health check endpoint (for monitoring tools, load balancers, etc.)
app.get('/api/health', async (req, res) => {
  try {
    const health = await orchestrator.healthCheck();
    const mem = process.memoryUsage();
    const dbStates = health.databases || {
      postgres: health.postgres,
      redis: health.redis
    };

    const normalizedDbStates = Object.fromEntries(
      Object.entries(dbStates).map(([db, isConnected]) => [
        db,
        isConnected ? 'connected' : 'disconnected'
      ])
    );

    const criticalHealthy = Boolean(dbStates.postgresSequelize || dbStates.postgres);

    const healthCheck = {
      status: criticalHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      memory: {
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100 + ' MB',
        heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100 + ' MB'
      },
      databases: normalizedDbStates
    };
    
    res.status(criticalHealthy ? 200 : 503).json(healthCheck);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Database orchestrator health check endpoint (public for monitoring)
app.get('/api/db/health', async (req, res) => {
  try {
    const health = await orchestrator.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      orchestrator: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Database orchestrator statistics endpoint
app.get('/api/db/stats', authUser, requireRole('admin'), (req, res) => {
  try {
    const stats = orchestrator.getStats();
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Database intelligence metrics endpoint
app.get('/api/db/intelligence/metrics', authUser, requireRole('admin'), (req, res) => {
  try {
    const intelligence = orchestrator.getIntelligence();
    if (!intelligence) {
      return res.status(503).json({
        error: 'Intelligence layer not initialized',
        timestamp: new Date().toISOString()
      });
    }
    const metrics = intelligence.getMetrics();
    res.status(200).json(metrics);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Intelligent query endpoint
app.post('/api/db/intelligence/query', authUser, requireRole('admin'), async (req, res) => {
  try {
    const intelligence = orchestrator.getIntelligence();
    if (!intelligence) {
      return res.status(503).json({
        error: 'Intelligence layer not initialized',
        timestamp: new Date().toISOString()
      });
    }
    
    const { query, context } = req.body;
    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await intelligence.intelligentRoute(query, context || {});
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Intelligent data collection endpoint
app.post('/api/db/intelligence/collect', authUser, requireRole('admin'), async (req, res) => {
  try {
    const intelligence = orchestrator.getIntelligence();
    if (!intelligence) {
      return res.status(503).json({
        error: 'Intelligence layer not initialized',
        timestamp: new Date().toISOString()
      });
    }
    
    const { data, metadata } = req.body;
    if (!data) {
      return res.status(400).json({
        error: 'Data is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await intelligence.collectAndStore(data, metadata || {});
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Documentation (Specific paths only, NOT catch-all '/')
app.use('/swagger.json', authUser, requireRole('admin'), documentationRouter);
app.use('/api-docs', authUser, requireRole('admin'), documentationRouter);
app.use('/docs', authUser, requireRole('admin'), documentationRouter);

// Circuit Breaker Monitoring
app.use('/api/circuit-breakers', circuitBreakerRouter);
// Third-party API integration status (admin, read-only) — integrations/catalog.js
app.use('/api/admin/integrations', adminIntegrationsRouter);
mountLabRoutes(app, 'adminPricing'); // lab test price lists for admins — see routes/lab/registry.js
// App-facing API contract (OpenAPI 3.0.3, admin) — server/openapi/
app.use('/api/admin/openapi', openapiRouter);

// OAuth2 Routes (must be before authentication middleware)
app.use('/api/auth', oauthRouter);
app.use('/api/auth/doctor', doctorOAuthRouter);
app.use('/api/auth', authLoginRouter);

// The /oauth mount is gone: it exposed this app as an OAuth authorization
// server for Rocket.Chat SSO, which was retired on 2026-10-04. The patient
// social login that shares this router is served from /api/auth above.

// API v1 - Multi-tenant Wellness Platform (OIDC-based authentication)
app.use('/v1', apiV1Router);

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN: PATIENT  (→ migrate to routes/domains/patient.domain.js)
// ═══════════════════════════════════════════════════════════════════════════
app.use("/api/users", userRouter);
app.use("/api/addresses", addressRouter);
app.use("/api/family-members", familyMemberRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/membership-plans", membershipPlansRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/password-reset", passwordResetRouter);


app.use("/api/reports", reportsRouter); // Patient medical reports
app.use("/api/reports", uploadRouter); // Medical report upload
app.use("/api/health-assessment", healthAssessmentRouter); // Health risk assessment
app.use("/api/hra", authUser, healthAssessmentRouter); // HRA alias for /api/health-assessment
app.use("/api/reports", reportAnalysisRouter); // Report analysis
app.use("/api/health-score", healthScoreRouter); // Daily composite health score + logging

// Doctor routes - all mounted under /api/doctors for consistency
// Mount enhanced routes first so canonical auth/profile handlers are used.
app.use("/api/doctors", doctorEnhancedRoutes); // Enhanced: auth, search, public profiles
app.use("/api/doctors", doctorRoutes); // Core: register, appointments, alerts, dashboard stats
app.use("/api/doctors", availabilityRouter); // Availability management
app.use("/api/doctors", doctorSettingsRoutes); // Settings: attached pharmacies/labs
app.use("/api/ai/scribe", aiScribeRouter); // AI Scribe for prescription generation
app.use("/api/ai/vision", aiVisionRouter); // AI Vision for medical image analysis
app.use("/api/recordings", recordingRouter); // Consultation recording management
app.use("/api/doctors/availability", doctorAvailabilityRoutes); // Doctor availability management
app.use("/api/doctor-settings", doctorSettingsRoutes); // Doctor appointment configuration
app.use("/api/enhanced-appointments", enhancedAppointmentRoutes); // Enhanced appointment booking

// Clinical workflow routes
app.use("/api/doctor/clinical-workflow", clinicalWorkflowRouter); // SOAP notes, ICD-10/CPT codes, AI summaries
mountLabRoutes(app, 'doctorIntegration'); // lab routes — see routes/lab/registry.js
app.use("/api/doctor/care-plans", carePlanRouter); // Care plans, tasks, reminders
app.use("/api/doctor/queue", queueManagementRouter); // Queue management, triage, ETA, no-show handling
app.use("/api/doctor/consent", consentManagementRouter); // Consent management, e-signatures, HIPAA compliance
app.use("/api/doctor/delegation", delegationRouter); // Delegation logs, audit trails, co-signatures
app.use("/api/doctor/revenue", revenueInsightsRouter); // Revenue insights, profitability, claim tracking
app.use("/api/doctor/engagement", patientEngagementRouter); // Patient engagement, post-visit instructions
app.use("/api/membership", membershipRouter);
app.use("/api/wellness", wellnessRouter); // Wellness tab aggregate (goals, challenges, HealthCoins) — mobile app
app.use("/api/org-membership-plans", orgMembershipPlansRouter); // Organization-specific plan customization
app.use("/api/programs", healthProgramsRouter);                // Health Coaching Framework — unlimited configurable programs
app.use("/api/insurance", insuranceRouter);
app.use("/api/insurance-policies", insurancePolicyRouter); // Comprehensive insurance policy & rule engine
app.use("/api/insurance-company", insuranceCompanyRouter); // Insurance company & corporate login
app.use("/api/insurance-broker", insuranceBrokerRouter); // Insurance broker/intermediary login
app.use('/api/broker-integrations', brokerIntegrationRouter); // Broker server-to-server integration + signed webhooks
app.use("/api/hospital/insurance", hospitalInsuranceRouter); // IHX-like hospital insurance claims dashboard
app.use("/api/hospital-insurance/auth", hospitalInsuranceAuthRouter); // Separate insurance portal login
app.use("/api/hospital/insurance/emails", hospitalInsuranceEmailRouter); // Insurance portal email AI inbox
app.use("/api/tpa", tpaRouter); // TPA (Third Party Administrator) login
app.use('/api/admin/webhooks', idempotentWebhookRouter); // Idempotent webhook event log (admin: list, retry, stats)
app.use("/api/appointments", appointmentRouter);
mountLabRoutes(app, 'catalog'); // lab routes — see routes/lab/registry.js
app.use("/api/employee", employeeInsuranceRouter); // SmartCRM insurance link + in-app enrolment (ADR-001; inert until switched on)
app.use("/api/employee", employeeNetworkRouter); // Corporate employee network (my-labs, my-hospitals, my-clinics)
app.use(["/api/kits", "/api/checkup-kits", "/api/lab/kits"], healthPackageKitsRouter);
app.use("/api/admin/health-packages", adminHealthPackagesRouter);
app.use("/api/corporate-bookings", corporateBookingsRouter); // Team member books corporate health checkups + notifies employees
app.use("/api/health-checkups", healthCheckupRouter); // Patient individual/corporate health-checkup booking flow
app.use("/api/cart", cartRouter); // Lab test cart management
app.use("/api/prescriptions", prescriptionRouter); // Prescription CRUD and PDF generation
app.use("/api/ehr", ehrRouter); // Electronic Health Records - admin access to patient records
app.use('/api/payroll', payrollRouter);
app.use('/api/roadmap-intelligence', roadmapIntelligenceRouter);
app.use('/api/clinical-intelligence', sibAIGuard, attachAIReporter, clinicalIntelligenceRouter);
app.use('/api/display', hospitalDisplayRouter);
app.use('/api/display/kiosk', displayKioskRouter);
app.use('/api/abdm/kiosk', abdmKioskRouter);
app.use('/api/v1/queue', hospitalQueueRouter);
app.use('/api/qms', qmsRouter); // Unified QMS — hospital / clinic / lab + Aadhaar QR
app.use("/api/emr", emrRouter); // EMR folder per user — accessible by team members
app.use("/api/health-diary", healthDiaryRouter); // Patient health journal and diary entries
app.use("/api/mental-health", mentalHealthRouter); // App Mind & Mood sync over the health diary (QA-09)
app.use("/api/health-intelligence", healthIntelligenceRouter); // Dr. iSHA Health Intelligence Dashboard
app.use("/api/sib", sibControlRouter); // SIB Control Layer - AI decision management, kill switch, approvals
app.use("/api/sib-chatbots", sibChatbotsRouter); // SIB Chatbots - Admin dashboard AI chatbots (Health, Appointment, Emergency)
app.use('/api/provider-network-bot', providerNetworkBotRouter); // Provider directory bot: ingest, QC, publish to SmartHealth network
app.use("/api/health", healthRouter); // Unified health metrics endpoint
app.use("/api/consultation", onlineConsultationRouter); // Online consultation booking flow
app.use("/api/myupchar", myupcharRouter); // myUpchar Live Consult API proxy
app.use("/api/consultation-recordings", consultationRecordingRouter); // Consultation recording and AI transcription
app.use("/api/billing", billingRouter); // Billing, orders, invoices, and payments
app.use("/api/notifications", notificationRouter); // In-app notification management
app.use("/api/fitness", fitnessRouter);
app.use("/api/fitness-data", fitnessDataRouter); // Health and fitness tracking data
app.use("/api/activity-tracker", activityTrackerRouter); // Daily activity: steps, stairs, sleep, exercise, calories, vitals
app.use("/api/apple-health", appleHealthRouter); // Apple HealthKit integration for iOS
app.use("/api/ai", aiRouter);
app.use("/api/medical-ai", medicalAIRouter);
app.use("/api/ai/gpu", authUser, aiGpuMetricsRouter); // GPU scheduler metrics (superadmin)
app.use("/api/ai-governance", authUser, aiGovernanceRouter); // SaMD governance: model cards, PCCP, drift, quality gates
app.use("/api/report-review", authUser, reportReviewRouter); // WP3 Stage C: report observation verify gate (clinician review)
app.use("/api/clinical-knowledge-fabric", clinicalKnowledgeFabricRouter); // Per-specialty CDSS/copilot knowledge base; draft rules gated behind medical-director approval
// Care units (outreach clinics, medical centres, OHCs) and the OHC workspace. The corporate mount must precede the generic /api/corporate routers below.
app.use("/api/care-units", careUnitsRouter);
app.use("/api/corporate/ohc-units", corporateOhcRouter);
app.use("/api/ohc-workspace", ohcWorkspaceRouter);
app.use("/api/hospital-branch", hospitalBranchRouter); // Multi-branch architecture Phase 1: branches, staff assignment, tariff overrides
app.use("/api/asset-tracking", assetTrackingRouter); // Asset Tracking: software scaffolding for RFID/IoT — manual-entry only, no reader hardware connected yet
app.use("/api/dms", dmsRouter); // Document Management System: policies, SOPs, consent forms, NABH/HR documents — administrative, not SaMD
app.use("/api/surveillance", surveillanceRouter); // Security camera vision analytics: edge gateway ingest (device key) + portal APIs — security monitoring, not SaMD
app.use("/api/parking", parkingRouter); // Parking: lots, gate movements, passes, watchlist, incidents, overstay, devices — administrative, not SaMD
app.use("/api/housekeeping", housekeepingRouter); // Housekeeping: task tracking (cleaning/disinfection/waste collection) — administrative, not SaMD
app.use("/api/corporate-account", corporateAccountRouter); // Module 24: MoU versioning, rate cards, SPOC, credit ledger, employee consent grants
app.use("/api/care-series", careSeriesRouter); // Recurring-treatment workflow shell (dialysis/chemo/etc.) — content gated via Clinical Knowledge Fabric
app.use("/api/dialysis", dialysisRouter); // Vascular access, UF/dialysate parameters, medication administration, chair/schedule management
app.use("/api/chemotherapy", chemotherapyRouter); // Regimen reference, BSA, pre-cycle checklist, infusion monitoring, extravasation, CTCAE grading
app.use("/api/specialty-ot", specialtyOtExtensionsRouter); // Ophthalmology IOL, cardiac surgery, orthopaedic implant fields (merged into operative_notes.note_data) + post-op follow-up plan
app.use("/api/samd-regulatory", samdRegulatoryRouter);       // SaMD regulatory items 11-16: clinical validation, QMS, IEC 62304, ISO 14971, CDSCO
app.use("/api/feedback-intelligence", authUser, feedbackIntelligenceRouter); // Self-healing feedback loop: quality scores, SLA, signals
app.use("/api/telemetry", telemetryRouter);                   // Client-side event ingestion (perf, funnels, errors)
app.use("/api/ai-health", aiHealthRouter); // AI health assistant, diet plans, Dr. ISHA
app.use("/api/v3/ai-brain", authUser, aiBrainRouter); // AI Brain intelligence layer (agentic LLM + RAG + 15 tools)
app.use("/api/v3/module-copilot", moduleCopilotRouter); // Per-module AI copilots
app.use("/api/v3/careos", healthosApiKeyOrUser, sibAIGuard, attachAIReporter, careosRouter);
app.use("/api/v3/healthos", healthosApiKeyOrUser, sibAIGuard, attachAIReporter, careosRouter);
app.use("/api/v3/hospital-os", sibAIGuard, attachAIReporter, hospitalOsRouter); // Hospital OS 2035 unified platform
app.use("/api/v3/rwe", authUser, rwePlatformRouter); // Real-world evidence platform (Wave 4)
app.use("/api/v3/ai-intelligence", authUser, aiIntelligenceRouter); // Drug interactions, insurance, triage, risk scores, insights
app.use("/api/emergency", authUser, aiIntelligenceRouter); // Emergency alias (triage/assess, risk-score)
// Unversioned alias: the shipped mobile app calls /api/ai-intelligence/risk-score/me,
// which ring-fencing refused (403) because only the /api/v3 prefix was known —
// so the app fell back to generic tips instead of the user's own risk score.
app.use("/api/ai-intelligence", authUser, aiIntelligenceRouter);
app.use('/api/medcore-adoption', medcoreAdoptionRouter); // Clean-room MedCore capability adoption
app.use("/api/v3/ai-analytics", authUser, aiAnalyticsRouter); // AI analytics dashboard (LLM ops, quality, tools, population health)
app.use("/api/v3/ai-deeptech", authUser, aiDeepTechRouter); // DeepTech: HIS, Clinical NLP, Pre-auth, Multi-agent Context, Federated Learning
app.use("/api/diet", dietRouter); // Diet plan shortcut (alias for /api/ai-health/diet)
// The Ayushman router was mounted only at "/api/ahunground" — a prefix
// nothing calls and nothing allow-lists, while the ring-fencing allow-list
// and every caller use "/api/ayushman". The router was therefore
// unreachable by either name: /api/ayushman/* passed the gate and hit no
// route (404), /api/ahunground/* had a route and was refused by the gate
// (403). That is why the Ayushman e-card read as "missing API".
app.use("/api/ayushman", ayushmanRouter);
app.use("/api/ahunground", ayushmanRouter); // retained alias
app.use('/api/places', placesRouter);

app.use('/stats', adminStatsRouter); // Admin dashboard statistics (public stats endpoint, outside /api to bypass middleware)
app.use('/api/admin', adminRouter);
app.use('/api/admin', adminApiRouter); // API credentials, aggregators, and other admin APIs
app.use('/api/admin/orders-revenue', adminOrdersRevenueRouter); // Real orders/payments/membership-upgrade purchase history
app.use('/api/admin/webinars', authUser, requireRole('admin'), adminWebinarRouter); // Super admin webinar management
app.use('/api/admin/webinar-modules', authUser, requireRole('admin'), adminWebinarModulesRouter); // Webinar module & notification configuration
app.use('/api/admin/pending-registrations', adminPendingRegistrationsRouter); // Super admin review & approve entity registrations
app.use('/api/admin/feature-flags', featureFlagsAdminRouter); // Tenant-aware feature flag registry
app.use('/api/feature-flags', publicFeatureFlagsRouter); // Authenticated effective flag snapshot
app.use('/api/admin/module-access', moduleAccessRouter);
app.use('/api/module-access', moduleAccessRouter); // Public endpoint for checking user's own module access
app.use('/api/admin/roles', roleRouter); // Role management with CRUD + module access
app.use('/api/roles', roleRouter); // User-facing role endpoints (check own roles/modules)
app.use('/api/team', teamRouter);
app.use('/api/team/provider-network-bot', providerNetworkBotRouter);
app.use('/api/team/emails', teamEmailRouter); // Team email inbox with AI processing
app.use('/api/team/welcome-email-templates', welcomeEmailTemplatesRouter); // Welcome email template customization
app.use('/api/email-settings', authUser, emailSettingsRouter); // User SMTP/IMAP configuration settings
app.use('/api/admin/email-settings', authUser, requireRole('admin'), emailSettingsRouter); // Admin email settings management
app.use('/api/doctor/webinars', authUser, doctorWebinarRouter); // Doctor webinar hosting
app.use('/api/nurse', nurseRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/patients', patientRouter); // Patient registration by multiple roles
app.use('/api', activityLogRoutes); // Activity logging routes
app.use('/api/crm', crmRouter);
app.use('/api/crm/team', crmTeamRouter); // CRM login/role administration (create/update team logins, reporting manager)
app.use('/api/rfq', rfqRouter); // RFQ/insurance module — extracted off /api/crm 2026-09-11, Team-only
app.use('/api/crm/v2', hospitalCrmV2Router);
app.use('/api/crm/worldclass', hospitalCrmWorldclassRouter);
app.use('/api/crm/growth', hospitalCrmGrowthRouter); // Hospital CRM phases 2-8
app.use('/api/crm/growth', hospitalCrmSpecialtyRouter); // Specialty, diagnostic, and digital growth domains
app.use('/api/crm/communication-hub', hospitalCrmCommunicationHubRouter); // Brevo-style campaign and communications monitoring
app.use('/api/crm/customer-care', customerCareCrmRouter); // Customer-care queues, knowledge and audited handoffs
app.use('/api/crm/segments', crmSegmentsRouter);
app.use('/api/crm/automations', crmAutomationsRouter);
app.use('/api/rfq/underwriting', crmUnderwritingRouter); // RFQ underwriting pipeline — isolated from /api/crm; Team-only (authTeam)
app.use('/api/crm/emails', crmEmailRouter); // CRM email inbox with SMTP/IMAP settings
app.use('/api/crm/campaigns', crmCampaignsRouter); // CRM marketing campaigns
app.use('/api/crm/campaign-analytics', crmCampaignAnalyticsRouter); // CRM marketing analytics
app.use('/api/crm/ai', crmAIRouter); // CRM AI — scoring, prediction, insights, forecast
app.use('/api/crm/flows', crmFlowBuilderRouter); // Clean-room visual CRM flow builder
app.use('/api/crm/social', crmSocialGrowthRouter); // Tenant-scoped social growth controls over Meta inbox
app.use('/api/rfq/analysis', crmAnalysisRouter); // RFQ retrospective/prospective analysis + quote engine — isolated from /api/crm; Team-only (authTeam)
app.use('/api/fcm', fcmRouter);
app.use('/api/call-notification', callNotificationRouter); // Doctor-to-patient call notifications
app.use('/api/firebase', firebaseStatusRouter);
app.use('/api/tts', ttsRouter); // Eleven Labs Text-to-Speech
app.use('/api/async', asyncRouter);
app.use('/api/privacy', privacyRouter); // GDPR/DPDP/HIPAA compliance endpoints
app.use('/api/video', videoRouter); // Video calling endpoints
app.use('/api/webinars', authUser, publicWebinarRouter); // Public webinar browsing and registration

// n8n Webhook callbacks
app.use('/api/webhooks/n8n-callback', n8nCallbackRouter); // n8n workflow callbacks
app.use('/api/webhooks/tpa', tpaWebhookRouter); // TPA/insurer inbound webhooks (idempotent + HMAC verified)

// Prometheus metrics endpoint
const isLocalMetricsRequest = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

app.get('/metrics/internal', (req, res, next) => {
  if (!isLocalMetricsRequest(req)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  return prometheus.metricsEndpoint(req, res, next);
});

app.get('/metrics', authUser, requireRole('admin'), prometheus.metricsEndpoint);
app.use('/api/sms', smsRouter); // SMS gateway management
app.use('/api/video-config', videoConfigRouter); // Video configuration management
app.use('/api/public', marketingLeadsRouter); // Public marketing lead capture
app.use('/api/fb-leads', fbLeadsRouter);    // Facebook Lead Ads webhook (public — no auth)
app.use('/api/social-inbox', socialInboxRouter); // Instagram/Facebook Messenger Team inbox (authTeam)
app.use('/api/crm/brightbean-chat', crmBrightbeanChatRouter); // Clean-room BrightBean-style CRM chat automation
app.use('/api/voice-config', voiceConfigRouter); // Voice call configuration management
app.use('/api/crm/contact-center', contactCenterRouter);
app.use('/api/contact-center/hooks', contactCenterHooks);
app.use('/api/whatsapp', whatsappRouter); // WhatsApp templates, campaigns & messaging
app.use('/api/whatsapp-config', whatsappConfigRouter); // WhatsApp provider configuration management
app.use('/api/whatsapp-numbers', whatsappNumbersRouter); // WhatsApp multiple numbers management
app.use('/api/payments', paymentRouter); // Payment gateway management
app.use('/api/whatsapp-business', whatsappBusinessRouter); // WhatsApp Business API integration
app.use('/api/whatsapp-production', whatsappProductionRouter); // Production WhatsApp messaging with templates
app.use('/api/team/communication-workspace', teamCommunicationWorkspace);
app.use('/api/admin/communication-workspace', adminCommunicationWorkspace);
app.use('/api/crm/workspace', crmCommunicationWorkspace);
app.use('/api/chat', chatRouter); // Chat system endpoints
app.use('/api/support', supportChatRouter); // Omnichannel support chat (WhatsApp + In-App -> Chatwoot)
app.use('/api/omnichannel', omnichannelJourneyRouter); // Omnichannel journey builder — multi-channel patient messaging
app.use('/api/embeddings', embeddingsRouter); // Embeddings management via PGVector
app.use('/api/cdss', cdssKnowledgeRouter); // CDSS mobile aliases: /query, /guidelines
app.use('/api/cdss/knowledge', cdssKnowledgeRouter); // CDSS Knowledge base (Gale Encyclopedia, medical PDFs)
app.use('/api/tickets', ticketsRouter); // Support ticket management system
app.use('/api/tenants', tenantRouter); // Multi-tenant organization management
app.use('/api/tenant-domains', tenantDomainRouter); // Custom domain management
app.use('/api/admin/dedicated-installations', dedicatedInstallationsRouter({ pool: pgPool, authenticate: authUser }));
app.use('/api/field', fieldForceRouter); // Smart Force field force module (Team login, 'Field Force' permission)
app.use('/api/crm/field-force', crmFieldForceRouter); // Field force management — Business Head CRM view
app.use('/api/corporate', corporateRouter); // Corporate benefits and plans
app.use('/api/corporate', corporateReferralRouter); // HR-issued lab referral letters (template + issue + PDF)
app.use('/api/aggregators', aggregatorRouter); // Aggregator organizational hierarchy
app.use('/api/aggregator-auth', aggregatorAuthRouter); // Aggregator authentication (login/register)
app.use('/api/corporates', aggregatorRouter); // Corporate management endpoints
app.use('/api/corporate', aggregatorRouter); // Self-service corporate endpoints
app.use('/api/scribe', scribeRouter); // AI Scribe - Public API entrypoint
app.use('/api/hospital/scribe', scribeRouter); // AI Scribe - Hospital dashboard entrypoint
app.use('/api/offline-scribe', offlineScribeRouter); // Offline AI Scribe - CPU-only, Indian languages
app.use('/api/voice-assistant', voiceAssistantRouter); // Doctor Voice Assistant - Siri-style AI agent
app.use('/api/doctor-copilot', doctorCopilotRouter); // Unified doctor AI gateway (AI-PLATFORM-001)
app.use('/api/doctor/chat', doctorChatRouter); // Doctor ↔ Patient / Doctor ↔ Nurse messaging
app.use('/api/doctors/imaging', doctorImagingRouter); // Medical imaging (CT, MRI, USG, Echo, Cathlab, X-Ray)
import doctorRisReferredRouter from './routes/doctor-ris-referred.route.js';
app.use('/api/doctors/ris-referred', doctorRisReferredRouter); // Lab-referred RIS studies — read + Draft-only report review for the referring doctor
app.use('/api/ai-nodes', localAiNodeRouter); // Cloud Mother - Local AI Node management for hospital multi-tenancy
app.use('/api', hospitalRouter); // Hospital directory and SPN network
app.use('/api/hospital', executiveDashboardRouter); // CEO/CFO/COO/MS executive dashboards
app.use('/api/hospital/practice', hospitalPracticeRouter); // Hospital practice management (appointments, patients, staff, resources)
app.use('/api/hospital/billing', hospitalBillingRouter); // Hospital billing suite — stations, invoices, PGI, audit
app.use('/api/hospital/finance', hospitalFinanceRouter); // Accounts books: vendors, expenses, budgets, tax, journal
app.use('/api/hospital/clinical-notes', hospitalClinicalNotesRouter); // Hospital HMIS progress notes / SOAP
app.use('/api/hospital', hospitalPracticeRouter); // Alias practice endpoints for hospital dashboard modules
app.use('/api/hospital/auth', hospitalAuthRouter); // Hospital authentication & corporate onboarding
app.use('/api/user-associations', userAssociationRouter); // User hierarchy and entity associations
app.use('/api/clinics', clinicRouter); // Clinics directory (labs, dental, etc.)
app.use('/api/coupons', couponRouter); // Corporate HC coupon management
mountLabRoutes(app, 'directory'); // lab routes — see routes/lab/registry.js
app.use('/api/pharmacy', pharmacyRouter); // Pharmacy authentication and management
app.use('/api/ambulance', ambulanceRouter); // Ambulance service authentication and management
app.use('/api/homecare', homecareRouter); // Homecare provider authentication and management
app.use('/api/pharmacy-orders', patientPharmacyOrdersRouter); // Patient-facing pharmacy order management
app.use('/api/devices', deviceRouter); // Device management (smart tablets with SIM)
app.use('/api/wearables', wearableRouter); // Wearable devices (smartwatch, band, ring)
app.use('/api/health-data', healthDataRouter); // BLE device health data sync
// Mobile app v1.2.8 calls bare /api/vitals; the store lives at /health-data/vitals.
app.get('/api/vitals', forwardToRouter(healthDataRouter, '/vitals'));
app.post('/api/vitals', forwardToRouter(healthDataRouter, '/vitals'));
app.use('/api/poc-devices', pocDeviceRouter); // Point-of-care diagnostic devices (BLE)
app.use('/api/health-camps', healthCampRouter); // Outdoor health camp management
app.use('/api/email', emailRouter); // Production-ready email management system
app.use('/api/orders', orderRouter); // Order processing & team task management
app.use('/api/otp', otpRouter); // OTP generation, verification, and SMS delivery
app.use('/api/otp', otpTestRouter); // OTP testing - Direct Twilio WhatsApp delivery
app.use('/api/queues', queueRouter); // BullMQ queue management and monitoring
app.use('/api/video-events', videoEventsRouter); // Video streaming events for Kafka

// Master Data API - RAG profiled providers
import masterdataRouter from './routes/masterdata.routes.js';
app.use('/api/masterdata', masterdataRouter); // Master data providers (hospitals, labs, clinics) from RAG profiling

// Admin Management Routes
import adminHospitalsRouter from './routes/admin/hospitals.routes.js';
import adminCorporateQuotesRouter from './routes/admin/corporate-quotes.routes.js';
import adminCorporateBenefitProvidersRouter from './routes/admin/corporate-benefit-providers.routes.js';
import adminClinicsRouter from './routes/admin/clinics.routes.js';
import adminPharmaciesRouter from './routes/admin/pharmacies.routes.js';
import adminDoctorsRouter from './routes/admin/doctors.routes.js';
import adminAppointmentsRouter from './routes/admin/appointments.routes.js';
import drugPriceSyncRouter from './routes/admin/drug-price-sync.route.js';

app.use('/api/admin/hospitals', adminHospitalsRouter); // Admin hospital CRUD operations
mountLabRoutes(app, 'admin'); // lab routes — see routes/lab/registry.js
app.use('/api/admin/corporate-quotes', adminCorporateQuotesRouter); // Corporate OPD/wellness wallet quoting tool
app.use('/api/admin/corporate-benefit-providers', adminCorporateBenefitProvidersRouter); // Cashless network provider directory CRUD
app.use('/api/admin/clinics', adminClinicsRouter); // Admin clinic CRUD operations
app.use('/api/admin/pharmacies', adminPharmaciesRouter); // Admin pharmacy CRUD operations
app.use('/api/admin/doctors', adminDoctorsRouter); // Admin doctor CRUD operations
app.use('/api/admin/appointments', adminAppointmentsRouter); // Admin appointment oversight
app.use('/api/admin/aggregators', aggregatorRouter); // Admin broker/aggregator CRUD operations
app.use('/api/admin/drug-price-sync', drugPriceSyncRouter); // Drug price sync — NPPA, Jan Aushadhi, manual upload

// Clinic Portal Routes
import clinicAuthRouter from './routes/clinic/auth.routes.js';
import clinicDashboardRouter from './routes/clinic/dashboard.routes.js';
import clinicStaffRouter from './routes/clinic-staff.routes.js';
import clinicStaffAuthRouter from './routes/clinic-staff-auth.routes.js';
import clinicPatientRouter from './routes/clinic-patient.routes.js';

// Unified Patient Routes (for Mediczy Mobile App - Multi-tenant)
import unifiedPatientRouter from './routes/unified-patient.routes.js';

// Unified Hospital Staff Routes (for Mediczy Mobile App - Multi-tenant)
import unifiedHospitalStaffRouter from './routes/unified-hospital-staff.routes.js';
import { hrStaffLogin } from './controller/unified-hospital-staff.controller.js';
import { body as expressBody } from 'express-validator';

// Super Admin Routes
import superadminClinicRouter from './routes/superadmin-clinic.routes.js';
import superAdminTenantRouter from './routes/super-admin-tenant.route.js';

// SaaS Platform Routes (Super Admin)
import voiceScribeAdminRouter from './routes/voice-scriber-admin.route.js';
import errorTrackingRouter from './routes/error-tracking.route.js';
import saasDashboardRouter from './routes/saas-dashboard.route.js';
import complianceDashboardRouter from './routes/compliance-dashboard.route.js';
import reportBuilderRouter from './routes/report-builder.route.js';

app.use('/api/admin/voice-scriber', voiceScribeAdminRouter); // Voice Scriber device management & analytics
app.use('/api/admin/errors', errorTrackingRouter); // Error tracking & dashboard
app.use('/api/admin/saas', saasDashboardRouter); // SaaS usage dashboard & tenant analytics
app.use('/api/admin/compliance', complianceDashboardRouter); // HIPAA/DPDP compliance dashboard
app.use('/api/admin/reports', reportBuilderRouter); // Custom report builder & scheduled reports

app.use('/api/clinic/dashboard', clinicDashboardRouter); // Clinic practice management dashboard
app.use('/api/clinic', clinicAuthRouter); // Clinic authentication (login, logout, verify)
app.use('/api/clinic', clinicStaffAuthRouter); // Clinic staff authentication (doctor, nurse, assistant login)
app.use('/api/clinic', clinicStaffRouter); // Clinic staff management (CRUD operations)
app.use('/api/clinic', clinicPatientRouter); // Clinic patient management (signup, add, login, list)

// Unified Patient Routes - Single Mediczy Mobile App for all tenants
app.use('/api/patient', unifiedPatientRouter); // Patient signup, login, profile (multi-tenant)
// HR portal login alias for the web bundle. HR signs in with a USERNAME, so this must accept
// the same body as /api/hospital/staff/hr/login (hrLoginValidation) -- it previously required
// `email` via .isEmail(), which rejected every username-only HR login with "Invalid email".
// The browser happens to try /hospital/staff/hr/login first and so never hit this, but any
// direct caller of the documented alias did.
app.post('/api/hr/login', authLimiter, [
  expressBody('hospital_id').optional().trim(),
  expressBody('hospital_slug').optional().trim(),
  expressBody('hospital_domain').optional().trim(),
  expressBody('username').optional({ checkFalsy: true }).trim()
    .isLength({ min: 3, max: 100 }).withMessage('Username must be 3-100 characters')
    .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Username may contain only letters, numbers, dots, underscores and hyphens'),
  expressBody('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  expressBody('password').notEmpty().withMessage('Password is required')
], hrStaffLogin);
app.use('/api/hr', hrmsRouter); // HRMS staff, attendance, and biometric device workflows

// Unified Hospital Staff Routes - Single Mediczy Mobile App for all hospital staff
app.use('/api/hospital/staff', unifiedHospitalStaffRouter); // Doctor, nurse, assistant, insurance coordinator (multi-tenant)

// Super Admin Routes
app.use('/api/superadmin/clinics', superadminClinicRouter); // Super admin clinic management (create, list, update, delete)
app.use('/api/superadmin/tenants', superAdminTenantRouter); // Super admin tenant/organization management (multi-tenancy control)

// Phase 4: FHIR R4 API — Interoperability endpoints (metadata is public per FHIR spec)
app.use('/api/fhir/r4', fhirRouter);
// ITEM-23: FHIR Subscription push notifications
app.use('/api/fhir/r4/Subscription', fhirSubscriptionsRouter);

// ITEM-22: CDS Hooks — HL7 point-of-care clinical decision support (discovery is public)
app.use('/cds-hooks', cdsHooksRouter);

// ============== INTEROPERABILITY — GAP IMPLEMENTATIONS ==============
app.use('/api/sftp',       sftpRouter);        // GAP-5: SFTP/FTPS file exchange (AES-256-GCM creds)
app.use('/api/cda',        cdaRouter);         // GAP-7: CDA R2 discharge, referral, CCD, imaging
app.use('/api/compliance', nabhjciRouter);     // GAP-3: NABH 5th Ed + JCI 8th Ed compliance
app.use('/api/iso27001',   iso27001Router);    // GAP-4: ISO 27001:2022 — 93 controls, SoA, risk register
app.use('/api/edi',        x12nEdiRouter);     // GAP-1: X12N EDI 270/271/837P/837I/835/278 (HIPAA 5010)
app.use('/api/abdm',       abdmRouter);        // GAP-2: Live ABDM/ABHA client (consent, PHI, care-context)

// ============== HYPERGRID — IoT / Interoperability / AI Platform ==============
app.use('/api/hypergrid/mqtt',        hypergridMqttRouter);
app.use('/api/hypergrid/events',      hypergridEventsRouter);
app.use('/api/hypergrid/terminology', hypergridTerminologyRouter);
app.use('/api/hypergrid/dicom',       hypergridDicomRouter);
app.use('/api/orthanc',               orthancWebhookRouter);
app.use('/api/imaging',               imagingSessionRouter);
app.use('/api/imaging/platform',      imagingPlatformRouter);
app.use('/api/hypergrid/smart',       hypergridSmartFhirRouter);
app.use('/api/hypergrid/twins',       hypergridTwinsRouter);
app.use('/api/hypergrid/connectors',  hypergridConnectorRouter);
app.use('/api/hypergrid/edge',        hypergridEdgeRouter);
app.use('/api/hypergrid/marketplace', hypergridMarketplaceRouter);
app.use('/api/medical-device-gateway', medicalDeviceGatewayRouter);

// Ambulance Service Routes
import ambulanceAuthRouter from './routes/ambulance/auth.routes.js';

app.use('/api/ambulance', ambulanceAuthRouter); // Ambulance authentication (login, logout, verify)

// Homecare Service Routes
import homecareAuthRouter from './routes/homecare/auth.routes.js';

app.use('/api/homecare', homecareAuthRouter); // Homecare authentication (login, logout, verify)

// Corporate Service Routes
import corporateAuthRouter from './routes/corporate/auth.routes.js';
import corporateHrManagementRouter from './routes/corporate/hr-management.routes.js';
import preEmploymentRouter, { candidateRouter as preEmploymentCandidateRouter } from './routes/pre-employment.route.js';

app.use('/api/corporate', corporateAuthRouter); // Corporate authentication (login, logout, verify)
app.use('/api/corporate/hr', corporateHrManagementRouter); // Super-HR self-service team management (invite/remove/transfer)
app.use('/api/corporate/pre-employment', preEmploymentRouter); // Candidate-first PEME workflow; never a benefit entitlement
app.use('/api/pre-employment', preEmploymentCandidateRouter); // Secure candidate consent invitation endpoints

// Hospital Service Routes - Backwards-compatible alias (no /auth prefix)
app.use('/api/hospital', hospitalAuthAliasRouter); // Hospital authentication (login, logout, verify)

// Lab Service Routes
import dicomModalityRouter from './routes/dicom-modality.route.js';

mountLabRoutes(app, 'portal'); // lab routes — see routes/lab/registry.js
app.use('/api/dicom', dicomModalityRouter); // DICOM modality peer registry (Orthanc sync)

// Pharmacy Service Routes
// NOTE: Pharmacy routes already registered at line 616 with pharmacyRouter
// import pharmacyAuthRouter from './routes/pharmacy/auth.routes.js';
// app.use('/api/pharmacy', pharmacyAuthRouter); // Pharmacy authentication (login, logout, verify) - DISABLED: Duplicate route

// TPA Service Routes - DISABLED: Using main tpa.route.js at line 586 instead
// import tpaAuthRouter from './routes/tpa/auth.routes.js';
// app.use('/api/tpa', tpaAuthRouter); // TPA authentication (login, logout, verify)

// PSU Service Routes
import psuAuthRouter from './routes/psu/auth.routes.js';

app.use('/api/psu', psuAuthRouter); // PSU authentication (login, logout, verify)

// Insurer Service Routes
import insurerAuthRouter from './routes/insurer/auth.routes.js';

app.use('/api/insurer', insurerAuthRouter); // Insurer authentication (login, logout, verify)

// NGO Service Routes
import ngoAuthRouter from './routes/ngo/auth.routes.js';

app.use('/api/ngo', ngoAuthRouter); // NGO authentication (login, logout, verify)

// Communication Module Routes (Email, SMS, WhatsApp) - Available for all user types
app.use('/api/hospital/communication/chatwoot', hospitalChatwootRouter);
app.use('/api/hospital/communication', communicationRouter); // Hospital communication
app.use('/api/tpa/communication', communicationRouter); // TPA communication
app.use('/api/broker/communication', communicationRouter); // Insurance Broker communication
app.use('/api/insurance/communication', communicationRouter); // Insurance Company communication
app.use('/api/insurer/communication', communicationRouter); // Insurer communication (alias)
app.use('/api/admin/communication', communicationRouter); // Admin communication

// Token Management Routes (refresh, revoke)
import authTokenRouter from './routes/auth.token.route.js';
import authMfaRouter from './routes/auth.mfa.route.js';
app.use('/api/auth', authTokenRouter); // Token refresh and revocation endpoints
app.use('/api/auth/mfa', authMfaRouter); // TOTP enrollment and privileged step-up authentication

import dataExportRouter from './routes/data-export.route.js';
app.use('/api/users/data', dataExportRouter);     // DPDPA data export & erasure

// Universal Auth Routes (logout, session-info for all user types)
// Temporarily disabled - requires ringFencing middleware
// import authUniversalRouter from './routes/auth.universal.route.js';
// app.use('/api/auth', authUniversalRouter); // Universal auth endpoints (logout, session-info, token revocation)

// ============== INPATIENT / HMIS CORE (Phase 1-4 Patient Journey) ==============
import adtRouter from './routes/adt.route.js';
import bedsManagementRouter from './routes/beds-management.route.js';
import otSchedulingRouter from './routes/ot-scheduling.route.js';
import emarRouter from './routes/emar.route.js';
import clinicalSafetyRouter from './routes/clinical-safety.route.js';
import vitalsRouter from './routes/vitals.route.js';
import erWorkflowRouter from './routes/er-workflow.route.js';
import patientNavigationRouter from './routes/patient-navigation.route.js';
import nursingIpdRouter from './routes/nursing-ipd.route.js';
import clinicalWorkspaceRouter from './routes/clinical-workspace.route.js';
import anesthesiaRouter from './routes/anesthesia.route.js';
import billingEstimateRouter from './routes/billing-estimate.route.js';
import corporateHmisRouter from './routes/corporate-hmis.route.js';
import teamOccupationalHealthRouter from './routes/team-occupational-health.route.js';
import clinicOccupationalHealthRouter from './routes/clinic-occupational-health.route.js';
import patientFitnessCertificatesRouter from './routes/patient-fitness-certificates.route.js';
import dischargeWorkflowRouter from './routes/discharge-workflow.route.js';
import followUpHmisRouter from './routes/follow-up-hmis.route.js';
import icuRouter from './routes/icu.route.js';
import hmisPreAuthRouter from './routes/hmis-preauth.route.js';
import nursingEchartRouter from './routes/nursing-echart.route.js';
import clinicalScoresRouter from './routes/clinical-scores.route.js';
import bedsideReferenceRouter from './routes/bedside-reference.route.js';
import hl7GatewayRouter from './routes/hl7-gateway.route.js';
import hmisAnalyticsRouter from './routes/hmis-analytics.route.js';
import hmisAlertsRouter from './routes/hmis-alerts.route.js';
import hmisAutomationRouter from './routes/hmis-automation.route.js';
import clinicalReportsRouter from './routes/clinical-reports.route.js';
import aiHmisOpsRouter from './routes/ai-hmis-ops.route.js';
import aiRevenueRouter from './routes/ai-revenue.route.js';
import aiDeptRouter from './routes/ai-dept.route.js';
import wardsAdminRouter from './routes/wards-admin.route.js';
import otRoomsAdminRouter from './routes/ot-rooms-admin.route.js';
import chargeMasterRouter from './routes/charge-master.route.js';
import pharmacyDispenseRouter from './routes/pharmacy-dispense.route.js';
import hospitalOsControlRouter from './routes/hospital-os-control.route.js';
import revenueShareRouter from './routes/revenue-share.route.js';
import marketplaceRouter from './routes/specialist-marketplace.route.js';
import teleIcuRouter from './routes/tele-icu-command.route.js';
import ssoRouter from './routes/sso.route.js';
import enterpriseAuthRouter from './routes/enterprise-auth.route.js';
import auditModuleRouter from './routes/audit.route.js';
import mrdModuleRouter from './routes/mrd.route.js';
import iamModuleRouter from './routes/iam.route.js';
import indiaHealthIntelligenceRouter from './routes/india-health-intelligence.route.js';
import patientCopilotRouter from './routes/patient-copilot.route.js';
import specialtyModuleRouter from './routes/specialty-module.route.js';

app.use('/api/v1/adt', adtRouter);
app.use('/api/v1/beds', bedsManagementRouter);
app.use('/api/v1/ot', otSchedulingRouter);
app.use('/api/v1/emar', emarRouter);
app.use('/api/clinical-safety', clinicalSafetyRouter);
app.use('/api/v1/vitals', vitalsRouter);
app.use('/api/v1/er', erWorkflowRouter);
app.use('/api/v1/navigation', patientNavigationRouter);
app.use('/api/v1/nursing', nursingIpdRouter);
app.use('/api/v1/clinical-workspace', clinicalWorkspaceRouter);
app.use('/api/v1/anesthesia', anesthesiaRouter);
app.use('/api/v1/billing', billingEstimateRouter);
app.use('/api/v1/corporate', corporateHmisRouter);
app.use('/api/team/occupational-health', teamOccupationalHealthRouter); // Camp/on-site fitness certificate issuance by Team clinical staff
app.use('/api/clinic/occupational-health', clinicOccupationalHealthRouter); // Fitness certificate issuance by a clinic's own doctor (clinic_staff login)
app.use('/api/user/fitness-certificates', patientFitnessCertificatesRouter); // Patient's own view of fitness certificates issued to them
app.use('/api/v1/occupational-health', corporateHmisRouter);
app.use('/api/v1/discharge', dischargeWorkflowRouter);
app.use('/api/v1/follow-up', followUpHmisRouter);
app.use('/api/v1/recovery', followUpHmisRouter);
app.use('/api/v1/icu', icuRouter);
app.use('/api/v1/insurance', hmisPreAuthRouter);
app.use('/api/v1/echart', nursingEchartRouter);
app.use('/api/v1/scores', clinicalScoresRouter);
mountLabRoutes(app, 'rules'); // lab routes — see routes/lab/registry.js
app.use('/api/v1/reference', bedsideReferenceRouter);
app.use('/api/v1/hl7', hl7GatewayRouter);
app.use('/api/v1/analytics', hmisAnalyticsRouter);
app.use('/api/v1/alerts', hmisAlertsRouter);
app.use('/api/v1/automation', hmisAutomationRouter);
app.use('/api/v1/reports/clinical', clinicalReportsRouter);
app.use('/api/v1/ai-ops', aiHmisOpsRouter);
app.use('/api/v1/ai-revenue', aiRevenueRouter);
app.use('/api/v1/ai-dept', aiDeptRouter);
app.use('/api/v1/wards', wardsAdminRouter);
app.use('/api/v1/ot-rooms', otRoomsAdminRouter);
app.use('/api/v1/charge-master', chargeMasterRouter);
app.use('/api/v1/pharmacy-dispense', pharmacyDispenseRouter);
app.use('/api/v1/hospital-os', hospitalOsControlRouter);
app.use('/api/v1/revenue-share', revenueShareRouter);
app.use('/api/v1/marketplace', marketplaceRouter);
app.use('/api/v1/tele-icu', teleIcuRouter);
app.use('/api/sso', ssoRouter);
app.use('/api/enterprise/auth', enterpriseAuthRouter);
app.use('/api/audit', auditModuleRouter); // Upgrade Plan A1 — read/export access to audit_logs
app.use('/api/mrd', mrdModuleRouter); // Upgrade Plan A2 — Medical Records Department workflow
app.use('/api/iam', iamModuleRouter); // Upgrade Plan A3 — consolidated core identity surface (additive, fronts existing routers)
app.use('/api/india-health', indiaHealthIntelligenceRouter); // Upgrade Plan A4 — India Health Intelligence layer (additive, fronts existing ABDM/CDA/CDS-Hooks routers)
app.use('/api/patient-copilot', patientCopilotRouter); // Upgrade Plan B6 — patient-facing record Q&A, hard-locked to req.user.id
app.use('/api/customer-care', customerCareRouter); // Customer-safe, non-clinical task bot
app.use('/api/specialty-module', specialtyModuleRouter); // Upgrade Plan B5 — specialty order-set/CDS engine; content stays draft-only until a named specialist approves it

// ============== ENTERPRISE API v2 (New Architecture) ==============
// API v2 - Enterprise-grade endpoints with proper MVC pattern
import apiV2Router from './api/v2/index.js';
app.use('/api/v2', apiV2Router);

// Mobile API Gateway - Dedicated endpoints for iOS/Android apps
import mobileApiRouter from './api/mobile/index.js';
app.use('/api/mobile', mobileApiRouter);

// ============== PLATFORM ADMIN API (PaaS Control Plane) ==============
// Platform API - Super Super Admin (admin@mediqzy.com) management endpoints
import platformApiRouter from './api/platform/index.js';
app.use('/api/platform', platformApiRouter);

// ============== DOMAIN RESOLVER MIDDLEWARE ==============
// Resolve tenant from domain/headers for multi-tenant routing
import { domainResolver } from './middleware/domainResolver.middleware.js';
app.use(domainResolver);

// ============== PHASE 3: Proactive Alerts Cron ==============
import proactiveAlertsCron from './services/ai-proactive-alerts-cron.service.js';
proactiveAlertsCron.start();

// ============== Daily Health Score Cron (09:00 AM) ==============
import dailyHealthScoreService from './services/daily-health-score.service.js';
dailyHealthScoreService.start();

// ============== Pharmacy: Drug Price Sync ==============
import drugPriceSyncService from './services/drug-price-sync.service.js';
drugPriceSyncService.start();

// ============== Pharmacy: Low-Stock / Near-Expiry Alert Scan ==============
import pharmacyStockAlertCronService from './services/pharmacy-stock-alert-cron.service.js';
pharmacyStockAlertCronService.start();

// ============== Corporate Employee QC (Daily 03:00 IST) ==============
import corporateEmployeeQcService from './services/corporate-employee-qc.service.js';
corporateEmployeeQcService.start();

// ============== Health Checkup Appointment Reminders (Daily 18:00 IST) ==============
import healthCheckupReminderCronService from './services/health-checkup-reminder-cron.service.js';
healthCheckupReminderCronService.start();

// ============== Imaging daily S3 → MinIO transfer (02:30) ==============
import { startImagingDailyMinioCron } from './services/imaging/imaging-daily-minio-cron.service.js';
startImagingDailyMinioCron();

// ============== PACS S3 → on-prem MinIO nightly archive (midnight) ==============
import { startPacsMinioArchiveCron } from './services/imaging/pacs-minio-archive-cron.service.js';
startPacsMinioArchiveCron();

import { startCrmSegmentRefreshCron } from './services/crm-segment-refresh-cron.service.js';
startCrmSegmentRefreshCron();

import { startCrmAutomationCron } from './services/crm-automation-cron.service.js';
startCrmAutomationCron();

// ============== SaMD: Drift Monitor (weekly Sun 01:00) ==============
import governanceServiceForCron from './services/ai-model-governance.service.js';
import { tick as cronTick, tickError as cronTickError, beginJob as cronBeginJob } from './utils/cronRegistry.js';
import cron from 'node-cron';
import nodemailer from './integrations/nodemailer.js';
import { runWeeklyMisForAllCorporates } from './services/corporate-wellness-mis.service.js';

async function sendDriftAlert(drifted) {
  if (!process.env.MEDICAL_DIRECTOR_EMAIL || !process.env.SMTP_HOST) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_FROM,
    to: process.env.MEDICAL_DIRECTOR_EMAIL,
    subject: '[ALERT] AI Model Drift Detected — Mediczy',
    text: `Drift detected in ${drifted.length} feature(s): ${drifted.join(', ')}.\n\nReview at: ${process.env.APP_URL || 'https://app.mediqzy.com'}/api/ai-governance/dashboard\n\nThis is an automated alert from the Mediczy AI Governance system.`,
  });
}

cron.schedule('0 1 * * 0', async () => {
  if (!(await cronBeginJob('ai_drift_monitor'))) return;   // one run at a time across processes; tick/tickError release it
  try {
    const result = await governanceServiceForCron.runDriftMonitor();
    cronTick('ai_drift_monitor', { alerts: result.alerts?.length || 0, features: result.results?.length || 0 });

    const drifted = result.results?.filter(r => r.psi > 0.20).map(r => r.feature) || [];
    if (drifted.length > 0) {
      console.warn(`[DriftMonitor] Drift detected in features: ${drifted.join(', ')}`);
      sendDriftAlert(drifted).catch(e => console.error('[DriftMonitor] Alert email failed:', e.message));
    }
  } catch (err) {
    cronTickError('ai_drift_monitor', err.message);
  }
});

// WP3 Stage F: durable CRM delivery of verified report observations (no-op until CRM_WEBHOOK_URL set)
cron.schedule('*/2 * * * *', async () => {
  if (!(await cronBeginJob('report_delivery_outbox'))) return;
  try {
    const { deliverPending } = await import('./services/report-delivery.service.js');
    const r = await deliverPending(25);
    cronTick('report_delivery_outbox', r);
  } catch (err) {
    cronTickError('report_delivery_outbox', err.message);
  }
});

cron.schedule('0 1 * * 1', async () => {
  if (!(await cronBeginJob('ai_demographic_parity'))) return;   // one run at a time across processes; tick/tickError release it
  try {
    const result = await governanceServiceForCron.computeDemographicParity();
    cronTick('ai_demographic_parity', { groups: result.groups?.length || 0, flagged: result.disparityFlagged || 0 });
  } catch (err) {
    cronTickError('ai_demographic_parity', err.message);
  }
});

// ============== Corporate Wellness Weekly MIS (Mon 08:00 IST) ==============
cron.schedule('30 2 * * 1', async () => {
  if (!(await cronBeginJob('corporate_weekly_mis'))) return;   // one run at a time across processes; tick/tickError release it
  try {
    const result = await runWeeklyMisForAllCorporates({ sendEmail: true });
    cronTick('corporate_weekly_mis', {
      corporates: result.length,
      ready: result.filter((row) => row.status === 'ready').length,
      failed: result.filter((row) => row.status === 'failed').length,
    });
  } catch (err) {
    cronTickError('corporate_weekly_mis', err.message);
  }
});

// ============== Hospital Billing Nightly Cron (02:00 IST) ==============
import { runNightlyBilling } from './services/hospital-billing-cron.service.js';

// Biomedical CMMS: mark overdue PM/calibration schedules and block clinical use until completion.
import biomedicalEquipment from './services/biomedical-equipment.service.js';
cron.schedule('30 0 * * *', async () => {
  if (!(await cronBeginJob('biomedical_pm_overdue'))) return;
  try {
    const result = await biomedicalEquipment.markPreventiveMaintenanceOverdue();
    cronTick('biomedical_pm_overdue', result);
  } catch (err) {
    cronTickError('biomedical_pm_overdue', err.message);
  }
});

cron.schedule('0 2 * * *', async () => {
  if (!(await cronBeginJob('hospital_billing_nightly'))) return;   // the service also holds its own lease (hospital-billing-nightly)
  try {
    const result = await runNightlyBilling();
    cronTick('hospital_billing_nightly', result);
  } catch (err) {
    cronTickError('hospital_billing_nightly', err.message);
  }
});

// ============== AR Follow-up: aging work-items + SLA escalation (01:30) ==============
import arFollowUpService from './services/ar-follow-up.service.js';
cron.schedule('30 1 * * *', async () => {
  // runArEscalation() holds its own cron lease (ar_follow_up_escalation).
  try {
    await arFollowUpService.runArEscalation();
  } catch (err) {
    cronTickError('ar_follow_up_escalation', err.message);
  }
});

// ============== Abandoned checkout expiry: cancel stale unpaid orders (W-ORD-1/2) ==============
import orderExpiryService from './services/order-expiry.service.js';
cron.schedule('*/10 * * * *', async () => {
  // expireAbandonedOrders() holds its own cron lease (order_abandonment_expiry)
  // and never cancels an order that has a successful or in-flight payment.
  try {
    await orderExpiryService.expireAbandonedOrders();
  } catch (err) {
    cronTickError('order_abandonment_expiry', err.message);
  }
});

// ============== ITEM-16: Audit Chain Integrity Check (daily 03:00 AM) ==============
import { verifyChain as verifyAuditChain } from './services/audit-chain.service.js';

cron.schedule('0 3 * * *', async () => {
  if (!(await cronBeginJob('audit_chain_verify'))) return;   // one run at a time across processes; tick/tickError release it
  try {
    const result = await verifyAuditChain();
    cronTick('audit_chain_verify', { valid: result.valid, checkedRows: result.checkedRows, brokenAt: result.brokenAt });
    if (!result.valid) {
      console.warn(`[AuditChain] INTEGRITY BREACH — chain broken at row id ${result.brokenAt}. Possible tampering detected. Checked ${result.checkedRows} rows.`);
    }
  } catch (err) {
    cronTickError('audit_chain_verify', err.message);
  }
});

// ITEM-06: Auto-create next month's audit_log partition on the 25th at 1 AM
import { ensureNextMonthPartition } from './migrations/audit-log-partitioning.migration.js';
cron.schedule('0 1 25 * *', async () => {
  if (!(await cronBeginJob('audit_log_partition'))) return;   // one run at a time across processes; tick/tickError release it
  try {
    await ensureNextMonthPartition();
    cronTick('audit_log_partition', { action: 'next_month_partition_ensured' });
  } catch (err) {
    cronTickError('audit_log_partition', err.message);
  }
});

// ============== SCM: PAR Auto-Reorder (every 6h) ==============
import { startScmParReorderCron } from './services/scm-par-reorder-cron.service.js';
startScmParReorderCron();

// ============== Parking: overstay scan (every 10 min) ==============
import { startParkingOverstayCron } from './services/parking-overstay-cron.service.js';
startParkingOverstayCron();

// ============== Surveillance: frame-log purge (daily) ==============
import { startSurveillancePurgeCron } from './services/surveillance-purge-cron.service.js';
startSurveillancePurgeCron();

// ============== Adoption: adherence occurrence delivery (feature-gated) ==============
import { startMedcoreAdoptionCron } from './services/medcore-adoption-cron.service.js';
startMedcoreAdoptionCron();

import reportBuilderService from './services/report-builder.service.js';
reportBuilderService.startScheduledReports().catch((error) => console.error('[reports] schedule restore failed:', error.message));

app.use('/api', (req, res) => res.status(404).json({success:false,code:'not_found',message:'API endpoint not found'}));

// Final catch-all error handler -- must be the last middleware. Anything
// that reaches here (including async route errors forwarded by
// express-async-errors) gets a clean JSON 500 instead of crashing the
// process or leaking Express's default HTML error page.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  logger.error('[unhandled route error]', { path: req.path, method: req.method, error: err?.message, stack: err?.stack });
  res.status(err?.statusCode || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err?.message || 'Internal server error'),
  });
});

export default app;
