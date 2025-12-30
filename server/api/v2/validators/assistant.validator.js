/**
 * Zod Validation Schemas for Assistant API v2
 * Type-safe validation at runtime with detailed error messages
 */

import { z } from 'zod';

// ============== Base Schemas ==============

const phoneSchema = z.string()
  .regex(/^[+]?[\d\s-()]{10,20}$/, 'Invalid phone number format');

const emailSchema = z.string()
  .email('Invalid email format')
  .toLowerCase();

const idSchema = z.string()
  .min(1, 'ID is required');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

// ============== Auth Schemas ==============

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
    role: z.enum(['doctor', 'assistant', 'patient', 'admin']).optional().default('assistant'),
    rememberMe: z.boolean().optional().default(false)
  })
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required')
  })
});

// ============== Profile Schemas ==============

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
    phone: phoneSchema.optional(),
    avatarUrl: z.string().url('Invalid avatar URL').optional()
  })
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string()
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })
});

// ============== Appointment Schemas ==============

export const getAppointmentsSchema = z.object({
  query: z.object({
    ...paginationSchema.shape,
    status: z.enum(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
    doctorId: idSchema.optional(),
    patientId: idSchema.optional(),
    search: z.string().optional()
  })
});

export const createAppointmentSchema = z.object({
  body: z.object({
    patientId: idSchema,
    doctorId: idSchema.optional(), // May use linked doctor
    appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    appointmentTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    type: z.enum(['consultation', 'follow-up', 'emergency', 'video', 'chat']).default('consultation'),
    symptoms: z.string().max(1000).optional(),
    notes: z.string().max(2000).optional(),
    duration: z.number().int().min(5).max(120).default(15) // minutes
  })
});

export const updateAppointmentSchema = z.object({
  params: z.object({
    id: idSchema
  }),
  body: z.object({
    appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    appointmentTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    status: z.enum(['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show']).optional(),
    notes: z.string().max(2000).optional(),
    cancellationReason: z.string().max(500).optional()
  })
});

// ============== Patient Schemas ==============

export const getPatientsSchema = z.object({
  query: z.object({
    ...paginationSchema.shape,
    search: z.string().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    minAge: z.coerce.number().int().min(0).optional(),
    maxAge: z.coerce.number().int().max(150).optional()
  })
});

export const registerPatientSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: emailSchema.optional(),
    phone: phoneSchema,
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    address: z.string().max(500).optional(),
    bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
    allergies: z.string().max(1000).optional(),
    emergencyContact: z.object({
      name: z.string().max(100),
      phone: phoneSchema,
      relationship: z.string().max(50)
    }).optional()
  })
});

export const updatePatientSchema = z.object({
  params: z.object({
    id: idSchema
  }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    address: z.string().max(500).optional(),
    bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
    allergies: z.string().max(1000).optional()
  })
});

// ============== Prescription Schemas ==============

export const getPrescriptionsSchema = z.object({
  query: z.object({
    ...paginationSchema.shape,
    patientId: idSchema.optional(),
    status: z.enum(['draft', 'pending', 'signed', 'dispensed']).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
});

// ============== Billing Schemas ==============

export const getBillingSchema = z.object({
  query: z.object({
    ...paginationSchema.shape,
    status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
    patientId: idSchema.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
});

export const createBillingSchema = z.object({
  body: z.object({
    patientId: idSchema,
    appointmentId: idSchema.optional(),
    items: z.array(z.object({
      description: z.string().min(1).max(200),
      quantity: z.number().int().min(1).default(1),
      unitPrice: z.number().min(0),
      tax: z.number().min(0).max(100).default(0) // percentage
    })).min(1, 'At least one item is required'),
    discount: z.number().min(0).default(0),
    notes: z.string().max(500).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
});

// ============== Message Schemas ==============

export const getMessagesSchema = z.object({
  query: z.object({
    ...paginationSchema.shape,
    folder: z.enum(['inbox', 'sent', 'drafts', 'trash']).default('inbox'),
    unreadOnly: z.coerce.boolean().optional()
  })
});

export const sendMessageSchema = z.object({
  body: z.object({
    recipientId: idSchema,
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    attachments: z.array(z.object({
      filename: z.string(),
      url: z.string().url(),
      size: z.number()
    })).optional()
  })
});

// ============== Search Schemas ==============

export const searchSchema = z.object({
  query: z.object({
    q: z.string().min(1, 'Search query is required'),
    type: z.enum(['patients', 'appointments', 'prescriptions', 'all']).default('all'),
    ...paginationSchema.shape
  })
});

// ============== ID Param Schema ==============

export const idParamSchema = z.object({
  params: z.object({
    id: idSchema
  })
});

export default {
  loginSchema,
  refreshTokenSchema,
  updateProfileSchema,
  changePasswordSchema,
  getAppointmentsSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  getPatientsSchema,
  registerPatientSchema,
  updatePatientSchema,
  getPrescriptionsSchema,
  getBillingSchema,
  createBillingSchema,
  getMessagesSchema,
  sendMessageSchema,
  searchSchema,
  idParamSchema
};
