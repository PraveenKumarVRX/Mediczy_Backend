/**
 * Zod schemas for AI health endpoints.
 */

import { z } from 'zod';

// ── AI /chat request ────────────────────────────────────────────────────────
export const aiChatRequestSchema = z.object({
  message:  z.string().min(1).max(4000).optional(),
  symptoms: z.string().min(1).max(4000).optional(),
  sessionId: z.string().uuid().optional(),
}).refine(data => data.message || data.symptoms, {
  message: 'Either message or symptoms is required',
});

// ── Dr. ISHA consult request ────────────────────────────────────────────────
export const drIshaConsultSchema = z.object({
  message:       z.string().min(1).max(4000).optional(),
  symptoms:      z.string().min(1).max(4000).optional(),
  medicalHistory: z.string().max(5000).optional(),
}).refine(data => data.message || data.symptoms, {
  message: 'Either message or symptoms is required',
});

// ── Diet plan request ───────────────────────────────────────────────────────
export const dietPlanSchema = z.object({
  age:       z.coerce.number().int().min(1).max(120),
  weight:    z.coerce.number().min(1).max(500),
  height:    z.coerce.number().min(1).max(300),
  goal:      z.enum(['weight_loss','weight_gain','maintain']),
  dietaryRestrictions: z.array(z.string()).default([]),
  activityLevel: z.enum(['sedentary','light','moderate','active','veryActive']),
  gender:    z.enum(['male','female','other']),
});

// ── Outbound AI response shape (schema guard) ───────────────────────────────
export const aiChatResponseGuard = z.object({
  success: z.literal(true),
  message: z.string(),
  analysis: z.object({
    severity:           z.string(),
    possibleConditions: z.array(z.string()),
    recommendations:    z.array(z.string()),
    urgency:            z.string(),
  }),
  suggestedActions: z.array(
    z.object({
      action: z.string(),
      type:   z.string(),
      url:    z.string().optional(),
      meta:   z.record(z.unknown()).optional(),
    })
  ),
  disclaimer: z.string(),
  // optional fields added by guards
  highRisk:      z.boolean().optional(),
  bookingCta:    z.object({ url: z.string(), label: z.string() }).optional(),
  auditId:       z.string().optional(),
});
