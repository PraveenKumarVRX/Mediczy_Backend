/**
 * Error Handler Middleware with Enhanced Debugging
 */

import { logger } from '../utils/logger.js';
import { debug } from '../utils/debugger.js';

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
 * Async error wrapper - catches errors in async route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not Found Handler
 */
export function notFoundHandler(req, res, next) {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
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
