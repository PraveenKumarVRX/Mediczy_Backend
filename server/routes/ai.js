import medicalAIRouter from './medical-ai.route.js';
import { sibFetch as fetch } from '../services/sib-client.js';
import express from 'express';
import auth from '../middleware/auth.js';
import dotenv from 'dotenv';
import healthDiaryService from '../services/health-diary.service.js';
import rateLimit from 'express-rate-limit';
import llmProvider from '../services/ai-brain/llm-provider.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import detectAppointmentIntent from '../utils/appointmentIntent.js';

import { schemaVerifier, guardedQuery } from '../utils/schema-guard.js';
// Load environment variables
dotenv.config();

const router = express.Router();

let aiDoctorMetricsTableReady = false;

const SCHEMA_TABLES = ['ai_doctor_metrics'];

// Owned by the migration and only verified here: creating these on demand
// would let a skipped migration look healthy on tables without its indexes
// and constraints, and would let a request hold an ACCESS EXCLUSIVE lock.
const ensureAiDoctorMetricsTable = schemaVerifier({
  sequelize: postgresSequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004800-rwe-export-governance before using AI doctor metrics',
});

ensureAiDoctorMetricsTable().catch((err) => console.error('[ai] schema check failed:', err.message, err.details || ''));

const guardedPostgresSequelize = guardedQuery(postgresSequelize, 'Apply migration 20261015004800-rwe-export-governance before using AI doctor metrics');

// Reported at startup so an unmigrated environment shows in the log, not
// only when the first request fails. Boot is not blocked.

// SIB FastAPI Configuration (SOLE AI SOURCE)
const SIB_BASE_URL = process.env.SIB_URL || 'http://localhost:8001';
let sibAvailable = null; // null = unknown, true/false = checked

/**
 * Check SIB health and availability
 */
async function checkSibHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${SIB_BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) {
      const health = await response.json();
      sibAvailable = health.status === 'healthy';
      return sibAvailable;
    }
    sibAvailable = false;
    return false;
  } catch (error) {
    console.warn('⚠️ SIB health check failed:', error.message);
    sibAvailable = false;
    return false;
  }
}

/**
 * Call SIB /query endpoint for AI processing
 */
async function callSibQuery(query, options = {}) {
  if (sibAvailable === null) await checkSibHealth();
  if (!sibAvailable) {
    throw new Error('SIB (AI Brain) is unavailable. Please try again later.');
  }
  
  const response = await fetch(`${SIB_BASE_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: query,
      patient_id: options.userId?.toString() || null,
      include_summary: options.includeSummary || false
    }),
    signal: AbortSignal.timeout(30000)
  });
  
  if (!response.ok) {
    throw new Error(`SIB returned ${response.status}`);
  }
  
  return response.json();
}

/**
 * Call SIB /chat endpoint for conversational AI
 */
async function callSibChat(message, options = {}) {
  if (sibAvailable === null) await checkSibHealth();
  if (!sibAvailable) {
    throw new Error('SIB (AI Brain) is unavailable. Please try again later.');
  }
  
  const response = await fetch(`${SIB_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patient_id: options.userId?.toString() || 'anonymous',
      message: message,
      language: options.language || 'en',
      session_id: options.sessionId || null,
      include_risk: options.includeRisk || false,
      include_rag: true
    }),
    signal: AbortSignal.timeout(60000)
  });
  
  if (!response.ok) {
    throw new Error(`SIB returned ${response.status}`);
  }
  
  return response.json();
}

// Initialize SIB health check on startup — retry once after 8 s to handle PM2 boot race
(async () => {
  const healthy = await checkSibHealth();
  if (healthy) {
    console.log('✅ SIB FastAPI is available (SOLE AI SOURCE)');
  } else {
    setTimeout(async () => {
      const retry = await checkSibHealth();
      if (retry) {
        console.log('✅ SIB FastAPI available (connected on retry)');
      } else {
        console.warn('⚠️ SIB FastAPI not available at startup - will retry on requests');
      }
    }, 8000);
  }
})();

// Per-route limiter to protect expensive AI calls
const aiRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many AI requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(aiRouteLimiter);

// Lightweight KPI ingestion endpoint for AI Doctor UX analytics
router.post('/ai-doctor/metrics', auth, async (req, res) => {
  try {

    const {
      eventType,
      sessionId = null,
      language = 'en',
      pagePath = '/ai-doctor',
      latencyMs = null,
      payload = {},
    } = req.body || {};

    if (!eventType || typeof eventType !== 'string' || eventType.length > 64) {
      return res.status(400).json({ success: false, message: 'eventType is required (max 64 chars).' });
    }

    if (sessionId && (typeof sessionId !== 'string' || sessionId.length > 128)) {
      return res.status(400).json({ success: false, message: 'sessionId must be <= 128 chars.' });
    }

    if (typeof language !== 'string' || language.length > 16) {
      return res.status(400).json({ success: false, message: 'language must be <= 16 chars.' });
    }

    if (typeof pagePath !== 'string' || pagePath.length > 120) {
      return res.status(400).json({ success: false, message: 'pagePath must be <= 120 chars.' });
    }

    if (latencyMs !== null && (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 600000)) {
      return res.status(400).json({ success: false, message: 'latencyMs must be between 0 and 600000.' });
    }

    if (payload && typeof payload !== 'object') {
      return res.status(400).json({ success: false, message: 'payload must be a JSON object.' });
    }

    await guardedPostgresSequelize(
      `
        INSERT INTO ai_doctor_metrics (
          user_id,
          tenant_id,
          event_type,
          session_id,
          language_code,
          page_path,
          latency_ms,
          payload,
          ip_address,
          user_agent
        ) VALUES (
          :userId,
          :tenantId,
          :eventType,
          :sessionId,
          :language,
          :pagePath,
          :latencyMs,
          :payload::jsonb,
          :ipAddress,
          :userAgent
        )
      `,
      {
        replacements: {
          userId: req.user?.id || null,
          tenantId: req.user?.tenantId || null,
          eventType,
          sessionId,
          language,
          pagePath,
          latencyMs,
          payload: JSON.stringify(payload || {}),
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        },
      }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('[AI Doctor Metrics] Ingestion error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to ingest AI Doctor metric.' });
  }
});

