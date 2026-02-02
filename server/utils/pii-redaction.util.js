/**
 * PII Redaction Utility
 * Automatically redacts Personally Identifiable Information from logs and responses
 * GDPR/HIPAA Compliance - Prevents sensitive data leakage
 */

// Regex patterns for common PII types
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
  phone: /\b(\+\d{1,3}[- ]?)?\d{10}\b|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  aadhaar: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,  // Indian Aadhaar
  pan: /\b[A-Z]{5}\d{4}[A-Z]{1}\b/g,       // Indian PAN
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  jwt: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  apiKey: /\b[A-Za-z0-9_-]{32,}\b/g,
  // Indian mobile format
  indianMobile: /\b[6-9]\d{9}\b/g
};

// Field names that likely contain sensitive data
const SENSITIVE_FIELD_NAMES = [
  'password', 'passwd', 'pwd',
  'token', 'accessToken', 'refreshToken', 'auth',
  'secret', 'apiKey', 'api_key', 'privateKey', 'private_key',
  'ssn', 'social_security',
  'aadhaar', 'aadhar',
  'pan', 'pan_number',
  'creditCard', 'credit_card', 'cardNumber', 'card_number', 'cvv', 'cvc',
  'pin', 'otp', 'verification_code',
  'dob', 'date_of_birth', 'birthdate',
  'medicalRecord', 'medical_record', 'diagnosis', 'prescription'
];

/**
 * Redact PII from a string
 * @param {string} text - Text to redact
 * @param {Object} options - Redaction options
 * @returns {string} Redacted text
 */
export function redactPII(text, options = {}) {
  if (typeof text !== 'string') {
    return text;
  }
  
  const {
    keepDomain = false,      // Keep email domain (user@[REDACTED])
    keepLastDigits = 0,      // Keep last N digits of numbers
    customPatterns = {}      // Additional patterns to redact
  } = options;
  
  let redacted = text;
  
  // Apply built-in patterns
  Object.entries({ ...PII_PATTERNS, ...customPatterns }).forEach(([type, pattern]) => {
    if (type === 'email' && keepDomain) {
      redacted = redacted.replace(pattern, (match) => {
        const [, domain] = match.split('@');
        return `[REDACTED_EMAIL]@${domain}`;
      });
    } else if (keepLastDigits > 0 && ['phone', 'creditCard', 'aadhaar'].includes(type)) {
      redacted = redacted.replace(pattern, (match) => {
        const cleaned = match.replace(/[\s-]/g, '');
        const lastDigits = cleaned.slice(-keepLastDigits);
        return `[REDACTED_${type.toUpperCase()}]...${lastDigits}`;
      });
    } else {
      redacted = redacted.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
    }
  });
  
  return redacted;
}

/**
 * Redact PII from an object (deep)
 * @param {Object} obj - Object to redact
 * @param {Object} options - Redaction options
 * @returns {Object} Redacted object
 */
