/**
 * autoTicketService.js
 * Automatically creates and assigns support tickets from inbound
 * WhatsApp messages and emails when a healthcare service request is detected.
 */

import Ticket from '../models/ticket.model.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import logger from '../config/logger.js';
import rocketChatService from './rocketchat.service.js';

// ─── Intent patterns ──────────────────────────────────────────────────────────

export const SERVICE_INTENTS = [
  {
    patterns: [
      /cancel.*appoint|appoint.*cancel|want.*cancel|cancel.*booking|cancel.*slot/i,
    ],
    category: 'appointment-cancellation',
    priority: 'high',
    label: 'Appointment Cancellation',
    emoji: '❌',
    replyHint: "Your cancellation request has been received. A team member will confirm the cancellation shortly.",
  },
  {
    patterns: [
      /postpone|reschedule|change.*appoint|appoint.*change|shift.*appoint|move.*appoint|change.*date|change.*time|new.*slot/i,
    ],
    category: 'appointment-reschedule',
    priority: 'medium',
    label: 'Appointment Reschedule',
    emoji: '📅',
    replyHint: "Your reschedule request has been received. A team member will reach out shortly to confirm your new slot.",
  },
  {
    patterns: [
      /need.*doctor|want.*doctor|book.*consultat|doctor.*consult|see.*doctor|online.*consult|video.*consult|speak.*doctor/i,
    ],
    category: 'doctor-consultation',
    priority: 'medium',
    label: 'Doctor Consultation',
    emoji: '👨‍⚕️',
    replyHint: "Your consultation request has been noted. Our team will connect you with the right doctor shortly.",
  },
  {
    patterns: [
      /health.*check|checkup|check.?up|lab.*test|blood.*test|full.*body|annual.*check|routine.*check/i,
    ],
    category: 'health-checkup',
    priority: 'medium',
    label: 'Health Checkup',
    emoji: '🏥',
    replyHint: "Your health checkup request has been received. Our team will contact you with available slots and packages.",
  },
  {
    patterns: [
      /prescription|need.*medicine|medication.*refill|refill.*med|need.*tablets|need.*pills/i,
    ],
    category: 'prescription',
    priority: 'medium',
    label: 'Prescription Request',
    emoji: '💊',
    replyHint: "Your prescription request has been noted. A team member will follow up with you shortly.",
  },
  {
    patterns: [
      /\breport\b|\bresult\b|lab.*report|test.*result|medical.*report|diagnostics|get.*report|my.*report|share.*report|send.*report/i,
    ],
    category: 'health-report',
    priority: 'medium',
    label: 'Health Report Request',
    emoji: '📋',
    replyHint: "Your report request has been received. Our team will share the report with you shortly.",
  },
  {
    patterns: [
      /bill|invoice|payment|charge|refund|amount.*due|fee.*query|cost.*query/i,
    ],
    category: 'billing',
    priority: 'high',
    label: 'Billing Enquiry',
    emoji: '💳',
    replyHint: "Your billing query has been received. Our accounts team will contact you shortly.",
  },
  {
    patterns: [
      /complaint|very.*bad|terrible|horrible|not.*satisfied|not.*happy|issue.*with|problem.*with/i,
    ],
    category: 'complaint',
    priority: 'high',
    label: 'Complaint',
    emoji: '⚠️',
    replyHint: "We're sorry to hear about your experience. Your complaint has been registered and a team member will contact you within the hour.",
  },
];

// Map AI email processor intent strings → ticket categories
const EMAIL_INTENT_MAP = {
  appointment_request: 'doctor-consultation',
  appointment_cancellation: 'appointment-cancellation',
  appointment_reschedule: 'appointment-reschedule',
  test_result: 'health-report',
  prescription: 'prescription',
  billing: 'billing',
  complaint: 'complaint',
  health_checkup: 'health-checkup',
};

const EMAIL_INTENT_PRIORITY = {
  appointment_cancellation: 'high',
  billing: 'high',
  complaint: 'high',
};

// Intents that should NOT auto-create tickets (informational / feedback)
const SKIP_EMAIL_INTENTS = new Set(['feedback', 'greeting', 'other', 'general']);

// ─── Detect intent from free text ─────────────────────────────────────────────

export function detectServiceIntent(text) {
  if (!text) return null;
  for (const intent of SERVICE_INTENTS) {
    if (intent.patterns.some((p) => p.test(text))) {
      return intent;
    }
  }
  return null;
}