// User-level summary endpoint for quick product KPI visibility
router.get('/ai-doctor/metrics/summary', auth, async (req, res) => {
  try {

    const userId = req.user?.id || null;
    const days = Math.min(30, Math.max(1, parseInt(req.query.days || '7', 10)));

    const [summary] = await guardedPostgresSequelize(
      `
        SELECT
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE event_type = 'message_submit')::int AS messages_sent,
          COUNT(*) FILTER (WHERE event_type = 'prompt_click')::int AS prompt_clicks,
          COUNT(*) FILTER (WHERE event_type = 'response_success')::int AS response_success,
          ROUND(AVG(latency_ms) FILTER (WHERE event_type = 'response_success' AND latency_ms IS NOT NULL), 0)::int AS avg_latency_ms,
          MAX(latency_ms) FILTER (WHERE event_type = 'response_success' AND latency_ms IS NOT NULL)::int AS max_latency_ms
        FROM ai_doctor_metrics
        WHERE user_id = :userId
          AND created_at >= NOW() - (:days || ' days')::interval
      `,
      {
        replacements: { userId, days },
        type: QueryTypes.SELECT,
      }
    );

    const topPrompts = await guardedPostgresSequelize(
      `
        SELECT
          payload->>'prompt' AS prompt,
          COUNT(*)::int AS clicks
        FROM ai_doctor_metrics
        WHERE user_id = :userId
          AND event_type = 'prompt_click'
          AND created_at >= NOW() - (:days || ' days')::interval
          AND payload ? 'prompt'
        GROUP BY payload->>'prompt'
        ORDER BY clicks DESC
        LIMIT 5
      `,
      {
        replacements: { userId, days },
        type: QueryTypes.SELECT,
      }
    );

    return res.json({
      success: true,
      data: {
        periodDays: days,
        summary: summary || {},
        topPrompts,
      },
    });
  } catch (error) {
    console.error('[AI Doctor Metrics] Summary error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch AI Doctor metrics summary.' });
  }
});

// Helper function to validate command response
const validateCommandResponse = (result) => {
  const requiredFields = ['intent', 'confidence', 'response'];
  const missingFields = requiredFields.filter(field => !(field in result));
  
  if (missingFields.length > 0) {
    throw new Error(`Invalid response format. Missing fields: ${missingFields.join(', ')}`);
  }

  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    throw new Error('Invalid confidence value. Must be a number between 0 and 1');
  }

  // Accept 'error' and 'greeting' as valid intents along with the standard ones
  if (!['navigation', 'query', 'action', 'system', 'error', 'greeting'].includes(result.intent)) {
    // If intent is invalid, convert to query intent with a friendly response
    result.intent = 'query';
    result.confidence = 0.5;
  }

  return true;
};

