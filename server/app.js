import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import helmet from "helmet";
import crypto from 'crypto';
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import fileUpload from 'express-fileupload';
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
import labIntegrationRouter from './routes/lab-integration.route.js';
import carePlanRouter from './routes/care-plan.route.js';
import queueManagementRouter from './routes/queue-management.route.js';
import consentManagementRouter from './routes/consent-management.route.js';
import delegationRouter from './routes/delegation.route.js';
import revenueInsightsRouter from './routes/revenue-insights.route.js';
import patientEngagementRouter from './routes/patient-engagement.route.js';
import fitnessRouter from "./routes/fitness.route.js";
import fitnessDataRouter from "./routes/fitnessData.js";
import appleHealthRouter from "./routes/apple-health.route.js";
import aiRouter from "./routes/ai.js";
import medicalAIRouter from "./routes/medical-ai.route.js";
import aiHealthRouter from "./routes/ai-health.route.js";
import aiVisionRouter from "./routes/ai-vision.route.js";
import aiScribeRouter from "./routes/ai-scribe.route.js";
import scribeRouter from "./routes/scribe.js";
import offlineScribeRouter from "./routes/offline-scribe.route.js";
import localAiNodeRouter from "./routes/local-ai-node.route.js";
import recordingRouter from "./routes/recording.route.js";
import uploadRouter from "./routes/upload.route.js";
import healthAssessmentRouter from "./routes/health-assessment.route.js";
import reportAnalysisRouter from "./routes/report-analysis.route.js";
import dietRouter from "./routes/diet.route.js";
import ayushmanRouter from "./routes/ayushman.route.js";
import placesRouter from './routes/places.js';
import ttsRouter from './routes/tts.route.js';

import adminRouter from './routes/admin.route.js';
import fcmRouter from './routes/fcm.route.js';
import callNotificationRouter from './routes/call-notification.route.js';
import firebaseStatusRouter from './routes/firebase-status.route.js';
import crmRouter from './routes/crm.route.js';
import asyncRouter from './routes/async.route.js';
import appointmentRouter from './routes/appointment.route.js';
import reportsRouter from './routes/reports.route.js';
import labTestsRouter from './routes/lab-tests.route.js';
import availabilityRouter from './routes/availability.route.js';
import membershipRouter from './routes/membership.route.js';
import orgMembershipPlansRouter from './routes/org-membership-plans.route.js';
import teamRouter from './routes/team.route.js';
import teamEmailRouter from './routes/teamEmail.route.js';
import emailSettingsRouter from './routes/emailSettings.route.js';
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
import whatsappConfigRouter from './routes/whatsapp.config.route.js';
import whatsappBusinessRouter from './routes/whatsapp.business.route.js';
import whatsappProductionRouter from './routes/whatsapp-production.route.js';
import whatsappNumbersRouter from './routes/whatsapp-numbers.route.js';
import rocketChatRouter from './routes/rocketchat.routes.js';
import chatRouter from './routes/chat.route.js';
import supportChatRouter from './routes/support-chat.route.js';
import omnichannelJourneyRouter from './routes/omnichannel-journey.route.js';
import ticketsRouter from './routes/tickets.route.js';
import tenantRouter from './routes/tenant.route.js';
import tenantDomainRouter from './routes/tenant-domain.route.js';
import emailRouter from './routes/email.route.js';
import paymentRouter from './routes/payment.route.js';
import orderRouter from './routes/order.route.js';
import videoEventsRouter from './routes/video-events.route.js';
import otpRouter from './routes/otp.route.js';
import otpTestRouter from './routes/otp.test.route.js';
import enhancedLabRouter from './routes/lab.route.enhanced.js';
import corporateRouter from './routes/corporate.route.js';
import aggregatorRouter from './routes/aggregator.route.js';
import aggregatorAuthRouter from './routes/aggregator-auth.route.js';
import cartRouter from './routes/cart.route.js';
import employeeNetworkRouter from './routes/employee-network.route.js';
import corporateBookingsRouter from './routes/corporate-bookings.route.js';
import hospitalRouter from './routes/hospital.route.js';
import hospitalAuthRouter from './routes/hospital-auth.route.js';
import hospitalAuthAliasRouter from './routes/hospital/auth.routes.js';
import hospitalInsuranceRouter from './routes/hospital-insurance.route.js';
import hospitalInsuranceAuthRouter from './routes/hospital-insurance/auth.routes.js';
import clinicRouter from './routes/clinic.route.js';
import pharmacyRouter from './routes/pharmacy.route.js';
import ambulanceRouter from './routes/ambulance.route.js';
import homecareRouter from './routes/homecare.route.js';
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
import healthDiaryRouter from './routes/health-diary.route.js';
import healthIntelligenceRouter from './routes/health-intelligence.route.js';
import sibControlRouter from './routes/sib-control.route.js';
import sibChatbotsRouter from './routes/sib-chatbots.route.js';
import { ringFencingMiddleware } from './middleware/ringFencing.js';
import onlineConsultationRouter from './routes/online-consultation.route.js';
import notificationRouter from './routes/notification.route.js';
import embeddingsRouter from './routes/embeddings.route.js';
import cdssKnowledgeRouter from './routes/cdss-knowledge.route.js';
import documentationRouter from './routes/documentation.route.js';
import circuitBreakerRouter from './routes/circuit-breaker.route.js';
import n8nCallbackRouter from './routes/webhooks/n8n-callback.route.js';
import oauthRouter from './routes/oauth.route.js';
import doctorOAuthRouter from './routes/doctor-oauth.route.js';
import authLoginRouter from './routes/auth.login.route.js';
import { authUser, requireRole } from './middleware/auth.middleware.js';
import { requireAppKey } from './middleware/appAuth.middleware.js';
import communicationRouter from './routes/communication.route.js';

