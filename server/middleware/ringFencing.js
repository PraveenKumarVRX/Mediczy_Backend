import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-super-secret-key-2024';

// User type to allowed endpoints mapping
const USER_TYPE_PERMISSIONS = {
  user: {
    allowedPaths: [
      '/api/user',
      '/api/auth',
      '/api/doctors',
      '/api/appointments',
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
      '/api/ayushman'
    ],
    tokenField: 'userId'
  },
  doctor: {
    allowedPaths: [
      '/api/doctor',
      '/api/doctors/appointments',
      '/api/doctors/prescriptions',
      '/api/doctors/patients',
      '/api/doctors/availability',
      '/api/doctors/health-monitoring',
      '/api/video',
      '/api/chat'
    ],
    tokenField: 'doctorId'
  },
  admin: {
    allowedPaths: [
      '/api/admin',
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
      '/api/settings'
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
      '/api/orders'
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
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/doctor-login',
  '/api/auth/doctor-register',
  '/api/admin/login',
  '/api/team/login',
  '/api/nurse/login',
  '/api/assistant/login',
  '/api/corporate/login',
  '/api/hospital/login',
  '/api/clinic/login',
  '/api/lab/login',
  '/api/pharmacy/login',
  '/api/tpa/login',
  '/api/psu/login',
  '/api/insurer/login',
  '/api/ngo/login',
  '/api/health-check',
  '/api/status'
];

/**
 * Ring-fencing middleware to prevent unauthorized cross-user access
 * Ensures users can only access endpoints relevant to their role
 */
const ringFencingMiddleware = (req, res, next) => {
  const requestPath = req.path;
  
  // Allow public endpoints
  if (PUBLIC_ENDPOINTS.some(endpoint => requestPath.startsWith(endpoint))) {
    return next();
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
    const userType = decoded.userType || decoded.role || 'user';

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
    const hasAccess = permissions.allowedPaths.some(allowedPath => 
      requestPath.startsWith(allowedPath)
    );

    if (!hasAccess) {
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
    
    console.log(`✅ Ring-fencing: ${userType} accessing ${requestPath}`);
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

export {
  ringFencingMiddleware,
  checkPrivilege,
  ensureOwnResource,
  hasAccess,
  USER_TYPE_PERMISSIONS
};

export default ringFencingMiddleware;
