/**
 * Validation Utilities for API v2
 * Provides middleware for Zod schema validation
 */

import { ZodError } from 'zod';

/**
 * Validate request against Zod schema
 * @param {ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware
 */
export const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      // Build object to validate based on schema structure
      const toValidate = {};
      
      if (schema.shape?.body) {
        toValidate.body = req.body;
      }
      
      if (schema.shape?.query) {
        toValidate.query = req.query;
      }
      
      if (schema.shape?.params) {
        toValidate.params = req.params;
      }
      
      // If no structured validation, validate body directly
      if (Object.keys(toValidate).length === 0) {
        toValidate.body = req.body;
      }
      
      // Parse and validate
      const validated = await schema.parseAsync(toValidate);
      
      // Merge validated data back to request
      if (validated.body) req.body = validated.body;
      if (validated.query) req.query = validated.query;
      if (validated.params) req.params = validated.params;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }));
        
        return res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            errors: formattedErrors
          }
        });
      }
      
      // Pass other errors to error handler
      next(error);
    }
  };
};

/**
 * Validate query parameters only
 */
export const validateQuery = (schema) => {
  return async (req, res, next) => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      handleValidationError(error, res, next);
    }
  };
};

/**
 * Validate body only
 */
export const validateBody = (schema) => {
  return async (req, res, next) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      handleValidationError(error, res, next);
    }
  };
};

/**
 * Validate params only
 */
export const validateParams = (schema) => {
  return async (req, res, next) => {
    try {
      req.params = await schema.parseAsync(req.params);
      next();
    } catch (error) {
      handleValidationError(error, res, next);
    }
  };
};

/**
 * Handle validation errors consistently
 */
const handleValidationError = (error, res, next) => {
  if (error instanceof ZodError) {
    const formattedErrors = error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }));
    
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: formattedErrors
      }
    });
  }
  
  next(error);
};

/**
 * Sanitize input (basic XSS prevention)
 */
export const sanitize = (value) => {
  if (typeof value !== 'string') return value;
  
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Sanitize object recursively
 */
export const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return sanitize(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
};

export default {
  validateRequest,
  validateQuery,
  validateBody,
  validateParams,
  sanitize,
  sanitizeObject
};