// API v1 Routes (Multi-tenant wellness platform API)
import apiV1Router from './routes/api-v1-index.js';
import consultationRecordingRouter from './routes/consultation-recording.route.js';
import billingRouter from './routes/billing.route.js';
import moduleAccessRouter from './routes/module-access.route.js';
import roleRouter from './routes/role.route.js';
import hospitalPracticeRouter from './routes/hospital/practice.route.js';
import userAssociationRouter from './routes/userAssociation.route.js';

// Webinar routes
import adminWebinarRouter from './routes/admin/webinar.routes.js';
import adminWebinarModulesRouter from './routes/admin/webinar-modules.routes.js';
import doctorWebinarRouter from './routes/doctor/webinar.routes.js';
import publicWebinarRouter from './routes/webinar.routes.js';

// AI Brain intelligence layer
import aiBrainRouter from './routes/ai-brain.route.js';
import aiIntelligenceRouter from './routes/ai-intelligence.route.js';
import aiAnalyticsRouter from './routes/ai-analytics.route.js';

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

const app = express();

// SECURITY: Enhanced error handling for unhandled rejections and uncaught exceptions
import logger from './config/logger.js';  // Default export

let isShuttingDown = false;

// Graceful shutdown function
async function gracefulShutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }
  
  isShuttingDown = true;
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout (30s), forcing exit');
    process.exit(1);
  }, 30000);
  
  try {
    // Stop accepting new requests
    if (global.httpServer) {
      await new Promise((resolve) => {
        global.httpServer.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }
    
    // Close database connections
    if (global.sequelize) {
      await global.sequelize.close();
      logger.info('Database connections closed');
    }
    
    // Close Redis
    if (global.redisClient) {
      await global.redisClient.quit();
      logger.info('Redis connection closed');
    }
    
    // Close Kafka
    if (global.kafkaProducer) {
      await global.kafkaProducer.disconnect();
      logger.info('Kafka producer disconnected');
    }
    
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(exitCode);
    
  } catch (error) {
    logger.error('Error during graceful shutdown:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

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
    // TODO: Integrate with alerting system (Sentry, PagerDuty, etc.)
    // await sendCriticalAlert('Unhandled Promise Rejection', { reason, env: process.env.NODE_ENV });
  } catch (alertError) {
    logger.error('Failed to send alert:', { error: alertError.message });
  }
  
  // Graceful shutdown for critical errors
  if (isCriticalError(reason)) {
    logger.error('Critical error detected in promise rejection, initiating shutdown');
    await gracefulShutdown('UNHANDLED_REJECTION', 1);
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
    // await sendCriticalAlert('Uncaught Exception', { error, env: process.env.NODE_ENV });
  } catch (alertError) {
    logger.error('Failed to send alert:', { error: alertError.message });
  }
  
  // Always exit on uncaught exceptions (process is in unknown state)
  logger.error('Uncaught exception detected, initiating emergency shutdown');
  await gracefulShutdown('UNCAUGHT_EXCEPTION', 1);
});

// Handle SIGTERM (container orchestration, PM2)
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received');
  await gracefulShutdown('SIGTERM', 0);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  logger.info('SIGINT signal received');
  await gracefulShutdown('SIGINT', 0);
});

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
const uploadDirs = ['./uploads', './uploads/doctors', './uploads/temp', './uploads/chat'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created upload directory: ${dir}`);
  }
});

// Trust proxy - Required for rate limiting behind nginx proxy
// This allows Express to trust X-Forwarded-* headers from Nginx/Cloudflare
app.set('trust proxy', 1); // Trust first proxy only

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

// Initialize compliance schedulers (GDPR/DPDP/HIPAA)
if (process.env.NODE_ENV !== 'test') {
  initializeDataRetentionScheduler();
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

const defaultProdOrigins = ['https://app.mediqzy.com', 'https://mediqzy.com', 'https://www.mediqzy.com'];
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

const baseOrigins = envOrigins.length > 0
  ? envOrigins
  : (process.env.NODE_ENV === 'production' ? defaultProdOrigins : defaultDevOrigins);

// Always include core production + dev domains regardless of NODE_ENV.
const allowedOrigins = Array.from(new Set([
  ...baseOrigins,
  ...defaultProdOrigins,
  ...defaultDevOrigins
]));

// Debug CORS configuration
console.log('🔒 CORS Configuration:');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   CORS_ORIGIN env:', process.env.CORS_ORIGIN);
console.log('   Allowed Origins:', allowedOrigins);

// Block disallowed origins early with 403 (both preflight and actual requests)
app.use((req, res, next) => {
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  console.log('🔍 ORIGIN CHECK:', { origin, referer, url: req.url, method: req.method });
  
  if (origin && !allowedOrigins.includes(origin)) {
    console.log('🚫 CORS BLOCKED - Origin:', origin, 'URL:', req.url, 'Method:', req.method);
    console.log('   Allowed origins:', allowedOrigins);
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
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Already blocked by the pre-check middleware; return false to skip headers
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Handle preflight requests explicitly BEFORE rate limiting
app.options('*', (req, res) => {
  const origin = req.get('Origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).end();
  }
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).end();
});

// 3. Rate Limiting - Global and Authentication-specific
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // tighter global cap to reduce abuse
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
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
  message: 'Too many AI requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

const aiImageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Image analysis limit reached. Please retry later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', globalLimiter);
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/doctors/login', authLimiter);
app.use('/api/doctors/register', authLimiter);
app.use('/api/nurse/login', authLimiter);
app.use('/api/assistant/login', authLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/medical-ai', aiLimiter);
app.use('/api/ai/working-medical-consult', aiLimiter);
app.use('/api/ai/analyze-image', aiImageLimiter);

// Prometheus metrics middleware
app.use(metricsMiddleware);

// 4. Response Compression (gzip/deflate)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between speed and compression ratio
}));

// 5. Body Parsers and File Upload
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
const globalFileUploadMiddleware = fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded',
  createParentPath: true,
  tempFileDir: '/tmp/'
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/offline-scribe/transcribe')) {
    return next();
  }
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

// 9. Activity Logging (Track all user activities with timestamps)
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});
app.use(activityLogger({
  includeBody: false, // Set to detailed logging (be careful with sensitive data)
  excludePaths: ['/health', '/api/admin/activity-logs', '/api/admin/activity-stats']
}));

// Twilio WhatsApp Webhook Bypass - MUST RUN FIRST before session/auth checks
// Allow unauthenticated requests for Twilio webhooks and RocketChat outgoing webhooks
app.use((req, res, next) => {
  console.log('🚀 [Bypass Check] Path:', req.path);
  if (req.path.startsWith('/api/whatsapp-production/webhook') ||
      req.path.startsWith('/api/whatsapp-production/fallback') ||
      req.path.startsWith('/api/whatsapp-production/status-callback') ||
      req.path.startsWith('/api/support/webhook/rocketchat') ||
      req.path.startsWith('/api/support/webhook/whatsapp')) {
    console.log('✅ [Bypass Check] Setting skipAuth=true for path:', req.path);
    req.skipAuth = true;
  }
  next();
});

// 9. Session Timeout (HIPAA 15-minute idle timeout)
app.use(sessionTimeout);
// 10. Ring-Fencing Middleware (Prevent cross-user privilege escalation)
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

// Detailed health check endpoint
app.get('/health', authUser, requireRole('admin'), async (req, res) => {
  try {
    const health = await orchestrator.healthCheck();
    const mem = process.memoryUsage();
    const dbStates = health.databases || {
      postgres: health.postgres,
      duckdb: health.duckdb,
      redis: health.redis
    };

    const normalizedDbStates = Object.fromEntries(
      Object.entries(dbStates).map(([db, isConnected]) => [
        db,
        isConnected ? 'connected' : 'disconnected'
      ])
    );

    const criticalHealthy = Boolean(dbStates.postgres);

    const healthCheck = {
      status: criticalHealthy ? 'healthy' : 'degraded',
      orchestratorStatus: health.status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      memory: {
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100 + ' MB',
        heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100 + ' MB',
        rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100 + ' MB'
      },
      databases: normalizedDbStates,
      capabilities: {
        pgvector: health.pgvector || false,
        citus: health.citus || false
      },
      connections: health.connections,
      lastCheck: health.lastCheck
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

// Public health check endpoint (for monitoring tools, load balancers, etc.)
app.get('/api/health', async (req, res) => {
  try {
    const health = await orchestrator.healthCheck();
    const mem = process.memoryUsage();
    const dbStates = health.databases || {
      postgres: health.postgres,
      duckdb: health.duckdb,
      redis: health.redis
    };

    const normalizedDbStates = Object.fromEntries(
      Object.entries(dbStates).map(([db, isConnected]) => [
        db,
        isConnected ? 'connected' : 'disconnected'
      ])
    );

    const criticalHealthy = Boolean(dbStates.postgres);

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

// OAuth2 Routes (must be before authentication middleware)
app.use('/api/auth', oauthRouter);
app.use('/api/auth/doctor', doctorOAuthRouter);
app.use('/api/auth', authLoginRouter);

// OAuth Server Routes (Rocket.Chat SSO - standard OAuth endpoints)
app.use('/oauth', oauthRouter);

// API v1 - Multi-tenant Wellness Platform (OIDC-based authentication)
app.use('/v1', apiV1Router);

app.use("/api/users", userRouter);
app.use("/api/addresses", addressRouter);
app.use("/api/family-members", familyMemberRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/membership-plans", membershipPlansRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/password-reset", passwordResetRouter);

// DEBUG: Log all /api/doctors/services requests
app.use((req, res, next) => {
  if (req.path.includes('/doctors/services')) {
    const fs = require('fs');
    fs.appendFileSync('/tmp/app-request-debug.log', 
      `${new Date().toISOString()} ${req.method} ${req.path} ${req.url}\n`
    );
  }
  next();
});

app.use("/api/reports", reportsRouter); // Patient medical reports
app.use("/api/reports", uploadRouter); // Medical report upload
app.use("/api/health-assessment", healthAssessmentRouter); // Health risk assessment
app.use("/api/reports", reportAnalysisRouter); // Report analysis

// Doctor routes - all mounted under /api/doctors for consistency
app.use("/api/doctors", doctorRoutes); // Core: login, register, profile, appointments
app.use("/api/doctors", doctorEnhancedRoutes); // Enhanced: search, public profiles
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
app.use("/api/doctor/lab-integration", labIntegrationRouter); // Lab results, abnormal flagging, patient notifications
app.use("/api/doctor/care-plans", carePlanRouter); // Care plans, tasks, reminders
app.use("/api/doctor/queue", queueManagementRouter); // Queue management, triage, ETA, no-show handling
app.use("/api/doctor/consent", consentManagementRouter); // Consent management, e-signatures, HIPAA compliance
app.use("/api/doctor/delegation", delegationRouter); // Delegation logs, audit trails, co-signatures
app.use("/api/doctor/revenue", revenueInsightsRouter); // Revenue insights, profitability, claim tracking
app.use("/api/doctor/engagement", patientEngagementRouter); // Patient engagement, post-visit instructions
app.use("/api/membership", membershipRouter);
app.use("/api/org-membership-plans", orgMembershipPlansRouter); // Organization-specific plan customization
app.use("/api/insurance", insuranceRouter);
app.use("/api/insurance-policies", insurancePolicyRouter); // Comprehensive insurance policy & rule engine
app.use("/api/insurance-company", insuranceCompanyRouter); // Insurance company & corporate login
app.use("/api/insurance-broker", insuranceBrokerRouter); // Insurance broker/intermediary login
app.use('/api/broker-integrations', brokerIntegrationRouter); // Broker server-to-server integration + signed webhooks
app.use("/api/hospital/insurance", hospitalInsuranceRouter); // IHX-like hospital insurance claims dashboard
app.use("/api/hospital-insurance/auth", hospitalInsuranceAuthRouter); // Separate insurance portal login
app.use("/api/tpa", tpaRouter); // TPA (Third Party Administrator) login
app.use("/api/appointments", appointmentRouter);
app.use("/api/lab-tests", labTestsRouter);
app.use("/api/employee", employeeNetworkRouter); // Corporate employee network (my-labs, my-hospitals, my-clinics)
app.use("/api/corporate-bookings", corporateBookingsRouter); // Team member books corporate health checkups + notifies employees
app.use("/api/cart", cartRouter); // Lab test cart management
app.use("/api/prescriptions", prescriptionRouter); // Prescription CRUD and PDF generation
app.use("/api/ehr", ehrRouter); // Electronic Health Records - admin access to patient records
app.use("/api/health-diary", healthDiaryRouter); // Patient health journal and diary entries
app.use("/api/health-intelligence", healthIntelligenceRouter); // Dr. iSHA Health Intelligence Dashboard
app.use("/api/sib", sibControlRouter); // SIB Control Layer - AI decision management, kill switch, approvals
app.use("/api/sib-chatbots", sibChatbotsRouter); // SIB Chatbots - Admin dashboard AI chatbots (Health, Appointment, Emergency)
app.use("/api/health", healthRouter); // Unified health metrics endpoint
app.use("/api/consultation", onlineConsultationRouter); // Online consultation booking flow
app.use("/api/consultation-recordings", consultationRecordingRouter); // Consultation recording and AI transcription
app.use("/api/billing", billingRouter); // Billing, orders, invoices, and payments
app.use("/api/notifications", notificationRouter); // In-app notification management
app.use("/api/fitness", fitnessRouter);
app.use("/api/fitness-data", fitnessDataRouter); // Health and fitness tracking data
app.use("/api/apple-health", appleHealthRouter); // Apple HealthKit integration for iOS
app.use("/api/ai", aiRouter);
app.use("/api/medical-ai", medicalAIRouter);
app.use("/api/ai-health", aiHealthRouter); // AI health assistant, diet plans, Dr. ISHA
app.use("/api/v3/ai-brain", authUser, aiBrainRouter); // AI Brain intelligence layer (agentic LLM + RAG + 15 tools)
app.use("/api/v3/ai-intelligence", authUser, aiIntelligenceRouter); // Drug interactions, insurance, triage, risk scores, insights
app.use("/api/v3/ai-analytics", authUser, aiAnalyticsRouter); // AI analytics dashboard (LLM ops, quality, tools, population health)
app.use("/api/diet", dietRouter); // Diet plan shortcut (alias for /api/ai-health/diet)
app.use("/api/ayushman", ayushmanRouter);
app.use('/api/places', placesRouter);

app.use('/stats', adminStatsRouter); // Admin dashboard statistics (public stats endpoint, outside /api to bypass middleware)
app.use('/api/admin', adminRouter);
app.use('/api/admin', adminApiRouter); // API credentials, aggregators, and other admin APIs
app.use('/api/admin/webinars', authUser, requireRole('admin'), adminWebinarRouter); // Super admin webinar management
app.use('/api/admin/webinar-modules', authUser, requireRole('admin'), adminWebinarModulesRouter); // Webinar module & notification configuration
app.use('/api/admin/module-access', moduleAccessRouter);
app.use('/api/module-access', moduleAccessRouter); // Public endpoint for checking user's own module access
app.use('/api/admin/roles', roleRouter); // Role management with CRUD + module access
app.use('/api/roles', roleRouter); // User-facing role endpoints (check own roles/modules)
app.use('/api/team', teamRouter);
app.use('/api/team/emails', teamEmailRouter); // Team email inbox with AI processing
app.use('/api/email-settings', authUser, emailSettingsRouter); // User SMTP/IMAP configuration settings
app.use('/api/admin/email-settings', authUser, requireRole('admin'), emailSettingsRouter); // Admin email settings management
app.use('/api/doctor/webinars', authUser, doctorWebinarRouter); // Doctor webinar hosting
app.use('/api/nurse', nurseRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/patients', patientRouter); // Patient registration by multiple roles
app.use('/api', activityLogRoutes); // Activity logging routes
app.use('/api/crm', crmRouter);
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
app.use('/api/voice-config', voiceConfigRouter); // Voice call configuration management
app.use('/api/whatsapp-config', whatsappConfigRouter); // WhatsApp provider configuration management
app.use('/api/whatsapp-numbers', whatsappNumbersRouter); // WhatsApp multiple numbers management
app.use('/api/payments', paymentRouter); // Payment gateway management
app.use('/api/rocketchat', rocketChatRouter); // RocketChat integration
app.use('/api/whatsapp-business', whatsappBusinessRouter); // WhatsApp Business API integration
app.use('/api/whatsapp-production', whatsappProductionRouter); // Production WhatsApp messaging with templates
app.use('/api/chat', chatRouter); // Chat system endpoints
app.use('/api/support', supportChatRouter); // Omnichannel support chat (WhatsApp + In-App to RocketChat)
app.use('/api/omnichannel', omnichannelJourneyRouter); // Omnichannel journey builder — multi-channel patient messaging
app.use('/api/embeddings', embeddingsRouter); // Embeddings management via PGVector
app.use('/api/cdss/knowledge', cdssKnowledgeRouter); // CDSS Knowledge base (Gale Encyclopedia, medical PDFs)
app.use('/api/tickets', ticketsRouter); // Support ticket management system
app.use('/api/tenants', tenantRouter); // Multi-tenant organization management
app.use('/api/tenant-domains', tenantDomainRouter); // Custom domain management
app.use('/api/corporate', corporateRouter); // Corporate benefits and plans
app.use('/api/aggregators', aggregatorRouter); // Aggregator organizational hierarchy
app.use('/api/aggregator-auth', aggregatorAuthRouter); // Aggregator authentication (login/register)
app.use('/api/corporates', aggregatorRouter); // Corporate management endpoints
app.use('/api/corporate', aggregatorRouter); // Self-service corporate endpoints
app.use('/api/scribe', scribeRouter); // AI Scribe - Public API entrypoint
app.use('/api/hospital/scribe', scribeRouter); // AI Scribe - Hospital dashboard entrypoint
app.use('/api/offline-scribe', offlineScribeRouter); // Offline AI Scribe - CPU-only, Indian languages
app.use('/api/ai-nodes', localAiNodeRouter); // Cloud Mother - Local AI Node management for hospital multi-tenancy
app.use('/api', hospitalRouter); // Hospital directory and SPN network
app.use('/api/hospital/practice', hospitalPracticeRouter); // Hospital practice management (appointments, patients, staff, resources)
app.use('/api/hospital', hospitalPracticeRouter); // Alias practice endpoints for hospital dashboard modules
app.use('/api/hospital/auth', hospitalAuthRouter); // Hospital authentication & corporate onboarding
app.use('/api/user-associations', userAssociationRouter); // User hierarchy and entity associations
app.use('/api/clinics', clinicRouter); // Clinics directory (labs, dental, etc.)
app.use('/api/coupons', couponRouter); // Corporate HC coupon management
app.use('/api/labs', enhancedLabRouter); // Enhanced laboratory management with comprehensive search
app.use('/api/pharmacy', pharmacyRouter); // Pharmacy authentication and management
app.use('/api/ambulance', ambulanceRouter); // Ambulance service authentication and management
app.use('/api/homecare', homecareRouter); // Homecare provider authentication and management
app.use('/api/devices', deviceRouter); // Device management (smart tablets with SIM)
app.use('/api/wearables', wearableRouter); // Wearable devices (smartwatch, band, ring)
app.use('/api/health-data', healthDataRouter); // BLE device health data sync
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
import adminLabsRouter from './routes/admin/labs.routes.js';
import adminClinicsRouter from './routes/admin/clinics.routes.js';
import adminPharmaciesRouter from './routes/admin/pharmacies.routes.js';
import adminDoctorsRouter from './routes/admin/doctors.routes.js';
import adminAppointmentsRouter from './routes/admin/appointments.routes.js';

app.use('/api/admin/hospitals', adminHospitalsRouter); // Admin hospital CRUD operations
app.use('/api/admin/labs', adminLabsRouter); // Admin lab CRUD operations
app.use('/api/admin/clinics', adminClinicsRouter); // Admin clinic CRUD operations
app.use('/api/admin/pharmacies', adminPharmaciesRouter); // Admin pharmacy CRUD operations
app.use('/api/admin/doctors', adminDoctorsRouter); // Admin doctor CRUD operations
app.use('/api/admin/appointments', adminAppointmentsRouter); // Admin appointment oversight
app.use('/api/admin/aggregators', aggregatorRouter); // Admin broker/aggregator CRUD operations

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

// Unified Hospital Staff Routes - Single Mediczy Mobile App for all hospital staff
app.use('/api/hospital/staff', unifiedHospitalStaffRouter); // Doctor, nurse, assistant, insurance coordinator (multi-tenant)

// Super Admin Routes
app.use('/api/superadmin/clinics', superadminClinicRouter); // Super admin clinic management (create, list, update, delete)
app.use('/api/superadmin/tenants', superAdminTenantRouter); // Super admin tenant/organization management (multi-tenancy control)

// Ambulance Service Routes
import ambulanceAuthRouter from './routes/ambulance/auth.routes.js';

app.use('/api/ambulance', ambulanceAuthRouter); // Ambulance authentication (login, logout, verify)

// Homecare Service Routes
import homecareAuthRouter from './routes/homecare/auth.routes.js';

app.use('/api/homecare', homecareAuthRouter); // Homecare authentication (login, logout, verify)

// Corporate Service Routes
import corporateAuthRouter from './routes/corporate/auth.routes.js';

app.use('/api/corporate', corporateAuthRouter); // Corporate authentication (login, logout, verify)

// Hospital Service Routes - Backwards-compatible alias (no /auth prefix)
app.use('/api/hospital', hospitalAuthAliasRouter); // Hospital authentication (login, logout, verify)

// Lab Service Routes
import labAuthRouter from './routes/lab/auth.routes.js';

app.use('/api/lab', labAuthRouter); // Lab authentication (login, logout, verify)

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
app.use('/api/hospital/communication', communicationRouter); // Hospital communication
app.use('/api/tpa/communication', communicationRouter); // TPA communication
app.use('/api/broker/communication', communicationRouter); // Insurance Broker communication
app.use('/api/insurance/communication', communicationRouter); // Insurance Company communication
app.use('/api/insurer/communication', communicationRouter); // Insurer communication (alias)
app.use('/api/admin/communication', communicationRouter); // Admin communication

// Token Management Routes (refresh, revoke)
import authTokenRouter from './routes/auth.token.route.js';
app.use('/api/auth', authTokenRouter); // Token refresh and revocation endpoints

// Universal Auth Routes (logout, session-info for all user types)
// Temporarily disabled - requires ringFencing middleware
// import authUniversalRouter from './routes/auth.universal.route.js';
// app.use('/api/auth', authUniversalRouter); // Universal auth endpoints (logout, session-info, token revocation)

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

export default app;
