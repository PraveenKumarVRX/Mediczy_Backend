import { channelChat } from '../services/medical-channel-chat.service.js';
import { sibPost } from '../services/sib-client.js';
import express from 'express';
import { createGupshupWebhook } from '../services/gupshup-webhook.service.js';
import { enqueueGupshupInbound, recordGupshupStatus, startGupshupInboundWorker } from '../services/gupshup-inbound-queue.service.js';
import gupshup from '../services/gupshup-whatsapp.service.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import unifiedConversationService from '../services/unified-conversation.service.js';
import whatsAppUserContextService from '../services/whatsapp-user-context.service.js';
import supportChat from '../services/support-chat-provider.service.js';

/**
 * Inbound WhatsApp used to be relayed into RocketChat (a #general post plus a livechat sync).
 * RocketChat was retired on 2026-10-04 and the tenant-aware replacement is the Chatwoot bridge in
 * services/chatwoot-bridge.service.js, which receives Twilio callbacks and pushes them into each
 * tenant's Chatwoot API inbox. These helpers keep the old call shapes so the handlers below are
 * unchanged, and mirror into Chatwoot's shared support thread when it is configured. They never
 * throw: WhatsApp handling must not depend on the agent workspace.
 */
const agentRelay = {
  sendMessage: async (channel, text) => {
    const key = String(channel) === 'GENERAL' ? 'support-feed' : String(channel).replace(/^ticket-/, '');
    return supportChat.postTicketNote({ ticketId: key, body: typeof text === 'string' ? text : JSON.stringify(text) });
  },
  syncToLivechat: async () => ({ synced: false, reason: 'rocketchat_retired' }),
};
import n8nService from '../services/n8n.service.js';
import whatsAppSIBBrain from '../services/whatsapp-sib-brain.service.js';
import { cache } from '../db/redis.js';
import logger from '../config/logger.js';
import { detectServiceIntent, createAutoTicket } from '../services/autoTicketService.js';
import axios from 'axios';
import sharedPool from '../db/pgPool.js';
import { bridgeInboundWhatsAppToCrm } from '../services/crm-inbound-bridge.service.js';
import { handleChatwootTwilioInbound } from '../services/chatwoot-bridge.service.js';
import whatsAppIdentityService, { genericLinkMessage } from '../services/whatsapp-identity.service.js';

const router = express.Router();
const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';

// Patient history is only sent to SIB for an explicit personal-record request
// and after the authoritative consent_records check succeeds. Generic symptom
// questions still receive knowledge-fabric guidance, but no EHR data leaves
// this service.
const isPatientSpecificQuery = (text) => {
  const normalized = String(text || '').toLowerCase();
  if (/\bwhat\s+do\s+you\s+know\s+about\s+me\b/i.test(normalized)) return true;
  // Require an explicit personal reference before treating a medical term as
  // a request for PHI. General questions about medicines, reports, or family
  // history remain available through knowledge-fabric guidance.
  return /\b(my|mine|me)\b.{0,40}\b(health|history|medical\s+record|records?|prescriptions?|medications?|allergies|lab\s+results?|reports?|appointments?|visits?|diagnos(?:is|es)|symptoms?|vitals?|blood\s+pressure|glucose|sugar)\b/i.test(normalized)
    || /\b(upcoming|previous|past|latest|recent)\b.{0,30}\b(my|mine|me)\b/i.test(normalized)
    || /\b(my|mine|me)\b.{0,30}\b(upcoming|previous|past|latest|recent)\b/i.test(normalized);
};

const isWhatsAppLinkRequest = (text) => {
  const normalized = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(verify|verify me|verify my account|link|link account|connect my account|secure this chat|authenticate me|confirm my number)$/.test(normalized)
    || /\b(link|connect|verify|authenticate)\b.{0,24}\b(account|number|whatsapp|chat)\b/.test(normalized);
};

