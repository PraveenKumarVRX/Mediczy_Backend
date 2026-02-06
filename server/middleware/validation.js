/**
 * Request Validation Middleware - Mediqzy API v1
 * Provides comprehensive validation for API requests
 */

import { body, param, query, validationResult } from 'express-validator';

/**
 * Validation error formatter
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg,
          value: err.value
        }))
      }
    });
  }
  
  next();
};

/**
 * Common validation rules
 */
export const validators = {
  // Tenant ID
  tenantId: () => param('tenantId')
    .notEmpty()
    .withMessage('Tenant ID is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Tenant ID must be between 3 and 50 characters'),

  // Resource IDs
  resourceId: (field = 'id') => param(field)
    .notEmpty()
    .withMessage(`${field} is required`)
    .isLength({ min: 3, max: 50 })
    .withMessage(`${field} must be between 3 and 50 characters`),

  // Email
  email: (field = 'email') => body(field)
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),

  // Phone
  phone: (field = 'phone', required = false) => {
    const validator = body(field)
      .matches(/^[+]?[\d\s\-()]+$/)
      .withMessage('Invalid phone number format')
      .isLength({ min: 10, max: 20 })
      .withMessage('Phone number must be between 10 and 20 characters');
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // Date
  date: (field, required = true) => {
    const validator = body(field)
      .isISO8601()
      .withMessage('Invalid date format (use ISO 8601)');
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // Pagination
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    query('sort')
      .optional()
      .isString()
      .withMessage('Sort must be a string'),
    query('order')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Order must be asc or desc')
  ],

  // Text fields
  text: (field, minLength = 1, maxLength = 500, required = true) => {
    const validator = body(field)
      .isString()
      .withMessage(`${field} must be a string`)
      .trim()
      .isLength({ min: minLength, max: maxLength })
      .withMessage(`${field} must be between ${minLength} and ${maxLength} characters`);
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // Enum values
  enum: (field, allowedValues, required = true) => {
    const validator = body(field)
      .isIn(allowedValues)
      .withMessage(`${field} must be one of: ${allowedValues.join(', ')}`);
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // Numeric values
  numeric: (field, min = null, max = null, required = true) => {
    let validator = body(field)
      .isNumeric()
      .withMessage(`${field} must be a number`);
    
    if (min !== null) {
      validator = validator.isFloat({ min }).withMessage(`${field} must be at least ${min}`);
    }
    if (max !== null) {
      validator = validator.isFloat({ max }).withMessage(`${field} must be at most ${max}`);
    }
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // Boolean
  boolean: (field, required = false) => {
    const validator = body(field)
      .isBoolean()
      .withMessage(`${field} must be a boolean`);
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // Array
  array: (field, minLength = null, maxLength = null, required = true) => {
    let validator = body(field)
      .isArray()
      .withMessage(`${field} must be an array`);
    
    if (minLength !== null) {
      validator = validator.isLength({ min: minLength })
        .withMessage(`${field} must contain at least ${minLength} items`);
    }
    if (maxLength !== null) {
      validator = validator.isLength({ max: maxLength })
        .withMessage(`${field} must contain at most ${maxLength} items`);
    }
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // JSON object
  jsonObject: (field, required = true) => {
    const validator = body(field)
      .isObject()
      .withMessage(`${field} must be an object`);
    
    return required ? validator.notEmpty() : validator.optional();
  },

  // UUID
  uuid: (field) => param(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`),
};

/**
 * Module-specific validation schemas
 */

// Chat validation
export const chatValidation = {
  createRoom: [
    validators.tenantId(),
    body('patient_id').notEmpty().withMessage('patient_id is required'),
    body('doctor_id').notEmpty().withMessage('doctor_id is required'),
    body('appointment_id').optional(),
    validators.enum('room_type', ['consultation', 'support', 'follow-up'], false),
    handleValidationErrors
  ],

  sendMessage: [
    validators.tenantId(),
    validators.resourceId('room_id'),
    validators.text('content', 1, 5000),
    validators.enum('message_type', ['text', 'image', 'file', 'prescription', 'report'], false),
    validators.jsonObject('attachment', false),
    handleValidationErrors
  ],

  listMessages: [
    validators.tenantId(),
    validators.resourceId('room_id'),
    ...validators.pagination(),
    handleValidationErrors
  ]
};

// Labs validation
export const labsValidation = {
  createBooking: [
    validators.tenantId(),
    validators.array('tests', 1, 20),
    validators.enum('collection_type', ['home-collection', 'lab-visit']),
    validators.date('collection_date', false),
    body('collection_time_slot').optional(),
    body('patient_name').notEmpty().withMessage('patient_name is required'),
    validators.numeric('patient_age', 0, 150),
    validators.enum('patient_gender', ['male', 'female', 'other'], false),
    handleValidationErrors
  ],

  uploadReport: [
    validators.tenantId(),
    validators.resourceId('booking_id'),
    body('report_url').isURL().withMessage('Invalid report URL'),
    handleValidationErrors
  ]
};

// Pharmacy validation
export const pharmacyValidation = {
  createPrescription: [
    validators.tenantId(),
    body('user_id').notEmpty().withMessage('user_id is required'),
    body('doctor_id').notEmpty().withMessage('doctor_id is required'),
    validators.text('diagnosis', 1, 1000, false),
    validators.array('medications', 1, 50),
    validators.date('valid_until', false),
    validators.numeric('refills_allowed', 0, 10, false),
    handleValidationErrors
  ],

  createOrder: [
    validators.tenantId(),
    body('prescription_id').optional(),
    validators.array('items', 1, 100),
    validators.enum('delivery_type', ['home-delivery', 'pickup']),
    validators.jsonObject('delivery_address', false),
    validators.date('delivery_date', false),
    handleValidationErrors
  ]
};

// Homecare validation
export const homecareValidation = {
  createBooking: [
    validators.tenantId(),
    body('service_id').notEmpty().withMessage('service_id is required'),
    validators.date('service_date'),
    body('service_time_slot').notEmpty().withMessage('service_time_slot is required'),
    validators.numeric('duration_days', 1, 365, false),
    validators.numeric('sessions_count', 1, 100, false),
    validators.jsonObject('service_address'),
    validators.text('patient_name', 1, 255),
    validators.numeric('patient_age', 0, 150),
    validators.enum('patient_gender', ['male', 'female', 'other']),
    validators.text('patient_condition', 1, 1000, false),
    handleValidationErrors
  ]
};

// Wellness validation
export const wellnessValidation = {
  createHRA: [
    validators.tenantId(),
    validators.jsonObject('responses'),
    validators.numeric('bmi', 0, 100, false),
    validators.numeric('bp_systolic', 0, 300, false),
    validators.numeric('bp_diastolic', 0, 200, false),
    validators.numeric('heart_rate', 0, 300, false),
    validators.numeric('blood_sugar', 0, 1000, false),
    validators.enum('smoking_status', ['never', 'former', 'current'], false),
    validators.enum('alcohol_consumption', ['none', 'moderate', 'heavy'], false),
    handleValidationErrors
  ],

  enrollPlan: [
    validators.tenantId(),
    body('plan_id').notEmpty().withMessage('plan_id is required'),
    validators.date('start_date', false),
    handleValidationErrors
  ]
};

// Webhooks validation
export const webhooksValidation = {
  createWebhook: [
    validators.tenantId(),
    validators.text('name', 3, 255),
    body('url').isURL().withMessage('Invalid webhook URL'),
    body('secret').notEmpty().withMessage('secret is required'),
    validators.array('events', 1, 50),
    validators.boolean('enabled', false),
    validators.boolean('retry_enabled', false),
    validators.numeric('max_retries', 1, 10, false),
    validators.numeric('timeout_seconds', 1, 120, false),
    validators.jsonObject('headers', false),
    handleValidationErrors
  ],

  testWebhook: [
    validators.tenantId(),
    validators.resourceId('webhook_id'),
    body('event_type').notEmpty().withMessage('event_type is required'),
    validators.jsonObject('event_data'),
    handleValidationErrors
  ]
};

// Appointments validation
export const appointmentsValidation = {
  createAppointment: [
    validators.tenantId(),
    body('user_id').notEmpty().withMessage('user_id is required'),
    body('doctor_id').notEmpty().withMessage('doctor_id is required'),
    validators.enum('appointment_type', ['consultation', 'follow-up', 'emergency']),
    validators.enum('consultation_mode', ['in-person', 'video', 'chat', 'home-visit']),
    validators.date('scheduled_date'),
    body('scheduled_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Invalid time format (use HH:MM)'),
    validators.numeric('duration_minutes', 15, 480, false),
    validators.text('symptoms', 0, 1000, false),
    handleValidationErrors
  ],

  updateAppointment: [
    validators.tenantId(),
    validators.resourceId('appointment_id'),
    validators.enum('status', ['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled'], false),
    validators.text('cancellation_reason', 0, 500, false),
    validators.text('notes', 0, 2000, false),
    handleValidationErrors
  ]
};

// Doctors validation
export const doctorsValidation = {
  createDoctor: [
    validators.tenantId(),
    validators.text('name', 3, 255),
    validators.email('email', false),
    validators.phone('phone', false),
    validators.enum('gender', ['male', 'female', 'other'], false),
    validators.text('specialty', 3, 100, false),
    validators.text('qualification', 3, 500, false),
    validators.numeric('experience_years', 0, 70, false),
    validators.text('registration_number', 3, 100, false),
    validators.numeric('consultation_fee', 0, 100000, false),
    handleValidationErrors
  ]
};

export default {
  validators,
  handleValidationErrors,
  chatValidation,
  labsValidation,
  pharmacyValidation,
  homecareValidation,
  wellnessValidation,
  webhooksValidation,
  appointmentsValidation,
  doctorsValidation
};
