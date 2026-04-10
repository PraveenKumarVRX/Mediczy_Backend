import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
const JWT_SECRET = JWT_CONFIG.SECRET;

// User type to allowed endpoints mapping
const USER_TYPE_PERMISSIONS = {
  user: {
    allowedPaths: [
      '/api/user',
      '/api/auth',
      '/api/doctors',
      '/api/appointments',
      '/api/patients',
      '/api/enhanced-appointments',  // Enhanced appointment booking
      '/api/prescriptions',
      '/api/health-tracker',
      '/api/consultation',
      '/api/chat',
      '/api/ai-doctor',
      '/api/ai',  // AI doctor chat endpoints
      '/api/medical-ai',  // Medical AI including emergency triage
      '/api/symptoms',
      '/api/medicine',
      '/api/emergency',
      '/api/diet',
      '/api/plans',
      '/api/bookings',
      '/api/health-feed',
      '/api/video',
      '/api/ayushman',
      '/api/membership',  // Membership plans and subscriptions
      '/api/membership-plans', // Membership plans (alternative route)
      '/api/wallet',  // User wallet and payments
      '/api/fitness',  // Fitness tracking
      '/api/fitness-data',  // Health and fitness data
      '/api/health',  // Unified health metrics
      '/api/apple-health',  // Apple Health integration
      '/api/health-diary',  // Health diary entries
      '/api/health-data',  // BLE device health data sync
      '/api/health-assessment',  // Health risk assessments
      '/api/health-intelligence',  // Dr. iSHA Health Intelligence Dashboard
      '/api/reports',  // Medical report uploads and analysis
      '/api/labs',  // Lab tests and diagnostic centers
      '/api/lab-tests',  // Lab test bookings and tracking
      '/api/cart',  // Lab test cart management
      '/api/family-members',  // Family member management
      '/api/notifications',  // User notifications
      '/api/mobile',  // Mobile API gateway
      '/api/v3/ai-brain',  // AI Brain intelligence layer
      '/api/v3/ai-intelligence',  // Drug interactions, triage, risk scores, insights
      '/api/v3/ai-analytics',  // AI usage analytics
      '/api/ai-health',  // AI health chat & Dr. iSHA
      '/api/users',  // User profile management
      '/api/addresses',  // Address management
      '/api/billing',  // Orders, invoices, payments
      '/api/payments',  // Razorpay payment processing
      '/api/insurance',  // Insurance policies & claims
      '/api/corporate',  // Corporate benefits & health checkups
      '/api/employee',  // Employee corporate network
      '/api/tts',  // Text-to-speech
      '/api/fcm',  // FCM push notification tokens
      '/api/privacy',  // Consent & data export (GDPR)
      '/api/support',  // Support chat
      '/api/tickets',  // Support tickets
      '/api/wearables',  // Wearable device management
      '/api/devices',  // Device management
      '/api/health-camps',  // Health camp discovery
      '/api/leaderboard',  // Health goals, challenges & leaderboard
      '/api/masterdata',  // Specialties, hospitals, labs directory
      '/api/places',  // Nearby places search
      '/api/module-access',  // Module access check
      '/api/roles',  // Role-based module access
      '/api/otp',  // OTP send/verify
      '/api/password-reset',  // Password reset
      '/api/omnichannel',  // Omnichannel messaging
      '/api/hospitals',  // Hospital directory
      '/api/clinics',  // Clinic directory
      '/api/poc-devices',  // POC device management
      '/api/firebase',  // Firebase status & test
      '/api/ehr',  // Electronic Health Records
      '/api/emr',  // EMR folder (own record)
      '/api/homecare',  // Homecare service booking (patients book home visits)
      '/api/pharmacy-orders',  // Patient-facing pharmacy order management
      '/v1'  // API v1 multi-tenant mobile app endpoints
    ],
    tokenField: 'userId'
  },
  patient: {  // Alias for 'user' - same permissions
    allowedPaths: [
      '/api/user',
      '/api/auth',
      '/api/doctors',
      '/api/appointments',
      '/api/patients',
      '/api/enhanced-appointments',  // Enhanced appointment booking
      '/api/prescriptions',
      '/api/health-tracker',
      '/api/consultation',
      '/api/chat',
      '/api/ai-doctor',
      '/api/ai',  // AI doctor chat endpoints
      '/api/medical-ai',  // Medical AI including emergency triage
      '/api/symptoms',
      '/api/medicine',
      '/api/emergency',
      '/api/diet',
      '/api/plans',
      '/api/bookings',
      '/api/health-feed',
      '/api/video',
      '/api/ayushman',
      '/api/membership',  // Membership plans and subscriptions
      '/api/membership-plans', // Membership plans (alternative route)
      '/api/wallet',  // User wallet and payments
      '/api/fitness',  // Fitness tracking
      '/api/fitness-data',  // Health and fitness data
      '/api/health',  // Unified health metrics
      '/api/apple-health',  // Apple Health integration
      '/api/health-diary',  // Health diary entries
      '/api/health-data',  // BLE device health data sync
      '/api/health-assessment',  // Health risk assessments
      '/api/health-intelligence',  // Dr. iSHA Health Intelligence Dashboard
      '/api/reports',  // Medical report uploads and analysis
      '/api/labs',  // Lab tests and diagnostic centers
      '/api/lab-tests',  // Lab test bookings and tracking
      '/api/cart',  // Lab test cart management
      '/api/family-members',  // Family member management
      '/api/notifications',  // User notifications
      '/api/mobile',  // Mobile API gateway
      '/api/v3/ai-brain',  // AI Brain intelligence layer
      '/api/v3/ai-intelligence',  // Drug interactions, triage, risk scores, insights
      '/api/v3/ai-analytics',  // AI usage analytics
      '/api/ai-health',  // AI health chat & Dr. iSHA
      '/api/users',  // User profile management
      '/api/addresses',  // Address management
      '/api/billing',  // Orders, invoices, payments
      '/api/payments',  // Razorpay payment processing
      '/api/insurance',  // Insurance policies & claims
      '/api/corporate',  // Corporate benefits & health checkups
      '/api/employee',  // Employee corporate network
      '/api/tts',  // Text-to-speech
      '/api/fcm',  // FCM push notification tokens
      '/api/privacy',  // Consent & data export (GDPR)
      '/api/support',  // Support chat
      '/api/tickets',  // Support tickets
      '/api/wearables',  // Wearable device management
      '/api/devices',  // Device management
      '/api/health-camps',  // Health camp discovery
      '/api/leaderboard',  // Health goals, challenges & leaderboard
      '/api/masterdata',  // Specialties, hospitals, labs directory
      '/api/places',  // Nearby places search
      '/api/module-access',  // Module access check
      '/api/roles',  // Role-based module access
      '/api/otp',  // OTP send/verify
      '/api/password-reset',  // Password reset
      '/api/omnichannel',  // Omnichannel messaging
      '/api/hospitals',  // Hospital directory
      '/api/clinics',  // Clinic directory
      '/api/poc-devices',  // POC device management
      '/api/firebase',  // Firebase status & test
      '/api/ehr',  // Electronic Health Records
      '/api/emr',  // EMR folder (own record)
      '/api/homecare',  // Homecare service booking (patients book home visits)
      '/api/pharmacy-orders',  // Patient-facing pharmacy order management
      '/v1'  // API v1 multi-tenant mobile app endpoints
    ],
    tokenField: 'userId'
  },
  doctor: {
    allowedPaths: [
      '/api/doctor',
      '/api/doctors',
      '/api/doctor-settings',
      '/api/users',
      '/api/patients',
      '/api/appointments',
      '/api/enhanced-appointments',  // Enhanced appointment booking for doctors
      '/api/consultation',  // Online consultation endpoints for doctors
      '/api/prescriptions',
      '/api/video',
      '/api/chat',
      '/api/call-notification',  // Doctor-to-patient call notifications
      '/api/ai',  // AI endpoints including prescription generation
      '/api/ai-scribe',
      '/api/offline-scribe',  // Offline AI Scribe for prescription generation
      '/api/scribe',  // AI Scribe public API
      '/api/recording',
      '/api/recordings',  // Consultation recordings
      '/api/consultation-recordings',  // Consultation recordings (alternative route)
      '/api/cdss',  // Clinical Decision Support System
      '/api/billing',  // Billing and invoices
      '/api/notifications',  // Doctor notifications
      '/api/v2/doctors',  // Enterprise API v2 doctor endpoints
      '/api/mobile',  // Mobile API gateway for doctor app
      '/api/v3/ai-brain',  // AI Brain intelligence layer
      '/api/v3/ai-intelligence',  // Drug interactions, triage, risk scores, insights
      '/api/ehr',  // Electronic Health Records - patient records access
      '/api/emr',  // EMR folder (own record)
      '/api/fhir',  // FHIR R4 interoperability endpoints
      '/v1'  // API v1 multi-tenant mobile app endpoints
    ],
    tokenField: 'doctorId'
  },
  admin: {
    allowedPaths: [
      '/api/admin',
      '/api/db',
      '/api/superadmin', // Super admin tenant/organization management
      '/api/platform', // Platform management routes
      '/api/sib', // SIB Control Layer management
      '/api/health',
      '/api/users',
      '/api/doctors',
      '/api/team',
      '/api/appointments',
      '/api/plans',
      '/api/insurance',
      '/api/hospitals',
      '/api/clinics',
      '/api/labs',
      '/api/pharmacies',
      '/api/corporates',
      '/api/homecare',
      '/api/ambulance',
      '/api/medivac',
      '/api/ngo',
      '/api/psu',
      '/api/ohc',
      '/api/billing',
      '/api/accounting',
      '/api/payments',
      '/api/coupons',  // Corporate HC coupon management
      '/api/email',
      '/api/sms',
      '/api/whatsapp',
      '/api/whatsapp-production',  // Production WhatsApp messaging & conversations
      '/api/sib-chatbots',  // SIB AI chatbots (health, appointment, emergency)
      '/api/video',
      '/api/voice',
      '/api/tickets',
      '/api/chat',  // Chat dashboard for conversations & WhatsApp
      '/api/activity-log',
      '/api/health-risk',
      '/api/crm',
      '/api/reports',
      '/api/settings',
      '/api/masterdata',
      '/api/recordings',  // Admin access to consultation recordings
      '/api/consultation-recordings',  // Admin access to consultation recordings
      '/api/v3/ai-brain',  // AI Brain intelligence layer
      '/api/v3/ai-intelligence',  // Drug interactions, triage, risk scores, insights
      '/api/v3/ai-analytics',  // AI analytics dashboard (admin only)
      '/api/ehr',  // Electronic Health Records
      '/api/fhir',  // FHIR R4 interoperability endpoints
      '/v1'  // API v1 multi-tenant mobile app endpoints
    ],
    tokenField: 'adminId'
  },
  team: {
    allowedPaths: [
      '/api/team',
      '/api/admin',  // Allow access to admin routes for team members
      '/api/users',
      '/api/doctors',
      '/api/appointments',
      '/api/hospitals',
      '/api/clinics',
      '/api/labs',
      '/api/pharmacies',
      '/api/corporates',
      '/api/corporate-bookings',  // Team members book corporate health checkups
      '/api/plans',
      '/api/coupons',  // Team members can manage coupons
      '/api/activity-log',
      '/api/chat',
      '/api/email-settings',  // Team members can configure email settings
      '/api/tickets',  // Team members can view and manage support tickets
      '/api/whatsapp-production',  // Team access to WhatsApp conversations
      '/api/whatsapp',  // Team access to WhatsApp templates & messaging
      '/api/sib-chatbots',  // Team access to SIB AI chatbots
      '/api/ehr',  // Electronic Health Records
      '/api/emr',  // EMR folder — team can view all users
      '/v1'  // API v1 multi-tenant mobile app endpoints
    ],
    tokenField: 'teamId'
  },
  nurse: {
    allowedPaths: [
      '/api/nurse',
      '/api/patients',
      '/api/vitals',
      '/api/medications',
      '/api/appointments',
      '/api/notes'
    ],
    tokenField: 'nurseId'
  },
  assistant: {
    allowedPaths: [
      '/api/assistant',
      '/api/patients',
      '/api/orders',
      '/api/appointments',
      '/api/prescriptions',
      '/api/billing',
      '/api/messages',
      '/api/reports',
      '/api/v2/assistants'  // Enterprise API v2 assistant endpoints
    ],
    tokenField: 'assistantId'
  },
  crm: {
    allowedPaths: [
      '/api/crm',
    ],
    tokenField: 'userId'
  },
  corporate: {
    allowedPaths: [
      '/api/corporate',
      '/api/insurance-company/corporate',
      '/api/corporate/employees',
      '/api/corporate/appointments',
      '/api/corporate/analytics',
      '/api/corporate/benefits',
      '/api/corporate/claims',
      '/api/corporate/departments',
      '/api/corporate/compliance',
      '/api/corporate/reports',
      '/api/video',  // Enable video calls for corporate users
      '/api/doctors',  // Allow browsing doctors
      '/api/appointments',  // Allow user appointment management
      '/api/chat'  // Allow chat functionality
    ],
    tokenField: 'corporateId'
  },
  hospital: {
    allowedPaths: [
      '/api/hospital',
      '/api/hospital/staff',
      '/api/hospital/dashboard',
      '/api/hospital/patients',
      '/api/hospital/appointments',
      '/api/hospital/departments',
      '/api/insurance/admin',
      '/api/ehr',  // Electronic Health Records
      '/api/users/change-password'  // Password change from hospital settings
    ],
    tokenField: 'hospitalId'
  },
  clinic: {
    allowedPaths: [
      '/api/clinic',
      '/api/clinic/dashboard',
      '/api/clinic/appointments',
      '/api/clinic/patients',
      '/api/clinic/inventory',
      '/api/clinic/invoices'
    ],
    tokenField: 'clinicId'
  },
  lab: {
    allowedPaths: [
      '/api/lab',
      '/api/lab/dashboard',
      '/api/lab/tests',
      '/api/lab/results',
      '/api/lab/reports'
    ],
    tokenField: 'labId'
  },
  pharmacy: {
    allowedPaths: [
      '/api/pharmacy',
      '/api/pharmacy/dashboard',
      '/api/pharmacy/orders',
      '/api/pharmacy/inventory',
      '/api/pharmacy/prescriptions'
    ],
    tokenField: 'pharmacyId'
  },
  homecare: {
    allowedPaths: [
      '/api/homecare'
    ],
    tokenField: 'homecareId'
  },
  ambulance: {
    allowedPaths: [
      '/api/ambulance'
    ],
    tokenField: 'ambulanceId'
  },
  broker: {
    allowedPaths: [
      '/api/insurance-broker'
    ],
    tokenField: 'brokerId'
  },
  insurance_company: {
    allowedPaths: [
      '/api/insurance-company'
    ],
    tokenField: 'insuranceCompanyId'
  },
  tpa: {
    allowedPaths: [
      '/api/tpa',
      '/api/tpa/dashboard',
      '/api/tpa/claims',
      '/api/tpa/network',
      '/api/tpa/policies'
    ],
    tokenField: 'tpaId'
  },
  psu: {
    allowedPaths: [
      '/api/psu',
      '/api/psu/dashboard',
      '/api/psu/employees',
      '/api/psu/benefits',
      '/api/psu/reports'
    ],
    tokenField: 'psuId'
  },
  insurer: {
    allowedPaths: [
      '/api/insurer',
      '/api/insurer/dashboard',
      '/api/insurer/policies',
      '/api/insurer/claims',
      '/api/insurer/analytics'
    ],
    tokenField: 'insurerId'
  },
  ngo: {
    allowedPaths: [
      '/api/ngo',
      '/api/ngo/dashboard',
      '/api/ngo/programs',
      '/api/ngo/beneficiaries',
      '/api/ngo/reports'
    ],
    tokenField: 'ngoId'
  },
  hospital_insurance: {
    allowedPaths: [
      '/api/hospital-insurance',
      '/api/hospital/insurance',
      '/api/hospital-insurance/auth'
    ],
    tokenField: 'hospitalId'
  }
};