const extractWhatsAppOtp = (text) => {
  const match = String(text || '').match(/^(?:otp|code|verification\s+code)?\s*[:#-]?\s*(\d{6})$/i);
  return match?.[1] || null;
};

const whatsappIdentityPrompt = () => 'Before I access your appointments, reports, prescriptions, health history, or book an appointment, please verify this WhatsApp number. Reply `VERIFY` and I’ll send a one-time code here.';

// Keep crisis handling ahead of appointment routing. This intentionally targets
// direct self-harm language; sadness, grief, and loneliness remain eligible for
// a supportive counselling referral and normal booking flow.
const isSelfHarmRisk = (text = '') => /\b(suicid(?:e|al)|kill\s+myself|end\s+my\s+life|take\s+my\s+life|hurt\s+myself|self[-\s]?harm|want\s+to\s+die|don['’]?t\s+want\s+to\s+live)\b/i.test(String(text));

const crisisResponse = () => `I’m really sorry you’re going through this. Your immediate safety matters more than booking an appointment.\n\nIf you may hurt yourself or are in immediate danger, call *112* in India now or go to the nearest emergency department. Please stay with someone you trust and move away from anything you could use to hurt yourself.\n\nAre you in immediate danger right now? Reply *YES* or *NO*. I can help connect you with a qualified mental-health professional once you’re safe.`;

const hasAuthoritativeAIConsent = async (patientId) => {
  if (!patientId) return false;
  try {
    const { rows } = await sharedPool.query(
      `SELECT 1
         FROM consent_records
        WHERE patient_id::text = $1
          AND purpose = 'ai_analysis'
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [patientId]
    );
    return rows.length > 0;
  } catch (error) {
    logger.warn('[whatsapp] AI consent check failed closed:', error.message);
    return false;
  }
};

const buildConsentScopedPatientContext = (context) => {
  const user = context?.user || {};
  const pickAppointment = (appointment = {}) => ({
    id: appointment.id,
    doctorName: appointment.doctorName || appointment.doctor_name,
    specialization: appointment.specialization,
    appointmentDate: appointment.appointmentDate || appointment.appointment_date,
    appointmentTime: appointment.appointmentTime || appointment.appointment_time,
    status: appointment.status,
    consultationType: appointment.consultationType || appointment.consultation_type,
    reason: appointment.reason
  });
  const pickPrescription = (prescription = {}) => ({
    id: prescription.id,
    prescriptionId: prescription.prescriptionId,
    doctorName: prescription.doctorName || prescription.doctor_name,
    diagnosis: prescription.diagnosis,
    medications: prescription.medications,
    followUpDate: prescription.followUpDate || prescription.follow_up_date,
    status: prescription.status,
    createdAt: prescription.createdAt || prescription.created_at
  });
  return {
    user: {
      id: user.id,
      name: user.name,
      age: user.age,
      gender: user.gender,
      bloodGroup: user.bloodGroup,
      city: user.city
    },
    appointments: {
      recent: (context?.appointments?.recent || []).slice(0, 5).map(pickAppointment),
      upcoming: (context?.appointments?.upcoming || []).slice(0, 5).map(pickAppointment)
    },
    prescriptions: {
      recent: (context?.prescriptions?.recent || []).slice(0, 5).map(pickPrescription)
    },
    activeMedications: (context?.activeMedications || []).slice(0, 10),
    summary: context?.summary
  };
};

/**
 * Upsert a WhatsApp contact into whatsapp_contacts on every inbound message.
 * Creates on first contact; updates name, patient link, and last_contact_at on repeat.
 */
async function upsertWhatsAppContact({ phone, profileName, userContext, identityVerified = false }) {
  try {
    const isKnownPatient = Boolean(identityVerified && userContext?.isKnownUser);
    const patientId = isKnownPatient ? userContext?.user?.id : null;
    const name = (isKnownPatient && userContext?.user?.name)
      ? userContext.user.name
      : (profileName || null);

    await sharedPool.query(
      `INSERT INTO whatsapp_contacts
         (phone, name, profile_name, is_known_patient, patient_id, message_count, first_contact_at, last_contact_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW(), NOW())
       ON CONFLICT (phone) DO UPDATE SET
         name             = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
         profile_name     = COALESCE(EXCLUDED.profile_name, whatsapp_contacts.profile_name),
         is_known_patient = EXCLUDED.is_known_patient OR whatsapp_contacts.is_known_patient,
         patient_id       = COALESCE(EXCLUDED.patient_id, whatsapp_contacts.patient_id),
         message_count    = whatsapp_contacts.message_count + 1,
         last_contact_at  = NOW(),
         updated_at       = NOW()`,
      [phone, name, profileName || null, isKnownPatient, patientId]
    );
  } catch (err) {
    logger.warn('⚠️ [whatsapp_contacts] upsert failed (non-fatal):', err.message);
  }
}

const sanitizeReply = (text) => {
  const normalized = String(text || '').trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return "Hi! I'm Dr. iSHA. How can I help you today?";
  if (lower.includes('there was an error processing your request') || lower.includes('please try again later')) {
    return "I'm sorry, I'm having trouble processing your request right now. Please try again in a few minutes or reply with more details.";
  }
  return normalized;
};

const compactWhatsAppReply = (text) => {
  const normalized = String(text || '').trim();
  if (!normalized) return normalized;
  const maxChars = parseInt(process.env.WHATSAPP_MAX_REPLY_CHARS || '420', 10);
  if (normalized.length <= maxChars) return normalized;
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  let shortened = sentences.slice(0, 2).join(' ').trim();
  if (!shortened || shortened.length < 80) {
    shortened = normalized.slice(0, maxChars).trim();
  }
  if (shortened.length > maxChars) {
    shortened = shortened.slice(0, maxChars).trim();
  }
  return `${shortened}…`;
};

// Broad status questions do not contain enough information for a clinical
// answer. Keep them out of the medical pipeline, which may otherwise treat
// the word "health" as a symptom query or retrieve an unrelated record.
const isGeneralHealthUpdateQuery = (text) => {
  const normalized = String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || !/\b(health|medical|wellbeing|well-being)\b/.test(normalized)) return false;
  if (!/\b(update|updates|status|latest|recent)\b/.test(normalized) && !/\bhow\s+is\s+my\s+health\b/.test(normalized)) return false;
  // A symptom-specific question should still receive clinical triage.
  return !/\b(pain|ache|fever|cough|headache|rash|nausea|vomit|bleed|breath|symptom|diagnos|medicine|medication)\b/.test(normalized);
};

const isAnswerFeedbackQuery = (text) => {
  const normalized = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\b(irrelevant|unrelated|wrong answer|wrong response|not what i asked|didn t answer|did not answer)\b/.test(normalized)
    || /\bwhy\s+(?:are|r)\s+you\s+sending\b/.test(normalized);
};

const hasInternalContextMarker = (text) => /(?:\[\s*(?:PATIENT\s+CONTEXT|RECENT\s+CONVERSATION|CURRENT\s+MESSAGE)\s*\]|===\s*PATIENT\s+CONTEXT)/i.test(String(text || ''));

const GENERAL_HEALTH_UPDATE_REPLY = 'I can check your appointments, prescriptions, reports, or recent health information. Which one would you like to review?';
const ANSWER_FEEDBACK_REPLY = 'You’re right — that response did not match your question. I can check your appointments, prescriptions, reports, or recent health information. Which one would you like to review?';

const HANDOFF_KEY_PREFIX = 'whatsapp:handoff:';
const HANDOFF_TTL_SECONDS = parseInt(process.env.WHATSAPP_HANDOFF_TTL || '86400', 10);
const WHATSAPP_ROOM_ID = 'whatsapp_general';

const normalizeWhatsAppNumber = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim().replace(/^whatsapp:/i, '');
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 10) {
    const countryCode = process.env.DEFAULT_COUNTRY_CODE || '91';
    return `+${countryCode}${digits}`;
  }
  if (digits.length >= 11) return `+${digits}`;
  return digits;
};

const getHandoffKey = (phoneNumber) => `${HANDOFF_KEY_PREFIX}${normalizeWhatsAppNumber(phoneNumber)}`;

const getHandoffState = async (phoneNumber) => {
  if (!phoneNumber) return null;
  return await cache.get(getHandoffKey(phoneNumber));
};

const setHandoffState = async (phoneNumber, payload = {}) => {
  if (!phoneNumber) return null;
  const state = {
    active: true,
    updatedAt: new Date().toISOString(),
    ...payload
  };
  await cache.set(getHandoffKey(phoneNumber), state, HANDOFF_TTL_SECONDS);
  return state;
};

/**
 * Clear handoff state - returns conversation to bot
 */
const clearHandoffState = async (phoneNumber) => {
  if (!phoneNumber) return false;
  await cache.del(getHandoffKey(phoneNumber));
  logger.info('🤖 Handoff cleared - conversation returned to bot', { phoneNumber });
  return true;
};

/**
 * Detect appointment booking intent from user message
 */
const detectBookingIntent = (message) => {
  const lowerMsg = (message || '').toLowerCase();
  const bookingPatterns = [
    /book\s*(an?\s*)?(appointment|consultation|doctor)/i,
    /fix\s*(an?\s*)?(appointment|consultation)/i,
    /schedule\s*(an?\s*)?(appointment|consultation|visit)/i,
    /i\s*want\s*to\s*(see|consult|meet|visit)\s*(a\s*)?(doctor|physician)/i,
    /need\s*(to\s*)?(see|consult)\s*(a\s*)?(doctor|physician)/i,
    /need\s*(a\s*)?(doctor\s*)?consultation/i,
    /doctor\s*consultation/i,
    /can\s*(you\s*)?book\s*(me\s*)?(an?\s*)?appointment/i,
    /yes\s*(please\s*)?(book|schedule)/i,
    /book\s*now/i,
    /yes\s*i\s*want\s*(to\s*)?(book|see)/i,
    /\b(book|schedule|arrange|find|search|connect|see|talk|speak)\b.{0,50}\b(psycholog(?:y|ist)|counsel(?:or|l?or)|therapist|mental\s+health|psychiatr(?:ist|y))\b/i,
    /\b(schedule|book|arrange)\b.{0,40}\b(virtual|video|online)\b.{0,20}\b(call|consult(?:ation)?|appointment|session)\b/i,
    /health\s*checkup/i,
    /health\s*check\s*up/i,
    /corporate\s*health/i,
    /full\s*body\s*check/i,
    /diagnostic\s*(test|check)/i,
    /lab\s*(test|checkup|check\s*up)/i
  ];
  
  const isBookingIntent = bookingPatterns.some(pattern => pattern.test(lowerMsg));
  const isHealthCheckupIntent = /(health\s*checkup|health\s*check\s*up|corporate\s*health|full\s*body\s*check|diagnostic\s*(test|check)|lab\s*(test|checkup|check\s*up)|master\s*health)/i.test(lowerMsg);
  const mentalHealthIntent = /\b(psycholog(?:y|ist)|counsel(?:or|l?or)|therapist|mental\s+health|psychiatr(?:ist|y)|grief\s+counselling?)\b/i.test(lowerMsg)
    && isBookingIntent;
  const virtualConsultation = /\b(virtual|video|online)\b.{0,20}\b(call|consult(?:ation)?|appointment|session)\b/i.test(lowerMsg)
    || /\b(call|consult(?:ation)?|appointment|session)\b.{0,20}\b(virtual|video|online)\b/i.test(lowerMsg);
  
  // Try to detect specialist type
  let specialistType = 'general_physician';
  if (/\b(gastro|stomach|digestive|abdomen)\b/i.test(lowerMsg)) specialistType = 'gastroenterologist';
  else if (/\b(heart|cardio|chest\s*pain)\b/i.test(lowerMsg)) specialistType = 'cardiologist';
  else if (/\b(skin|derma|rash)\b/i.test(lowerMsg)) specialistType = 'dermatologist';
  else if (/\b(child|baby|infant|pediatric)\b/i.test(lowerMsg)) specialistType = 'pediatrician';
  else if (/\b(bone|orthop|joint|fracture)\b/i.test(lowerMsg)) specialistType = 'orthopedic';
  else if (/\b(eye|vision|ophthalm)\b/i.test(lowerMsg)) specialistType = 'ophthalmologist';
  else if (/\b(ent|ear|nose|throat)\b/i.test(lowerMsg)) specialistType = 'ent';
  else if (/\b(neuro|brain|headache)\b/i.test(lowerMsg)) specialistType = 'neurologist';
  else if (/\b(gynec|women|pregnancy)\b/i.test(lowerMsg)) specialistType = 'gynecologist';
  else if (/\b(psychiatr|psychiatrist)\b/i.test(lowerMsg)) specialistType = 'psychiatrist';
  else if (/\b(psycholog(?:y|ist)?|counsel(?:or|l?or)?|therap(?:y|ist)?|mental\s+health|grief)\b/i.test(lowerMsg)) specialistType = 'psychologist';
  else if (/\b(general|physician|gp)\b/i.test(lowerMsg)) specialistType = 'general_physician';
  
  return {
    isBookingIntent,
    specialistType,
    bookingType: isHealthCheckupIntent ? 'health_checkup' : 'doctor_appointment',
    mentalHealthIntent,
    consultationType: virtualConsultation ? 'online' : undefined
  };
};

// Configuration for AI auto-reply - unified Dr. iSHA
const AI_AUTO_REPLY_ENABLED = process.env.WHATSAPP_AI_AUTO_REPLY === 'true' || false;
const USE_SIB_BRAIN = process.env.USE_SIB_BRAIN !== 'false'; // Default true

/**
 * Send appointment confirmation
 */
router.post('/send/appointment-confirmation', async (req, res) => {
  try {
    const { to, patientName, doctorName, date, time, location } = req.body;
    
    if (!to || !patientName || !doctorName || !date || !time || !location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendAppointmentConfirmation({
      to, patientName, doctorName, date, time, location
    });
    
    res.json({
      success: true,
      message: 'Appointment confirmation sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending appointment confirmation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send appointment reminder
 */
router.post('/send/appointment-reminder', async (req, res) => {
  try {
    const { to, patientName, doctorName, time, location } = req.body;
    
    if (!to || !patientName || !doctorName || !time || !location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendAppointmentReminder({
      to, patientName, doctorName, time, location
    });
    
    res.json({
      success: true,
      message: 'Appointment reminder sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending appointment reminder:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send health report notification
 */
router.post('/send/health-report', async (req, res) => {
  try {
    const { to, patientName } = req.body;
    
    if (!to || !patientName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendHealthReportReady({
      to, patientName
    });
    
    res.json({
      success: true,
      message: 'Health report notification sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending health report notification:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send prescription notification
 */
router.post('/send/prescription', async (req, res) => {
  try {
    const { to, patientName, doctorName, prescriptionUrl, medications, followUpDate } = req.body;
    
    if (!to || !patientName || !doctorName || !prescriptionUrl || !medications || !followUpDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendPrescriptionReady({
      to, patientName, doctorName, prescriptionUrl, medications, followUpDate
    });
    
    res.json({
      success: true,
      message: 'Prescription notification sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending prescription notification:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send OTP
 */
router.post('/send/otp', async (req, res) => {
  try {
    const { to, otp } = req.body;
    
    if (!to || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendOTP({ to, otp });
    
    res.json({
      success: true,
      message: 'OTP sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send health checkup reminder
 */
router.post('/send/checkup-reminder', async (req, res) => {
  try {
    const { to, patientName } = req.body;
    
    if (!to || !patientName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendCheckupReminder({
      to, patientName
    });
    
    res.json({
      success: true,
      message: 'Checkup reminder sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending checkup reminder:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send session message (reply within 24hr window)
 */
router.post('/send/session-message', async (req, res) => {
  try {
    const { to, body } = req.body;
    
    if (!to || !body) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendSessionMessage({ to, body });
    
    res.json({
      success: true,
      message: 'Message sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending session message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get message status
 */
router.get('/status/:messageSid', async (req, res) => {
  try {
    const { messageSid } = req.params;
    const message = await whatsappProductionService.getMessageStatus(messageSid);
    
    res.json({
      success: true,
      data: {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        price: message.price,
        priceUnit: message.priceUnit
      }
    });
  } catch (error) {
    console.error('Error getting message status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get template configuration status
 */
router.get('/templates/status', (req, res) => {
  try {
    const status = whatsappProductionService.getTemplateStatus();
    
    res.json({
      success: true,
      data: status,
      allConfigured: Object.values(status).every(v => v)
    });
  } catch (error) {
    console.error('Error getting template status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get WhatsApp conversations
 * Reads from chatbot_sessions DB (Twilio API removed — credentials not available in production)
 */
router.get('/conversations', async (req, res) => {
  try {
    const { messages } = await import('../utils/chatStorage.js');
    const result = await sharedPool.query(`
      SELECT
        session_id,
        message_count,
        messages,
        last_interaction_at,
        created_at
      FROM chatbot_sessions
      WHERE session_id LIKE 'whatsapp:%'
      ORDER BY last_interaction_at DESC NULLS LAST
    `);

    const dbConversations = result.rows.map(row => {
      const phoneNumber = row.session_id.replace(/^whatsapp:/i, '').trim();
      const msgs = Array.isArray(row.messages) ? row.messages : [];
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      return {
        id: phoneNumber,
        phoneNumber,
        customerName: phoneNumber,
        lastMessage: lastMsg ? (lastMsg.content || lastMsg.message || '') : '',
        lastActivity: row.last_interaction_at || row.created_at,
        lastMessageTime: row.last_interaction_at || row.created_at,
        messageCount: row.message_count || msgs.length,
        unreadCount: 0,
        status: 'active',
        source: 'chatbot_sessions'
      };
    });

    const roomMessages = await messages.get(WHATSAPP_ROOM_ID) || [];
    const redisConversationMap = new Map();
    for (const message of roomMessages) {
      const phoneNumber = String(message?.phoneNumber || '').trim();
      if (!phoneNumber) continue;
      const current = redisConversationMap.get(phoneNumber);
      const timestamp = message?.timestamp || new Date().toISOString();
      if (!current) {
        redisConversationMap.set(phoneNumber, {
          id: phoneNumber,
          phoneNumber,
          customerName: String(message?.userContext?.patientName || message?.userName || phoneNumber).replace(/^📱\s*/u, ''),
          lastMessage: message?.message || '',
          lastActivity: timestamp,
          lastMessageTime: timestamp,
          messageCount: 1,
          unreadCount: 0,
          status: 'active',
          source: 'redis_whatsapp_room'
        });
        continue;
      }

      current.messageCount += 1;
      const currentTime = new Date(current.lastActivity || 0).getTime();
      const newTime = new Date(timestamp).getTime();
      if (Number.isNaN(currentTime) || newTime >= currentTime) {
        current.lastMessage = message?.message || current.lastMessage;
        current.lastActivity = timestamp;
        current.lastMessageTime = timestamp;
      }
    }

    const mergedMap = new Map();
    for (const conv of dbConversations) mergedMap.set(conv.phoneNumber, conv);
    for (const [phoneNumber, conv] of redisConversationMap.entries()) {
      if (!mergedMap.has(phoneNumber)) {
        mergedMap.set(phoneNumber, conv);
      }
    }

    const conversations = Array.from(mergedMap.values()).sort((a, b) => {
      const aTime = new Date(a.lastActivity || a.lastMessageTime || 0).getTime();
      const bTime = new Date(b.lastActivity || b.lastMessageTime || 0).getTime();
      return bTime - aTime;
    });

    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Error fetching WhatsApp conversations:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get messages for a specific WhatsApp conversation
 * Reads from chatbot_sessions DB (Twilio API removed — credentials not available in production)
 */
router.get('/conversations/:phoneNumber/messages', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const cleanPhone = decodeURIComponent(phoneNumber).replace(/^whatsapp:/i, '').trim();
    const cleanPhoneWithPlus = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
    // Try both with and without leading '+'
    const sessionIds = [
      `whatsapp:${cleanPhone}`,
      cleanPhone.startsWith('+') ? `whatsapp:${cleanPhone.slice(1)}` : `whatsapp:+${cleanPhone}`
    ];

    let row = null;
    for (const sid of sessionIds) {
      const result = await sharedPool.query(
        `SELECT messages, session_id FROM chatbot_sessions WHERE session_id = $1`,
        [sid]
      );
      if (result.rows.length > 0) { row = result.rows[0]; break; }
    }

    const rawMessages = (row && Array.isArray(row.messages)) ? row.messages : [];
    const ourNumber = whatsappProductionService.provider === 'gupshup'
      ? `whatsapp:+${process.env.GUPSHUP_SOURCE_NUMBER}`
      : process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
    const dbPhone = cleanPhoneWithPlus;

    const dbNormalized = rawMessages.map((msg, idx) => ({
      id: msg.id || `msg_${idx}`,
      body: msg.content || msg.message || '',
      from: msg.role === 'user' ? dbPhone : ourNumber,
      to: msg.role === 'user' ? ourNumber : dbPhone,
      direction: msg.role === 'user' ? 'inbound' : 'outbound',
      status: 'delivered',
      timestamp: msg.createdAt || msg.timestamp || new Date().toISOString()
    }));

    const { messages } = await import('../utils/chatStorage.js');
    const roomMessages = await messages.get(WHATSAPP_ROOM_ID) || [];
    const redisNormalized = roomMessages
      .filter((msg) => String(msg?.phoneNumber || '').trim() === cleanPhoneWithPlus)
      .map((msg, idx) => ({
        id: msg?.id || `redis_msg_${idx}`,
        body: msg?.message || '',
        from: dbPhone,
        to: ourNumber,
        direction: 'inbound',
        status: 'delivered',
        timestamp: msg?.timestamp || new Date().toISOString()
      }));

    const mergedById = new Map();
    for (const msg of [...dbNormalized, ...redisNormalized]) {
      mergedById.set(msg.id, msg);
    }

    const normalized = Array.from(mergedById.values()).sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return aTime - bTime;
    });

    res.json({ success: true, messages: normalized });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Send a WhatsApp message in a conversation
 */
router.post('/conversations/:phoneNumber/send', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    const whatsappService = (await import('../services/whatsapp-production.service.js')).default;
    
    const result = await whatsappService.sendSessionMessage({
      to: phoneNumber,
      body: message
    });

    await setHandoffState(phoneNumber, {
      reason: 'manual_agent_message',
      source: 'team_dashboard'
    });
    
    res.json({
      success: true,
      message: 'Message sent',
      data: {
        messageSid: result.sid,
        status: result.status,
        to: result.to
      }
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Resolve/end handoff - returns conversation to bot
 * Agents use this when done assisting a customer
 */
router.post('/conversations/:phoneNumber/resolve', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { resolution = 'resolved', notes = '' } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Get current handoff state for logging
    const currentState = await getHandoffState(phoneNumber);
    
    // Clear handoff state
    await clearHandoffState(phoneNumber);
    
    // Log resolution
    logger.info('✅ Handoff resolved - conversation returned to bot', {
      phoneNumber,
      resolution,
      notes,
      previousState: currentState
    });
    
    // Notify the agent workspace
    try {
      await agentRelay.sendMessage(
        'GENERAL',
        `✅ *HANDOFF RESOLVED*\n📱 Customer: +${phoneNumber}\n📋 Resolution: ${resolution}\n${notes ? `📝 Notes: ${notes}\n` : ''}🤖 *Bot is now active* for this conversation\n⏰ Time: ${new Date().toLocaleString()}`
      );
    } catch (rcError) {
      logger.error('Failed to notify the agent workspace about resolution:', rcError.message);
    }
    
    // Optionally send confirmation to customer
    if (req.body.notifyCustomer) {
      const whatsappService = (await import('../services/whatsapp-production.service.js')).default;
      await whatsappService.sendSessionMessage({
        to: phoneNumber,
        body: "Thank you for chatting with our team! If you have any more questions, I'm here to help. 💙 - Dr. iSHA"
      });
    }
    
    res.json({
      success: true,
      message: 'Handoff resolved - conversation returned to bot',
      data: {
        phoneNumber,
        resolution,
        resolvedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error resolving handoff:', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get handoff status for a phone number
 */
router.get('/conversations/:phoneNumber/handoff-status', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    const handoffState = await getHandoffState(phoneNumber);
    
    res.json({
      success: true,
      data: {
        phoneNumber,
        isHandoffActive: !!handoffState?.active,
        handoffState: handoffState || null
      }
    });
  } catch (error) {
    logger.error('Error getting handoff status:', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get user context by phone number
 * Returns complete user profile, appointments, prescriptions, medications
 */
router.get('/user-context/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    const userContext = await whatsAppUserContextService.getFullUserContext(phoneNumber);
    
    res.json({
      success: true,
      context: userContext
    });
  } catch (error) {
    logger.error('Error fetching user context:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user context',
      error: error.message
    });
  }
});

/**
 * Trigger AI response for a WhatsApp user (manual trigger from admin)
 */
router.post('/ai-respond', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }
    
    logger.info('[ai-respond] Processing message:', { message: message.substring(0, 50), phoneNumber });
    
    const aiResponse = await unifiedConversationService.processMessage({
      message,
      channel: 'whatsapp',
      sessionId: `whatsapp:${phoneNumber}`,
      identifier: phoneNumber,
      userContext: { phoneNumber }
    });
    
    // Debug: Log all response keys and handoff fields
    logger.info('[ai-respond] Response received:', {
      keys: Object.keys(aiResponse),
      handoffRequired: aiResponse.handoffRequired,
      handoffDepartment: aiResponse.handoffDepartment,
      handoffReason: aiResponse.handoffReason,
      handoffSuggested: aiResponse.handoffSuggested,
      provider: aiResponse.provider
    });
    
    res.json({
      success: true,
      response: aiResponse
    });
  } catch (error) {
    logger.error('AI respond error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI response',
      error: error.message
    });
  }
});

/**
 * Send AI response to WhatsApp user
 */
router.post('/send-ai-response', async (req, res) => {
  try {
    const { phoneNumber, triggerMessage } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Get user context and generate AI response
    const aiResponse = await unifiedConversationService.processMessage({
      message: triggerMessage || 'Hi',
      channel: 'whatsapp',
      sessionId: `whatsapp:${phoneNumber}`,
      identifier: phoneNumber,
      userContext: { phoneNumber }
    });
    
    if (aiResponse.shouldReply && aiResponse.response) {
      // Send via WhatsApp
      const message = await whatsappProductionService.sendSessionMessage({
        to: phoneNumber,
        body: aiResponse.response
      });
      
      // Store in chat room
      const { messages } = await import('../utils/chatStorage.js');
      const aiMessageObj = {
        id: `ai_${Date.now()}`,
        userId: 'dr_isha_bot',
        userName: '🤖 Dr. iSHA',
        userRole: 'assistant',
        message: aiResponse.response,
        type: 'text',
        timestamp: new Date().toISOString(),
        source: 'ai_bot'
      };
      
      await messages.push(WHATSAPP_ROOM_ID, aiMessageObj);
      
      if (global.io) {
        global.io.to(WHATSAPP_ROOM_ID).emit('new_message', aiMessageObj);
      }
      
      res.json({
        success: true,
        message: 'AI response sent',
        data: {
          messageSid: message.sid,
          response: aiResponse.response,
          isKnownUser: aiResponse.isKnownUser
        }
      });
    } else {
      res.json({
        success: false,
        message: 'No response generated'
      });
    }
  } catch (error) {
    logger.error('Send AI response error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to send AI response',
      error: error.message
    });
  }
});

/**
 * Webhook verification (for Twilio setup)
 */
router.get('/webhook', (req, res) => {
  res.status(200).send('Webhook endpoint is active');
});

/**
 * Debug endpoint to check team chat inbox messages
 * This is for testing - returns messages stored in the WhatsApp room
 */
router.get('/team-inbox', async (req, res) => {
  try {
    const { chatRooms, messages } = await import('../utils/chatStorage.js');
    const room = await chatRooms.get(WHATSAPP_ROOM_ID);
    const roomMessages = await messages.get(WHATSAPP_ROOM_ID) || [];
    
    // Filter to show only WhatsApp messages
    const whatsappMessages = roomMessages.filter(m => m.source === 'whatsapp');
    
    res.json({
      success: true,
      room: room || null,
      totalMessages: roomMessages.length,
      whatsappMessageCount: whatsappMessages.length,
      messages: roomMessages.slice(-20) // Last 20 messages (all types)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Build a TwiML <Message> response.
 * Twilio delivers this back to the sender without needing outbound API credentials.
 */
const twimlReply = (text) => {
  const safe = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
};

/**
 * Main webhook for incoming WhatsApp messages
 * Identifies user, retrieves context, and optionally responds with AI
 * 
 * ⚠️ PRODUCTION: Twilio POSTs here WITHOUT auth headers
 * This endpoint must be fully public (no JWT required)
 */
const receiveGupshup = createGupshupWebhook({ enqueue: enqueueGupshupInbound, saveStatus: recordGupshupStatus });
// Gupshup's dashboard probes the callback URL before it saves a webhook.
// Keep this probe unauthenticated and side-effect free; event delivery remains
// protected by createGupshupWebhook (secret/IP allow-list + v2 validation).
const validateGupshupWebhookUrl = (_req, res) => res.status(200).end();
const isGupshupSetupProbe = req => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  // A few dashboard versions post URL/form metadata rather than a v2 event.
  // There is nothing to enqueue in that shape, so treat it as validation too.
  if (typeof body.app !== 'string' || typeof body.type !== 'string') return true;
  // Gupshup sends v2 user/system/template events while checking a callback.
  // These events carry no inbound message or delivery status and are safe to
  // acknowledge during a provider migration. Never bypass a real message or
  // message-event: those continue through the authenticated handler below.
  return Number(body.version) === 2
    && typeof body.type === 'string'
    && !['message', 'message-event'].includes(body.type);
};
router.get('/webhook/gupshup', validateGupshupWebhookUrl);
router.head('/webhook/gupshup', validateGupshupWebhookUrl);
router.post('/webhook/gupshup', (req, res) => {
  // Some Gupshup dashboard versions validate by sending an empty POST before
  // the provider is activated. A blank probe has no event to authenticate or
  // enqueue; acknowledge it without weakening authentication for real events.
  if (!req.body || (typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 0)) {
    return validateGupshupWebhookUrl(req, res);
  }
  // Gupshup validates an active subscription with an unauthenticated setup
  // or metadata probe. These payloads contain no message or delivery event,
  // so acknowledge them regardless of provider state; real events still go
  // through receiveGupshup and webhook authentication below.
  if (isGupshupSetupProbe(req)) {
    return validateGupshupWebhookUrl(req, res);
  }
  return receiveGupshup(req, res);
});
router.post('/webhook', (req, res, next) => {
  if (whatsappProductionService.provider === 'gupshup' || (req.body?.app && req.body?.type)) return receiveGupshup(req, res);
  req.skipAuth = true;
  return handleIncomingWhatsApp(req, res).catch(next);
});

async function sendIncomingGupshup(req, text) {
  if (req.gupshupReplyAttempted) throw new Error('Reply already attempted; reconcile before retrying');
  req.gupshupReplyAttempted = true;
  try { return await gupshup.sendText({ to: req.body.From, body: text }); }
  catch (error) { req.gupshupDeliveryError = error; throw error; }
}

async function incomingReply(req, res, text = '') {
  if (req.whatsappProvider === 'gupshup') {
    if (text) await sendIncomingGupshup(req, text);
    return res.status(200).end();
  }
  return res.type('text/xml').status(200).send(text ? twimlReply(text) : '<Response></Response>');
}

export async function handleIncomingWhatsApp(req, res) {
  try {
    const bridge = req.whatsappProvider === 'gupshup' ? { handled: false } : await handleChatwootTwilioInbound(req);
    if (bridge.handled) return res.type('text/xml').send('<Response></Response>');
  } catch (error) {
    return res.status(error.statusCode || 503).json({ success: false,
      message: error.statusCode ? error.message : 'Tenant agent bridge is unavailable' });
  }
  try {
    let pendingTwimlReply = null; // Set when AI sendSessionMessage fails; carried to final TwiML response
    console.log('📱 [WhatsApp Webhook] Handler called, req.skipAuth=', req.skipAuth);
    const { From, Body, MessageSid, ProfileName, MediaUrl0, MediaContentType0 } = req.body;
    
    // Extract phone number (remove whatsapp: prefix and trim)
    const phoneNumber = (From?.replace('whatsapp:', '') || '').trim();
    const customerName = ProfileName || phoneNumber;

    // CRM bridge: no-ops silently if this number isn't a known CRM lead.
    // Never allowed to affect the response below — this handler serves live
    // Twilio traffic and must always return its TwiML reply regardless.
    bridgeInboundWhatsAppToCrm({ phone: phoneNumber, body: Body, providerMessageId: MessageSid }).catch(() => {});

    logger.info('📱 Incoming WhatsApp message', {
      from: From,
      body: Body,
      messageSid: MessageSid,
      profileName: ProfileName,
      hasMedia: !!MediaUrl0,
      timestamp: new Date().toISOString()
    });
    
    // 1. IDENTIFY USER - Check if phone number exists in database
    const userContext = await whatsAppUserContextService.getFullUserContext(phoneNumber);
    // A phone match is only a candidate account association.  The sender must
    // complete the WhatsApp OTP link before we use the account identity in a
    // response or perform an appointment action.
    const whatsappIdentity = await whatsAppIdentityService.getSession(phoneNumber);
    const whatsappIdentityVerified = Boolean(
      whatsappIdentity
      && userContext.isKnownUser
      && String(whatsappIdentity.userId) === String(userContext.user?.id)
    );
    
    logger.info('👤 User identification', {
      phoneNumber,
      isKnownUser: userContext.isKnownUser,
      whatsappIdentityVerified,
      userId: whatsappIdentityVerified ? userContext.user?.id : undefined,
      userName: whatsappIdentityVerified ? userContext.user?.name : undefined,
      hasAppointments: userContext.appointments?.recent?.length > 0,
      hasPrescriptions: userContext.prescriptions?.recent?.length > 0
    });

    // Persist contact to whatsapp_contacts (fire-and-forget, non-blocking)
    upsertWhatsAppContact({ phone: phoneNumber, profileName: ProfileName, userContext, identityVerified: whatsappIdentityVerified });
    
    // Import chat rooms storage from chatStorage.js (Redis-backed)
    const { chatRooms, messages } = await import('../utils/chatStorage.js');
    
    // Send WhatsApp messages to the WhatsApp room
    if (!(await chatRooms.has(WHATSAPP_ROOM_ID))) {
      await chatRooms.set(WHATSAPP_ROOM_ID, {
        id: WHATSAPP_ROOM_ID,
        type: 'whatsapp_customer',
        participants: [],
        createdAt: new Date().toISOString(),
        title: 'WhatsApp Customers',
        description: 'Incoming messages from WhatsApp customers'
      });
      await messages.set(WHATSAPP_ROOM_ID, []);
    }
    
    // Create enhanced message object with user context
    const messageObj = {
      id: MessageSid,
      userId: whatsappIdentityVerified ? `user_${userContext.user.id}` : `whatsapp_${phoneNumber}`,
      userName: whatsappIdentityVerified
        ? `📱 ${userContext.user.name}` 
        : `📱 ${customerName}`,
      userRole: 'customer',
      message: Body || '[Media Message]',
      type: MediaUrl0 ? 'media' : 'text',
      mediaUrl: MediaUrl0,
      mediaType: MediaContentType0,
      timestamp: new Date().toISOString(),
      source: 'whatsapp',
      phoneNumber: phoneNumber,
      // Enhanced user context
      userContext: {
        isKnownUser: whatsappIdentityVerified,
        whatsappIdentityVerified,
        patientId: whatsappIdentityVerified ? userContext.user?.id : undefined,
        patientName: whatsappIdentityVerified ? userContext.user?.name : undefined,
        upcomingAppointments: whatsappIdentityVerified ? (userContext.appointments?.upcoming?.length || 0) : 0,
        activeMedications: whatsappIdentityVerified ? (userContext.activeMedications?.length || 0) : 0
      }
    };
    
    // Add to chat messages using Redis-backed push
    await messages.push(WHATSAPP_ROOM_ID, messageObj);
    const currentMessages = await messages.get(WHATSAPP_ROOM_ID) || [];
    
    logger.info('✅ WhatsApp message added to WhatsApp room (Redis)', {
      roomId: WHATSAPP_ROOM_ID,
      messageId: MessageSid,
      from: whatsappIdentityVerified ? userContext.user.name : customerName,
      isKnownUser: whatsappIdentityVerified,
      messageCount: currentMessages.length
    });
    
    // Mirror the incoming WhatsApp message to the shared support thread
    // WATI-LIKE OMNICHANNEL: Create/get a livechat room per WhatsApp contact so agents
    // can reply from RC Omnichannel and the reply is routed back to WhatsApp.
    agentRelay.syncToLivechat(
      phoneNumber,
      customerName,
      Body || '[Media Message]',
      whatsappIdentityVerified ? userContext.user : null
    ).then(r => {
      logger.info('✅ WhatsApp message synced to RC livechat', { roomId: r?.roomId });
    }).catch(err => {
      logger.warn('⚠️ Livechat sync failed (non-fatal):', err.message);
    });

    // Also keep posting to #general for the team chat room visibility
    const rcMessage = `📱 **WhatsApp Message from ${whatsappIdentityVerified ? userContext.user.name + ' (verified Mediczy account)' : customerName}** (${phoneNumber})\n\n${Body || '[Media Message]'}`;
    
    agentRelay.sendMessage('GENERAL', rcMessage).then(() => {
      logger.info('✅ WhatsApp message mirrored to the agent workspace support thread');
    }).catch(rcError => {
      logger.warn('⚠️ agent-workspace mirror failed (non-fatal):', rcError.message);
    });
    
    // Emit Socket.IO event to notify team members (if Socket.IO is available)
    if (global.io) {
      global.io.to(WHATSAPP_ROOM_ID).emit('new_message', messageObj);
      
      // Also emit user context update for real-time dashboard
      global.io.to(WHATSAPP_ROOM_ID).emit('user_context', {
        phoneNumber,
        isKnownUser: whatsappIdentityVerified,
        whatsappIdentityVerified,
        user: whatsappIdentityVerified ? userContext.user : null,
        timestamp: new Date().toISOString()
      });
      
      logger.info('🔔 Socket.IO notification sent to WhatsApp room');
    }
    
    // 2. CHECK FOR TEAM MEMBER REQUEST (e.g., "I want to chat with parinitha")
    const teamChatPatterns = [
      /\b(chat|talk|speak|connect|contact)\s+(with|to)\s+(\w+)/i,
      /\bi\s+want\s+to\s+(chat|talk|speak)\s+(with|to)\s+(\w+)/i,
      /\bconnect\s+me\s+(with|to)\s+(\w+)/i,
      /\bget\s+me\s+(\w+)/i
    ];
    
    let teamMemberRequested = null;
    for (const pattern of teamChatPatterns) {
      const match = Body?.match(pattern);
      if (match) {
        teamMemberRequested = match[match.length - 1]; // Last captured group is the name
        break;
      }
    }
    
    if (teamMemberRequested) {
      // Mirror to the agent workspace and notify the user
      try {
        await agentRelay.sendMessage(
          'GENERAL',
          `🔔 *Customer Request*\n👤 From: ${customerName} (+${phoneNumber})\n💬 Message: ${Body}\n\n📞 Requesting: ${teamMemberRequested}\n⏰ Time: ${new Date().toLocaleString()}`
        );

        await setHandoffState(phoneNumber, {
          reason: 'team_member_request',
          requested: teamMemberRequested,
          source: 'whatsapp'
        });
        
        const teamAckMsg = `I've notified our team. ${teamMemberRequested.charAt(0).toUpperCase() + teamMemberRequested.slice(1)} or another team member will respond to you shortly. 👍`;
        logger.info('✅ Team member request forwarded to the agent workspace', {
          phoneNumber,
          teamMember: teamMemberRequested
        });
        return await incomingReply(req, res, teamAckMsg);
      } catch (error) {
        logger.error('Error forwarding to the agent workspace:', error.message);
      }
    }

    const handoffState = await getHandoffState(phoneNumber);
    if (handoffState?.active) {
      logger.info('🤝 Human handoff active - skipping automation', {
        phoneNumber,
        reason: handoffState.reason
      });
      return await incomingReply(req, res);
    }

    // WhatsApp identity commands are handled before booking or AI.  This keeps
    // the one-time code out of the model prompt and makes linking independent
    // of provider/model availability.
    const otpCode = extractWhatsAppOtp(Body);
    if (otpCode) {
      const verification = await whatsAppIdentityService.verifyLink(phoneNumber, otpCode);
      if (verification.success) {
        const linkedName = userContext.user?.name ? `, ${userContext.user.name}` : '';
        return await incomingReply(req, res, `This WhatsApp number is now securely linked to your Mediczy account${linkedName}. I can help with your records and appointments, subject to your privacy consent.`);
      }
      return await incomingReply(req, res, verification.message);
    }

    if (isWhatsAppLinkRequest(Body)) {
      try {
        const linkResult = await whatsAppIdentityService.requestLink(phoneNumber);
        // The OTP transport already sent the code as a separate session
        // message. Do not send a second generic prompt after successful
        // delivery; it races the code and makes the flow look broken.
        if (linkResult?.sent) return await incomingReply(req, res);
        return await incomingReply(req, res, linkResult.message || genericLinkMessage);
      } catch (error) {
        logger.warn('[whatsapp] identity link request failed', {
          code: error?.code || 'unknown',
          message: String(error?.message || 'unknown').slice(0, 200)
        });
        // Do not disclose account existence or provider details.
        return await incomingReply(req, res, 'I could not send a verification code right now. Please try again in a few minutes.');
      }
    }

    // Self-harm language always takes priority over booking and model routing.
    // No account verification is needed before giving immediate safety
    // guidance, and this response discloses no patient information.
    if (isSelfHarmRisk(Body)) {
      return await incomingReply(req, res, crisisResponse());
    }

    // A broad "health update" prompt only asks the user what category to
    // review; it does not disclose records and can remain a public prompt.
    const personalRequest = isPatientSpecificQuery(Body) && !isGeneralHealthUpdateQuery(Body);
    if (personalRequest && !whatsappIdentityVerified) {
      return await incomingReply(req, res, whatsappIdentityPrompt());
    }

    // 3. CHECK FOR APPOINTMENT BOOKING INTENT
    // Appointment execution stays in the deterministic, DB-backed state
    // machine. The language model may answer medical questions, but it never
    // invents a slot or writes an appointment record.
    const { isBookingIntent, specialistType, bookingType, mentalHealthIntent, consultationType } = detectBookingIntent(Body);

    let bookingState = 'idle';
    let bookingService;
    // Mental-health booking stays inside the verified, database-backed flow
    // even when generic AI auto-replies are disabled. This avoids forwarding
    // sensitive specialty intent to the external n8n handoff path.
    if ((AI_AUTO_REPLY_ENABLED || mentalHealthIntent) && Body && !MediaUrl0) {
      try {
        ({ default: bookingService } = await import('../services/whatsapp-agentic-booking.service.js'));
        const session = await bookingService.getSession(phoneNumber);
        bookingState = session?.state || 'idle';
      } catch (error) {
        logger.warn('[whatsapp] booking session lookup failed:', error.message);
      }
    }

    if ((isBookingIntent || bookingState !== 'idle') && !whatsappIdentityVerified) {
      return await incomingReply(req, res, whatsappIdentityPrompt());
    }

    if ((AI_AUTO_REPLY_ENABLED || mentalHealthIntent) && Body && !MediaUrl0 && (isBookingIntent || bookingState !== 'idle')) {
      try {
        const bookingResult = await bookingService.processBookingIntent(phoneNumber, Body, userContext);
        if (bookingResult?.shouldReply) {
          return await incomingReply(req, res, sanitizeReply(bookingResult.response));
        }
      } catch (error) {
        logger.error('[whatsapp] deterministic booking flow failed:', error.message);
        return await incomingReply(req, res, "I couldn't complete that appointment request right now. Please try again with the specialty and preferred date.");
      }
    }

    if (isBookingIntent && whatsappIdentityVerified && !AI_AUTO_REPLY_ENABLED) {
      logger.info('📅 Appointment booking intent detected via WhatsApp', {
        phoneNumber,
        specialistType,
        bookingType,
        userId: userContext.user?.id
      });
      
      // Trigger n8n workflow for appointment booking (fire-and-forget — never blocks WhatsApp reply)
      n8nService.trigger('whatsapp-appointment-booking', {
        userId: userContext.user?.id,
        patientName: userContext.user?.name,
        patientPhone: phoneNumber,
        patientEmail: userContext.user?.email,
        specialistType: specialistType,
        bookingType,
        source: 'whatsapp',
        timestamp: new Date().toISOString()
      }).catch((error) => {
        logger.error('Appointment booking n8n error:', error.message);
      });

      // Respond immediately — don't wait for n8n
      const specialistNames = {
        'general_physician': 'General Physician',
        'gastroenterologist': 'Gastroenterologist',
        'cardiologist': 'Cardiologist',
        'dermatologist': 'Dermatologist',
        'pediatrician': 'Pediatrician',
        'orthopedic': 'Orthopedic Specialist',
        'ophthalmologist': 'Ophthalmologist',
        'ent': 'ENT Specialist',
        'neurologist': 'Neurologist',
        'gynecologist': 'Gynecologist'
      };

      const apptBody = `📅 *Appointment Booking Request*\n\n${
bookingType === 'health_checkup'
  ? "I'm processing your request for a health checkup at the nearest available lab."
  : `I'm processing your request to see a ${specialistNames[specialistType] || 'Doctor'}.`
}\n\n${
bookingType === 'health_checkup'
  ? `✅ Our team will contact you shortly to confirm your health checkup slot.\n\n📱 You'll receive a confirmation message with:\n• Lab name & location\n• Date & time options\n• Package/fee details`
  : `✅ Our team will contact you shortly to confirm your appointment slot.\n\n📱 You'll receive a confirmation message with:\n• Doctor's name\n• Date & time options\n• Consultation fee`
}\n\nIs there anything else I can help you with? 💙`;
      return await incomingReply(req, res, apptBody);
    }

    // 4. SERVICE REQUEST AUTO-TICKET
    // Detects cancellation / reschedule / report / consultation etc. and raises a ticket
    // Skip when AI is enabled - let the AI handle these conversationally
    if (!isBookingIntent && Body && !AI_AUTO_REPLY_ENABLED) {
      try {
        const serviceIntent = detectServiceIntent(Body);
        if (serviceIntent) {
          createAutoTicket({
            source: 'whatsapp',
            requester: {
              name: customerName || userContext.user?.name || '',
              phone: phoneNumber,
              email: userContext.user?.email || '',
            },
            intentLabel: serviceIntent.label,
            category: serviceIntent.category,
            priority: serviceIntent.priority,
            description: Body,
            tags: userContext.isKnownUser ? ['known-customer'] : ['unknown-customer'],
          }).then(() => {
            logger.info(`[autoTicket/WA] Ticket raised for ${serviceIntent.label} | ${phoneNumber}`);
          }).catch(e => logger.error('[autoTicket/WA]', e.message));

          // Acknowledge customer on WhatsApp via TwiML (single reply)
          const ticketAckMsg = `🎫 ${serviceIntent.replyHint}\n\n_A support ticket has been created. Our team will be in touch shortly._`;
          return await incomingReply(req, res, ticketAckMsg);
        }
      } catch (atErr) {
        logger.error('[autoTicket/WA] Error:', atErr.message);
      }
    }

    // 5. OPTIONAL: AI AUTO-REPLY (only if enabled)
    // Routes through SIB Brain for deep reasoning with user context
    if (AI_AUTO_REPLY_ENABLED && Body && !MediaUrl0) {
      let responseSent = false;
      try {
        // REMOVED hardcoded greeting and status query handlers
        // Let the AI handle ALL messages with full user context from database
        // This allows Dr. iSHA to check appointments, prescriptions, etc. from DB
        
        // Helper: Get time-based greeting
        const getTimeBasedGreeting = () => {
          const hour = new Date().getHours();
          if (hour < 12) return 'Good morning';
          if (hour < 17) return 'Good afternoon';
          return 'Good evening';
        };

        // Simple greeting gets fast response for all users
        const isSimpleGreeting = /^(hi|hello|hey|namaste|vanakkam)$/i.test(Body.trim());
        if (isSimpleGreeting) {
          const timeGreeting = getTimeBasedGreeting();
          const greetingResponse = whatsappIdentityVerified && userContext.user?.name
            ? `${timeGreeting} ${userContext.user.name}! 👋 How can I help you today?`
            : `${timeGreeting}! I'm Dr. iSHA. How can I help you today?`;
          
          logger.info('✅ Using STATIC greeting response', { response: greetingResponse });
          const greetMsg = sanitizeReply(greetingResponse);
          responseSent = true;
          return await incomingReply(req, res, greetMsg);
        }

        // Thank you / appreciation response
        const isThanks = /(^|\b)(thanks?|thank\s*you|thanku|thnx|appreciate|grateful)($|\b)/i.test(Body.trim());
        const isGoodbye = /(^|\b)(bye|goodbye|good\s*bye|see\s*you|take\s*care|gotta\s*go|gtg)($|\b)/i.test(Body.trim());

        if (isThanks && isGoodbye) {
          const combinedResponse = whatsappIdentityVerified && userContext.user?.name
            ? `You're welcome, ${userContext.user.name}. Take care and feel free to message me anytime you need help. 💙`
            : "You're welcome. Take care and feel free to message me anytime you need help. 💙";
          logger.info('✅ Using STATIC thanks+goodbye response', { response: combinedResponse });
          const thanksGoodbyeMsg = sanitizeReply(combinedResponse);
          responseSent = true;
          return await incomingReply(req, res, thanksGoodbyeMsg);
        }

        if (isThanks) {
          const thanksResponse = "You're welcome! Happy to help. Is there anything else I can assist you with?";
          logger.info('✅ Using STATIC thanks response', { response: thanksResponse });
          const thanksMsg = sanitizeReply(thanksResponse);
          responseSent = true;
          return await incomingReply(req, res, thanksMsg);
        }

        // Goodbye response
        if (isGoodbye) {
          const goodbyeResponse = whatsappIdentityVerified && userContext.user?.name
            ? `Take care, ${userContext.user.name}! Feel free to reach out anytime you need health assistance. Stay healthy! 💙`
            : "Take care! Feel free to reach out anytime you need health assistance. Stay healthy! 💙";
          logger.info('✅ Using STATIC goodbye response', { response: goodbyeResponse });
          const goodbyeMsg = sanitizeReply(goodbyeResponse);
          responseSent = true;
          return await incomingReply(req, res, goodbyeMsg);
        }

        // A broad request for a personal health update is a records/status
        // request, not a symptom description. Ask what record the patient
        // wants to review instead of sending it through clinical RAG.
        if (isGeneralHealthUpdateQuery(Body)) {
          const healthUpdateMsg = sanitizeReply(GENERAL_HEALTH_UPDATE_REPLY);
          responseSent = true;
          return await incomingReply(req, res, healthUpdateMsg);
        }

        if (isAnswerFeedbackQuery(Body)) {
          const feedbackMsg = sanitizeReply(ANSWER_FEEDBACK_REPLY);
          responseSent = true;
          return await incomingReply(req, res, feedbackMsg);
        }

        // ALL other messages (including appointment status, medical queries, etc.)
        // go through SIB FastAPI directly for faster responses

        logger.info(`🧠 Processing via SIB FastAPI`, {
          phoneNumber,
          messageLength: Body.length
        });
        
        const startTime = Date.now();
        const patientSpecific = whatsappIdentityVerified && userContext.isKnownUser && personalRequest;
        const consentVerified = patientSpecific
          ? await hasAuthoritativeAIConsent(userContext.user?.id)
          : false;
        const consentScopedContext = consentVerified
          ? buildConsentScopedPatientContext(userContext)
          : {};
        
        // Call SIB FastAPI directly with 15-second timeout (medical LLM queries via Groq typically take 6-12s)
        const aiResponse = await channelChat({
            channel: 'whatsapp', binding: phoneNumber,
            owner: JSON.stringify([whatsappIdentityVerified ? `user:${userContext.user?.id}` : `anonymous:${phoneNumber}`, 'whatsapp', userContext.user?.organization_uid || userContext.user?.organization_id || null]),
            message: Body, userId: patientSpecific ? userContext.user?.id : undefined,
            personal: patientSpecific, context: consentScopedContext,
          }).then(response => {
            const duration = Date.now() - startTime;
            logger.info(`✅ SIB response received in ${duration}ms`);
            // chat_answer can be a string or [string, array] tuple
            let answer = response.data.chat_answer || response.data.response || response.data.message;
            if (Array.isArray(answer)) answer = answer[0] || answer;
            return {
              shouldReply: true,
              response: String(answer || ''),
              provider: response.data.provider || 'sib-fastapi',
              sessionId: `whatsapp:${phoneNumber}`,
              isEmergency: response.data.is_emergency || false
            };
          }).catch(error => {
            const duration = Date.now() - startTime;
            logger.error(`SIB FastAPI error after ${duration}ms:`, {
              message: error.message,
              status: error.response?.status,
              data: error.response?.data,
              code: error.code
            });
            const consentBlocked = error.response?.status === 403 &&
              (error.response?.data?.error === 'Consent required' || error.response?.data?.code === 'consent_required');
            return {
              shouldReply: true,
              response: consentBlocked
                ? "I can help with your personal records after AI health-history consent is enabled in Privacy settings. For a general health question, tell me your symptoms and I can guide you without using your records."
                : "I'm here to help with appointments, health checkups, reports, and prescriptions. Tell me what you'd like to do.",
              provider: consentBlocked ? 'consent-gate' : 'fallback'
            };
          });
        const rawResponseText = String(aiResponse?.response || '').trim();
        // Never expose retrieval/prompt scaffolding to a patient. This also
        // protects the channel if an upstream provider returns a context
        // block instead of a natural-language answer.
        const safeResponseText = hasInternalContextMarker(rawResponseText)
          ? GENERAL_HEALTH_UPDATE_REPLY
          : rawResponseText;
        const compactResponseText = compactWhatsAppReply(safeResponseText);
        const normalizedResponseText = rawResponseText.toLowerCase();
        const isGenericErrorReply = normalizedResponseText.includes('there was an error processing your request');

        if (aiResponse.shouldReply) {
          const replyText = compactResponseText
            ? (isGenericErrorReply
              ? "I'm sorry, I'm having trouble processing your request right now. Please try again in a few minutes or reply with more details."
              : compactResponseText)
            : "I'm here to help with appointments, health checkups, reports, and prescriptions. Tell me what you'd like to do.";
          const sanitizedReply = sanitizeReply(replyText);
          // Try sending via API; TwiML at the end of the handler also carries the reply as fallback
          let aiReplySentViaApi = false;
          try {
            await (req.whatsappProvider === 'gupshup' ? sendIncomingGupshup(req, sanitizedReply) : whatsappProductionService.sendSessionMessage({ to: phoneNumber, body: sanitizedReply }));
            aiReplySentViaApi = true;
          } catch (sendErr) {
            if (req.whatsappProvider === 'gupshup') throw sendErr;
            logger.warn('⚠️ sendSessionMessage failed (will use TwiML):', sendErr.message);
          }
          pendingTwimlReply = aiReplySentViaApi ? null : sanitizedReply;
          responseSent = true;
          
          // Add AI response to chat room
          const aiMessageObj = {
            id: `ai_${Date.now()}`,
            userId: 'dr_isha_bot',
            userName: '🤖 Dr. iSHA',
            userRole: 'assistant',
            message: sanitizedReply,
            type: 'text',
            timestamp: new Date().toISOString(),
            source: 'ai_bot',
            replyTo: MessageSid,
            isEmergency: aiResponse.isEmergency
          };
          
          await messages.push(WHATSAPP_ROOM_ID, aiMessageObj);
          
          if (global.io) {
            global.io.to(WHATSAPP_ROOM_ID).emit('new_message', aiMessageObj);
          }
          
          // Also mirror the AI response to the agent workspace
          try {
            await agentRelay.sendMessage(
              'GENERAL',
              `🤖 *Dr. iSHA Response*\n📱 To: ${customerName} (+${phoneNumber})\n⏰ ${new Date().toLocaleString()}\n\n${sanitizedReply}`
            );
            logger.info('✅ AI response mirrored to the agent workspace');
          } catch (rcError) {
            logger.error('Failed to mirror the AI response to the agent workspace:', rcError.message);
          }
          
          logger.info('🤖 AI auto-reply sent', {
            to: phoneNumber,
            isEmergency: aiResponse.isEmergency,
            provider: aiResponse.provider
          });
          
          // Auto-trigger handoff if explicitly requested by user
          if (aiResponse.handoffRequired) {
            const department = aiResponse.handoffDepartment || 'general';
            const reason = aiResponse.handoffReason || 'user_requested';
            
            await setHandoffState(phoneNumber, {
              reason: reason,
              department: department,
              source: 'auto_escalation',
              triggerMessage: Body
            });
            
            // Notify the agent workspace about the escalation
            try {
              await agentRelay.sendMessage(
                'GENERAL',
                `🚨 *HUMAN HANDOFF ACTIVATED*\n👤 Customer: ${customerName} (+${phoneNumber})\n${whatsappIdentityVerified ? `🆔 Verified Mediczy account\n` : ''}📋 Department: ${department}\n📝 Reason: ${reason}\n💬 Trigger: "${Body}"\n⏰ Time: ${new Date().toLocaleString()}\n\n⚡ *Bot responses paused* - Human agent please respond`
              );
              logger.info('🚨 Human handoff activated', { phoneNumber, department, reason });
            } catch (rcError) {
              logger.error('Failed to notify the agent workspace about handoff:', rcError.message);
            }
          }
          
          // If emergency, also notify team
          if (aiResponse.isEmergency && global.io) {
            global.io.emit('emergency_alert', {
              phoneNumber,
              userName: whatsappIdentityVerified ? userContext.user.name : customerName,
              message: Body,
              userContext: userContext.summary,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (aiError) {
        if (req.whatsappProvider === 'gupshup') throw aiError;
        logger.error('AI auto-reply error (non-fatal):', { error: aiError.message });
        // Do not send a fallback reply here to avoid duplicate error messages
      }
    }
    
    // Return TwiML response — with reply text if API send failed, otherwise empty
    return await incomingReply(req, res, pendingTwimlReply || '');
  } catch (error) {
    if (req.whatsappProvider === 'gupshup') throw error;
    logger.error('❌ Webhook error:', { error: error.message, stack: error.stack });
    // Return empty TwiML even on error to prevent Twilio from triggering fallback
    res.type('text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
}

startGupshupInboundWorker(async event => {
  if (event.unsupportedMedia) {
    await gupshup.sendText({ to: event.message.From, body: 'Please send your request as text. Attachments are not supported on this channel yet.' });
    return;
  }
  const req = { body: event.message, whatsappProvider: 'gupshup', skipAuth: true,
    user: { id: 'gupshup-webhook', role: 'webhook' }, get: () => undefined };
  const res = { status() { return this; }, type() { return this; }, end() {}, send() {},
    json() { throw new Error('Inbound processing failed'); } };
  await handleIncomingWhatsApp(req, res);
  if (req.gupshupDeliveryError) throw req.gupshupDeliveryError;
});

/**
 * Fallback webhook for incoming messages
 * Used when primary webhook fails
 */
router.post('/fallback', (req, res) => {
  try {
    const { From, Body, MessageSid } = req.body;
    
    console.error('Fallback webhook triggered:', {
      from: From,
      body: Body,
      messageSid: MessageSid,
      timestamp: new Date().toISOString()
    });
    
    // Log to error tracking system
    // Send alert to admin
    
    // Return empty TwiML - DO NOT send any auto-reply
    res.type('text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Fallback webhook error:', error);
    res.type('text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * Status callback webhook
 * Receives delivery status updates from Twilio
 */
router.post('/status-callback', async (req, res) => {
  try {
    const { MessageSid, MessageStatus, To, ErrorCode, ErrorMessage } = req.body;
    
    console.log('Message status update:', {
      messageSid: MessageSid,
      status: MessageStatus,
      to: To,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      timestamp: new Date().toISOString()
    });
    
    // Update message status in database
    // - sent, delivered, read, failed, undelivered
    // - Store error codes for failed messages
    // - Trigger notifications for failures
    
    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      console.error('Message delivery failed:', {
        messageSid: MessageSid,
        errorCode: ErrorCode,
        errorMessage: ErrorMessage
      });
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Status callback error:', error);
    res.status(500).send('Error');
  }
});

// ==================== CONVERSATION MANAGEMENT ====================

/**
 * Get all WhatsApp conversations
 */
router.get('/conversations', async (req, res) => {
  try {
    const { status } = req.query;
    
    // In production, fetch from database
    // For now, return mock data
    const conversations = [
      {
        id: '1',
        customerName: 'Ramesh Kumar',
        customerPhone: '+917373007737',
        lastMessage: 'Thank you for the appointment confirmation',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 min ago
        unreadCount: 0,
        status: 'resolved',
        assignedTo: 'Parinitha M'
      },
      {
        id: '2',
        customerName: 'Priya Sharma',
        customerPhone: '+919884069443',
        lastMessage: 'I need to reschedule my appointment',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 min ago
        unreadCount: 2,
        status: 'active',
        assignedTo: 'Parinitha M'
      }
    ];
    
    const filteredConversations = status && status !== 'all' 
      ? conversations.filter(c => c.status === status)
      : conversations;
    
    res.json({
      success: true,
      conversations: filteredConversations
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get messages for a conversation
 */
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // In production, fetch from database
    // For now, return mock data
    const messages = [
      {
        id: '1',
        from: 'whatsapp:+919791476194',
        to: 'whatsapp:+917373007737',
        body: 'Hello! Your appointment with Dr. Nandita is confirmed for tomorrow at 3:00 PM.',
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        direction: 'outgoing',
        status: 'read'
      },
      {
        id: '2',
        from: 'whatsapp:+917373007737',
        to: 'whatsapp:+919791476194',
        body: 'Thank you for the confirmation!',
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        direction: 'incoming',
        status: 'delivered'
      }
    ];
    
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== SIB BRAIN STATUS ====================

/**
 * Get SIB Brain health status
 * Check if SIB is available and responsive
 */
router.get('/sib/health', async (req, res) => {
  try {
    const sibHealth = await whatsAppSIBBrain.checkSIBHealth();
    
    res.json({
      success: true,
      sibBrain: sibHealth,
      configuration: {
        autoReplyEnabled: AI_AUTO_REPLY_ENABLED,
        useSIBBrain: USE_SIB_BRAIN,
        sibUrl: process.env.SIB_URL || 'http://localhost:8001'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test SIB Brain response manually
 * For debugging and testing SIB integration
 */
router.post('/sib/test', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }
    
    const response = await whatsAppSIBBrain.processMessage(phoneNumber, message, 'Test User');
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export { hasInternalContextMarker, isAnswerFeedbackQuery, isGeneralHealthUpdateQuery, detectBookingIntent, isSelfHarmRisk };
export default router;
