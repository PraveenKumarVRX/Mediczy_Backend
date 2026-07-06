/**
 * Doctor Voice Assistant Route
 * ==============================
 * Siri-style AI assistant for doctors: voice → STT → LLM agent → action/answer
 *
 * Endpoints:
 *   POST /api/voice-assistant/stt        — audio file → transcribed text (Whisper)
 *   POST /api/voice-assistant/agent      — text + context → intent + action + response
 *   GET  /api/voice-assistant/tools      — list available assistant tools
 *
 * Agent tool execution:
 *   navigate_to            → returned to client for execution
 *   search_patient         → returned to client for execution
 *   add_clinical_note      → executed server-side (DB insert)
 *   schedule_followup      → returned to client with params for confirmation
 *   get_today_summary      → executed server-side (DB query)
 *   get_drug_info          → answered by LLM directly
 *   check_drug_interactions → answered by LLM directly
 *   medical_query          → answered by LLM directly
 */

import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import logger from '../config/logger.js';
import pool from '../db/pgPool.js';
import { getAIServiceConfig } from '../config/ai-services.config.js';

const router = express.Router();
const requireDoctor = requireRole(['doctor', 'admin', 'assistant', 'nurse', 'team']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const AI_SERVICE_CONFIG = getAIServiceConfig();
const OFFLINE_SCRIBE_URL = AI_SERVICE_CONFIG.offlineScribeUrl;
const LIVEKIT_URL = AI_SERVICE_CONFIG.liveKitUrl;
const LIVEKIT_HEALTH_URL = AI_SERVICE_CONFIG.liveKitHealthUrl;
const LIVEKIT_USES_CLOUD = AI_SERVICE_CONFIG.liveKitUsesCloud;

async function fetchJsonOrText(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

const ASSISTANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Navigate to a specific page or screen in the app. Use when doctor says "show", "open", "go to", "take me to".',
      parameters: {
        type: 'object',
        properties: {
          screen: {
            type: 'string',
            enum: [
              'appointments', 'patients', 'prescriptions', 'dashboard',
              'analytics', 'billing', 'health-records', 'er-dashboard',
              'icu-dashboard', 'voice-scribe', 'calculators', 'ai-assist',
              'templates', 'monitoring', 'queue', 'staff'
            ],
            description: 'The target screen/page'
          },
          params: {
            type: 'object',
            description: 'Optional navigation parameters e.g. { patientId: "123" }'
          }
        },
        required: ['screen']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_patient',
      description: 'Search for a patient by name, UHID, or phone number.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Patient name, UHID, or phone number' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_today_summary',
      description: 'Get a count of today\'s appointments: how many scheduled, completed, and pending. Use ONLY for "how many patients today", "today\'s overview", "my schedule count". Do NOT use for messages, alerts, notifications, or updates — use get_doctor_briefing for those.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_clinical_note',
      description: 'Add a clinical note or observation for the currently active patient.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'The clinical note text' },
          category: {
            type: 'string',
            enum: ['observation', 'plan', 'follow_up', 'instruction'],
            description: 'Note category'
          }
        },
        required: ['note']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_followup',
      description: 'Schedule a follow-up appointment for the current patient.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: 'Number of days from today, e.g. 7 for one week.' },
          reason: { type: 'string', description: 'Reason for follow-up' }
        },
        required: ['days']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_drug_info',
      description: 'Get comprehensive drug information: dosage, indications, contraindications, side effects.',
      parameters: {
        type: 'object',
        properties: {
          drug: { type: 'string', description: 'Drug or medication name' },
          question: { type: 'string', description: 'Specific aspect to answer (dosage, interactions, side effects, etc.)' }
        },
        required: ['drug']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_drug_interactions',
      description: 'Check for clinically significant interactions between two or more medications.',
      parameters: {
        type: 'object',
        properties: {
          drugs: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of drug names to check for interactions'
          }
        },
        required: ['drugs']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'medical_query',
      description: 'Answer a clinical question about symptoms, diagnosis, treatment, or medical guidelines. Use for any medical knowledge question.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The clinical question' },
          context: { type: 'string', description: 'Relevant patient context if provided' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_appointments',
      description: 'List/show/query appointments for the doctor. Use ONLY for viewing/listing — e.g. "show my appointments", "today\'s appointments", "upcoming", "pending", "completed". Do NOT use for booking, cancelling, or rescheduling appointments.',

      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Filter appointments by time or status. One of: today, upcoming, pending, completed, all. Default: today'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_patient_health',
      description: 'Get health summary, latest vitals, recent health readings, and last prescription for a patient. Use for "patient health update", "vitals of", "health status of".',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'Patient name to look up' },
          patient_id: { type: 'string', description: 'Patient ID or user ID if known' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book a new appointment for a patient with this doctor. Use when doctor says "book", "schedule", "create appointment", "fix appointment for".',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'Patient full name' },
          patient_phone: { type: 'string', description: 'Patient phone number' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time in HH:MM format (24hr)' },
          reason: { type: 'string', description: 'Reason for appointment / chief complaint' },
          type: {
            type: 'string',
            enum: ['in-person', 'video', 'phone'],
            description: 'Consultation type. Default: in-person'
          }
        },
        required: ['patient_name', 'date', 'time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment. Use when doctor says "cancel appointment for", "cancel the booking".',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment ID if known' },
          patient_name: { type: 'string', description: 'Patient name to find the appointment' },
          reason: { type: 'string', description: 'Reason for cancellation' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description: 'Reschedule/move an existing appointment to a NEW date and/or time. Triggers: "reschedule", "move appointment to", "shift appointment", "change appointment to [date]", "change time for". Always prefer this over list_appointments when a new date or time is mentioned.',

      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment ID if known' },
          patient_name: { type: 'string', description: 'Patient name to find the appointment' },
          new_date: { type: 'string', description: 'New date in YYYY-MM-DD format' },
          new_time: { type: 'string', description: 'New time in HH:MM format (24hr)' }
        },
        required: ['new_date', 'new_time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_doctor_briefing',
      description: 'Get a briefing of important updates for the doctor: urgent/unread notifications, pending appointment requests, new messages from nurses or hospital team, upcoming appointments in the next 2 hours. Use when doctor says "any updates?", "what\'s new?", "any messages?", "any emergencies?", "briefing", "what did I miss?", "any alerts?".',
      parameters: {
        type: 'object',
        properties: {
          priority: {
            type: 'string',
            enum: ['all', 'urgent', 'high'],
            description: 'Filter by priority. Default: all'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Create a clinical to-do or reminder task for the doctor. Use when doctor says "remind me to", "add a task", "create a reminder", "note to self", "I need to", "don\'t let me forget", "add to my list".',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title (the thing to be done)' },
          patient_name: { type: 'string', description: 'Patient name if task is patient-specific' },
          due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format. Use today if not specified.' },
          due_time: { type: 'string', description: 'Due time in HH:MM (24hr). Optional.' },
          priority: {
            type: 'string',
            enum: ['urgent', 'high', 'normal', 'low'],
            description: 'Task priority. Default: normal'
          }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List pending or recent tasks/reminders for the doctor. Use when doctor says "what are my tasks", "show my reminders", "what do I need to do", "my to-do list", "pending tasks".',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['pending', 'today', 'all'],
            description: 'Filter tasks. Default: pending'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'accept_appointment',
      description: 'Confirm/accept a pending appointment request from a patient. Use when doctor says "confirm the appointment", "accept booking", "approve appointment request".',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'Patient name if specified' },
          appointment_id: { type: 'string', description: 'Appointment ID if known' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark a task as completed or done. Use when doctor says "done", "completed", "mark as done", "finished", "task complete", "checked off".',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'integer', description: 'Task ID if known' },
          title: { type: 'string', description: 'Task title or keywords to find the task if ID not known' }
        }
      }
    }
  }
];

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(context = {}) {
  const { currentPatient, currentScreen, doctorName } = context;
  const patientInfo = currentPatient
    ? `Active patient: ${currentPatient.name || currentPatient.firstName || 'Unknown'}, Age: ${currentPatient.age || 'N/A'}, ID: ${currentPatient.id || currentPatient._id || 'N/A'}.`
    : '';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return `You are iSHA — a clinical AI assistant ONLY for Dr. ${doctorName || 'Doctor'} in the SmartHealth platform. You MUST NOT answer any question that is not about medicine, patients, appointments, prescriptions, tasks, or hospital workflow. For ANY non-medical query (geography, history, sports, trivia, general knowledge, coding, etc.), you MUST respond with this exact phrase: "I'm iSHA, your clinical assistant. I can only help with patient care and medical tasks." Today: ${dateStr}, ${timeStr}. Screen: ${currentScreen || 'dashboard'}. ${patientInfo}

STRICT SCOPE — NEVER VIOLATE:
- Non-clinical question (geography, capital cities, sports, history, weather, general trivia, coding, politics, etc.) → respond ONLY: "I'm iSHA, your clinical assistant. I can only help with patient care and medical tasks."
- Do NOT answer these even if you know the answer. Do NOT call any tool. Just output that one sentence.

CORE BEHAVIOR:
- Respond directly to the task. No greetings, no self-introduction, no "Good afternoon Doctor" on every message.
- Only identify yourself as iSHA if the doctor explicitly asks who you are.
- Act immediately. Never ask "are you sure?" for read operations. For writes (book/cancel), act and confirm.
- When the user says "are you sure?", "is that right?", "really?", "confirm that", or any similar expression of doubt: restate the previous answer verbally from conversation history. Do NOT call navigate_to. Do NOT repeat the tool call unless the answer needs refreshing.
- Be concise: 1-2 sentences max. Bullet list only for multiple items.
- Resolve pronouns from history: "his appointment", "that drug", "the same patient" etc.
- Always use the most specific tool available. Never answer appointment queries from memory.
- CRITICAL: "reschedule" → ALWAYS reschedule_appointment, never list_appointments. If any new date/time is mentioned with a patient name, it is reschedule or book, NOT list.

TOOL ROUTING (strict):
| User says | Tool |
|---|---|
| "my appointments / today / pending / upcoming" | list_appointments |
| "book / schedule / fix appointment for X on DATE at TIME" | book_appointment |
| "cancel appointment for X" | cancel_appointment |
| "confirm / accept / approve appointment (for X)" | accept_appointment |
| "reschedule / move / shift / change appointment for X to DATE TIME" | reschedule_appointment (NOT list_appointments) |
| "health / vitals / status of X" | get_patient_health |
| "today's summary / how many patients today / appointment count" | get_today_summary (counts only — NOT for messages/alerts) |
| "search patient X" | search_patient |
| "open / go to / show [screen]" | navigate_to |
| "any updates / messages / alerts / urgent / emergencies / what's new / briefing / what did I miss / any notifications" | get_doctor_briefing (NOT get_today_summary) |
| "are you sure / is that right / really / confirm that" | NO tool — restate last answer verbally |
| "what do you mean / explain that / clarify / what does that mean" | NO tool — clarify or simplify your previous answer from history |
| "dose / dosage / side effects / indication / contraindication of [drug]" | get_drug_info |
| "interaction / combine / mix [drug1] with [drug2]" | check_drug_interactions |
| any other clinical/medical question (diagnosis, symptoms, treatment, physiology) | medical_query |

RESPONSE FORMAT:
- Appointment lists: one line per appointment → "HH:MM — Patient Name (status): reason"
- Health summaries: Patient name, then key vitals inline, then conditions
- Actions completed: "[Action] done. [1 sentence confirmation]."
- Medical answers: lead with the answer, end with "Verify with clinical judgment."
- Greetings/who-are-you: briefly state you are iSHA and name 1-2 key capabilities. One sentence only.
- All other responses: no greeting, no sign-off, no filler — answer the task directly.`;
}

// ─── TTS text helper — convert long formatted text to short spoken version ────
function toSpokenText(text, maxSentences = 3) {
  if (!text) return '';
  // Strip bullet chars and action badge prefix lines
  const cleaned = text
    .replace(/^[•\-]\s*/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  // Split on sentence boundaries
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(' ');
}

// ─── Execute server-side tools ─────────────────────────────────────────────

async function executeGetTodaySummary(doctorId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE("appointmentDate") = $1) AS today_appointments,
        COUNT(*) FILTER (WHERE DATE("appointmentDate") = $1 AND status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE DATE("appointmentDate") = $1 AND status IN ('scheduled','confirmed','pending')) AS pending
      FROM appointments
      WHERE "doctorId" = $2
    `, [today, doctorId]);
    const row = result.rows[0] || {};
    return {
      todayAppointments: parseInt(row.today_appointments || 0),
      completed: parseInt(row.completed || 0),
      pending: parseInt(row.pending || 0),
    };
  } catch (err) {
    logger.warn('[VoiceAssistant] get_today_summary DB error', { error: err.message });
    return null;
  }
}

async function executeAddClinicalNote(doctorId, patientId, note, category = 'observation') {
  if (!patientId) return { success: false, error: 'No patient selected' };
  try {
    // Guard: doctor must have at least one appointment with this patient
    const rel = await pool.query(
      `SELECT 1 FROM appointments WHERE "doctorId" = $1 AND "userId" = $2 LIMIT 1`,
      [doctorId, patientId]
    );
    if (rel.rows.length === 0) {
      return { success: false, error: 'Patient not found in your appointment records.' };
    }

    const colMap = { plan: 'plan', follow_up: '"followUp"', instruction: '"patientEducation"' };
    const noteCol = colMap[category] || 'subjective';
    await pool.query(`
      INSERT INTO clinical_notes ("doctorId", "patientId", ${noteCol}, "status", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, 'draft', NOW(), NOW())
    `, [doctorId, patientId, note]);
    return { success: true };
  } catch (err) {
    logger.warn('[VoiceAssistant] add_clinical_note DB error', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function executeListAppointments(doctorId, filter = 'today', limit = 10) {
  try {
    const today = new Date().toISOString().split('T')[0];
    let whereClause = `a."doctorId" = $1`;
    const params = [doctorId];

    if (filter === 'today') {
      whereClause += ` AND DATE(a."appointmentDate") = $2`;
      params.push(today);
    } else if (filter === 'upcoming') {
      // Upcoming = future/today, not yet cancelled or completed
      whereClause += ` AND a."appointmentDate" >= CURRENT_DATE AND a.status NOT IN ('cancelled', 'completed')`;
    } else if (filter === 'pending') {
      whereClause += ` AND a.status = 'pending'`;
    } else if (filter === 'completed') {
      whereClause += ` AND a.status = 'completed' AND DATE(a."appointmentDate") = $2`;
      params.push(today);
    } else {
      // 'all' — last 30 days
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      whereClause += ` AND DATE(a."appointmentDate") >= $2`;
      params.push(monthAgo);
    }

    params.push(limit);
    const limitParam = `$${params.length}`;

    const result = await pool.query(`
      SELECT
        a.id, a."appointmentId", a."appointmentDate", a."appointmentTime",
        a.status, a.type, a."consultationType",
        COALESCE(a."patientName", u."firstName" || ' ' || u."lastName") AS "patientName",
        a.reason, a.symptoms, a.notes, a."paymentStatus", a."cancellationReason"
      FROM appointments a
      LEFT JOIN users u ON a."userId" = u.id
      WHERE ${whereClause}
      ORDER BY a."appointmentDate" ASC, a."appointmentTime" ASC
      LIMIT ${limitParam}
    `, params);

    return result.rows;
  } catch (err) {
    logger.warn('[VoiceAssistant] list_appointments error', { error: err.message });
    return null;
  }
}

async function executeGetPatientHealth(doctorId, patientName, patientId) {
  try {
    // ALWAYS verify the doctor-patient relationship via appointments, even when patientId is supplied.
    // This prevents a doctor from reading another doctor's patient's PHI by sending a known patientId.
    const relQuery = await pool.query(`
      SELECT a."userId",
             COALESCE(a."patientName", u."firstName" || ' ' || u."lastName") AS "patientName"
      FROM appointments a
      LEFT JOIN users u ON a."userId" = u.id
      WHERE a."doctorId" = $1
        AND (
          ($2::integer IS NOT NULL AND a."userId" = $2::integer)
          OR ($3::text IS NOT NULL AND LOWER(COALESCE(a."patientName", u."firstName" || ' ' || u."lastName")) ILIKE $3)
        )
      LIMIT 1
    `, [doctorId, patientId ? parseInt(patientId, 10) : null, patientName ? `%${patientName.toLowerCase()}%` : null]);

    const userId = relQuery.rows[0]?.userId ?? null;
    if (!userId) return null; // Patient not in this doctor's appointment records

    const summary = {};

    // Patient record — allergies, conditions, medications, last visit
    if (userId) {
      const pRow = await pool.query(`
        SELECT p.*, u."firstName", u."lastName", u."dateOfBirth", u."gender", u."phoneNumber"
        FROM patients p
        JOIN users u ON p."userId" = u.id
        WHERE p."userId" = $1
        LIMIT 1
      `, [userId]);
      if (pRow.rows[0]) {
        const p = pRow.rows[0];
        summary.patient = {
          name: `${p.firstName} ${p.lastName}`,
          dob: p.dateOfBirth,
          gender: p.gender,
          phone: p.phoneNumber,
          bloodGroup: p.bloodGroup,
          height: p.height,
          weight: p.weight,
          allergies: p.allergies,
          chronicConditions: p.chronicConditions,
          currentMedications: p.currentMedications,
          lastVisitDate: p.lastVisitDate,
          totalVisits: p.totalVisits,
        };
      }

      // Latest health readings (vitals)
      const readings = await pool.query(`
        SELECT reading_type, value, unit, recorded_at
        FROM health_readings
        WHERE user_id = $1
        ORDER BY recorded_at DESC
        LIMIT 20
      `, [userId]);
      if (readings.rows.length) {
        // Group by type, take latest per type
        const vitalsMap = {};
        readings.rows.forEach(r => {
          if (!vitalsMap[r.reading_type]) vitalsMap[r.reading_type] = r;
        });
        summary.vitals = Object.values(vitalsMap);
      }

      // Latest prescription (diagnosis + medications)
      const rx = await pool.query(`
        SELECT p.diagnosis, p.medications, p.vitals, p."chiefComplaints", p."createdAt"
        FROM prescriptions p
        JOIN appointments a ON p."appointmentId" = a."appointmentId"
        WHERE p."doctorId" = $1
          AND (p."userId" = $2 OR a."userId" = $2)
        ORDER BY p."createdAt" DESC
        LIMIT 1
      `, [doctorId, userId]);
      if (rx.rows[0]) summary.lastPrescription = rx.rows[0];
    }

    return Object.keys(summary).length ? summary : null;
  } catch (err) {
    logger.warn('[VoiceAssistant] get_patient_health error', { error: err.message });
    return null;
  }
}

async function executeBookAppointment(doctorId, doctorName, patientName, patientPhone, date, time, reason, type = 'in-person') {
  try {
    const apptId = `APPT-${Date.now()}`;
    const datetime = new Date(`${date}T${time}:00`);

    // Find userId from users table if patient exists
    let userId = null;
    let resolvedPatientName = patientName;
    if (patientPhone) {
      const uRow = await pool.query(`SELECT id, "firstName", "lastName" FROM users WHERE "phoneNumber" = $1 LIMIT 1`, [patientPhone]);
      if (uRow.rows[0]) {
        userId = uRow.rows[0].id;
        resolvedPatientName = `${uRow.rows[0].firstName} ${uRow.rows[0].lastName}`;
      }
    }

    await pool.query(`
      INSERT INTO appointments
        ("appointmentId", "doctorId", "userId", "patientName", "doctorName",
         "appointmentDate", "appointmentTime", "appointmentDateTime",
         reason, status, type, "consultationType", "createdAt", "updatedAt")
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10, $10, NOW(), NOW())
    `, [apptId, doctorId, userId, resolvedPatientName, doctorName, date, time, datetime, reason || 'Consultation', type]);

    return { success: true, appointmentId: apptId, patientName: resolvedPatientName, date, time };
  } catch (err) {
    logger.warn('[VoiceAssistant] book_appointment error', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function executeCancelAppointment(doctorId, appointmentId, patientName, reason) {
  try {
    let where = `"doctorId" = $1`;
    const params = [doctorId];

    if (appointmentId) {
      params.push(String(appointmentId));
      where += ` AND ("appointmentId" = $${params.length} OR id::text = $${params.length})`;
    } else if (patientName) {
      params.push(`%${patientName}%`);
      where += ` AND "patientName" ILIKE $${params.length} AND status NOT IN ('cancelled', 'completed')`;
    } else {
      return { success: false, error: 'Please provide appointment ID or patient name.' };
    }

    params.push(reason || 'Cancelled by doctor');
    params.push(doctorId);
    const result = await pool.query(`
      UPDATE appointments
      SET status = 'cancelled', "cancellationReason" = $${params.length - 1},
          "cancelledAt" = NOW(), "updatedAt" = NOW()
      WHERE ${where} AND status NOT IN ('cancelled', 'completed')
      RETURNING "appointmentId", "patientName", "appointmentDate", "appointmentTime"
    `, params.slice(0, -1));

    if (result.rows.length === 0) return { success: false, error: 'No matching active appointment found.' };
    return { success: true, cancelled: result.rows };
  } catch (err) {
    logger.warn('[VoiceAssistant] cancel_appointment error', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function executeAcceptAppointment(doctorId, appointmentId, patientName) {
  try {
    if (appointmentId || patientName) {
      let where = `"doctorId" = $1 AND status = 'pending'`;
      const params = [doctorId];

      if (appointmentId) {
        params.push(String(appointmentId));
        where += ` AND ("appointmentId" = $${params.length} OR id::text = $${params.length})`;
      } else if (patientName) {
        params.push(`%${patientName}%`);
        where += ` AND "patientName" ILIKE $${params.length}`;
      }

      const result = await pool.query(`
        UPDATE appointments
        SET status = 'confirmed', "updatedAt" = NOW()
        WHERE ${where}
        RETURNING "appointmentId", "patientName", "appointmentDate", "appointmentTime"
      `, params);

      if (result.rows.length === 0) {
        return { success: false, error: 'No pending appointment request found for that patient.' };
      }
      return { success: true, confirmed: result.rows };
    }

    // No name/ID — confirm the earliest pending request
    const result = await pool.query(`
      UPDATE appointments
      SET status = 'confirmed', "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM appointments
        WHERE "doctorId" = $1 AND status = 'pending'
        ORDER BY "appointmentDate" ASC, "appointmentTime" ASC
        LIMIT 1
      )
      RETURNING "appointmentId", "patientName", "appointmentDate", "appointmentTime"
    `, [doctorId]);

    if (result.rows.length === 0) {
      return { success: false, error: 'No pending appointment requests to confirm.' };
    }
    return { success: true, confirmed: result.rows };
  } catch (err) {
    logger.warn('[VoiceAssistant] accept_appointment error', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function executeRescheduleAppointment(doctorId, appointmentId, patientName, newDate, newTime) {
  try {
    let where = `"doctorId" = $1`;
    const params = [doctorId];

    if (appointmentId) {
      params.push(String(appointmentId));
      where += ` AND ("appointmentId" = $${params.length} OR id::text = $${params.length})`;
    } else if (patientName) {
      params.push(`%${patientName}%`);
      where += ` AND "patientName" ILIKE $${params.length} AND status NOT IN ('cancelled', 'completed')`;
    } else {
      return { success: false, error: 'Please provide appointment ID or patient name.' };
    }

    const newDatetime = new Date(`${newDate}T${newTime}:00`);
    params.push(newDate, newTime, newDatetime);
    const result = await pool.query(`
      UPDATE appointments
      SET "appointmentDate" = $${params.length - 2},
          "appointmentTime" = $${params.length - 1},
          "appointmentDateTime" = $${params.length},
          status = 'confirmed', "updatedAt" = NOW()
      WHERE ${where} AND status NOT IN ('cancelled', 'completed')
      RETURNING "appointmentId", "patientName", "appointmentDate", "appointmentTime"
    `, params);

    if (result.rows.length === 0) return { success: false, error: 'No matching active appointment found.' };
    return { success: true, rescheduled: result.rows[0], newDate, newTime };
  } catch (err) {
    logger.warn('[VoiceAssistant] reschedule_appointment error', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function executeGetDoctorBriefing(doctorId, priority = 'all') {
  try {
    const priorityFilter = priority === 'urgent'
      ? `AND priority = 'urgent'`
      : priority === 'high'
      ? `AND priority IN ('urgent','high')`
      : '';

    // 1. Unread notifications (last 48h) filtered by priority
    const notifResult = await pool.query(`
      SELECT id, type, priority, title, LEFT(message, 150) AS message, "createdAt"
      FROM notifications
      WHERE "userId" = $1
        AND "userType" = 'doctor'
        AND "isRead" = false
        AND "createdAt" >= NOW() - INTERVAL '48 hours'
        ${priorityFilter}
      ORDER BY
        CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        "createdAt" DESC
      LIMIT 10
    `, [doctorId]);

    // 2. Pending appointment requests (not yet accepted/rejected)
    const pendingReqResult = await pool.query(`
      SELECT "patientName", "appointmentDate", "appointmentTime", reason
      FROM appointments
      WHERE "doctorId" = $1
        AND status = 'pending'
        AND "appointmentDate" >= CURRENT_DATE
      ORDER BY "appointmentDate", "appointmentTime"
      LIMIT 5
    `, [doctorId]);

    // 3. Upcoming appointments in next 2 hours
    const upcomingResult = await pool.query(`
      SELECT "patientName", "appointmentDate", "appointmentTime", status, reason
      FROM appointments
      WHERE "doctorId" = $1
        AND DATE("appointmentDate") = CURRENT_DATE
        AND "appointmentTime"::time BETWEEN NOW()::time AND (NOW() + INTERVAL '2 hours')::time
        AND status NOT IN ('cancelled','completed')
      ORDER BY "appointmentTime"
      LIMIT 3
    `, [doctorId]);

    // 4. Overdue or due-today tasks
    const taskResult = await pool.query(`
      SELECT id, title, patient_name, due_date, priority
      FROM doctor_tasks
      WHERE doctor_id = $1
        AND status = 'pending'
        AND (due_date IS NULL OR due_date <= CURRENT_DATE)
      ORDER BY
        CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        due_date ASC NULLS LAST
      LIMIT 5
    `, [doctorId]).catch(() => ({ rows: [] }));

    return {
      unreadNotifications: notifResult.rows,
      pendingRequests: pendingReqResult.rows,
      upcomingSoon: upcomingResult.rows,
      pendingTasks: taskResult.rows,
    };
  } catch (err) {
    logger.warn('[VoiceAssistant] get_doctor_briefing error', { error: err.message });
    return { unreadNotifications: [], pendingRequests: [], upcomingSoon: [], pendingTasks: [] };
  }
}

async function executeAddTask(doctorId, { title, patient_name, due_date, due_time, priority = 'normal' }) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `INSERT INTO doctor_tasks (doctor_id, title, patient_name, due_date, due_time, priority, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'voice')
       RETURNING id, title, due_date, priority`,
      [doctorId, title, patient_name || null, due_date || today, due_time || null, priority]
    );
    return { success: true, task: result.rows[0] };
  } catch (err) {
    logger.warn('[VoiceAssistant] add_task error', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function executeListTasks(doctorId, filter = 'pending') {
  try {
    const dateClause = filter === 'today' ? `AND due_date = CURRENT_DATE` : '';
    const statusClause = filter === 'all' ? '' : `AND status = 'pending'`;
    const result = await pool.query(
      `SELECT id, title, patient_name, due_date, due_time, priority, status
       FROM doctor_tasks
       WHERE doctor_id = $1 ${statusClause} ${dateClause}
       ORDER BY
         CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
         due_date ASC NULLS LAST
       LIMIT 15`,
      [doctorId]
    );
    return result.rows;
  } catch (err) {
    logger.warn('[VoiceAssistant] list_tasks error', { error: err.message });
    return [];
  }
}

async function executeCompleteTask(doctorId, { task_id, title }) {
  try {
    let result;
    if (task_id) {
      result = await pool.query(
        `UPDATE doctor_tasks SET status = 'completed', updated_at = NOW()
         WHERE id = $1 AND doctor_id = $2 RETURNING id, title`,
        [task_id, doctorId]
      );
    } else if (title) {
      result = await pool.query(
        `UPDATE doctor_tasks SET status = 'completed', updated_at = NOW()
         WHERE doctor_id = $1 AND status = 'pending'
           AND title ILIKE $2
         ORDER BY created_at DESC LIMIT 1 RETURNING id, title`,
        [doctorId, `%${title}%`]
      );
    }
    if (result?.rows?.length > 0) return { success: true, task: result.rows[0] };
    return { success: false, error: 'Task not found' };
  } catch (err) {
    logger.warn('[VoiceAssistant] complete_task error', { error: err.message });
    return { success: false, error: err.message };
  }
}

async function answerMedicalQuery(query, context, extra = '') {
  const messages = [
    {
      role: 'system',
      content: `You are iSHA, a clinical AI assistant for doctors. Answer concisely and accurately.
