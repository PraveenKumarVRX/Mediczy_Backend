import AuditLog from '../models/auditLog.model.intelligent.js';

/**
 * Audit Middleware
 * 
 * Compliance: HIPAA §164.312(b), GDPR Article 30, DPDP Act §8
 * 
 * Automatically logs all API requests that involve PHI/PII access
 * for compliance and security monitoring.
 */

/**
 * Determine if endpoint involves PHI (Protected Health Information)
 */
const isPHIEndpoint = (path) => {
  const phiPatterns = [
    /\/health/i,
    /\/vital/i,
    /\/prescription/i,
    /\/lab/i,
    /\/diagnosis/i,
    /\/medical/i,
    /\/appointment/i,
    /\/consultation/i,
    /\/doctor/i,
    /\/insurance/i
  ];
  
  return phiPatterns.some(pattern => pattern.test(path));
};

/**
 * Determine if endpoint involves PII (Personally Identifiable Information)
 */
const isPIIEndpoint = (path) => {
  const piiPatterns = [
    /\/user/i,
    /\/profile/i,
    /\/register/i,
    /\/login/i,
    /\/payment/i,
    /\/address/i,
    /\/contact/i
  ];
  
  return piiPatterns.some(pattern => pattern.test(path));
};

/**
 * Map HTTP method to audit action
 */
const getActionFromMethod = (method) => {
  const methodMap = {
    'GET': 'READ',
    'POST': 'CREATE',
    'PUT': 'UPDATE',
    'PATCH': 'UPDATE',
    'DELETE': 'DELETE'
  };
  return methodMap[method] || 'READ';
};

/**
 * Audit middleware - logs all requests involving sensitive data
 */
export const auditMiddleware = async (req, res, next) => {
  const originalSend = res.send;
  const startTime = Date.now();
  
  // Override res.send to capture response data
  res.send = function(data) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // Restore original send
    res.send = originalSend;
    
    // Log the request asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const isPHI = isPHIEndpoint(req.path);
        const isPII = isPIIEndpoint(req.path);

        // Skip /login paths — controllers call auditLoginAttempt() explicitly,
        // so logging here would create a duplicate entry with wrong action/email.
        if (req.path.includes('/login')) return;

        // Only log if it's PHI, PII, or auth-related
        if (isPHI || isPII || req.path.includes('/register')) {
          await AuditLog.logEvent({
            userId: req.user?.id || null,
            userType: req.user?.role || 'system',
            userEmail: req.user?.email || null,
            action: getActionFromMethod(req.method),
            resourceType: extractResourceType(req.path),
            resourceId: extractResourceId(req.params),
            req,
            status: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
            statusCode: res.statusCode,
            isPHI,
            isPII,
            purpose: req.headers['x-purpose'] || 'Medical care and treatment'
          });
        }
      } catch (error) {
        console.error('Audit logging failed:', error);
        // Don't throw - audit logging should never break the app
      }
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Specific audit logger for PHI access
 * Use this for explicit PHI operations
 */
export const auditPHIAccess = async (req, userId, resourceType, resourceId, dataFields) => {
  try {
    await AuditLog.logEvent({
      userId: userId || req.user?.id,
      userType: req.user?.role || 'user',
      userEmail: req.user?.email,
      action: 'PHI_ACCESS',
      resourceType,
      resourceId,
      dataFields, // Specific fields accessed (Minimum Necessary)
      req,
      status: 'SUCCESS',
      isPHI: true,
      isPII: true,
      purpose: req.headers['x-purpose'] || 'Treatment, Payment, Healthcare Operations'
    });
  } catch (error) {
    console.error('PHI audit logging failed:', error);
  }
};

/**
 * Audit data modifications (for UPDATE/DELETE with before/after states)
 */
export const auditDataModification = async (req, resourceType, resourceId, before, after) => {
  try {
    await AuditLog.logEvent({
      userId: req.user?.id,
      userType: req.user?.role || 'user',
      userEmail: req.user?.email,
      action: req.method === 'DELETE' ? 'DELETE' : 'UPDATE',
      resourceType,
      resourceId,
      changesBefore: sanitizeForAudit(before),
      changesAfter: sanitizeForAudit(after),
      req,
      status: 'SUCCESS',
      isPHI: isPHIEndpoint(req.path),
      isPII: isPIIEndpoint(req.path)
    });
  } catch (error) {
    console.error('Data modification audit failed:', error);
  }
};

/**
 * Audit login attempts (successful and failed)
 */
export const auditLoginAttempt = async (req, userId, email, success, errorMessage = null) => {
  try {
    await AuditLog.logEvent({
      userId: success ? userId : null,
      userType: req.path.includes('doctor') ? 'doctor' : 'user',
      userEmail: email,
      action: success ? 'LOGIN' : 'LOGIN_FAILED',
      resourceType: 'Session',
      req,
      status: success ? 'SUCCESS' : 'FAILURE',
      errorMessage,
      isPII: true
    });
  } catch (error) {
    console.error('Login audit failed:', error);
  }
};

/**
 * Audit consent actions
 */
export const auditConsent = async (req, userId, consentType, action) => {
  try {
    await AuditLog.logEvent({
      userId,
      userType: req.user?.role || 'user',
      userEmail: req.user?.email,
      action: action === 'grant' ? 'CONSENT_GIVEN' : 'CONSENT_WITHDRAWN',
      resourceType: 'Consent',
      resourceId: null,
      req,
      status: 'SUCCESS',
      isPII: true,
      purpose: `User ${action === 'grant' ? 'granted' : 'withdrew'} consent for ${consentType}`
    });
  } catch (error) {
    console.error('Consent audit failed:', error);
  }
};

/**
 * Audit data export (GDPR right to access)
 */
export const auditDataExport = async (req, userId) => {
  try {
    await AuditLog.logEvent({
      userId,
      userType: req.user?.role || 'user',
      userEmail: req.user?.email,
      action: 'DATA_EXPORT',
      resourceType: 'User',
      resourceId: userId,
      req,
      status: 'SUCCESS',
      isPHI: true,
      isPII: true,
      purpose: 'GDPR/DPDP data portability request'
    });
  } catch (error) {
    console.error('Data export audit failed:', error);
  }
};

/**
 * Audit data deletion (GDPR right to erasure)
 */
export const auditDataDeletion = async (req, userId) => {
  try {
    await AuditLog.logEvent({
      userId,
      userType: req.user?.role || 'user',
      userEmail: req.user?.email,
      action: 'DATA_DELETION',
      resourceType: 'User',
      resourceId: userId,
      req,
      status: 'SUCCESS',
      isPHI: true,
      isPII: true,
      purpose: 'GDPR/DPDP right to erasure'
    });
  } catch (error) {
    console.error('Data deletion audit failed:', error);
  }
};

// Helper functions
function extractResourceType(path) {
  if (path.includes('/users')) return 'User';
  if (path.includes('/doctors')) return 'Doctor';
  if (path.includes('/appointment')) return 'Appointment';
  if (path.includes('/health')) return 'HealthRecord';
  if (path.includes('/vital')) return 'VitalSigns';
  if (path.includes('/prescription')) return 'Prescription';
  if (path.includes('/insurance')) return 'Insurance';
  return null;
}

function extractResourceId(params) {
  return params?.id || params?.userId || params?.doctorId || null;
}

function sanitizeForAudit(data) {
  if (!data) return null;
  
  // Remove sensitive fields from audit logs
  const sanitized = { ...data };
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.token;
  delete sanitized.refreshToken;
  delete sanitized.secretKey;
  
  return sanitized;
}

export default auditMiddleware;