const USER_TYPE_ALIASES = {
  system_admin: 'admin',
  super_admin: 'admin',
  platform_admin: 'admin',
  corporate_admin: 'corporate',
  hospital_admin: 'hospital',
  hospital_staff: 'hospital',
  hospital_doctor: 'hospital',
  clinic_admin: 'clinic',
  lab_admin: 'lab',
  pharmacy_admin: 'pharmacy',
  tpa_admin: 'tpa',
  psu_admin: 'psu',
  ngo_admin: 'ngo',
  insurer_admin: 'insurer',
  homecare_admin: 'homecare',
  ambulance_admin: 'ambulance',
  doctor_assistant: 'assistant',
  insurance_broker: 'broker',
  insurance_portal: 'hospital_insurance'
};

const resolveUserType = (decoded) => {
  const rawType = decoded.userType || decoded.role || decoded.type || (decoded.userId ? 'user' : null);
  if (!rawType) return null;
  return USER_TYPE_ALIASES[rawType] || rawType;
};

// Public endpoints that don't require authentication
const PUBLIC_ENDPOINTS = [
  '/health',
  '/api/health',              // Main health check endpoint
  '/api/db/health',           // Database health check endpoint (monitoring)
  '/api/health-check',
  '/api/status',
  '/metrics',
  '/api/sib/health', // SIB Control Layer health check (public monitoring)
  '/api/fhir/r4/metadata', // FHIR CapabilityStatement (public per FHIR spec)
  '/api/offline-scribe/health', // Offline AI Scribe health check (public for frontend status)
  '/api/offline-scribe/languages', // Offline AI Scribe supported languages (public)
  '/api/offline-scribe/templates', // Offline AI Scribe document templates (public)
  '/api/auth/login', // Generic auth login endpoint
  '/api/auth/register', // Generic auth registration endpoint
  '/api/auth/send-otp', // OTP login (legacy alias)
  '/api/auth/verify-otp', // OTP login (legacy alias)
  '/api/users/login',
  '/api/users/register',
  '/api/users/login/send-otp',
  '/api/users/login/verify-otp',
  '/api/doctors/login',
  '/api/doctors/register',
  '/api/doctors/search', // Public doctor search
  '/api/doctors/available', // Public available doctors list
  '/api/consultation/doctors', // Public consultation doctor listing (browse/book)
  '/api/labs', // Public lab search and browsing (location-based)
  '/api/admin/login',
  '/api/team/login',
  '/api/team/auth/verify',
  '/api/team/auth/refresh',
  '/api/crm/login',
  '/api/crm/auth/verify',
  '/api/crm/auth/refresh',
  '/api/nurse/login',
  '/api/assistant/login',
  '/api/corporate/login',
  '/api/password-reset', // Password reset OTP endpoints (public)
  '/api/corporate/auth/login',
  '/api/hospital/login',
  '/api/hospital/auth/login',
  '/api/hospital/auth/login/v2',
  '/api/hospital/auth/login-tenant',
  '/api/hospital/auth/register',
  '/api/hospital/auth/verify',
  '/api/hospital/auth/refresh',
  '/api/hospital/auth/logout',
  '/api/clinic/login',
  '/api/clinic/register',
  '/api/clinic/send-email-otp',
  '/api/clinic/verify-email-otp',
  '/api/clinic/send-phone-otp',
  '/api/clinic/verify-phone-otp',
  '/api/lab/login',
  '/api/lab/register',
  '/api/lab/send-email-otp',
  '/api/lab/verify-email-otp',
  '/api/lab/send-phone-otp',
  '/api/lab/verify-phone-otp',
  '/api/pharmacy/login',
  '/api/pharmacy/register',
  '/api/pharmacy/send-email-otp',
  '/api/pharmacy/verify-email-otp',
  '/api/pharmacy/send-phone-otp',
  '/api/pharmacy/verify-phone-otp',
  '/api/ambulance/login',
  '/api/ambulance/register',
  '/api/ambulance/send-email-otp',
  '/api/ambulance/verify-email-otp',
  '/api/ambulance/send-phone-otp',
  '/api/ambulance/verify-phone-otp',
  '/api/hospital/register',
  '/api/hospital/send-email-otp',
  '/api/hospital/verify-email-otp',
  '/api/hospital/send-phone-otp',
  '/api/hospital/verify-phone-otp',
  '/api/homecare/register',
  '/api/homecare/send-email-otp',
  '/api/homecare/verify-email-otp',
  '/api/homecare/send-phone-otp',
  '/api/homecare/verify-phone-otp',
  '/api/corporate/register',
  '/api/corporate/send-email-otp',
  '/api/corporate/verify-email-otp',
  '/api/corporate/send-phone-otp',
  '/api/corporate/verify-phone-otp',
  '/api/insurance-broker/login',
  '/api/insurance-broker/register',
  '/api/insurance-broker/send-email-otp',
  '/api/insurance-broker/verify-email-otp',
  '/api/insurance-broker/send-phone-otp',
  '/api/insurance-broker/verify-phone-otp',
  '/api/psu/login',
  '/api/insurer/login',
  '/api/insurance-company/login',
  '/api/insurance-company/corporate/login',
  '/api/hospital-insurance/auth/login',
  '/api/hospital-insurance/auth/verify',
  '/api/hospital-insurance/auth/logout',
  '/api/broker-integrations/health',
  '/api/broker-integrations/claims/submit',
  '/api/broker-integrations/webhooks',
  '/api/homecare/login',
  '/api/homecare/book',    // Patient homecare booking (public — no auth required)
  '/api/corporate/login',
  '/api/ngo/login',
  '/api/oauth',
  '/oauth',  // OAuth 2.0 SSO endpoints (Rocket.Chat integration)
  '/api/otp',
  '/api/masterdata', // Public read-only provider data (hospitals, labs, clinics)
  '/api/medical-ai/test', // AI medical consultation test endpoint (for demos and testing)
  '/api/medical-ai/health', // Medical AI health check (public monitoring)
  '/api/medical-ai/instant-triage-call', // Emergency triage endpoint - accessible without authentication
  '/api/tts', // Text-to-Speech for emergency triage (Eleven Labs)
  '/api/membership/plans', // Public membership plans listing
  '/api/membership-plans', // Public membership plans (alternative route)
  '/api/video/join/',        // Guest video join via invite link (no login required)
  '/api/video/health',       // Video subsystem health check (public monitoring)
  '/api/video/test',         // Video system test endpoint (public)
  '/api/whatsapp-production/webhook', // WhatsApp incoming message webhook (Twilio)
  '/api/whatsapp-production/status-callback', // WhatsApp message status callback (Twilio)
  '/api/whatsapp-production/fallback', // WhatsApp fallback webhook (Twilio)
  '/api/support/webhook/rocketchat', // RocketChat outgoing webhook (agent replies)
  '/api/support/webhook/whatsapp', // WhatsApp support webhook
  '/api/support/departments', // Support department list (public, needed before login)
  '/api/whatsapp-production/user-context', // WhatsApp user context lookup
  '/api/whatsapp-production/ai-respond', // WhatsApp AI response generation
  '/api/whatsapp-production/send-ai-response', // WhatsApp AI response send
  '/api/whatsapp-production/team-inbox', // WhatsApp team inbox
  // Platform Admin API public endpoints
  '/api/platform/health',
  // Enterprise API v2 public endpoints
  '/api/v2/health',
  '/api/v2/',
  '/api/v2/auth/login',
  '/api/v2/auth/refresh',
  '/api/v2/assistants/login',
  // Mobile API public endpoints
  '/api/mobile/health',
  '/api/mobile/status',
  '/api/mobile/auth',
  '/api/mobile/doctors',  // Public doctor search for mobile
  '/api/mobile/organizations',  // Public organization listing for signup
  // CDSS Knowledge Base (Clinical Decision Support System) - public for doctors and patients
  '/api/cdss/knowledge/query', // AI-powered clinical decision support queries
  '/api/cdss/knowledge/health', // CDSS service health check
  '/api/cdss/knowledge/drug-interactions', // Check for drug interactions
  '/api/cdss/knowledge/medication-alternatives', // Get medication alternatives from CIMS
  '/api/cdss/knowledge/search', // Semantic search in knowledge base
  '/api/cdss/knowledge/stats', // Knowledge base statistics
  '/api/cdss/knowledge/sources', // Available knowledge sources
  '/api/public/', // Public signed-token download endpoints (report PDFs, etc.)
  '/api/notifications/send-internal', // n8n internal workflow notification endpoint (token-auth at route level)
  '/api/webhooks/n8n-callback/', // n8n workflow callbacks (server-to-server, token-auth at route level)
];

