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
      '/api/mobile'  // Mobile API gateway
    ],
    tokenField: 'userId'
  },
  patient: {  // Alias for 'user' - same permissions
    allowedPaths: [
      '/api/user',
      '/api/auth',
      '/api/doctors',
      '/api/appointments',
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
      '/api/mobile'  // Mobile API gateway
    ],
    tokenField: 'userId'
  },
  doctor: {
    allowedPaths: [
      '/api/doctor',
      '/api/doctors',
      '/api/patients',
      '/api/appointments',
      '/api/enhanced-appointments',  // Enhanced appointment booking for doctors
      '/api/prescriptions',
      '/api/video',
      '/api/chat',
      '/api/ai-scribe',
      '/api/recording',
      '/api/cdss',  // Clinical Decision Support System
      '/api/billing',  // Billing and invoices
      '/api/notifications',  // Doctor notifications
      '/api/v2/doctors'  // Enterprise API v2 doctor endpoints
    ],
    tokenField: 'doctorId'
  },
  admin: {
    allowedPaths: [
      '/api/admin',
      '/api/superadmin', // Super admin tenant/organization management
      '/api/platform', // Platform management routes
      '/api/sib', // SIB Control Layer management
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
      '/api/email',
      '/api/sms',
      '/api/whatsapp',
      '/api/video',
      '/api/voice',
      '/api/tickets',
      '/api/activity-log',
      '/api/health-risk',
      '/api/crm',
      '/api/reports',
      '/api/settings',
      '/api/masterdata'
    ],
    tokenField: 'adminId'
  },
  team: {
    allowedPaths: [
      '/api/team',
      '/api/users',
      '/api/doctors',
      '/api/appointments',
      '/api/hospitals',
      '/api/clinics',
      '/api/labs',
      '/api/pharmacies',
      '/api/corporates',
      '/api/plans',
      '/api/activity-log',
      '/api/chat'
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
  corporate: {
    allowedPaths: [
      '/api/corporate',
      '/api/corporate/employees',
      '/api/corporate/appointments',
      '/api/corporate/analytics',
      '/api/corporate/benefits',
      '/api/corporate/claims',
      '/api/corporate/departments',
      '/api/corporate/compliance',
      '/api/corporate/reports'
    ],
    tokenField: 'corporateId'
  },
  hospital: {
    allowedPaths: [
      '/api/hospital',
      '/api/hospital/dashboard',
      '/api/hospital/patients',
      '/api/hospital/appointments',
      '/api/hospital/departments'
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
  }
};

// Public endpoints that don't require authentication
const PUBLIC_ENDPOINTS = [
  '/health',
  '/api/health-check',
  '/api/status',
  '/metrics',
  '/api/sib/health', // SIB Control Layer health check (public monitoring)
  '/api/users/login',
  '/api/users/register',
  '/api/doctors/login',
  '/api/doctors/register',
  '/api/doctors/search', // Public doctor search
  '/api/doctors/available', // Public available doctors list
  '/api/labs', // Public lab search and browsing (location-based)
  '/api/admin/login',
  '/api/team/login',
  '/api/nurse/login',
  '/api/assistant/login',
  '/api/corporate/login',
  '/api/corporate/auth/login',
  '/api/hospital/login',
  '/api/hospital/auth/login',
  '/api/hospital/auth/register',
  '/api/clinic/login',
  '/api/lab/login',
  '/api/pharmacy/login',
  '/api/ambulance/login',
  '/api/tpa/login',
  '/api/psu/login',
  '/api/insurer/login',
  '/api/insurance-company/login',
  '/api/insurance-company/corporate/login',
  '/api/insurance-broker/login',
  '/api/homecare/login',
  '/api/ngo/login',
  '/api/oauth',
  '/api/otp',
  '/api/masterdata', // Public read-only provider data (hospitals, labs, clinics)
  '/api/medical-ai/test', // AI medical consultation test endpoint (for demos and testing)
  '/api/tts', // Text-to-Speech for emergency triage (Eleven Labs)
  '/api/membership/plans', // Public membership plans listing
  '/api/membership-plans', // Public membership plans (alternative route)
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
  '/api/mobile/doctors'  // Public doctor search for mobile
];

/**
 * Ring-fencing middleware to prevent unauthorized cross-user access
 * Ensures users can only access endpoints relevant to their role
 */
const ringFencingMiddleware = (req, res, next) => {
  const requestPath = req.path;
  const requestMethod = req.method;

  // Allow public endpoints
  if (PUBLIC_ENDPOINTS.some(endpoint => requestPath.startsWith(endpoint))) {
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

  // Allow dev tokens in development/testing (they'll be validated by route-specific middleware)
  const devTokens = ['dev-clinic-token', 'dev-hospital-token', 'dev-lab-token', 'dev-pharmacy-token', 'dev-assistant-token', 'dev-nurse-token', 'dev-corporate-token'];
  if (devTokens.includes(token)) {
    console.log(`✅ Ring-fencing: Allowing dev token bypass for ${requestPath}`);
    return next();
  }

  try {
    // Verify and decode token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Normalize userType from multiple possible fields
    // Priority: userType > role > fallback to 'user'
    const userType = decoded.userType || decoded.role || (decoded.userId ? 'user' : null);

    if (!userType) {
      console.log('🚫 Ring-fencing: No userType/role in token');
      return res.status(403).json({
        error: 'Invalid token - missing role information',
        code: 'MISSING_ROLE'
      });
    }

    // Get user permissions
    const permissions = USER_TYPE_PERMISSIONS[userType];

    console.error(`[RING-FENCE DEBUG] User type: ${userType}, Has /api/reports: ${permissions?.allowedPaths?.includes('/api/reports')}`);
    console.error(`[RING-FENCE DEBUG] Allowed paths:`, permissions?.allowedPaths);

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
        error: 'Access denied - insufficient privileges - UPDATED VERSION TEST',
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
