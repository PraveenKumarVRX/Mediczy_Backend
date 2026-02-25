/**
 * Common Zod primitives reused across all schema files.
 */

import { z } from 'zod';

// ── ID fields ──────────────────────────────────────────────────────────────
export const intId = z.coerce.number().int().positive();
export const uuidId = z.string().uuid();

// ── Date / Time ────────────────────────────────────────────────────────────
/** YYYY-MM-DD */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/** HH:MM (24-hour) */
export const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour)');

// ── Contact ────────────────────────────────────────────────────────────────
/** Indian mobile: optional +91, then 10 digits */
export const phoneNumber = z
  .string()
  .regex(/^(\+91)?[6-9]\d{9}$/, 'Invalid phone number');

export const emailAddress = z.string().email();

// ── Pagination ─────────────────────────────────────────────────────────────
export const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Consultation types ──────────────────────────────────────────────────────
export const consultationType = z.enum([
  'video',
  'audio',
  'in_person',
  'clinic',
  'home_visit',
  'emergency',
]);

// ── Tenant ─────────────────────────────────────────────────────────────────
export const tenantId = intId;
export const corporateId = intId;
export const labId = intId;
export const doctorId = intId;
export const patientId = intId;
