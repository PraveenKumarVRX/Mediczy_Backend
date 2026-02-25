/**
 * validateRequest — Zod-based request validation middleware factory.
 *
 * Usage:
 *   import { validateBody, validateQuery, validateParams } from '../validationSchemas/validateRequest.middleware.js';
 *   import { createAppointmentSchema } from '../validationSchemas/appointment.schema.js';
 *
 *   router.post('/', auth, validateBody(createAppointmentSchema), controller.create);
 */

/**
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;   // replace with coerced / defaulted values
    next();
  };
}

/**
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(422).json({
        success: false,
        message: 'Invalid query parameters',
        errors: result.error.flatten().fieldErrors,
      });
    }
    req.query = result.data;
    next();
  };
}

/**
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid route parameters',
        errors: result.error.flatten().fieldErrors,
      });
    }
    req.params = result.data;
    next();
  };
}
