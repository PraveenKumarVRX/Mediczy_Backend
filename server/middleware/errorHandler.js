/**
 * Centralized Error Handler - Mediqzy API v1
 * Handles all errors consistently across the API
 */

import { logger } from '../utils/logger.js';
import { debug } from '../utils/debugger.js';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error types
 */
export const ErrorTypes = {
  // Client errors (4xx)
  BadRequest: (message = 'Bad request', details = null) => 
    new ApiError(400, 'BAD_REQUEST', message, details),
  
  Unauthorized: (message = 'Unauthorized', details = null) => 
    new ApiError(401, 'UNAUTHORIZED', message, details),
  
  Forbidden: (message = 'Forbidden', details = null) => 
    new ApiError(403, 'FORBIDDEN', message, details),
  
  NotFound: (resource = 'Resource', details = null) => 
    new ApiError(404, 'NOT_FOUND', `${resource} not found`, details),
  
  Conflict: (message = 'Resource already exists', details = null) => 
    new ApiError(409, 'CONFLICT', message, details),
  
  ValidationError: (message = 'Validation failed', details = null) => 
    new ApiError(422, 'VALIDATION_ERROR', message, details),
  
  TooManyRequests: (message = 'Too many requests', details = null) => 
    new ApiError(429, 'TOO_MANY_REQUESTS', message, details),

  // Server errors (5xx)
  InternalServer: (message = 'Internal server error', details = null) => 
    new ApiError(500, 'INTERNAL_SERVER_ERROR', message, details),
  
  ServiceUnavailable: (message = 'Service temporarily unavailable', details = null) => 
    new ApiError(503, 'SERVICE_UNAVAILABLE', message, details),
  
  DatabaseError: (message = 'Database operation failed', details = null) => 
    new ApiError(500, 'DATABASE_ERROR', message, details),

  // Business logic errors
  PaymentRequired: (message = 'Payment required', details = null) => 
    new ApiError(402, 'PAYMENT_REQUIRED', message, details),
  
  ResourceLocked: (message = 'Resource is locked', details = null) => 
    new ApiError(423, 'RESOURCE_LOCKED', message, details),
};

/**
 * Database error handler
 */
const handleDatabaseError = (error) => {
  console.error('Database error:', error);

  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // unique_violation
      return ErrorTypes.Conflict('Resource already exists', {
        constraint: error.constraint,
        detail: error.detail
      });
    
    case '23503': // foreign_key_violation
      return ErrorTypes.BadRequest('Invalid reference to related resource', {
        constraint: error.constraint,
        detail: error.detail
      });
    
    case '23502': // not_null_violation
      return ErrorTypes.BadRequest('Required field missing', {
        column: error.column,
        detail: error.detail
      });
    
    case '22P02': // invalid_text_representation
      return ErrorTypes.BadRequest('Invalid data format', {
        detail: error.detail
      });
    
    case '42P01': // undefined_table
      return ErrorTypes.InternalServer('Database schema error', {
        detail: 'Required table does not exist'
      });
    
    default:
      return ErrorTypes.DatabaseError('Database operation failed', {
        code: error.code,
        routine: error.routine
      });
  }
};

/**
 * Async route wrapper to catch errors
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Main error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle database errors
  if (err.code && err.code.match(/^[0-9A-Z]{5}$/)) {
    error = handleDatabaseError(err);
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    error = ErrorTypes.ServiceUnavailable('Request timeout');
  }

  // Handle non-operational errors
  if (!error.isOperational) {
    console.error('Unhandled error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      user: req.user?.user_id
    });
    
    error = ErrorTypes.InternalServer();
  }

  // Build error response
  const statusCode = error.statusCode || 500;
  const response = {
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    }
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development' && error.details) {
    response.error.details = error.details;
  }

  // Add stack trace in development mode
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.error.stack = error.stack.split('\n');
  }

  // Log error
  if (logger) {
    logger.error('API Error', response.error);
  }
  if (debug) {
    debug.error('Error occurred', err);
  }

  res.status(statusCode).json(response);
};

// Keep legacy handlers for compatibility

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res, next) => {
  const error = ErrorTypes.NotFound('Endpoint', {
    path: req.originalUrl,
    method: req.method
  });
  next(error);
};

/**
 * Development error handler - provides detailed error information
 */
export function developmentErrorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  
  // Log the error with full details
  logger.error('Request Error', {
    message: err.message,
    stack: err.stack,
    statusCode,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    user: req.user?.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Debug output
  debug.error('Error occurred', err);

  // Send detailed error response
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message,
      statusCode,
      stack: process.env.SHOW_ERROR_DETAILS === 'true' ? err.stack : undefined,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      details: err.details || {},
      validationErrors: err.validationErrors || []
    }
  });
}

/**
 * Production error handler - provides minimal error information
 */
export function productionErrorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  
  // Log the error
  logger.error('Request Error', {
    message: err.message,
    statusCode,
    method: req.method,
    path: req.path,
    user: req.user?.id
  });

  // Send minimal error response
  res.status(statusCode).json({
    success: false,
    error: {
      message: statusCode === 500 ? 'Internal Server Error' : err.message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Get appropriate error handler based on environment
 */
export function getErrorHandler() {
  return process.env.NODE_ENV === 'production' 
    ? productionErrorHandler 
    : developmentErrorHandler;
}

/**
 * Validation Error Handler
 */
export function validationErrorHandler(errors) {
  const error = new Error('Validation Failed');
  error.statusCode = 422;
  error.validationErrors = errors.array ? errors.array() : errors;
  return error;
}

export default {
  developmentErrorHandler,
  productionErrorHandler,
  getErrorHandler,
  asyncHandler,
  notFoundHandler,
  validationErrorHandler
};
