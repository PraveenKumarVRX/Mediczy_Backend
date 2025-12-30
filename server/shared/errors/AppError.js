/**
 * Application Error Classes
 * Standardized error handling across the application
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

// 400 - Bad Request
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

// 401 - Unauthorized
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

// 403 - Forbidden
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', details = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

// 404 - Not Found
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', details = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}

// 409 - Conflict
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

// 422 - Validation Error
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 422, 'VALIDATION_ERROR', { errors });
  }
}

// 429 - Rate Limited
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = 60) {
    super(message, 429, 'RATE_LIMITED', { retryAfter });
  }
}

// 500 - Internal Server Error
export class InternalError extends AppError {
  constructor(message = 'Internal server error', details = null) {
    super(message, 500, 'INTERNAL_ERROR', details);
  }
}

// 502 - Bad Gateway (external service errors)
export class ExternalServiceError extends AppError {
  constructor(service, message = 'External service error') {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', { service });
  }
}

// 503 - Service Unavailable
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', retryAfter = 60) {
    super(message, 503, 'SERVICE_UNAVAILABLE', { retryAfter });
  }
}

// Tenant Errors
export class TenantNotFoundError extends AppError {
  constructor(message = 'Tenant not found') {
    super(message, 404, 'TENANT_NOT_FOUND');
  }
}

export class TenantSuspendedError extends AppError {
  constructor(message = 'Tenant account suspended') {
    super(message, 403, 'TENANT_SUSPENDED');
  }
}

// Authentication Errors
export class TokenExpiredError extends AppError {
  constructor(message = 'Token expired') {
    super(message, 401, 'TOKEN_EXPIRED');
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid token') {
    super(message, 401, 'INVALID_TOKEN');
  }
}

// Business Logic Errors
export class InsufficientPermissionsError extends AppError {
  constructor(action, resource) {
    super(`Insufficient permissions to ${action} ${resource}`, 403, 'INSUFFICIENT_PERMISSIONS', { action, resource });
  }
}

export class ResourceLimitExceededError extends AppError {
  constructor(resource, limit) {
    super(`${resource} limit exceeded (max: ${limit})`, 403, 'LIMIT_EXCEEDED', { resource, limit });
  }
}

export class DuplicateResourceError extends AppError {
  constructor(resource, identifier) {
    super(`${resource} already exists`, 409, 'DUPLICATE_RESOURCE', { resource, identifier });
  }
}

export default AppError;