export function redactPIIFromObject(obj, options = {}) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return typeof obj === 'string' ? redactPII(obj, options) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactPIIFromObject(item, options));
  }
  
  const redacted = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if field name indicates sensitive data
    const isSensitiveField = SENSITIVE_FIELD_NAMES.some(field => 
      lowerKey.includes(field.toLowerCase())
    );
    
    if (isSensitiveField) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = redactPII(value, options);
    } else if (typeof value === 'object') {
      redacted[key] = redactPIIFromObject(value, options);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Create a safe logger with automatic PII redaction
 * @param {Object} logger - Base logger (Winston, Bunyan, etc.)
 * @param {Object} options - Redaction options
 * @returns {Object} Safe logger
 */
export function createSafeLogger(logger, options = {}) {
  const {
    redactInDevelopment = false,  // Don't redact in dev by default
    levels = ['info', 'warn', 'error', 'debug']
  } = options;
  
  const shouldRedact = process.env.NODE_ENV === 'production' || redactInDevelopment;
  
  const safeLogger = {};
  
  levels.forEach(level => {
    safeLogger[level] = (message, data) => {
      if (shouldRedact && data) {
        const redactedData = redactPIIFromObject(data, options);
        logger[level](message, redactedData);
      } else {
        logger[level](message, data);
      }
    };
  });
  
  return safeLogger;
}

/**
 * Express middleware to redact PII from request/response logs
 */
export function piiRedactionMiddleware(options = {}) {
  return (req, res, next) => {
    // Store original res.json
    const originalJson = res.json.bind(res);
    
    // Override res.json to redact PII in responses
    res.json = function(data) {
      if (process.env.NODE_ENV === 'production' && options.redactResponses) {
        const redactedData = redactPIIFromObject(data, options);
        return originalJson(redactedData);
      }
      return originalJson(data);
    };
    
    // Redact sensitive headers
    if (options.redactHeaders) {
      const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
      sensitiveHeaders.forEach(header => {
        if (req.headers[header]) {
          req.headers[header] = '[REDACTED]';
        }
      });
    }
    
    next();
  };
}

/**
 * Sanitize user object for logging (remove sensitive fields)
 * @param {Object} user - User object
 * @returns {Object} Sanitized user object
 */
export function sanitizeUserForLogging(user) {
  if (!user) return null;
  
  const { password, token, refreshToken, mfaSecret, apiKey, ...safe } = user;
  
  return {
    id: safe.id,
    email: process.env.NODE_ENV === 'production' 
      ? redactPII(safe.email, { keepDomain: true })
      : safe.email,
    role: safe.role || safe.userType,
    organizationId: safe.organization_id,
    // Don't include: firstName, lastName, phone (PII)
  };
}

/**
 * Redact SQL query parameters for logging
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Object} Redacted query and params
 */
export function redactSQLForLogging(query, params = []) {
  const redactedParams = params.map((param, index) => {
    // Redact based on parameter position/name patterns
    if (typeof param === 'string') {
      return redactPII(param, { keepLastDigits: 4 });
    }
    return param;
  });
  
  return {
    query: query.replace(/\$\d+/g, '?'),  // Normalize placeholders
    params: redactedParams
  };
}

/**
 * Check if data contains PII (for audit/compliance)
 * @param {any} data - Data to check
 * @returns {Object} PII detection results
 */
export function detectPII(data) {
  const detected = {
    hasPII: false,
    types: [],
    count: 0
  };
  
  const dataString = JSON.stringify(data);
  
  Object.entries(PII_PATTERNS).forEach(([type, pattern]) => {
    const matches = dataString.match(pattern);
    if (matches && matches.length > 0) {
      detected.hasPII = true;
      detected.types.push(type);
      detected.count += matches.length;
    }
  });
  
  return detected;
}

/**
 * Anonymize data for analytics (hash instead of redact)
 * @param {string} value - Value to anonymize
 * @param {string} salt - Salt for hashing
 * @returns {string} Hashed value
 */
export function anonymizeForAnalytics(value, salt = process.env.ANALYTICS_SALT || 'default-salt') {
  if (!value) return null;
  
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(value + salt)
    .digest('hex')
    .substring(0, 16); // First 16 characters
}

/**
 * GDPR-compliant data export (redact sensitive fields)
 * @param {Object} userData - User data for export
 * @returns {Object} Exportable data
 */
export function prepareGDPRExport(userData) {
  const exported = { ...userData };
  
  // Remove internal system fields
  delete exported.password;
  delete exported.mfaSecret;
  delete exported.apiKey;
  delete exported.refreshToken;
  
  // Hash sensitive identifiers
  if (exported.id) {
    exported.anonymizedId = anonymizeForAnalytics(String(exported.id));
  }
  
  // Add metadata
  exported._export = {
    exportedAt: new Date().toISOString(),
    dataController: 'Mediczy',
    purpose: 'GDPR Data Portability Request'
  };
  
  return exported;
}

export default {
  redactPII,
  redactPIIFromObject,
  createSafeLogger,
  piiRedactionMiddleware,
  sanitizeUserForLogging,
  redactSQLForLogging,
  detectPII,
  anonymizeForAnalytics,
  prepareGDPRExport,
  PII_PATTERNS,
  SENSITIVE_FIELD_NAMES
};
