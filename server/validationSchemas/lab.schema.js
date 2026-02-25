/**
 * Zod schemas for lab booking endpoints.
 */

import { z } from 'zod';
import {
  intId,
  dateString,
  timeHHMM,
  phoneNumber,
  patientId,
  labId,
} from './common.schema.js';

// ── Book a lab test ─────────────────────────────────────────────────────────
export const bookLabTestSchema = z.object({
  labId:          labId,
  testName:       z.string().min(1).max(200),
  appointmentDate: dateString,
  appointmentTime: timeHHMM,
  patientName:    z.string().min(1).max(200),
  patientPhone:   phoneNumber.optional(),
  patientAge:     z.coerce.number().int().min(0).max(150).optional(),
  patientGender:  z.enum(['male','female','other']).optional(),
  notes:          z.string().max(1000).optional(),
  homeCollection: z.boolean().default(false),
  address:        z.string().max(500).optional(),
});

// ── Query: list team bookings ───────────────────────────────────────────────
export const teamBookingsQuerySchema = z.object({
  from:   dateString.optional(),
  to:     dateString.optional(),
  status: z.string().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});