/**
 * Ring-fencing middleware to prevent unauthorized cross-user access
 * Ensures users can only access endpoints relevant to their role
 */
const ringFencingMiddleware = (req, res, next) => {
  const requestPath = req.originalUrl.split('?')[0]; // Use originalUrl and strip query params
  const requestMethod = req.method;

  // ⚠️ CRITICAL: Bypass ring-fencing for Twilio WhatsApp webhooks
  // Twilio cannot send JWT auth headers; these endpoints must accept unauthenticated requests
  if (requestPath.startsWith('/api/whatsapp-production/webhook') ||
      requestPath.startsWith('/api/whatsapp-production/fallback') ||
      requestPath.startsWith('/api/whatsapp-production/status-callback')) {
    console.log('✅ Twilio WhatsApp webhook bypass (public, no auth required):', requestPath);
    return next();
  }

  // Allow public endpoints
  if (PUBLIC_ENDPOINTS.some(endpoint => requestPath.startsWith(endpoint))) {
    return next();
  }

  const hospitalStaffAuthPattern = /^\/api\/hospital\/staff\/[^/]+\/(login|signup)$/;
  const patientAuthPattern = /^\/api\/patient\/(login|signup)$/;
  const patientClinicSearchPattern = /^\/api\/patient\/(clinics\/search|provider-clinics)$/;
  const clinicPatientAuthPattern = /^\/api\/clinic\/[^/]+\/patient\/(login|signup)$/;
  const clinicStaffAuthPattern = /^\/api\/clinic\/staff\/(login|doctor-login|nurse-login|assistant-login)$/;

  if (hospitalStaffAuthPattern.test(requestPath) ||
      patientAuthPattern.test(requestPath) ||
      patientClinicSearchPattern.test(requestPath) ||
      clinicPatientAuthPattern.test(requestPath) ||
      clinicStaffAuthPattern.test(requestPath)) {
    return next();
  }

  // Allow public GET requests to /api/doctors for listing/browsing
  if (requestMethod === 'GET' && (requestPath === '/api/doctors' || requestPath.startsWith('/api/doctors/'))) {
    // Allow public access to doctor listing, search, and public profiles
    const publicDoctorPaths = [
      '/api/doctors',
      '/api/doctors/search',
      '/api/doctors/available'
    ];
    const isDoctorIdPath = /^\/api\/doctors\/\d+/.test(requestPath); // Match /api/doctors/123, /api/doctors/123/slots, etc.

    if (publicDoctorPaths.some(path => requestPath.startsWith(path)) || isDoctorIdPath) {
      return next();
    }
  }

  // Get token from header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('🚫 Ring-fencing: No valid authorization header');
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_TOKEN'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify and decode token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Normalize userType from multiple possible fields
    // Priority: userType > role > type > fallback to 'user'
    const userType = resolveUserType(decoded);

    if (!userType) {
      console.log('🚫 Ring-fencing: No userType/role in token');
      return res.status(403).json({
        error: 'Invalid token - missing role information',
        code: 'MISSING_ROLE'
      });
    }

    // Get user permissions
    const permissions = USER_TYPE_PERMISSIONS[userType];

    if (!permissions) {
      console.log(`🚫 Ring-fencing: Unknown user type: ${userType}`);
      return res.status(403).json({
        error: 'Invalid user type',
        code: 'INVALID_USER_TYPE'
      });
    }

    // Check if user has access to this endpoint
    const hasPathAccess = permissions.allowedPaths.some(allowedPath =>
      requestPath.startsWith(allowedPath)
    );

    if (!hasPathAccess) {
      console.log(`🚫 Ring-fencing: ${userType} attempted unauthorized access to: ${requestPath}`);
      console.log(`   Allowed paths for ${userType}:`, permissions.allowedPaths);
      return res.status(403).json({
        error: 'Access denied - insufficient privileges',
        code: 'ACCESS_DENIED',
        userType: userType,
        requestedPath: requestPath
      });
    }

    // Attach decoded user info to request
    req.user = decoded;
    req.userType = userType;

    // =========================================================================
    // USER ID-BASED RING-FENCING
    // Ensures users can only access their own resources
    // =========================================================================

    // Get the authenticated user's ID based on their role
    const authenticatedUserId = decoded.id || decoded.userId || decoded.doctorId ||
      decoded.nurseId || decoded.assistantId || decoded.adminId ||
      decoded.corporateId || decoded.hospitalId || decoded.clinicId ||
      decoded.labId || decoded.pharmacyId || decoded.tpaId ||
      decoded.psuId || decoded.insurerId || decoded.ngoId;

    // Admin bypass - admins can access any resource
    if (userType === 'admin' || userType === 'team') {
      console.log(`✅ Ring-fencing: ${userType} (admin bypass) accessing ${requestPath}`);
      return next();
    }

    // Check for user ID in URL path - patterns like /api/users/:id, /api/patients/:id, etc.
    const userIdPatterns = [
      { pattern: /^\/api\/users\/(\d+)/, ownerTypes: ['user', 'admin'] },
      { pattern: /^\/api\/user\/(\d+)/, ownerTypes: ['user', 'admin'] },
      { pattern: /^\/api\/patients\/(\d+)/, ownerTypes: ['user', 'doctor', 'nurse', 'admin'] },
      { pattern: /^\/api\/doctor\/(\d+)/, ownerTypes: ['doctor', 'admin'] },
      { pattern: /^\/api\/doctors\/(\d+)\/private/, ownerTypes: ['doctor', 'admin'] }, // Private doctor routes
      { pattern: /^\/api\/nurse\/(\d+)/, ownerTypes: ['nurse', 'admin'] },
      { pattern: /^\/api\/assistant\/(\d+)/, ownerTypes: ['assistant', 'admin'] },
      { pattern: /^\/api\/corporate\/(\d+)/, ownerTypes: ['corporate', 'admin'] },
      { pattern: /^\/api\/hospital\/(\d+)/, ownerTypes: ['hospital', 'admin'] },
      { pattern: /^\/api\/clinic\/(\d+)/, ownerTypes: ['clinic', 'admin'] },
      { pattern: /^\/api\/lab\/(\d+)/, ownerTypes: ['lab', 'admin'] },
      { pattern: /^\/api\/pharmacy\/(\d+)/, ownerTypes: ['pharmacy', 'admin'] },
      { pattern: /^\/api\/tpa\/(\d+)/, ownerTypes: ['tpa', 'admin'] },
      { pattern: /^\/api\/psu\/(\d+)/, ownerTypes: ['psu', 'admin'] },
      { pattern: /^\/api\/insurer\/(\d+)/, ownerTypes: ['insurer', 'admin'] },
      { pattern: /^\/api\/ngo\/(\d+)/, ownerTypes: ['ngo', 'admin'] },
    ];

    for (const { pattern, ownerTypes } of userIdPatterns) {
      const match = requestPath.match(pattern);
      if (match) {
        const requestedResourceId = parseInt(match[1], 10);

        // Check if the user type is allowed to access this resource type
        if (!ownerTypes.includes(userType)) {
          console.log(`🚫 Ring-fencing: ${userType} cannot access ${pattern.source} resources`);
          return res.status(403).json({
            error: 'Access denied - resource type not allowed for your role',
            code: 'RESOURCE_TYPE_DENIED',
            userType: userType
          });
        }

        // For own-resource access, verify the ID matches
        // Exception: doctors/nurses can access patient resources they're assigned to
        const isOwnResource = requestedResourceId === authenticatedUserId;
        const isDoctorAccessingPatient = userType === 'doctor' && pattern.source.includes('patients');
        const isNurseAccessingPatient = userType === 'nurse' && pattern.source.includes('patients');

        if (!isOwnResource && !isDoctorAccessingPatient && !isNurseAccessingPatient) {
          console.log(`🚫 Ring-fencing: ${userType} (ID: ${authenticatedUserId}) attempted to access resource ID: ${requestedResourceId}`);
          return res.status(403).json({
            error: 'Access denied - you can only access your own resources',
            code: 'OWN_RESOURCE_ONLY',
            userType: userType
          });
        }

        // For doctor/nurse accessing patient, we'll let the route handler verify the relationship
        if (isDoctorAccessingPatient || isNurseAccessingPatient) {
          req.requirePatientRelationshipCheck = true;
          req.requestedPatientId = requestedResourceId;
        }

        break;
      }
    }

    // Check for user ID in query parameters
    const queryUserId = req.query.userId || req.query.user_id || req.query.patientId || req.query.patient_id;
    if (queryUserId && userType === 'user') {
      const requestedQueryUserId = parseInt(queryUserId, 10);
      if (requestedQueryUserId !== authenticatedUserId) {
        console.log(`🚫 Ring-fencing: User ${authenticatedUserId} attempted to query data for user ${requestedQueryUserId}`);
        return res.status(403).json({
          error: 'Access denied - you can only query your own data',
          code: 'OWN_DATA_ONLY'
        });
      }
    }

    // Check for user ID in request body (for POST/PUT/PATCH requests)
    if (['POST', 'PUT', 'PATCH'].includes(requestMethod) && req.body) {
      const bodyUserId = req.body.userId || req.body.user_id || req.body.targetUserId;
      if (bodyUserId && userType === 'user') {
        const requestedBodyUserId = parseInt(bodyUserId, 10);
        if (requestedBodyUserId !== authenticatedUserId) {
          console.log(`🚫 Ring-fencing: User ${authenticatedUserId} attempted to modify data for user ${requestedBodyUserId}`);
          return res.status(403).json({
            error: 'Access denied - you can only modify your own data',
            code: 'OWN_DATA_ONLY'
          });
        }
      }
    }

    console.log(`✅ Ring-fencing: ${userType} (ID: ${authenticatedUserId}) accessing ${requestPath}`);
    next();

  } catch (error) {
    console.error('🚫 Ring-fencing: Token verification failed:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Middleware to check specific privilege for an action
 * Use this for fine-grained access control within a route
 */
const checkPrivilege = (requiredPrivilege) => {
  return (req, res, next) => {
    const userType = req.userType;
    const userPrivileges = req.user?.privileges || [];

    // Admin has all privileges
    if (userType === 'admin') {
      return next();
    }

    // Check if user has required privilege
    if (!userPrivileges.includes(requiredPrivilege)) {
      console.log(`🚫 Privilege check failed: ${userType} lacks privilege: ${requiredPrivilege}`);
      return res.status(403).json({
        error: 'Insufficient privileges for this action',
        code: 'PRIVILEGE_REQUIRED',
        required: requiredPrivilege
      });
    }

    next();
  };
};

/**
 * Middleware to ensure user can only access their own resources
 * Checks if the requested resource ID matches the authenticated user's ID
 */
const ensureOwnResource = (idParam = 'id') => {
  return (req, res, next) => {
    const userType = req.userType;
    const requestedId = req.params[idParam];
    const permissions = USER_TYPE_PERMISSIONS[userType];

    if (!permissions) {
      return res.status(403).json({
        error: 'Invalid user type',
        code: 'INVALID_USER_TYPE'
      });
    }

    const userId = req.user[permissions.tokenField];

    // Admin can access all resources
    if (userType === 'admin') {
      return next();
    }

    // Check if user is accessing their own resource
    if (requestedId && requestedId !== String(userId)) {
      console.log(`🚫 Resource access denied: ${userType} (${userId}) attempted to access resource ${requestedId}`);
      return res.status(403).json({
        error: 'You can only access your own resources',
        code: 'OWN_RESOURCE_ONLY'
      });
    }

    next();
  };
};

/**
 * Helper function to check if user type has access to a specific path
 */
const hasAccess = (userType, path) => {
  const permissions = USER_TYPE_PERMISSIONS[userType];
  if (!permissions) return false;

  return permissions.allowedPaths.some(allowedPath =>
    path.startsWith(allowedPath)
  );
};

/**
 * Middleware to verify doctor-patient or nurse-patient relationship
 * Use this after ringFencingMiddleware for routes that need relationship verification
 */
const verifyPatientRelationship = (relationshipModel) => {
  return async (req, res, next) => {
    // Skip if no relationship check is required
    if (!req.requirePatientRelationshipCheck) {
      return next();
    }

    const userType = req.userType;
    const userId = req.user.id || req.user.doctorId || req.user.nurseId;
    const patientId = req.requestedPatientId;

    try {
      // For doctors, check if they have an appointment or consultation with this patient
      if (userType === 'doctor' && relationshipModel) {
        const hasRelationship = await relationshipModel.findOne({
          where: {
            doctorId: userId,
            patientId: patientId
          }
        });

        if (!hasRelationship) {
          console.log(`🚫 Ring-fencing: Doctor ${userId} has no relationship with patient ${patientId}`);
          return res.status(403).json({
            error: 'Access denied - no patient relationship found',
            code: 'NO_PATIENT_RELATIONSHIP'
          });
        }
      }

      // For nurses, similar check can be added based on ward assignment
      if (userType === 'nurse' && relationshipModel) {
        const hasRelationship = await relationshipModel.findOne({
          where: {
            nurseId: userId,
            patientId: patientId
          }
        });

        if (!hasRelationship) {
          console.log(`🚫 Ring-fencing: Nurse ${userId} has no relationship with patient ${patientId}`);
          return res.status(403).json({
            error: 'Access denied - no patient relationship found',
            code: 'NO_PATIENT_RELATIONSHIP'
          });
        }
      }

      next();
    } catch (error) {
      console.error('🚫 Ring-fencing: Error verifying patient relationship:', error.message);
      return res.status(500).json({
        error: 'Error verifying access permissions',
        code: 'RELATIONSHIP_CHECK_ERROR'
      });
    }
  };
};

/**
 * Middleware to extract and validate user ID from various sources
 * Useful for routes that need to ensure user is accessing their own data
 */
const extractAndValidateUserId = (req, res, next) => {
  const userType = req.userType;
  const authenticatedUserId = req.user?.id || req.user?.userId;

  // Extract user ID from various sources
  const sourceUserId =
    req.params.userId || req.params.id ||
    req.query.userId || req.query.user_id ||
    req.body?.userId || req.body?.user_id;

  if (sourceUserId) {
    const requestedUserId = parseInt(sourceUserId, 10);

    // Admin bypass
    if (userType === 'admin' || userType === 'team') {
      req.targetUserId = requestedUserId;
      return next();
    }

    // Verify user is accessing their own data
    if (userType === 'user' && requestedUserId !== authenticatedUserId) {
      console.log(`🚫 Ring-fencing: User ${authenticatedUserId} attempted to access user ${requestedUserId}'s data`);
      return res.status(403).json({
        error: 'Access denied - you can only access your own data',
        code: 'OWN_DATA_ONLY'
      });
    }

    req.targetUserId = requestedUserId;
  } else {
    // If no user ID specified, default to authenticated user
    req.targetUserId = authenticatedUserId;
  }

  next();
};

export {
  ringFencingMiddleware,
  checkPrivilege,
  ensureOwnResource,
  hasAccess,
  verifyPatientRelationship,
  extractAndValidateUserId,
  USER_TYPE_PERMISSIONS
};

export default ringFencingMiddleware;