// Process voice commands
router.post('/process-command', auth, async (req, res) => {
  try {
    const { command, currentPath = '/', userContext = {} } = req.body;
    const safeRoutes = userContext?.availableRoutes?.length
      ? userContext.availableRoutes
      : ['/', '/health-tracker', '/appointments', '/preventive-health', '/insurance', '/symptoms', '/bmi', '/medicine', '/ai-doctor', '/chat'];

    // Validate input
    if (!command) {
      return res.status(400).json({
        error: 'Invalid Request',
        details: 'No command provided. Please provide a voice command to process.'
      });
    }

    if (command.length > 500) {
      return res.status(400).json({
        error: 'Invalid Request',
        details: 'Command is too long. Please keep commands under 500 characters.'
      });
    }

    console.log('Processing AI voice command request');

    const systemPrompt = `You are an AI assistant that processes voice commands for a health tracking application.
Your task is to understand the user's intent and provide appropriate navigation or action responses.
You should respond in a clear, concise manner and always maintain the specified JSON format.

IMPORTANT: You must ONLY navigate to these specific available routes:

1. Dashboard (/):
   - Main application dashboard
   - Overview of all features
   - Quick access to main functions
   - Recent activity summary

2. Health Tracker (/health-tracker):
   - Health and fitness tracking
   - Activity metrics
   - Progress monitoring
   - Health analytics

3. Appointments (/appointments):
   - Schedule appointments
   - Manage bookings
   - View consultation history
   - Check availability

4. Preventive Health (/preventive-health):
   - Health prevention information
   - Recommendations
   - Preventive care guidelines
   - Health risk assessments

5. Insurance (/insurance):
   - Insurance coverage details
   - Health plans
   - Policy information
   - Claims management

6. Symptoms (/symptoms):
   - Symptom checker
   - Health symptom tracking
   - Condition monitoring
   - Health alerts

7. BMI Index (/bmi):
   - BMI calculator
   - Weight tracking
   - Body metrics
   - Health goals

8. Medicine (/medicine):
   - Medication management
   - Prescription tracking
   - Drug information
   - Pharmacy services

9. AI Doctor (/ai-doctor):
   - AI health consultation
   - Virtual health assistant
   - Health recommendations
   - Automated health checks

10. Chat with Doctor (/chat):
    - Live doctor consultation
    - Medical chat
    - Healthcare professional messaging
    - Online medical advice

Special Views and Actions:
1. Analytics View (in Health Tracker):
   - Switch to charts view
   - View detailed statistics
   - See progress graphs

2. Overview Mode:
   - Switch to summary view
   - Quick stats display
   - Basic metrics view

3. System Commands:
   - Help: Show available commands
   - Back: Return to previous page
   - Home: Go to main dashboard
   - Refresh: Update current view

Navigation Rules:
1. ONLY navigate to these exact paths: /, /health-tracker, /appointments, /preventive-health, /insurance, /symptoms, /bmi, /medicine, /ai-doctor, /chat
2. If a requested route is not in this list, respond with an error
3. Use exact paths as shown above
4. Do not make up or guess routes

Example Commands:
1. "take me to appointments" -> navigate to "/appointments"
2. "show me my health data" -> navigate to "/health-tracker"
3. "check my symptoms" -> navigate to "/symptoms"
4. "calculate my bmi" -> navigate to "/bmi"
5. "go back to home" -> navigate to "/"`;

    const userPrompt = `Process this voice command and determine the appropriate action.
Command: "${command}"
Current Location: ${currentPath}
User Context: ${JSON.stringify(userContext, null, 2)}

Available Routes: ${safeRoutes.join(', ')}

Respond with a JSON object that includes:
{
  "intent": "navigation" | "query" | "action" | "system",
  "confidence": 0.0-1.0,
  "targetPath": "/path" or null,
  "action": "specific action" or null,
  "parameters": {
    "tab": string | null,
    "view": string | null,
    "timeRange": string | null,
    "metric": string | null,
    "additionalParams": object | null
  },
  "response": "user-friendly response"
}

If navigation is requested to a route that's not in availableRoutes, set:
{
  "intent": "error",
  "confidence": 1.0,
  "targetPath": null,
  "action": null,
  "parameters": {},
  "response": "I'm sorry, but that page is not available in this application."
}

Examples:
1. Valid navigation:
{
  "intent": "navigation",
  "confidence": 0.9,
  "targetPath": "/health-tracker",
  "action": null,
  "parameters": {},
  "response": "Taking you to your health dashboard"
}

2. Invalid navigation:
{
  "intent": "error",
  "confidence": 1.0,
  "targetPath": null,
  "action": null,
  "parameters": {},
  "response": "I'm sorry, but that page is not available in this application."
}`;

    try {
      // Check if this is a greeting/conversational message (not a command)
      // Includes English, Hindi and common conversational patterns
      const greetingPatterns = /^(hi+|hello+|hey+|ayesha|isha|how are you|what'?s up|good\s*(morning|afternoon|evening)|namaste|namaskar|kaise ho|kya haal|aapka naam|tumhara naam|your name|who are you|kaun ho|kon ho)[\s\w,!?.]*$/i;
      const hindiConversational = /naam|kaun|kon|kaise|kya|aap|tum|mera|meri|batao|bolo|sunao/i;
      const isGreeting = greetingPatterns.test(command.trim()) || hindiConversational.test(command.trim());

      if (isGreeting) {
        // Detect if the command is in Hindi
        const isHindi = /[\u0900-\u097F]|naam|kaun|kon|kaise|kya|aap|tum|batao|bolo|sunao|haal|namaste/i.test(command);
        
        const hindiResponse = "नमस्ते! 👋 मैं आपकी वॉइस असिस्टेंट हूं। मैं आपको ऐप में navigate करने में मदद कर सकती हूं। आप 'appointments पर जाओ', 'health data दिखाओ', या 'symptoms check करो' बोल सकते हैं। क्या करना है आपको?";
        const englishResponse = "Hey there! 👋 I'm your voice assistant. I can help you navigate the app. Try saying 'go to appointments', 'show my health data', or 'check symptoms'. What would you like to do?";
        
        // Return a friendly response for greetings
        return res.json({
          intent: "query",
          confidence: 1.0,
          targetPath: null,
          action: null,
          parameters: {},
          response: isHindi ? hindiResponse : englishResponse,
          currentPath: currentPath,
          processed: true,
          timestamp: new Date().toISOString(),
          commandProcessed: command
        });
      }

      // Route through SIB (SOLE AI SOURCE)
      const sibResponse = await callSibQuery(
        `Process this voice command for a health app navigation:\nCommand: "${command}"\nCurrent Location: ${currentPath}\nAvailable Routes: ${safeRoutes.join(', ')}\n\nRespond with JSON: {"intent": "navigation|query|action|system|error", "confidence": 0.0-1.0, "targetPath": "/path or null", "action": "specific action or null", "parameters": {}, "response": "user-friendly response"}`,
        { userId: req.user?.id }
      );

      // Parse response from SIB
      let result;
      try {
        const answer = sibResponse.answer || sibResponse.response || sibResponse.chat_answer || '';
        // Try to extract JSON from response
        const jsonMatch = answer.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          // If no JSON, create a query response
          result = {
            intent: 'query',
            confidence: 0.7,
            targetPath: null,
            action: null,
            parameters: {},
            response: answer
          };
        }
      } catch (parseError) {
        console.error('Failed to parse SIB response:', sibResponse);
        result = {
          intent: 'query',
          confidence: 0.5,
          targetPath: null,
          action: null,
          parameters: {},
          response: sibResponse.answer || 'I understood your request but had trouble processing it.'
        };
      }

      // Validate the response format
      validateCommandResponse(result);

      // Enhance the response with additional context
      result.currentPath = currentPath;
      result.processed = true;
      result.timestamp = new Date().toISOString();
      result.commandProcessed = command;

      console.log('AI command processed successfully');
      res.json(result);

    } catch (aiError) {
      console.error('AI Service Error:', aiError);
      const status = aiError.statusCode || 500;
      res.status(status).json({
        error: 'AI Processing Error',
        details: aiError.message,
        command: command,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Command Processing Error:', error);
    
    // Determine the appropriate status code
    let statusCode = 500;
    if (error.message.includes('Invalid Request')) {
      statusCode = 400;
    } else if (error.message.includes('authentication')) {
      statusCode = 401;
    }

    // Send detailed error response
    res.status(statusCode).json({
      error: 'Command Processing Error',
      details: error.message,
      timestamp: new Date().toISOString(),
      command: req.body.command,
      path: req.body.currentPath
    });
  }
});

// Get command suggestions
router.get('/command-suggestions', auth, async (req, res) => {
  try {
    const { context } = req.query;

    const prompt = `Generate 5 natural voice command suggestions for a health tracking application.
Current context: ${context}

Focus on commands related to:
1. Navigation between pages
2. Checking health metrics
3. Managing appointments
4. Viewing analytics
5. Common user actions

The suggestions should be natural and conversational, like:
- "Show me my health dashboard"
- "How many steps have I taken today?"
- "Switch to the analytics view"
- "Check my upcoming appointments"
- "Go back to the main page"

Respond in JSON format:
{
  "suggestions": [
    {
      "command": "natural command",
      "description": "what it does",
      "category": "navigation|query|action|system"
    }
  ]
}`;

    // Route through SIB (SOLE AI SOURCE)
    const sibResponse = await callSibQuery(prompt, { userId: req.user?.id });

    try {
      const answer = sibResponse.answer || sibResponse.response || '';
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        res.json(suggestions);
      } else {
        // Return default suggestions if SIB doesn't return JSON
        res.json({
          suggestions: [
            { command: "Show me my health dashboard", description: "Navigate to main dashboard", category: "navigation" },
            { command: "Check my appointments", description: "View upcoming appointments", category: "navigation" },
            { command: "How many steps today?", description: "Check step count", category: "query" },
            { command: "Go to health tracker", description: "Navigate to health tracker", category: "navigation" },
            { command: "Talk to Dr. iSHA", description: "Start AI consultation", category: "action" }
          ]
        });
      }
    } catch (parseError) {
      console.error('Error parsing suggestions:', parseError);
      res.json({
        suggestions: [
          { command: "Show me my health dashboard", description: "Navigate to main dashboard", category: "navigation" },
          { command: "Check my appointments", description: "View upcoming appointments", category: "navigation" },
          { command: "How many steps today?", description: "Check step count", category: "query" }
        ]
      });
    }
  } catch (error) {
    console.error('Error generating suggestions:', error);
    const status = error.statusCode || 500;
    res.status(status).json({
      error: 'Failed to generate command suggestions',
      details: error.message
    });
  }
});

router.post('/analyze-image', auth, async (req, res) => {
  try {
    const { image, language } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Image analysis requires vision model - SIB can route to appropriate backend
    // For now, return a helpful message directing to SIB /ehr/upload for medical images
    return res.status(200).json({
      description: 'For medical image analysis, please use the EHR upload feature or describe your symptoms to Dr. iSHA for personalized guidance.',
      language: language || 'en',
      suggestion: 'You can upload medical documents through the EHR system or chat with Dr. iSHA about your health concerns.',
      sibEndpoint: '/ehr/upload'
    });
  } catch (error) {
    console.error('Image analysis error:', error.message);
    res.status(500).json({ 
      error: 'Failed to analyze image',
      details: error.message
    });
  }
});

// Medical Consultation endpoint using Groq AI for Dr. Mediczy AI
router.post('/working-medical-consult', (req,res,next) => {
  req.url='/consult';
  return medicalAIRouter.handle(req,res,next);
});
// Conversational Appointment Booking endpoint
router.post('/appointment-conversation', auth, async (req, res) => {
  try {
    const { query, stage = 'initial', selectedDoctorId, appointmentDetails, language = 'en' } = req.body;
    const userId = req.user.id;

    console.log(`🗣️ Appointment conversation - Stage: ${stage}`);

    // Stage 1: Detect if user wants appointment
    if (stage === 'initial') {
      const appointmentKeywords = ['appointment', 'book', 'schedule', 'consult', 'see doctor', 'meet doctor', 'doctor visit', 'talk to doctor', 'yes', 'yeah', 'sure', 'okay', 'ok'];
      const wantsAppointment = appointmentKeywords.some(keyword => query.toLowerCase().includes(keyword));
      
      if (wantsAppointment) {
        // Fetch top 4 available doctors (with fallback to mock data for testing)
        let availableDoctors = [];
        
        try {
          const doctorModel = await import('../models/doctor.model.intelligent.js');
          const doctors = await doctorModel.default.findAll({
            where: { 
              isActive: true,
              isVerified: true
            },
            attributes: ['id', 'firstName', 'lastName', 'specialization', 'experience', 'consultationTypes', 'languages'],
            limit: 4,
            order: [['createdAt', 'DESC']]
          });
          
          availableDoctors = doctors.map(doc => {
            const docData = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
            return {
              id: docData.id,
              name: `Dr. ${docData.firstName} ${docData.lastName}`,
              firstName: docData.firstName,
              lastName: docData.lastName,
              specialization: docData.specialization || 'General Physician',
              experience: docData.experience || 0,
              availableFor: {
                online: docData.consultationTypes?.online?.available || false,
                walkIn: docData.consultationTypes?.walkIn?.available || false,
                homeVisit: docData.consultationTypes?.homeVisit?.available || false
              },
              languages: docData.languages || ['English']
            };
          });
        } catch (error) {
          console.log('⚠️ Database unavailable, using mock doctors for testing');
        }
        
        // Fallback to mock data if no doctors found
        if (availableDoctors.length === 0) {
          availableDoctors = [
            {
              id: 'mock_1',
              name: 'Dr. Sarah Johnson',
              firstName: 'Sarah',
              lastName: 'Johnson',
              specialization: 'General Physician',
              experience: 10,
              availableFor: { online: true, walkIn: true, homeVisit: false },
              languages: ['English', 'Spanish']
            },
            {
              id: 'mock_2',
              name: 'Dr. Rajesh Kumar',
              firstName: 'Rajesh',
              lastName: 'Kumar',
              specialization: 'Cardiologist',
              experience: 15,
              availableFor: { online: true, walkIn: true, homeVisit: true },
              languages: ['English', 'Hindi', 'Bengali']
            },
            {
              id: 'mock_3',
              name: 'Dr. Maria Garcia',
              firstName: 'Maria',
              lastName: 'Garcia',
              specialization: 'Pediatrician',
              experience: 8,
              availableFor: { online: true, walkIn: true, homeVisit: true },
              languages: ['English', 'Spanish']
            },
            {
              id: 'mock_4',
              name: 'Dr. Ahmed Al-Rashid',
              firstName: 'Ahmed',
              lastName: 'Al-Rashid',
              specialization: 'Dermatologist',
              experience: 12,
              availableFor: { online: true, walkIn: true, homeVisit: false },
              languages: ['English', 'Arabic']
            }
          ];
        }

        const conversationalResponse = language === 'en'
          ? `Great! I'd be happy to help you book an appointment with a doctor online. 🩺\n\nI've found **${availableDoctors.length} top doctors** available for online consultations:\n\n${availableDoctors.map((doc, idx) => 
            `**${idx + 1}. ${doc.name}**\n   • Specialty: ${doc.specialization}\n   • Experience: ${doc.experience} years\n   • Rating: ⭐ ${doc.rating}/5\n   • Available for: ${[doc.availableFor.online && 'Online', doc.availableFor.walkIn && 'Walk-in', doc.availableFor.homeVisit && 'Home Visit'].filter(Boolean).join(', ')}\n`
          ).join('\n')}\n**Which doctor would you like to consult with?** Please select by number (1-${availableDoctors.length}) or name.`
          : `बढ़िया! मैं आपको डॉक्टर के साथ ऑनलाइन अपॉइंटमेंट बुक करने में मदद करूंगा। 🩺\n\nमुझे **${availableDoctors.length} शीर्ष डॉक्टर** ऑनलाइन परामर्श के लिए उपलब्ध मिले:\n\n${availableDoctors.map((doc, idx) => 
            `**${idx + 1}. ${doc.name}**\n   • विशेषज्ञता: ${doc.specialization}\n   • अनुभव: ${doc.experience} साल\n   • रेटिंग: ⭐ ${doc.rating}/5\n   • उपलब्ध: ${[doc.availableFor.online && 'ऑनलाइन', doc.availableFor.walkIn && 'वॉक-इन', doc.availableFor.homeVisit && 'होम विजिट'].filter(Boolean).join(', ')}\n`
          ).join('\n')}\n**आप किस डॉक्टर से परामर्श लेना चाहेंगे?** कृपया संख्या (1-${availableDoctors.length}) या नाम से चुनें।`;

        return res.json({
          status: 'success',
          stage: 'doctor_selection',
          response: conversationalResponse,
          doctors: availableDoctors,
          language
        });
      } else {
        return res.json({
          status: 'success',
          stage: 'initial',
          response: language === 'en' 
            ? "I can help you book an appointment with a doctor. Would you like to see available doctors for online consultation?"
            : "मैं आपको डॉक्टर के साथ अपॉइंटमेंट बुक करने में मदद कर सकता हूं। क्या आप ऑनलाइन परामर्श के लिए उपलब्ध डॉक्टरों को देखना चाहेंगे?",
          language
        });
      }
    }

    // Stage 2: User selects a doctor
    if (stage === 'doctor_selection' && selectedDoctorId) {
      let docData = null;
      
      // Try to fetch from database first
      try {
        const doctorModel = await import('../models/doctor.model.intelligent.js');
        const doctor = await doctorModel.default.findOne({
          where: { id: selectedDoctorId }
        });
        
        if (doctor) {
          docData = typeof doctor.toJSON === 'function' ? doctor.toJSON() : doctor;
        }
      } catch (error) {
        console.log('⚠️ Database unavailable, using mock doctor data');
      }
      
      // Fallback to mock data
      if (!docData) {
        const mockDoctors = {
          'mock_1': { id: 'mock_1', firstName: 'Sarah', lastName: 'Johnson', specialization: 'General Physician', experience: 10, consultationTypes: { online: { available: true }, walkIn: { available: true }, homeVisit: { available: false } } },
          'mock_2': { id: 'mock_2', firstName: 'Rajesh', lastName: 'Kumar', specialization: 'Cardiologist', experience: 15, consultationTypes: { online: { available: true }, walkIn: { available: true }, homeVisit: { available: true } } },
          'mock_3': { id: 'mock_3', firstName: 'Maria', lastName: 'Garcia', specialization: 'Pediatrician', experience: 8, consultationTypes: { online: { available: true }, walkIn: { available: true }, homeVisit: { available: true } } },
          'mock_4': { id: 'mock_4', firstName: 'Ahmed', lastName: 'Al-Rashid', specialization: 'Dermatologist', experience: 12, consultationTypes: { online: { available: true }, walkIn: { available: true }, homeVisit: { available: false } } }
        };
        docData = mockDoctors[selectedDoctorId];
      }

      if (!docData) {
        return res.status(404).json({
          status: 'error',
          message: 'Doctor not found'
        });
      }

      const doctorName = `Dr. ${docData.firstName} ${docData.lastName}`;
      
      const consultationTypes = [];
      if (docData.consultationTypes?.online?.available) consultationTypes.push('Online Video Call');
      if (docData.consultationTypes?.walkIn?.available) consultationTypes.push('Walk-in Clinic Visit');
      if (docData.consultationTypes?.homeVisit?.available) consultationTypes.push('Home Visit');

      const confirmationResponse = language === 'en'
        ? `Perfect choice! You've selected **${doctorName}** (${docData.specialization}).\n\n📋 **Appointment Details:**\n• **Doctor:** ${doctorName}\n• **Specialty:** ${docData.specialization}\n• **Experience:** ${docData.experience} years\n• **Consultation Types:** ${consultationTypes.join(', ')}\n\n**Please provide your preferred:**\n1️⃣ Date (e.g., December 5, 2025)\n2️⃣ Time (e.g., 2:00 PM)\n3️⃣ Consultation Type (Online/Walk-in/Home Visit)\n\nExample: "December 5 at 2 PM, Online consultation"`
        : `बढ़िया चुनाव! आपने **${doctorName}** (${docData.specialization}) को चुना है।\n\n📋 **अपॉइंटमेंट विवरण:**\n• **डॉक्टर:** ${doctorName}\n• **विशेषज्ञता:** ${docData.specialization}\n• **अनुभव:** ${docData.experience} साल\n• **परामर्श प्रकार:** ${consultationTypes.join(', ')}\n\n**कृपया अपनी पसंदीदा जानकारी दें:**\n1️⃣ तारीख (जैसे, 5 दिसंबर, 2025)\n2️⃣ समय (जैसे, दोपहर 2 बजे)\n3️⃣ परामर्श प्रकार (ऑनलाइन/वॉक-इन/होम विजिट)\n\nउदाहरण: "5 दिसंबर दोपहर 2 बजे, ऑनलाइन परामर्श"`;

      return res.json({
        status: 'success',
        stage: 'datetime_selection',
        response: confirmationResponse,
        selectedDoctor: {
          id: docData.id,
          name: doctorName,
          specialization: docData.specialization,
          consultationTypes
        },
        language
      });
    }

    // Stage 3: User provides date/time/type
    if (stage === 'datetime_selection' && appointmentDetails) {
      const { date, time, type, doctorId, doctorName } = appointmentDetails;
      
      const finalConfirmation = language === 'en'
        ? `📅 **Appointment Confirmation**\n\nPlease review your appointment details:\n\n• **Doctor:** ${doctorName}\n• **Date:** ${date}\n• **Time:** ${time}\n• **Type:** ${type}\n\n**Is this correct?** Reply with:\n✅ "Confirm" to book the appointment\n✏️ "Change [detail]" to modify (e.g., "Change time to 3 PM")\n❌ "Cancel" to start over`
        : `📅 **अपॉइंटमेंट पुष्टि**\n\nकृपया अपने अपॉइंटमेंट विवरण की समीक्षा करें:\n\n• **डॉक्टर:** ${doctorName}\n• **तारीख:** ${date}\n• **समय:** ${time}\n• **प्रकार:** ${type}\n\n**क्या यह सही है?** जवाब दें:\n✅ "पुष्टि करें" अपॉइंटमेंट बुक करने के लिए\n✏️ "बदलें [विवरण]" संशोधित करने के लिए\n❌ "रद्द करें" फिर से शुरू करने के लिए`;

      return res.json({
        status: 'success',
        stage: 'final_confirmation',
        response: finalConfirmation,
        appointmentDetails: {
          doctorId,
          doctorName,
          date,
          time,
          type
        },
        language
      });
    }

    // Stage 4: Final confirmation or modification
    if (stage === 'final_confirmation') {
      const lowerQuery = query.toLowerCase();
      
      if (lowerQuery.includes('confirm') || lowerQuery.includes('yes') || lowerQuery.includes('book')) {
        // Book the appointment
        const bookingResponse = language === 'en'
          ? `🎉 **Appointment Booked Successfully!**\n\nYour appointment has been confirmed:\n• **Confirmation ID:** #APT${Date.now()}\n• **Doctor:** ${appointmentDetails.doctorName}\n• **Date:** ${appointmentDetails.date}\n• **Time:** ${appointmentDetails.time}\n• **Type:** ${appointmentDetails.type}\n\n📧 You'll receive a confirmation email shortly.\n📱 You can view your appointment in the "My Appointments" section.\n\nIs there anything else I can help you with?`
          : `🎉 **अपॉइंटमेंट सफलतापूर्वक बुक हो गया!**\n\nआपका अपॉइंटमेंट पुष्टि हो गया है:\n• **पुष्टि ID:** #APT${Date.now()}\n• **डॉक्टर:** ${appointmentDetails.doctorName}\n• **तारीख:** ${appointmentDetails.date}\n• **समय:** ${appointmentDetails.time}\n• **प्रकार:** ${appointmentDetails.type}\n\n📧 आपको जल्द ही पुष्टि ईमेल प्राप्त होगा।\n📱 आप "मेरे अपॉइंटमेंट" अनुभाग में अपना अपॉइंटमेंट देख सकते हैं।\n\nक्या मैं आपकी कोई और सहायता कर सकता हूं?`;

        return res.json({
          status: 'success',
          stage: 'completed',
          response: bookingResponse,
          appointmentBooked: true,
          confirmationId: `APT${Date.now()}`,
          language
        });
      } else if (lowerQuery.includes('change') || lowerQuery.includes('modify') || lowerQuery.includes('बदलें')) {
        const modificationResponse = language === 'en'
          ? `No problem! What would you like to change?\n\n• Type "change date" for a different date\n• Type "change time" for a different time\n• Type "change type" for a different consultation type\n\nOr simply tell me: "Change time to 3 PM" or "Change to walk-in visit"`
          : `कोई समस्या नहीं! आप क्या बदलना चाहेंगे?\n\n• अलग तारीख के लिए "तारीख बदलें" टाइप करें\n• अलग समय के लिए "समय बदलें" टाइप करें\n• अलग परामर्श प्रकार के लिए "प्रकार बदलें" टाइप करें\n\nया बस मुझे बताएं: "समय 3 बजे बदलें" या "वॉक-इन विजिट में बदलें"`;

        return res.json({
          status: 'success',
          stage: 'modification',
          response: modificationResponse,
          currentDetails: appointmentDetails,
          language
        });
      } else if (lowerQuery.includes('cancel') || lowerQuery.includes('रद्द')) {
        return res.json({
          status: 'success',
          stage: 'initial',
          response: language === 'en'
            ? "Appointment booking cancelled. Would you like to start over or can I help you with something else?"
            : "अपॉइंटमेंट बुकिंग रद्द कर दी गई। क्या आप फिर से शुरू करना चाहेंगे या मैं आपकी किसी और चीज़ में मदद कर सकता हूं?",
          language
        });
      }
    }

    // Stage 5: Handle modifications
    if (stage === 'modification' && appointmentDetails) {
      // Parse modification request
      const lowerQuery = query.toLowerCase();
      let updatedDetails = { ...appointmentDetails };
      
      // Extract time changes
      const timeMatch = query.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)|(\d{1,2}\s*(?:AM|PM|am|pm))/i);
      if (timeMatch) {
        updatedDetails.time = timeMatch[0];
      }
      
      // Extract date changes
      const dateMatch = query.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}/i);
      if (dateMatch) {
        updatedDetails.date = dateMatch[0];
      }
      
      // Extract consultation type changes
      if (lowerQuery.includes('online') || lowerQuery.includes('ऑनलाइन')) {
        updatedDetails.type = 'Online';
      } else if (lowerQuery.includes('walk') || lowerQuery.includes('वॉक')) {
        updatedDetails.type = 'Walk-in';
      } else if (lowerQuery.includes('home') || lowerQuery.includes('होम')) {
        updatedDetails.type = 'Home Visit';
      }

      const updateConfirmation = language === 'en'
        ? `✅ **Updated Appointment Details:**\n\n• **Doctor:** ${updatedDetails.doctorName}\n• **Date:** ${updatedDetails.date}\n• **Time:** ${updatedDetails.time}\n• **Type:** ${updatedDetails.type}\n\n**Is this correct now?** Reply "Confirm" to book or "Change [detail]" to modify further.`
        : `✅ **अपडेट किए गए अपॉइंटमेंट विवरण:**\n\n• **डॉक्टर:** ${updatedDetails.doctorName}\n• **तारीख:** ${updatedDetails.date}\n• **समय:** ${updatedDetails.time}\n• **प्रकार:** ${updatedDetails.type}\n\n**क्या अब यह सही है?** "पुष्टि करें" का जवाब दें या आगे संशोधित करने के लिए "बदलें [विवरण]"।`;

      return res.json({
        status: 'success',
        stage: 'final_confirmation',
        response: updateConfirmation,
        appointmentDetails: updatedDetails,
        language
      });
    }

    // Default fallback
    return res.json({
      status: 'success',
      stage: 'initial',
      response: language === 'en'
        ? "I can help you book an appointment with a doctor. Would you like to see available doctors?"
        : "मैं आपको डॉक्टर के साथ अपॉइंटमेंट बुक करने में मदद कर सकता हूं। क्या आप उपलब्ध डॉक्टरों को देखना चाहेंगे?",
      language
    });

  } catch (error) {
    console.error('Appointment conversation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process appointment conversation',
      details: error.message
    });
  }
});