Always include: "For reference only — verify with clinical judgment." at the end.
${context ? `Patient context: ${context}` : ''}${extra}`
    },
    { role: 'user', content: query }
  ];
  const resp = await llmProvider.chat({ messages, maxTokens: 500, temperature: 0.2, skipCache: false });
  return resp.content || 'Unable to answer at this time.';
}

// ─── POST /stt — Audio → Text ─────────────────────────────────────────────────
// Pipeline: VAD audio buffer → Groq Whisper (primary, ~300ms) → local Whisper fallback

router.post('/stt', authUser, requireDoctor, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

  const language = req.body.language || 'en';
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  // ── Primary: Groq Whisper (whisper-large-v3-turbo, ~300ms) ──────────────────
  if (GROQ_API_KEY) {
    try {
      const groqForm = new FormData();
      groqForm.append('file', req.file.buffer, {
        filename: req.file.originalname || 'audio.wav',
        contentType: req.file.mimetype || 'audio/wav',
      });
      groqForm.append('model', 'whisper-large-v3-turbo');
      groqForm.append('language', language);
      groqForm.append('response_format', 'json');

      const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { ...groqForm.getHeaders(), 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: groqForm,
        timeout: 10000,
      });

      if (groqResp.ok) {
        const data = await groqResp.json();
        const text = (data.text || '').trim();
        logger.info(`[STT] Groq Whisper: "${text.slice(0, 80)}"`);
        return res.json({ text, language, provider: 'groq-whisper' });
      }
      logger.warn('[STT] Groq Whisper failed, falling back to local', { status: groqResp.status });
    } catch (err) {
      logger.warn('[STT] Groq Whisper error, falling back to local', { error: err.message });
    }
  }

  // ── Fallback: local Whisper (offline scribe, port 8006) ─────────────────────
  try {
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname || 'recording.wav',
      contentType: req.file.mimetype || 'audio/wav',
    });
    form.append('language', language);

    const response = await fetch(`${OFFLINE_SCRIBE_URL}/api/scribe/transcribe`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      timeout: 30000,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(502).json({ error: `STT service error: ${errText.slice(0, 200)}` });
    }

    const data = await response.json();
    return res.json({
      text: data.transcription || data.text || '',
      language: data.detected_language || language,
      duration: data.duration_seconds || null,
      provider: 'local-whisper',
    });
  } catch (err) {
    logger.error('[VoiceAssistant] STT error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /status — Aggregate voice stack readiness ─────────────────────────

router.get('/status', authUser, requireDoctor, async (req, res) => {
  const status = {
    success: true,
    service: 'voice-assistant',
    components: {
      stt: { status: 'unknown', provider: process.env.GROQ_API_KEY ? 'groq-whisper+local-fallback' : 'local-whisper' },
      tts: { status: process.env.ELEVENLABS_API_KEY ? 'configured' : 'fallback', provider: process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'browser' },
      livekit: { status: 'unknown', configured: Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL) },
    },
    endpoints: {
      scribe: OFFLINE_SCRIBE_URL,
      livekit: LIVEKIT_URL || null,
    },
  };

  try {
    const scribe = await fetchJsonOrText(OFFLINE_SCRIBE_URL + '/api/scribe/health', {}, 5000);
    status.components.stt.status = scribe.ok && scribe.body?.components?.stt?.status === 'healthy' ? 'healthy' : 'degraded';
    status.components.stt.backend = scribe.body?.components?.stt || null;
  } catch (error) {
    status.success = false;
    status.components.stt = { ...status.components.stt, status: 'unhealthy', error: error.message };
  }

  if (LIVEKIT_USES_CLOUD) {
    // LiveKit Cloud has no public self-hosted-style health endpoint; treat a
    // fully-configured project as healthy rather than pinging a non-existent path.
    status.components.livekit = {
      ...status.components.livekit,
      status: status.components.livekit.configured ? 'healthy' : 'unconfigured',
      cloud: true,
      mode: 'cloud',
      healthUrl: LIVEKIT_HEALTH_URL,
    };
    if (!status.components.livekit.configured) status.success = false;
  } else if (LIVEKIT_HEALTH_URL) {
    try {
      const livekit = await fetchJsonOrText(LIVEKIT_HEALTH_URL, {}, 5000);
      status.components.livekit.status = livekit.ok ? 'healthy' : 'degraded';
      status.components.livekit.healthUrl = LIVEKIT_HEALTH_URL;
      status.components.livekit.mode = 'self-hosted';
    } catch (error) {
      status.success = false;
      status.components.livekit = { ...status.components.livekit, status: 'unhealthy', healthUrl: LIVEKIT_HEALTH_URL, mode: 'self-hosted', error: error.message };
    }
  } else {
    status.components.livekit = { ...status.components.livekit, status: 'unconfigured', healthUrl: null };
  }

  const httpStatus = status.success ? 200 : 503;
  return res.status(httpStatus).json(status);
});

// ─── GET /livekit-token — Issue short-lived token for iSHA audio room ────────
// The frontend joins room "isha-assistant-<doctorId>" (subscribe + publish)
// so TTS audio published by backend can be played by the same participant,
// and microphone audio from future upgrades can be bridged.

router.get('/livekit-token', authUser, requireDoctor, async (req, res) => {
  try {
    const apiKey    = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl     = LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      return res.status(503).json({ error: 'LiveKit not configured' });
    }

    const doctorId = req.user?.id || req.user?.userId || 'unknown';
    const roomName = `isha-assistant-${doctorId}`;
    const identity = `doctor-${doctorId}`;

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: 'iSHA Assistant',
      ttl: 3600, // 1 hour
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    // Dispatch the Dr Isha agent to the room so it joins automatically.
    // Fire-and-forget — if dispatch fails (e.g. agent worker not running)
    // the mobile still gets a valid token and can retry later.
    try {
      const httpUrl = wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
      const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
      await dispatchClient.createDispatch(roomName, 'dr-isha', {
        metadata: JSON.stringify({ doctorId }),
      });
    } catch (dispatchErr) {
      logger.warn('[VoiceAssistant] Agent dispatch failed (agent may not be running)', {
        error: dispatchErr.message, roomName,
      });
    }

    return res.json({ token: jwt, url: wsUrl, roomName });
  } catch (err) {
    logger.error('[VoiceAssistant] LiveKit token error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── Follow-up / misclassification helpers ───────────────────────────────────

const META_MEDICAL_RE = /I understood this as|health intelligence request|please confirm before I take action/i;
const CLARIFY_RE = /\b(what do you mean|what does that mean|explain (that|this)|clarify|can you explain|i don'?t understand)\b/i;
const DOUBT_RE = /\b(are you sure|is that (right|correct)|really\??|confirm that)\b/i;
const CONFIRM_APPT_RE = /\b(confirm|accept|approve)\s+(the\s+)?(appointment|booking|request)s?\b/i;

function tryConversationShortcuts(text, historyMessages) {
  const trimmed = text.trim();

  if (CLARIFY_RE.test(trimmed) && historyMessages.length) {
    const lastAssistant = [...historyMessages].reverse().find(m => m.role === 'assistant' && m.content);
    if (lastAssistant) {
      const simplified = toSpokenText(lastAssistant.content, 4);
      const response = simplified
        ? `Let me clarify: ${simplified}`
        : "I was referring to your previous question. Could you tell me which part you'd like me to explain?";
      return { intent: 'general', action: null, parameters: null, response, speak: response, requiresConfirmation: false };
    }
  }

  if (DOUBT_RE.test(trimmed) && historyMessages.length) {
    const lastAssistant = [...historyMessages].reverse().find(m => m.role === 'assistant' && m.content);
    if (lastAssistant) {
      const response = `Yes — ${toSpokenText(lastAssistant.content, 3)}`;
      return { intent: 'general', action: null, parameters: null, response, speak: response, requiresConfirmation: false };
    }
  }

  if (CONFIRM_APPT_RE.test(trimmed)) {
    const nameMatch = trimmed.match(/\bfor\s+([a-z][a-z\s.'-]{1,40})/i);
    const patientName = nameMatch?.[1]?.trim().replace(/\s+(please|now|today)$/i, '') || '';
    return { shortcut: 'accept_appointment', parameters: { patient_name: patientName } };
  }

  return null;
}

// ─── POST /agent — Text → Intent + Action/Answer ─────────────────────────────

router.post('/agent', authUser, requireDoctor, async (req, res) => {
  const { text, context = {}, history = [] } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const doctorId = req.user?.id || req.user?.doctorId;
  const enrichedContext = { ...context, doctorName: req.user?.firstName || req.user?.name };
  const systemPrompt = buildSystemPrompt(enrichedContext);
  const currentPatientId = context.currentPatient?.id || context.currentPatient?._id;

  // Build conversation messages with history for continuity (last 10 turns)
  const historyMessages = Array.isArray(history)
    ? history.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.text || '').slice(0, 500),
      }))
    : [];

  // Fast path: clarifications, doubt-checks, appointment confirmations
  const shortcut = tryConversationShortcuts(text, historyMessages);
  if (shortcut && !shortcut.shortcut) {
    return res.json(shortcut);
  }

  // ── iSHA JSON intent prompt — sent to iSHA instead of function-calling ─────
  const ishaIntentPrompt = `You are iSHA, an AI medical assistant for Dr. ${enrichedContext.doctorName || 'Doctor'} on the SmartHealth platform.
