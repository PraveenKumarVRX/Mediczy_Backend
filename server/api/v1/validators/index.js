/**
 * Validation Utilities
 * Centralized validation handling with Zod
 */

import { ZodError } from 'zod';
import { ValidationError } from '../../../shared/errors/AppError.js';

/**
 * Validate request data against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {object} data - Data to validate
 * @returns {object} Validated and typed data
 * @throws {ValidationError} If validation fails
 */
export const validateRequest = (schema, data) => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      throw new ValidationError('Validation failed', errors);
    }
    throw error;
  }
};

/**
 * Async validation for complex validations
 */
export const validateRequestAsync = async (schema, data) => {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      throw new ValidationError('Validation failed', errors);
    }
    throw error;
  }
};

/**
 * Validation middleware factory
 * @param {z.ZodSchema} schema - Zod schema
 * @param {'body' | 'query' | 'params'} source - Request property to validate
 */
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      req[source] = validateRequest(schema, req[source]);
      next();
    } catch (error) {
      next(error);
    }
  };
};

export { z } from 'zod';