// Translation endpoint for multilingual support
router.post('/translate', auth, async (req, res) => {
  try {
    const { text, targetLanguage, context = 'general' } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({
        status: 'error',
        message: 'Text and target language are required'
      });
    }

    console.log(`🌐 Translation request: ${targetLanguage} (${context})`);

    const translationPrompt = context === 'medical'
      ? `You are a medical translator. Translate the following medical text to ${targetLanguage} while preserving medical terminology, emojis, and markdown formatting. Keep the translation accurate and easy to understand for patients.\n\nText to translate:\n${text}`
      : `Translate the following text to ${targetLanguage} while preserving emojis and formatting.\n\nText to translate:\n${text}`;

    const result = await llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator specializing in medical and healthcare communications.'
        },
        {
          role: 'user',
          content: translationPrompt
        }
      ],
      temperature: 0.3,
      maxTokens: 2000
    });

    const translatedText = result.content || text;

    res.json({
      status: 'success',
      translatedText,
      originalText: text,
      targetLanguage,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Translation error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({
      status: 'error',
      message: 'Translation failed',
      translatedText: req.body.text // Return original text as fallback
    });
  }
});

// ElevenLabs Text-to-Speech endpoint
router.post('/text-to-speech', auth, async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({
        status: 'error',
        message: 'Text is required'
      });
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const VOICE_ID = voiceId || process.env.ELEVENLABS_VOICE_ID || 'pjcYQlDFKMbcOUp6F5GD'; // Custom Dr. iSHA voice

    if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === 'your_elevenlabs_api_key_here') {
      // Fallback: Return a flag to use browser TTS
      console.log('🔊 ElevenLabs API key not configured, falling back to browser TTS');
      return res.json({
        status: 'fallback',
        message: 'Using browser TTS',
        text: text
      });
    }

    console.log(`🔊 ElevenLabs TTS request length=${text.length}`);

    // Clean text for TTS (remove markdown, emojis, etc.)
    const cleanText = text
      .replace(/[#*_~`]/g, '') // Remove markdown
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/\n{2,}/g, '. ') // Convert double newlines to pauses
      .replace(/\n/g, ' ') // Single newlines to spaces
      .trim()
      .substring(0, 5000); // ElevenLabs has a character limit

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('ElevenLabs API error:', errorData);
      // Fallback to browser TTS
      return res.json({
        status: 'fallback',
        message: 'ElevenLabs error, using browser TTS',
        text: text
      });
    }

    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();
    
    // Send audio as base64
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    res.json({
      status: 'success',
      audio: base64Audio,
      format: 'audio/mpeg'
    });

  } catch (error) {
    console.error('TTS error:', error);
    // Fallback to browser TTS
    res.json({
      status: 'fallback',
      message: 'TTS error, using browser TTS',
      text: req.body.text
    });
  }
});