Today: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.${enrichedContext.currentPatient ? `\nActive patient: ${enrichedContext.currentPatient.name || 'Unknown'}.` : ''}

You MUST respond ONLY with a valid JSON object — no extra text, no markdown fences. Format:
{"action":"<action>","parameters":{},"response":"<spoken reply>"}

Available actions and their parameters:
- "list_appointments"       → {"filter":"today|upcoming|pending|completed|all"}
- "get_today_summary"       → {}
- "book_appointment"        → {"patient_name":"","date":"YYYY-MM-DD","time":"HH:MM","reason":"","patient_phone":""}
- "cancel_appointment"      → {"patient_name":"","appointment_id":"","reason":""}
- "accept_appointment"      → {"patient_name":"","appointment_id":""}
- "reschedule_appointment"  → {"patient_name":"","appointment_id":"","new_date":"YYYY-MM-DD","new_time":"HH:MM"}
- "schedule_followup"       → {"days":7,"reason":""}
- "search_patient"          → {"query":"name/phone/ID"}
- "get_patient_health"      → {"patient_name":"","patient_id":""}
- "navigate_to"             → {"screen":"appointments|patients|dashboard|prescriptions|billing|analytics|health-records|queue|staff|ai-assist|voice-scribe|calculators|templates|monitoring|er-dashboard|icu-dashboard"}
- "add_clinical_note"       → {"note":"","category":"general|soap|assessment"}
- "get_drug_info"           → {"drug":"","question":""}
- "check_drug_interactions" → {"drugs":["drug1","drug2"]}
- "get_doctor_briefing"     → {}
- "add_task"                → {"title":"","patient_name":"","due_date":"YYYY-MM-DD","due_time":"HH:MM","priority":"urgent|high|normal|low"}
- "list_tasks"              → {"filter":"pending|today|all"}
- "complete_task"           → {"task_id":null,"title":""}
- "medical_query"           → {"query":"the clinical question"}
- "general"                 → {}

