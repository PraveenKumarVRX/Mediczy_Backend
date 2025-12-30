/**
 * Request Validation Schemas - Assistant
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

export const assistantLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  deviceInfo: z.object({
    platform: z.enum(['web', 'ios', 'android']).optional(),
    deviceId: z.string().optional(),
    appVersion: z.string().optional(),
    pushToken: z.string().optional()
  }).optional()
});

export const assistantProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number').optional(),
  emergencyContact: z.string().optional(),
  workSchedule: z.record(z.string()).optional(),
  profileImage: z.string().url().optional()
});

export const appointmentStatusSchema = z.object({
  status: z.enum(['confirmed', 'cancelled', 'rescheduled', 'completed', 'no-show']),
  reason: z.string().max(500).optional(),
  newDateTime: z.string().datetime().optional() // For rescheduling
});

export const patientRegistrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email().optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().default('India')
  }).optional(),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string()
  }).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.array(z.string()).optional(),
  medicalHistory: z.string().optional()
});

export const messageSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  content: z.string().min(1, 'Message content is required').max(2000),
  type: z.enum(['text', 'appointment_reminder', 'prescription', 'follow_up']).default('text')
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});
