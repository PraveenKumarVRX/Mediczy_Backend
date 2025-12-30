/**
 * Central Error Handler Middleware
 * Provides consistent error responses across the API
 * Handles operational errors, programming errors, and third-party errors
 */

import { AppError } from '../shared/errors/AppError.js';

/**
 * Development error response - includes stack trace
 */
const sendErrorDev = (err, req, res) => {
  console.error('❌ ERROR:', err);

  return res.status(err.statusCode).json({
    success: false,
    error: {
      code: err.code || 'ERROR',
      message: err.message,
      details: err.details || null,
      stack: err.stack
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
};

/**
 * Production error response - sanitized
 */
const sendErrorProd = (err, req, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || 'ERROR',
        message: err.message,
        details: err.details || null
      }
    });
  }

  // Programming or unknown error: don't leak error details
  console.error('❌ UNEXPECTED ERROR:', err);

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again later.'
    }
  });
};

/**
 * Handle specific error types and convert to AppError
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400, 'INVALID_INPUT');
};

const handleDuplicateFieldsDB = (err) => {
  const field = err.detail?.match(/\(([^)]+)\)/)?.[1] || 'field';
  const message = `Duplicate value for ${field}. Please use another value.`;
  return new AppError(message, 409, 'DUPLICATE_ENTRY');
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors || {}).map(el => el.message);
  const message = `Invalid input data: ${errors.join('. ')}`;
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again.', 401, 'INVALID_TOKEN');
};

const handleJWTExpiredError = () => {
  return new AppError('Your session has expired. Please log in again.', 401, 'TOKEN_EXPIRED');
};

const handleZodError = (err) => {
  const errors = err.issues?.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code
  })) || [];
  
  const error = new AppError('Validation failed', 422, 'VALIDATION_ERROR');
  error.details = errors;
  return error;
};

const handlePostgresError = (err) => {
  // Handle specific PostgreSQL error codes
  switch (err.code) {
    case '23505': // unique_violation
      return handleDuplicateFieldsDB(err);
    case '23503': // foreign_key_violation
      return new AppError('Referenced record not found', 400, 'REFERENCE_ERROR');
    case '23502': // not_null_violation
      return new AppError(`Missing required field: ${err.column}`, 400, 'MISSING_FIELD');
    case '22P02': // invalid_text_representation
      return new AppError('Invalid input format', 400, 'INVALID_FORMAT');
    case '42P01': // undefined_table
      return new AppError('Database table not found', 500, 'DATABASE_ERROR');
    case '42703': // undefined_column
      return new AppError('Invalid database column', 500, 'DATABASE_ERROR');
    case '28P01': // invalid_password
      return new AppError('Database authentication failed', 500, 'DATABASE_ERROR');
    case 'ECONNREFUSED':
      return new AppError('Database connection refused', 503, 'DATABASE_UNAVAILABLE');
    default:
      console.error('Unhandled PostgreSQL error:', err.code, err.message);
      return new AppError('Database error occurred', 500, 'DATABASE_ERROR');
  }
};

const handleAxiosError = (err) => {
  const message = err.response?.data?.message || err.message || 'External service error';
  const statusCode = err.response?.status || 502;
  return new AppError(`External service error: ${message}`, statusCode, 'EXTERNAL_SERVICE_ERROR');
};

const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File too large. Maximum size exceeded.', 400, 'FILE_TOO_LARGE');
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new AppError('Too many files uploaded', 400, 'TOO_MANY_FILES');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected file field', 400, 'INVALID_FILE_FIELD');
  }
  return new AppError('File upload error', 400, 'FILE_UPLOAD_ERROR');
};

/**
 * Main error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Set defaults
  err.statusCode = err.statusCode || 500;
  err.code = err.code || 'ERROR';

  // Log error for debugging
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Error:`, {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }

  // Handle specific error types
  let error = err;

  // PostgreSQL errors
  if (err.code && typeof err.code === 'string' && (err.code.startsWith('22') || err.code.startsWith('23') || err.code.startsWith('42'))) {
    error = handlePostgresError(err);
  }
  
  // Database connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    error = new AppError('Database connection error', 503, 'DATABASE_UNAVAILABLE');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  // Zod validation errors
  if (err.name === 'ZodError') error = handleZodError(err);

  // Mongoose/MongoDB validation (if used)
  if (err.name === 'CastError') error = handleCastErrorDB(err);
  if (err.name === 'ValidationError') error = handleValidationErrorDB(err);

  // Axios/HTTP client errors
  if (err.isAxiosError) error = handleAxiosError(err);

  // Multer file upload errors
  if (err.code?.startsWith('LIMIT_')) error = handleMulterError(err);

  // Send appropriate response based on environment
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * Handle 404 Not Found
 */
export const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

/**
 * Handle async errors wrapper
 * Wraps async route handlers to catch errors automatically
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Sync error wrapper
 * For synchronous route handlers
 */
export const syncHandler = (fn) => {
  return (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Handle uncaught exceptions
 */
export const setupUncaughtHandlers = () => {
  process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION! Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION! Shutting down...');
    console.error('Reason:', reason);
    // In production, you might want to:
    // - Send to error tracking service (Sentry, etc.)
    // - Gracefully close server before exit
    process.exit(1);
  });
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  syncHandler,
  setupUncaughtHandlers
};