Rules:
- IDENTITY / GREETING (who are you, what can you do, hello, hi, good morning, introduce yourself) → {"action":"general","parameters":{},"response":"I'm iSHA, your AI clinical assistant. I can manage appointments, tasks, patient health, drug questions, and clinical notes — just speak naturally."}
- NON-CLINICAL QUERY (geography, capital cities, history, sports, weather, trivia, coding, general knowledge, politics, entertainment) → respond ONLY: {"action":"general","parameters":{},"response":"I'm iSHA, your clinical assistant. I can only help with patient care and medical tasks."}
- TASK / REMINDER / TO-DO (remind me, add task, note to self, don't forget, I need to, add to my list) → add_task with title extracted from speech
- SHOW TASKS / MY LIST / WHAT DO I NEED TO DO → list_tasks
- DONE / COMPLETED / MARK AS DONE / FINISHED TASK → complete_task
- "reschedule" → always reschedule_appointment
- "confirm / accept / approve appointment" → accept_appointment (NOT medical_query). If no patient named, confirm the next pending request.
- "what do you mean / explain that / clarify" → general: restate or simplify your PREVIOUS assistant message from conversation history
- "are you sure / confirm that / is that right" (doubting prior answer) → general: restate previous answer, NO tool
- WORKFLOW QUESTIONS about appointments, briefing, tasks, patients, navigation → use the matching action tool, NEVER medical_query
- "alerts / messages / updates / notifications / briefing / what's new" → always get_doctor_briefing (NOT get_today_summary)
- "how many patients / appointment count / today's summary" → get_today_summary
- DRUG DOSE / SIDE EFFECTS / INDICATION / CONTRAINDICATION (e.g. "dose of metformin", "side effects of aspirin", "when to use lisinopril") → get_drug_info with {"drug":"<name>","question":"<specific aspect>"}
- DRUG INTERACTIONS (e.g. "interaction between X and Y", "can I combine X with Y") → check_drug_interactions with {"drugs":["X","Y"]}
- CLINICAL / MEDICAL QUESTION without a specific drug (diagnosis criteria, treatment protocol, symptoms, physiology) → medical_query with {"query":"<question>"}
- NEVER use medical_query for appointment confirmation, briefing follow-ups, or "what do you mean" clarifications
- For get_drug_info, check_drug_interactions, medical_query: write the full clinical answer directly in "response"
- For all other actions: write a 1-sentence spoken confirmation in "response"`;

  try {
    // ── Step 1: Call central LLM router (SIB-first) for JSON intent ─────
    let toolName = shortcut?.shortcut || null;
    let args = shortcut?.parameters || {};
    let directContent = null;
    let ishaOk = false;

    if (!toolName) try {
      const ishaResp = await llmProvider.chat({
        messages: [
          { role: 'system', content: ishaIntentPrompt },
          ...historyMessages,
          { role: 'user', content: text.trim() }
        ],
        maxTokens: 600,
        temperature: 0.1,
        skipCache: true,
        forceProvider: 'sib',
      });

      const raw = (ishaResp.content || '').trim();
      // Strip markdown code fences if present
      let jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      // Extract JSON object if iSHA wrapped it in text
      if (!jsonStr.startsWith('{')) {
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (match) jsonStr = match[0];
      }
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        // iSHA returned plain conversational text — use it directly as a general answer
        const err = new Error(parseErr.message + ' (iSHA non-JSON)');
        err._rawContent = raw;
        err.message = `Unexpected token: not valid JSON. Raw: ${raw.slice(0, 80)}`;
        throw err;
      }

      toolName = parsed.action || 'general';
      args = { ...args, ...(parsed.parameters || {}) };
      directContent = parsed.response || null;
      ishaOk = true;
    } catch (ishaErr) {
      logger.warn('[VoiceAssistant] SIB intent path failed, falling back to cascade', { error: ishaErr.message });

      // If iSHA returned plain conversational text, use it directly — no need to call Groq
      if (ishaErr._rawContent && !ishaErr._rawContent.includes('{')) {
        toolName = 'general';
        directContent = ishaErr._rawContent;
        // skip Groq fallback entirely
      } else {
        try {
          const agentResp = await llmProvider.chat({
            messages: [
              { role: 'system', content: systemPrompt },
              ...historyMessages,
              { role: 'user', content: text.trim() }
            ],
            tools: ASSISTANT_TOOLS,
            toolChoice: 'auto',
            maxTokens: 800,
            temperature: 0.1,
            skipCache: true,
          });
          const toolCalls = agentResp.toolCalls || [];
          directContent = agentResp.content;
          if (!toolCalls.length) {
            toolName = 'general';
          } else {
            const call = toolCalls[0];
            toolName = call.function?.name || call.name;
            try {
              args = typeof call.function?.arguments === 'string'
                ? JSON.parse(call.function.arguments)
                : (call.function?.arguments || call.arguments || {});
            } catch { /* keep empty */ }
          }
        } catch (groqErr) {
          // Both LLMs failed — return a graceful general response
          logger.error('[VoiceAssistant] Both iSHA and Groq failed', { error: groqErr.message });
          toolName = 'general';
          directContent = "I'm having trouble processing that right now. Please try again.";
        }
      }
    }

    // ── Step 2: Parse response ─────────────────────────────────────────────

    // No action / general — check if iSHA answered a medical question via 'general'
    if (!toolName || toolName === 'general') {
      const SCOPE_REJECT   = "I'm iSHA, your clinical assistant. I can only help";
      const GREETING_RESP  = "I'm iSHA, your AI clinical assistant. I can manage";
      const OFF_TOPIC_MSG  = "I'm iSHA, your clinical assistant. I can only help with patient care and medical tasks.";

      // Detect if iSHA slipped and answered a non-clinical question anyway
      const NON_CLINICAL_RE = /\b(python|javascript|typescript|java\b|golang|rust|c\+\+|programming|for\s+loop|while\s+loop|\bvariable\b|\barray\b|\bfunction\s*\(|console\.|print\(|def\s+\w|capital\s+of|president\s+of|ipl\b|cricket\s+world|football\s+match|photosynthesis|geography)\b/i;
      const hasNonClinicalContent = NON_CLINICAL_RE.test(directContent || '');

      // Re-route: BiMediX2 used 'general' but wrote a substantive clinical answer
      const isClinicalFallthrough = directContent &&
        directContent.length > 80 &&
        !directContent.startsWith(SCOPE_REJECT) &&
        !directContent.startsWith(GREETING_RESP) &&
        !hasNonClinicalContent;

      if (isClinicalFallthrough) {
        return res.json({
          intent: 'medical_query',
          action: 'medical_query',
          parameters: null,
          response: directContent,
          speak: directContent,
          requiresConfirmation: false,
        });
      }

      // Non-clinical content answered by model — substitute rejection phrase
      const responseText = hasNonClinicalContent
        ? OFF_TOPIC_MSG
        : (directContent || "I'm your SmartHealth assistant. How can I help?");

      return res.json({
        intent: 'general',
        action: null,
        parameters: null,
        response: responseText,
        speak: responseText,
        requiresConfirmation: false,
      });
    }

    // ── Step 3: Execute or relay ───────────────────────────────────────────

    // medical_query — iSHA already answered in directContent; fall back to answerMedicalQuery
    if (toolName === 'medical_query') {
      // SIB sometimes misclassifies workflow questions as medical_query with a meta placeholder
      if (META_MEDICAL_RE.test(directContent || '') || CONFIRM_APPT_RE.test(text)) {
        const pending = await executeListAppointments(doctorId, 'pending', 5);
        if (pending?.length) {
          const names = pending.map(a => a.patientName || 'Unknown').join(', ');
          const msg = `You have ${pending.length} pending appointment request${pending.length > 1 ? 's' : ''}: ${names}. Say "confirm the appointment" to accept the next one, or name the patient.`;
          return res.json({
            intent: 'action',
            action: 'list_appointments',
            parameters: { filter: 'pending' },
            response: msg,
            speak: toSpokenText(msg),
            data: pending,
            requiresConfirmation: false,
          });
        }
        const msg = "I can help with appointments, patient records, drug questions, and your daily briefing. What would you like to do?";
        return res.json({
          intent: 'general',
          action: null,
          parameters: null,
          response: msg,
          speak: msg,
          requiresConfirmation: false,
        });
      }

      const answer = directContent || await answerMedicalQuery(args.query || text, args.context || '');
      return res.json({
        intent: 'medical_query',
        action: 'medical_query',
        parameters: args,
        response: answer,
        speak: answer,
        requiresConfirmation: false,
      });
    }

    // get_drug_info — iSHA may have answered directly; fall back to answerMedicalQuery
    if (toolName === 'get_drug_info') {
      const q = `${args.question ? args.question + ' for ' : 'Complete information about '}${args.drug}`;
      const answer = directContent || await answerMedicalQuery(q, '', `Focus on: dosage, indications, side effects, contraindications.`);
      return res.json({
        intent: 'medical_query',
        action: 'get_drug_info',
        parameters: args,
        response: answer,
        speak: answer,
        requiresConfirmation: false,
      });
    }

    // check_drug_interactions — iSHA may have answered directly; fall back to answerMedicalQuery
    if (toolName === 'check_drug_interactions') {
      const drugs = (args.drugs || []).join(', ');
      const q = `What are the clinically significant interactions between: ${drugs}?`;
      const answer = directContent || await answerMedicalQuery(q, '', 'Be specific about severity levels (major/moderate/minor).');
      return res.json({
        intent: 'medical_query',
        action: 'check_drug_interactions',
        parameters: args,
        response: answer,
        speak: answer,
        requiresConfirmation: false,
      });
    }

    // get_today_summary — execute server-side
    if (toolName === 'get_today_summary') {
      const summary = await executeGetTodaySummary(doctorId);
      const spoken = summary
        ? `Today you have ${summary.todayAppointments} appointments: ${summary.completed} completed, ${summary.pending} pending.`
        : 'Unable to fetch today\'s summary right now.';
      return res.json({
        intent: 'action',
        action: 'get_today_summary',
        parameters: null,
        response: spoken,
        speak: spoken,
        data: summary,
        requiresConfirmation: false,
      });
    }

    // add_clinical_note — execute server-side with confirmation
    if (toolName === 'add_clinical_note') {
      if (!currentPatientId) {
        const msg = 'No patient is currently selected. Please open a patient record first.';
        return res.json({ intent: 'action', action: 'add_clinical_note', parameters: args, response: msg, speak: msg, requiresConfirmation: false });
      }
      const result = await executeAddClinicalNote(doctorId, currentPatientId, args.note, args.category);
      const msg = result.success
        ? `Clinical note added: "${args.note}"`
        : `Could not add note: ${result.error}`;
      return res.json({
        intent: 'action',
        action: 'add_clinical_note',
        parameters: args,
        response: msg,
        speak: msg,
        requiresConfirmation: false,
      });
    }

    // schedule_followup — return to client for UI confirmation
    if (toolName === 'schedule_followup') {
      const days = parseInt(args.days, 10) || 7;  // coerce string to int (Groq may pass string)
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + days);
      const dateStr = followUpDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const msg = `Schedule a follow-up in ${days} days (${dateStr})${args.reason ? ` for ${args.reason}` : ''}?`;
      return res.json({
        intent: 'action',
        action: 'schedule_followup',
        parameters: { ...args, followUpDate: followUpDate.toISOString() },
        response: msg,
        speak: msg,
        requiresConfirmation: true,
      });
    }

    // navigate_to — return to client for execution
    if (toolName === 'navigate_to') {
      const screenLabels = {
        appointments: 'Appointments', patients: 'Patients', prescriptions: 'Prescriptions',
        dashboard: 'Dashboard', analytics: 'Analytics', billing: 'Billing',
        'health-records': 'Health Records', 'er-dashboard': 'ER Dashboard',
        'icu-dashboard': 'ICU Dashboard', 'voice-scribe': 'Voice Scribe',
        calculators: 'Medical Calculators', 'ai-assist': 'AI Assist',
        templates: 'Document Templates', monitoring: 'Remote Monitoring',
        queue: 'Queue', staff: 'Staff',
      };
      const label = screenLabels[args.screen] || args.screen;
      const msg = `Opening ${label}`;
      return res.json({
        intent: 'action',
        action: 'navigate_to',
        parameters: args,
        response: msg,
        speak: msg,
        requiresConfirmation: false,
      });
    }

    // search_patient — return to client for execution
    if (toolName === 'search_patient') {
      const msg = `Searching for patient "${args.query}"`;
      return res.json({
        intent: 'action',
        action: 'search_patient',
        parameters: args,
        response: msg,
        speak: msg,
        requiresConfirmation: false,
      });
    }

    // list_appointments — execute server-side
    if (toolName === 'list_appointments') {
      // Normalize filter — LLM sometimes uses non-enum values like "confirmed", "scheduled", "booked"
      const VALID_FILTERS = ['today', 'upcoming', 'pending', 'completed', 'all'];
      let rawFilter = (args.filter || 'today').toLowerCase();
      if (!VALID_FILTERS.includes(rawFilter)) {
        // Map common synonyms
        if (['confirmed', 'scheduled', 'booked', 'upcoming'].includes(rawFilter)) rawFilter = 'upcoming';
        else if (['done', 'finished', 'past'].includes(rawFilter)) rawFilter = 'completed';
        else rawFilter = 'today';
      }
      const filter = rawFilter;
      const limit = args.limit ? (parseInt(args.limit, 10) || 10) : 10;
      const rows = await executeListAppointments(doctorId, filter, limit);
      if (!rows || rows.length === 0) {
        const msg = filter === 'today'
          ? 'You have no appointments scheduled for today.'
          : `No ${filter} appointments found.`;
        return res.json({ intent: 'action', action: 'list_appointments', parameters: args, response: msg, speak: msg, data: [], requiresConfirmation: false });
      }
      const lines = rows.map(a => {
        const time = a.appointmentTime ? String(a.appointmentTime).slice(0, 5) : '';
        const status = a.status || '';
        const name = a.patientName || 'Unknown';
        const reason = a.reason || a.symptoms || '';
        return `• ${time} — ${name} (${status})${reason ? ': ' + reason : ''}`;
      });
      const heading = filter === 'today'
        ? `You have ${rows.length} appointment${rows.length !== 1 ? 's' : ''} today:`
        : `${rows.length} ${filter} appointment${rows.length !== 1 ? 's' : ''}:`;
      const msg = `${heading}\n${lines.join('\n')}`;
      // Spoken version — concise summary
      const firstFew = rows.slice(0, 3).map(a =>
        `${String(a.appointmentTime || '').slice(0, 5)} ${a.patientName || 'unknown'}`
      ).join(', ');
      const speak = rows.length <= 3
        ? `${heading.replace(':', '.')} ${firstFew}.`
        : `${heading.replace(':', '.')} First: ${firstFew}${rows.length > 3 ? `, and ${rows.length - 3} more.` : '.'}`;
      return res.json({ intent: 'action', action: 'list_appointments', parameters: args, response: msg, speak, data: rows, requiresConfirmation: false });
    }

    // get_patient_health — execute server-side
    if (toolName === 'get_patient_health') {
      const data = await executeGetPatientHealth(doctorId, args.patient_name, args.patient_id);
      if (!data) {
        const name = args.patient_name || args.patient_id || 'that patient';
        const msg = `No health records found for ${name}. They may not have visited you yet.`;
        return res.json({ intent: 'action', action: 'get_patient_health', parameters: args, response: msg, speak: msg, requiresConfirmation: false });
      }
      const parts = [];
      if (data.patient) {
        const p = data.patient;
        parts.push(`Patient: ${p.name}${p.gender ? ', ' + p.gender : ''}${p.bloodGroup ? ', Blood: ' + p.bloodGroup : ''}`);
        if (p.weight || p.height) parts.push(`Weight: ${p.weight || '?'} kg, Height: ${p.height || '?'} cm`);
        if (p.chronicConditions) parts.push(`Conditions: ${Array.isArray(p.chronicConditions) ? p.chronicConditions.join(', ') : p.chronicConditions}`);
        if (p.allergies) parts.push(`Allergies: ${Array.isArray(p.allergies) ? p.allergies.join(', ') : p.allergies}`);
        if (p.currentMedications) parts.push(`Current Medications: ${Array.isArray(p.currentMedications) ? p.currentMedications.join(', ') : p.currentMedications}`);
        if (p.lastVisitDate) parts.push(`Last Visit: ${new Date(p.lastVisitDate).toLocaleDateString('en-IN')}`);
      }
      if (data.vitals && data.vitals.length) {
        const vLines = data.vitals.slice(0, 6).map(v => `${v.reading_type}: ${v.value} ${v.unit || ''}`);
        parts.push(`Latest Vitals: ${vLines.join(', ')}`);
      }
      if (data.lastPrescription) {
        const rx = data.lastPrescription;
        if (rx.diagnosis) parts.push(`Last Diagnosis: ${Array.isArray(rx.diagnosis) ? rx.diagnosis.join(', ') : rx.diagnosis}`);
      }
      const msg = parts.join('\n') || 'Health summary retrieved.';
      return res.json({ intent: 'action', action: 'get_patient_health', parameters: args, response: msg, speak: msg, data, requiresConfirmation: false });
    }

    // book_appointment — execute server-side
    if (toolName === 'book_appointment') {
      if (!args.date || !args.time || !args.patient_name) {
        const msg = 'To book an appointment I need the patient name, date, and time. Please provide these details.';
        return res.json({ intent: 'action', action: 'book_appointment', parameters: args, response: msg, speak: msg, requiresConfirmation: false });
      }
      const doctorDisplayName = enrichedContext.doctorName || 'Doctor';
      const result = await executeBookAppointment(doctorId, doctorDisplayName, args.patient_name, args.patient_phone, args.date, args.time, args.reason, args.type);
      const msg = result.success
        ? `Appointment booked for ${result.patientName} on ${result.date} at ${result.time}. ID: ${result.appointmentId}.`
        : `Could not book appointment: ${result.error}`;
      return res.json({ intent: 'action', action: 'book_appointment', parameters: args, response: msg, speak: msg, data: result, requiresConfirmation: false });
    }

    // accept_appointment — confirm pending patient request
    if (toolName === 'accept_appointment') {
      const result = await executeAcceptAppointment(doctorId, args.appointment_id, args.patient_name);
      let msg;
      if (result.success) {
        const c = result.confirmed[0];
        const dateStr = c.appointmentDate ? new Date(c.appointmentDate).toLocaleDateString('en-IN') : '';
        msg = `Confirmed appointment for ${c.patientName}${dateStr ? ` on ${dateStr}` : ''}${c.appointmentTime ? ` at ${String(c.appointmentTime).slice(0, 5)}` : ''}.`;
      } else {
        msg = result.error || 'Could not confirm the appointment.';
      }
      return res.json({
        intent: 'action',
        action: 'accept_appointment',
        parameters: args,
        response: msg,
        speak: msg,
        data: result,
        requiresConfirmation: false,
      });
    }

    // cancel_appointment — execute server-side
    if (toolName === 'cancel_appointment') {
      const result = await executeCancelAppointment(doctorId, args.appointment_id, args.patient_name, args.reason);
      let msg;
      if (result.success) {
        const c = result.cancelled[0];
        msg = `Appointment for ${c.patientName} on ${new Date(c.appointmentDate).toLocaleDateString('en-IN')} at ${c.appointmentTime} has been cancelled.`;
      } else {
        msg = `Could not cancel appointment: ${result.error}`;
      }
      return res.json({ intent: 'action', action: 'cancel_appointment', parameters: args, response: msg, speak: msg, data: result, requiresConfirmation: false });
    }

    // reschedule_appointment — execute server-side
    if (toolName === 'reschedule_appointment') {
      if (!args.new_date || !args.new_time) {
        const msg = 'Please provide the new date and time for rescheduling.';
        return res.json({ intent: 'action', action: 'reschedule_appointment', parameters: args, response: msg, speak: msg, requiresConfirmation: false });
      }
      const result = await executeRescheduleAppointment(doctorId, args.appointment_id, args.patient_name, args.new_date, args.new_time);
      let msg;
      if (result.success) {
        const r = result.rescheduled;
        msg = `Appointment for ${r.patientName} has been rescheduled to ${result.newDate} at ${result.newTime}.`;
      } else {
        msg = `Could not reschedule: ${result.error}`;
      }
      return res.json({ intent: 'action', action: 'reschedule_appointment', parameters: args, response: msg, speak: msg, data: result, requiresConfirmation: false });
    }

    // get_doctor_briefing — execute server-side
    if (toolName === 'get_doctor_briefing') {
      const briefing = await executeGetDoctorBriefing(doctorId, args.priority || 'all');
      const { unreadNotifications, pendingRequests, upcomingSoon, pendingTasks = [] } = briefing;

      const parts = [];

      if (upcomingSoon.length > 0) {
        parts.push(`⏰ **Upcoming in 2 hours:** ${upcomingSoon.map(a => `${a.appointmentTime} — ${a.patientName}`).join(', ')}`);
      }
      if (pendingRequests.length > 0) {
        parts.push(`📋 **${pendingRequests.length} pending appointment request${pendingRequests.length > 1 ? 's' : ''}:** ${pendingRequests.map(a => `${a.patientName} on ${a.appointmentDate}`).join(', ')}`);
      }
      if (unreadNotifications.length > 0) {
        const urgentItems = unreadNotifications.filter(n => n.priority === 'urgent');
        const highItems   = unreadNotifications.filter(n => n.priority === 'high');
        const normalItems = unreadNotifications.filter(n => !['urgent','high'].includes(n.priority));
        if (urgentItems.length > 0) parts.push(`🚨 **URGENT (${urgentItems.length}):** ${urgentItems.map(n => n.title).join(' | ')}`);
        if (highItems.length > 0)   parts.push(`🔴 **High priority (${highItems.length}):** ${highItems.map(n => n.title).join(' | ')}`);
        if (normalItems.length > 0) parts.push(`📬 **${normalItems.length} unread notification${normalItems.length > 1 ? 's' : ''}`);
      }
      if (pendingTasks.length > 0) {
        parts.push(`✅ **${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}:** ${pendingTasks.map(t => t.title).join(' | ')}`);
      }

      if (parts.length === 0) {
        const msg = 'No new updates, alerts, or pending tasks at the moment.';
        return res.json({ intent: 'action', action: 'get_doctor_briefing', parameters: args, response: msg, speak: msg, data: briefing, requiresConfirmation: false });
      }

      const fullText = parts.join('\n');
      const spokenParts = [];
      if (upcomingSoon.length > 0)   spokenParts.push(`${upcomingSoon.length} appointment${upcomingSoon.length > 1 ? 's' : ''} coming up soon.`);
      if (pendingRequests.length > 0) spokenParts.push(`${pendingRequests.length} pending appointment request${pendingRequests.length > 1 ? 's' : ''}.`);
      const urgentNotifs = unreadNotifications.filter(n => n.priority === 'urgent');
      const highNotifs   = unreadNotifications.filter(n => n.priority === 'high');
      if (urgentNotifs.length > 0)   spokenParts.push(`Urgent alert: ${urgentNotifs[0].title}.`);
      else if (highNotifs.length > 0) spokenParts.push(`${highNotifs.length} high-priority notification${highNotifs.length > 1 ? 's' : ''}.`);
      else if (unreadNotifications.length > 0) spokenParts.push(`${unreadNotifications.length} unread notifications.`);
      if (pendingTasks.length > 0)   spokenParts.push(`You also have ${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}.`);
      const spokenText = spokenParts.join(' ') || fullText;

      return res.json({ intent: 'action', action: 'get_doctor_briefing', parameters: args, response: fullText, speak: spokenText, data: briefing, requiresConfirmation: false });
    }

    // add_task — create a doctor task from voice
    if (toolName === 'add_task') {
      const result = await executeAddTask(doctorId, args);
      const dueStr = args.due_date ? ` for ${args.due_date}` : ' for today';
      const patientStr = args.patient_name ? ` regarding ${args.patient_name}` : '';
      const msg = result.success
        ? `Task added: "${args.title}"${patientStr}${dueStr}.`
        : `Couldn't save task: ${result.error}`;
      return res.json({ intent: 'action', action: 'add_task', parameters: args, response: msg, speak: msg, data: result.task || null, requiresConfirmation: false });
    }

    // list_tasks — show pending tasks
    if (toolName === 'list_tasks') {
      const tasks = await executeListTasks(doctorId, args.filter || 'pending');
      if (!tasks.length) {
        const msg = 'You have no pending tasks.';
        return res.json({ intent: 'action', action: 'list_tasks', parameters: args, response: msg, speak: msg, data: [], requiresConfirmation: false });
      }
      const lines = tasks.map(t => {
        const due = t.due_date ? ` — due ${t.due_date}` : '';
        const pat = t.patient_name ? ` (${t.patient_name})` : '';
        const pri = t.priority !== 'normal' ? ` [${t.priority}]` : '';
        return `• ${t.title}${pat}${due}${pri}`;
      });
      const msg = `You have ${tasks.length} pending task${tasks.length !== 1 ? 's' : ''}:\n${lines.join('\n')}`;
      const spoken = `You have ${tasks.length} pending task${tasks.length !== 1 ? 's' : ''}. First: ${tasks[0].title}.`;
      return res.json({ intent: 'action', action: 'list_tasks', parameters: args, response: msg, speak: spoken, data: tasks, requiresConfirmation: false });
    }

    // complete_task — mark task done
    if (toolName === 'complete_task') {
      const result = await executeCompleteTask(doctorId, args);
      const msg = result.success
        ? `Done! Task "${result.task?.title || args.title || 'task'}" marked as completed.`
        : `Couldn't find that task. Try saying "show my tasks" to see what's pending.`;
      return res.json({ intent: 'action', action: 'complete_task', parameters: args, response: msg, speak: msg, data: result.task || null, requiresConfirmation: false });
    }

    // Unknown tool — fallback
    return res.json({
      intent: 'action',
      action: toolName,
      parameters: args,
      response: directContent || `Executing ${toolName}`,
      speak: directContent || `Executing ${toolName}`,
      requiresConfirmation: false,
    });

  } catch (err) {
    logger.error('[VoiceAssistant] Agent error', { error: err.message, text });
    return res.status(500).json({
      error: err.message,
      response: 'Sorry, I encountered an error. Please try again.',
    });
  }
});

