/**
 * Omnichannel Journey Builder Route
 * ───────────────────────────────────
 * Unified dispatch endpoint for sending patient-facing messages across
 * WhatsApp, email, in-app push and SMS simultaneously.
 *
 * Routes:
 *   POST /api/omnichannel/send         — Ad-hoc multi-channel message
 *   POST /api/omnichannel/journey      — Trigger a named journey (e.g. appointment_booked)
 *   GET  /api/omnichannel/journeys     — List available journey templates
 *   POST /api/omnichannel/broadcast    — Send to a patient cohort (admin)
 *
 * All routes require authentication.  Broadcast requires admin.
 */

import express from 'express';
import { z } from 'zod';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../validationSchemas/validateRequest.middleware.js';
import notificationService from '../services/notification.service.js';
import whatsappRouter from '../services/whatsapp-router.service.js';

const router = express.Router();

// ─── Channel Enum ─────────────────────────────────────────────────────────────
const SUPPORTED_CHANNELS = /** @type {const} */ (['whatsapp', 'email', 'in-app', 'sms', 'push']);

// ─── Journey Templates ────────────────────────────────────────────────────────
/**
 * A journey template comprises:
 *  - id:       unique slug
 *  - name:     human label
 *  - channels: default channels (overridable per request)
 *  - variables: required template variables
 */
const JOURNEY_TEMPLATES = {
  appointment_booked: {
    id: 'appointment_booked',
    name: 'Appointment Booking Confirmation',
    channels: ['in-app', 'email', 'whatsapp'],
    variables: ['patientName', 'doctorName', 'date', 'time', 'consultationType', 'appointmentId'],
    whatsappRoute: 'appointments',
    notificationType: 'appointment_booked',
  },
  appointment_reminder: {
    id: 'appointment_reminder',
    name: 'Appointment Reminder (24 h)',
    channels: ['in-app', 'whatsapp'],
    variables: ['patientName', 'doctorName', 'date', 'time'],
    whatsappRoute: 'appointments',
    notificationType: 'appointment_reminder',
  },
  appointment_cancelled: {
    id: 'appointment_cancelled',
    name: 'Appointment Cancellation',
    channels: ['in-app', 'email'],
    variables: ['patientName', 'doctorName', 'date', 'time'],
    notificationType: 'appointment_cancelled',
  },
  lab_result_ready: {
    id: 'lab_result_ready',
    name: 'Lab Result Available',
    channels: ['in-app', 'email'],
    variables: ['patientName', 'testName', 'labName', 'reportUrl'],
    notificationType: 'lab_result_ready',
  },
  prescription_ready: {
    id: 'prescription_ready',
    name: 'Prescription Issued',
    channels: ['in-app', 'whatsapp'],
    variables: ['patientName', 'doctorName', 'medicationCount'],
    whatsappRoute: 'prescriptions',
    notificationType: 'prescription_ready',
  },
  payment_success: {
    id: 'payment_success',
    name: 'Payment Confirmation',
    channels: ['in-app', 'email'],
    variables: ['patientName', 'amount', 'orderId', 'service'],
    notificationType: 'payment_success',
  },
  health_tip: {
    id: 'health_tip',
    name: 'Personalised Health Tip',
    channels: ['in-app'],
    variables: ['patientName', 'tip', 'category'],
    notificationType: 'health_tip',
  },
};

// ─── Validation schemas ───────────────────────────────────────────────────────
const sendSchema = z.object({
  patientId:  z.number().int().positive(),
  phone:      z.string().optional(),
  email:      z.string().email().optional(),
  channels:   z.array(z.enum(SUPPORTED_CHANNELS)).min(1),
  template:   z.string().min(1),                  // notification type string
  variables:  z.record(z.string(), z.unknown()).default({}),
  actionUrl:  z.string().optional(),
  priority:   z.enum(['normal', 'high']).default('normal'),
});

const journeySchema = z.object({
  journeyId:  z.string().min(1),
  patientId:  z.number().int().positive(),
  phone:      z.string().optional(),
  email:      z.string().email().optional(),
  variables:  z.record(z.string(), z.unknown()),   // caller must supply all required vars
  channels:   z.array(z.enum(SUPPORTED_CHANNELS)).optional(),  // override journey defaults
  actionUrl:  z.string().optional(),
});

const broadcastSchema = z.object({
  patientIds: z.array(z.number().int().positive()).min(1).max(500),
  channels:   z.array(z.enum(SUPPORTED_CHANNELS)).min(1),
  template:   z.string().min(1),
  variables:  z.record(z.string(), z.unknown()).default({}),
  actionUrl:  z.string().optional(),
});

// ─── Internal dispatch helpers ────────────────────────────────────────────────
/**
 * Dispatch a single message across selected channels.
 * All failures are collected rather than thrown.
 *
 * @param {{
 *   patientId, phone, email, channels, template, variables, actionUrl, priority
 * }} opts
 */