export function detectEmailIntent(aiIntent) {
  if (!aiIntent || SKIP_EMAIL_INTENTS.has(aiIntent)) return null;
  const mapped = EMAIL_INTENT_MAP[aiIntent];
  if (!mapped) return null;
  const intent = SERVICE_INTENTS.find((i) => i.category === mapped);
  return intent || { category: mapped, priority: EMAIL_INTENT_PRIORITY[aiIntent] || 'medium', label: aiIntent.replace(/_/g, ' '), emoji: '📋', replyHint: '' };
}

// ─── Round-robin team member assignment ───────────────────────────────────────

let _assigneeIndex = 0;

async function getNextTeamAssignee() {
  try {
    const [rows] = await postgresSequelize.query(`
      SELECT id, full_name AS name, email
      FROM team_members
      WHERE employment_status = 'active'
        AND full_name IS NOT NULL
      ORDER BY id
      LIMIT 20
    `);
    if (!rows || rows.length === 0) {
      logger.warn('[autoTicket] No active team members found for assignment');
      return null;
    }
    const member = rows[_assigneeIndex % rows.length];
    _assigneeIndex++;
    return member;
  } catch (err) {
    logger.error('[autoTicket] Could not fetch team members:', err.message);
    return null;
  }
}

// ─── Core auto-ticket creator ──────────────────────────────────────────────────

/**
 * Creates a ticket and assigns it to the next available team member.
 *
 * @param {object} opts
 * @param {string} opts.source          'whatsapp' | 'email'
 * @param {object} opts.requester       { name, email, phone }
 * @param {string} opts.intentLabel     Human-readable intent label
 * @param {string} opts.category        Ticket category string
 * @param {string} opts.priority        'low' | 'medium' | 'high' | 'critical'
 * @param {string} opts.title           Override ticket title
 * @param {string} opts.description     Full message/email body
 * @param {string[]} opts.tags          Extra tags
 * @returns {Promise<object>} Saved ticket
 */
export async function createAutoTicket({
  source,
  requester,
  intentLabel,
  category,
  priority = 'medium',
  title,
  description,
  tags = [],
}) {
  const assignee = await getNextTeamAssignee();

  const ticketData = {
    title: title || `[${intentLabel}] ${requester.name || requester.phone || requester.email || 'Customer'}`,
    description: description || `Auto-generated from ${source}`,
    category,
    priority,
    status: assignee ? 'in-progress' : 'open',
    requester: {
      name: requester.name || '',
      email: requester.email || '',
      phone: requester.phone || '',
      role: 'Customer',
      source,
    },
    assignee: assignee
      ? {
          userId: assignee.id,
          name: assignee.name,
          email: assignee.email,
          assignedAt: new Date().toISOString(),
        }
      : null,
    assignedTo: assignee?.id || null,
    tags: [...new Set([...tags, source, 'auto-generated'])],
    messages: [],
  };

  const ticket = new Ticket(ticketData);
  await ticket.save();

  // ── RocketChat notification ──────────────────────────────────────────────
  const priorityEmoji = { low: '🔵', medium: '🟡', high: '🟠', critical: '🔴' }[priority] || '⚪';
  const catEntry = SERVICE_INTENTS.find((i) => i.category === category);
  const catEmoji = catEntry?.emoji || '📋';

  const rcMsg =
    `🎫 *New Service Ticket – ${source.toUpperCase()}*\n\n` +
    `${catEmoji} *Type:* ${intentLabel}\n` +
    `${priorityEmoji} *Priority:* ${priority.toUpperCase()}\n` +
    `📋 *Ticket ID:* ${ticket.ticketId || ticket._id}\n` +
    `👤 *Customer:* ${requester.name || 'Unknown'}` +
    (requester.phone ? ` | 📱 ${requester.phone}` : '') +
    (requester.email ? ` | ✉️ ${requester.email}` : '') +
    '\n' +
    `📝 *Message:* ${(description || '').substring(0, 250)}${(description || '').length > 250 ? '…' : ''}\n` +
    (assignee
      ? `✅ *Assigned to:* ${assignee.name} (${assignee.email})\n`
      : `🔴 *Status:* Unassigned – no active team member found\n`) +
    `⏰ *Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  rocketChatService
    .sendMessage('GENERAL', rcMsg)
    .catch((e) => logger.warn('[autoTicket] RocketChat notify failed:', e.message));

  logger.info(
    `[autoTicket] ✅ Ticket ${ticket.ticketId || ticket._id} | ${category} | ` +
    `assigned: ${assignee?.name || 'none'} | source: ${source}`
  );

  return ticket;
}