// Get available ElevenLabs voices
router.get('/voices', auth, async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

    if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === 'your_elevenlabs_api_key_here') {
      return res.json({
        status: 'success',
        voices: [
          { id: 'browser', name: 'Browser Default', description: 'Uses browser built-in TTS' }
        ]
      });
    }

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();
    
    res.json({
      status: 'success',
      voices: data.voices.map(v => ({
        id: v.voice_id,
        name: v.name,
        description: v.description || '',
        preview_url: v.preview_url
      }))
    });

  } catch (error) {
    console.error('Get voices error:', error);
    res.json({
      status: 'success',
      voices: [
        { id: 'browser', name: 'Browser Default', description: 'Uses browser built-in TTS' }
      ]
    });
  }
});

// ====================
// SIB FEEDBACK SYSTEM
// ====================

const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';

/**
 * Submit detailed feedback for SIB response
 * POST /api/ai/feedback
 * Body: { query, response, rating, feedback_text, feedback_type, category, conversation_id }
 */
router.post('/feedback', auth, async (req, res) => {
  try {
    const { query, response, rating, feedback_text, feedback_type, category, conversation_id } = req.body;
    
    if (!query || !response) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'query and response are required' 
      });
    }
    
    const sibResponse = await fetch(`${SIB_URL}/api/feedback/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        response,
        rating: rating || null,
        feedback_text: feedback_text || null,
        feedback_type: feedback_type || 'general',
        user_id: req.user?.id?.toString() || null,
        patient_id: req.body.patient_id || null,
        category: category || 'general',
        conversation_id: conversation_id || null
      })
    });
    
    if (!sibResponse.ok) {
      throw new Error(`SIB feedback API error: ${sibResponse.status}`);
    }
    
    const result = await sibResponse.json();
    res.json({ status: 'success', ...result });
    
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to submit feedback' 
    });
  }
});

/**
 * Submit quick thumbs up/down feedback
 * POST /api/ai/feedback/quick
 * Body: { query, response, is_positive, conversation_id }
 */
router.post('/feedback/quick', auth, async (req, res) => {
  try {
    const { query, response, is_positive, conversation_id } = req.body;
    
    if (!query || !response || typeof is_positive !== 'boolean') {
      return res.status(400).json({ 
        status: 'error', 
        message: 'query, response, and is_positive (boolean) are required' 
      });
    }
    
    const sibResponse = await fetch(`${SIB_URL}/api/feedback/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        response,
        is_positive,
        user_id: req.user?.id?.toString() || null,
        conversation_id: conversation_id || null
      })
    });
    
    if (!sibResponse.ok) {
      throw new Error(`SIB quick feedback API error: ${sibResponse.status}`);
    }
    
    const result = await sibResponse.json();
    res.json({ status: 'success', ...result });
    
  } catch (error) {
    console.error('Quick feedback error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to submit quick feedback' 
    });
  }
});