async function dispatchMultiChannel({ patientId, phone, email, channels, template, variables, actionUrl, priority }) {
  const results = {};
  const errors  = {};

  await Promise.allSettled(
    channels.map(async (channel) => {
      try {
        switch (channel) {

          case 'in-app':
          case 'push':
            await notificationService.send({
              userId:    patientId,
              userType:  'patient',
              type:      template,
              variables,
              data:      { ...variables },
              channels:  ['in-app'],
              actionUrl: actionUrl || '/dashboard',
            });
            results[channel] = 'sent';
            break;

          case 'email':
            await notificationService.send({
              userId:    patientId,
              userType:  'patient',
              type:      template,
              variables,
              data:      { ...variables },
              channels:  ['email'],
              actionUrl: actionUrl || '/dashboard',
            });
            results[channel] = 'sent';
            break;

          case 'whatsapp':
            if (!phone) {
              errors[channel] = 'phone number required for WhatsApp';
              break;
            }
            await whatsappRouter.sendMessage({
              to:       phone,
              content:  buildWhatsappText(template, variables),
              route:    'general',
              priority: priority || 'normal',
            });
            results[channel] = 'sent';
            break;

          case 'sms':
            // SMS falls back to notification service SMS channel
            await notificationService.send({
              userId:    patientId,
              userType:  'patient',
              type:      template,
              variables,
              channels:  ['sms'],
              actionUrl: actionUrl || '/dashboard',
            });
            results[channel] = 'sent';
            break;

          default:
            errors[channel] = 'unsupported channel';
        }
      } catch (err) {
        errors[channel] = err.message;
      }
    }),
  );

  return { results, errors };
}

/**
 * Build a plain WhatsApp text from template + variables when no approved template is available.
 */
function buildWhatsappText(template, variables) {
  const greeting = variables.patientName ? `Hello ${variables.patientName}! ` : '';
  const body = Object.entries(variables)
    .filter(([k]) => k !== 'patientName')
    .map(([k, v]) => `${toLabel(k)}: ${v}`)
    .join('\n');
  return `${greeting}\n${template.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n${body}\n\n— Mediczy Health`;
}

function toLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

// ─── GET /api/omnichannel/journeys ────────────────────────────────────────────
router.get('/journeys', authUser, (_req, res) => {
  res.json({
    success: true,
    journeys: Object.values(JOURNEY_TEMPLATES).map(({ id, name, channels, variables }) => ({
      id, name, defaultChannels: channels, requiredVariables: variables,
    })),
  });
});

// ─── POST /api/omnichannel/send ────────────────────────────────────────────────
/**
 * Ad-hoc message dispatch.
 * Body: { patientId, phone?, email?, channels, template, variables, actionUrl?, priority? }
 */
router.post('/send', authUser, validateBody(sendSchema), async (req, res) => {
  try {
    const { patientId, phone, email, channels, template, variables, actionUrl, priority } = req.body;

    const { results, errors } = await dispatchMultiChannel({
      patientId, phone, email, channels, template, variables, actionUrl, priority,
    });

    const allFailed = channels.every(ch => errors[ch]);
    return res.status(allFailed ? 502 : 200).json({
      success: !allFailed,
      results,
      errors: Object.keys(errors).length ? errors : undefined,
    });
  } catch (err) {
    console.error('Omnichannel /send error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/omnichannel/journey ────────────────────────────────────────────
/**
 * Named journey dispatch.
 * Body: { journeyId, patientId, phone?, email?, variables, channels? }
 */
router.post('/journey', authUser, validateBody(journeySchema), async (req, res) => {
  try {
    const { journeyId, patientId, phone, email, variables, channels, actionUrl } = req.body;

    const tmpl = JOURNEY_TEMPLATES[journeyId];
    if (!tmpl) {
      return res.status(404).json({ success: false, message: `Journey '${journeyId}' not found` });
    }

    // Validate required variables
    const missing = tmpl.variables.filter(v => variables[v] == null);
    if (missing.length) {
      return res.status(422).json({
        success: false,
        message: 'Missing required journey variables',
        missing,
      });
    }

    const activeChannels = channels?.length ? channels : tmpl.channels;

    const { results, errors } = await dispatchMultiChannel({
      patientId,
      phone,
      email,
      channels:  activeChannels,
      template:  tmpl.notificationType,
      variables,
      actionUrl: actionUrl || '/dashboard',
    });

    const allFailed = activeChannels.every(ch => errors[ch]);
    return res.status(allFailed ? 502 : 200).json({
      success: !allFailed,
      journeyId,
      channels:  activeChannels,
      results,
      errors:    Object.keys(errors).length ? errors : undefined,
    });
  } catch (err) {
    console.error('Omnichannel /journey error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/omnichannel/broadcast (admin only) ─────────────────────────────
/**
 * Bulk dispatch to a cohort of patients.
 * Body: { patientIds, channels, template, variables, actionUrl? }
 * Max 500 patients per call.  Errors are collected per patient.
 */
router.post('/broadcast', authUser, requireRole('admin'), validateBody(broadcastSchema), async (req, res) => {
  try {
    const { patientIds, channels, template, variables, actionUrl } = req.body;

    const outcomes = await Promise.allSettled(
      patientIds.map(patientId =>
        dispatchMultiChannel({ patientId, channels, template, variables, actionUrl }),
      ),
    );

    const summary = outcomes.map((o, i) => ({
      patientId: patientIds[i],
      status:    o.status,
      ...(o.status === 'fulfilled' ? { results: o.value.results, errors: o.value.errors } : { error: o.reason?.message }),
    }));

    const successCount = summary.filter(s => s.status === 'fulfilled').length;

    return res.json({
      success:      true,
      total:        patientIds.length,
      successCount,
      failureCount: patientIds.length - successCount,
      summary,
    });
  } catch (err) {
    console.error('Omnichannel /broadcast error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
