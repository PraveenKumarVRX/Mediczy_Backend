/**
 * Zod schemas for appointment endpoints.
 */

import { z } from 'zod';
import {
  intId,
  dateString,
  timeHHMM,
  phoneNumber,
  consultationType,
  patientId,
  doctorId,
  tenantId,
} from './common.schema.js';

// ── Create appointment ──────────────────────────────────────────────────────
export const createAppointmentSchema = z.object({
  doctorId:         doctorId,
  appointmentDate:  dateString,
  appointmentTime:  timeHHMM,
  consultationType: consultationType,
  symptoms:  z.string().max(2000).optional(),
  patientId: patientId.optional(),          // used by corporate / team flows
  tenantId:  tenantId.optional(),
  labId:     intId.optional(),
  notes:     z.string().max(1000).optional(),
  isUrgent:  z.boolean().default(false),
});

// ── Reschedule appointment ──────────────────────────────────────────────────
export const rescheduleAppointmentSchema = z.object({
  appointmentDate: dateString,
  appointmentTime: timeHHMM,
  reason: z.string().max(500).optional(),
});

// ── Cancel appointment ──────────────────────────────────────────────────────
export const cancelAppointmentSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

// ── Complete appointment ────────────────────────────────────────────────────
export const completeAppointmentSchema = z.object({
  diagnosis:   z.string().max(5000).optional(),
  prescription: z.string().max(10000).optional(),
  followUpDate: dateString.optional(),
  notes:        z.string().max(2000).optional(),
});

// ── Rate appointment ────────────────────────────────────────────────────────
export const rateAppointmentSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  review:  z.string().max(2000).optional(),
});

// ── Query: list appointments ────────────────────────────────────────────────
export const listAppointmentsQuerySchema = z.object({
  status: z.enum(['scheduled','completed','cancelled','no_show','rescheduled']).optional(),
  from:   dateString.optional(),
  to:     dateString.optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});