/**
 * Submit correction feedback for wrong responses
 * POST /api/ai/feedback/correction
 * Body: { query, original_response, corrected_response, correction_reason, conversation_id }
 */
router.post('/feedback/correction', auth, async (req, res) => {
  try {
    const { query, original_response, corrected_response, correction_reason, conversation_id } = req.body;
    
    if (!query || !original_response || !corrected_response) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'query, original_response, and corrected_response are required' 
      });
    }
    
    const sibResponse = await fetch(`${SIB_URL}/api/feedback/correction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        original_response,
        corrected_response,
        correction_reason: correction_reason || null,
        user_id: req.user?.id?.toString() || null,
        conversation_id: conversation_id || null
      })
    });
    
    if (!sibResponse.ok) {
      throw new Error(`SIB correction API error: ${sibResponse.status}`);
    }
    
    const result = await sibResponse.json();
    res.json({ status: 'success', ...result });
    
  } catch (error) {
    console.error('Correction feedback error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to submit correction' 
    });
  }
});

/**
 * Get feedback statistics
 * GET /api/ai/feedback/stats
 */
router.get('/feedback/stats', auth, async (req, res) => {
  try {
    const sibResponse = await fetch(`${SIB_URL}/api/feedback/stats`);
    
    if (!sibResponse.ok) {
      throw new Error(`SIB stats API error: ${sibResponse.status}`);
    }
    
    const result = await sibResponse.json();
    res.json({ status: 'success', ...result });
    
  } catch (error) {
    console.error('Feedback stats error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get feedback stats' 
    });
  }
});

/**
 * Get learning insights and stats
 * GET /api/ai/learning/stats
 */
router.get('/learning/stats', auth, async (req, res) => {
  try {
    const sibResponse = await fetch(`${SIB_URL}/api/feedback/insights/active`);
    
    if (!sibResponse.ok) {
      throw new Error(`SIB insights API error: ${sibResponse.status}`);
    }
    
    const insights = await sibResponse.json();
    
    // Also get quality trends
    const trendsResponse = await fetch(`${SIB_URL}/api/feedback/quality/trends`);
    const trends = trendsResponse.ok ? await trendsResponse.json() : { trends: [] };
    
    res.json({ 
      status: 'success', 
      insights: insights.insights || [],
      quality_trends: trends.trends || [],
      total_insights: insights.total || 0
    });
    
  } catch (error) {
    console.error('Learning stats error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to get learning stats' 
    });
  }
});


const ADMIN_AI_STATS_MODULES = new Set(["scribe", "vision", "brain", "deeptech", "cdss", "alerts"]);

router.get("/:module/stats", auth, async (req, res) => {
  const module = String(req.params.module || "").toLowerCase();
  if (!ADMIN_AI_STATS_MODULES.has(module)) {
    return res.status(404).json({ status: "error", message: "AI module not found" });
  }

  res.json({
    success: true,
    module,
    requests: 0,
    avgLatencyMs: 0,
    errors: 0,
    status: "ready",
  });
});

export default router;