// ─── GET /briefing — Proactive update poll (frontend polling) ─────────────────

router.get('/briefing', authUser, requireDoctor, async (req, res) => {
  const doctorId = req.user?.id;
  if (!doctorId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Fetch urgent & high priority unread notifications (last 24h only for polling)
    const notifResult = await pool.query(`
      SELECT id, type, priority, title, LEFT(message, 200) AS message, "createdAt"
      FROM notifications
      WHERE "userId" = $1
        AND "userType" = 'doctor'
        AND "isRead" = false
        AND priority IN ('urgent','high')
        AND "createdAt" >= NOW() - INTERVAL '24 hours'
      ORDER BY CASE priority WHEN 'urgent' THEN 1 ELSE 2 END, "createdAt" DESC
      LIMIT 5
    `, [doctorId]);

    // Pending appointment requests
    const pendingResult = await pool.query(`
      SELECT "patientName", "appointmentDate", "appointmentTime", reason
      FROM appointments
      WHERE "doctorId" = $1 AND status = 'pending' AND "appointmentDate" >= CURRENT_DATE
      ORDER BY "appointmentDate", "appointmentTime"
      LIMIT 3
    `, [doctorId]);

    // Appointments starting in next 30 min
    const imminentResult = await pool.query(`
      SELECT "patientName", "appointmentTime", status
      FROM appointments
      WHERE "doctorId" = $1
        AND DATE("appointmentDate") = CURRENT_DATE
        AND "appointmentTime"::time BETWEEN NOW()::time AND (NOW() + INTERVAL '30 minutes')::time
        AND status NOT IN ('cancelled','completed')
      ORDER BY "appointmentTime"
      LIMIT 2
    `, [doctorId]);

    const urgentNotifs  = notifResult.rows.filter(n => n.priority === 'urgent');
    const highNotifs    = notifResult.rows.filter(n => n.priority === 'high');
    const hasUrgent     = urgentNotifs.length > 0;
    const hasUpdates    = notifResult.rows.length > 0 || pendingResult.rows.length > 0 || imminentResult.rows.length > 0;

    // Compose spoken alert text
    const spokenParts = [];
    if (urgentNotifs.length > 0)   spokenParts.push(`Urgent: ${urgentNotifs[0].title}.`);
    if (highNotifs.length > 0)     spokenParts.push(`${highNotifs.length} high-priority alert${highNotifs.length > 1 ? 's' : ''}.`);
    if (pendingResult.rows.length > 0) spokenParts.push(`${pendingResult.rows.length} appointment request${pendingResult.rows.length > 1 ? 's' : ''} pending.`);
    if (imminentResult.rows.length > 0) spokenParts.push(`${imminentResult.rows[0].patientName} starts in under 30 minutes.`);

    return res.json({
      hasUpdates,
      hasUrgent,
      speakText: spokenParts.join(' '),
      urgent: urgentNotifs,
      high: highNotifs,
      pendingRequests: pendingResult.rows,
      imminent: imminentResult.rows,
    });
  } catch (err) {
    logger.error('[VoiceAssistant] Briefing poll error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /tools — List available tools ───────────────────────────────────────

router.get('/tools', authUser, requireDoctor, (req, res) => {
  res.json({
    tools: ASSISTANT_TOOLS.map(t => ({
      name: t.function.name,
      description: t.function.description,
    }))
  });
});

export default router;
