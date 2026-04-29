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
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import logger from '../config/logger.js';
import pool from '../db/pgPool.js';

const router = express.Router();
const requireDoctor = requireRole(['doctor', 'admin', 'assistant', 'nurse', 'team']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const OFFLINE_SCRIBE_URL = process.env.OFFLINE_SCRIBE_URL || 'http://localhost:8006';

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
      description: 'Get a summary of today for the doctor: appointment count, pending tasks, recent alerts.',
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
          days: { type: 'number', description: 'Number of days from today' },
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
  }
];

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(context = {}) {
  const { currentPatient, currentScreen, doctorName } = context;
  const patientInfo = currentPatient
    ? `Current patient: ${currentPatient.name || currentPatient.firstName || 'Unknown'}, Age: ${currentPatient.age || 'N/A'}, ID: ${currentPatient.id || currentPatient._id || 'N/A'}`
    : 'No patient currently selected.';

  return `You are iSHA Assistant, a smart voice assistant for doctors in a clinical app called SmartHealth.
You help doctors navigate the app, find information, and answer medical questions quickly.

Current context:
- Doctor: ${doctorName || 'Doctor'}
- Active screen: ${currentScreen || 'dashboard'}
- ${patientInfo}

You have access to tools for:
1. Navigating app screens (appointments, prescriptions, patients, ER dashboard, etc.)
2. Searching patients
3. Getting today's schedule summary
4. Adding clinical notes for the current patient
5. Scheduling follow-ups
6. Answering drug information questions
7. Checking drug interactions
8. Answering medical/clinical questions

Rules:
- Always call a tool — NEVER just respond with text unless the query is pure greeting/small-talk
- For app navigation commands like "show appointments", "open patients" → use navigate_to
- For medical knowledge questions → use medical_query or get_drug_info
- For drug interaction checks → use check_drug_interactions
- Keep responses concise and clinical — doctors are busy
- For critical actions (prescriptions, notes), confirm before executing
- Add a disclaimer for medical advice: "For reference only. Verify with clinical judgment."
- If the input is a greeting or unclear, respond directly without a tool call`;
}

// ─── Execute server-side tools ─────────────────────────────────────────────

async function executeGetTodaySummary(doctorId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE(scheduled_at) = $1) AS today_appointments,
        COUNT(*) FILTER (WHERE DATE(scheduled_at) = $1 AND status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE DATE(scheduled_at) = $1 AND status IN ('scheduled','confirmed')) AS pending
      FROM appointments
      WHERE doctor_id = $2
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
    await pool.query(`
      INSERT INTO clinical_notes (doctor_id, patient_id, note, category, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [doctorId, patientId, note, category]);
    return { success: true };
  } catch (err) {
    logger.warn('[VoiceAssistant] add_clinical_note DB error', { error: err.message });
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

router.post('/stt', authUser, requireDoctor, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

  const language = req.body.language || 'en';

  try {
    // Proxy to offline scribe Python service for Whisper transcription
    const form = new FormData();
    form.append('audio', req.file.buffer, {
      filename: req.file.originalname || 'recording.webm',
      contentType: req.file.mimetype || 'audio/webm',
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
    });
  } catch (err) {
    logger.error('[VoiceAssistant] STT error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /agent — Text → Intent + Action/Answer ─────────────────────────────

router.post('/agent', authUser, requireDoctor, async (req, res) => {
  const { text, context = {} } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const doctorId = req.user?.id || req.user?.doctorId;
  const enrichedContext = { ...context, doctorName: req.user?.firstName || req.user?.name };
  const systemPrompt = buildSystemPrompt(enrichedContext);
  const currentPatientId = context.currentPatient?.id || context.currentPatient?._id;

  try {
    // ── Step 1: Call LLM agent with tool definitions ──────────────────────
    const agentResp = await llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.trim() }
      ],
      tools: ASSISTANT_TOOLS,
      toolChoice: 'auto',
      maxTokens: 800,
      temperature: 0.1,
      skipCache: true,
    });

    // ── Step 2: Parse response ─────────────────────────────────────────────
    const toolCalls = agentResp.toolCalls || [];
    const directContent = agentResp.content;

    // No tool call — direct answer (greeting, small talk, etc.)
    if (!toolCalls.length) {
      return res.json({
        intent: 'general',
        action: null,
        parameters: null,
        response: directContent || "I'm your SmartHealth assistant. How can I help?",
        speak: directContent || "I'm your SmartHealth assistant. How can I help?",
        requiresConfirmation: false,
      });
    }

    const call = toolCalls[0];
    const toolName = call.function?.name || call.name;
    let args = {};
    try {
      args = typeof call.function?.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : (call.function?.arguments || call.arguments || {});
    } catch { /* keep empty */ }

    // ── Step 3: Execute or relay ───────────────────────────────────────────

    // medical_query — answer directly
    if (toolName === 'medical_query') {
      const answer = await answerMedicalQuery(args.query || text, args.context || '');
      return res.json({
        intent: 'medical_query',
        action: null,
        parameters: null,
        response: answer,
        speak: answer,
        requiresConfirmation: false,
      });
    }

    // get_drug_info — answer directly
    if (toolName === 'get_drug_info') {
      const q = `${args.question ? args.question + ' for ' : 'Complete information about '}${args.drug}`;
      const answer = await answerMedicalQuery(q, '', `Focus on: dosage, indications, side effects, contraindications.`);
      return res.json({
        intent: 'medical_query',
        action: 'get_drug_info',
        parameters: args,
        response: answer,
        speak: answer,
        requiresConfirmation: false,
      });
    }

    // check_drug_interactions — answer directly
    if (toolName === 'check_drug_interactions') {
      const drugs = (args.drugs || []).join(', ');
      const q = `What are the clinically significant interactions between: ${drugs}?`;
      const answer = await answerMedicalQuery(q, '', 'Be specific about severity levels (major/moderate/minor).');
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
      const days = args.days || 7;
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
