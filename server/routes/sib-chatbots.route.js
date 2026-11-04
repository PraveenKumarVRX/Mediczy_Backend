import { sibFetch as fetch } from '../services/sib-client.js';
import express from 'express';

import unifiedConversationService from '../services/unified-conversation.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';

const router = express.Router();
router.use(authUser, requireRole(['admin', 'team']));
router.use((req, res, next) => {
  if (req.body?.patientData || req.body?.patientInfo || req.body?.patientId || req.body?.userId) {
    return res.status(403).json({ success: false, error: 'Use the authorized patient workflow for personal data and actions' });
  }
  next();
});

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sib_chatbot_configs (
      bot_id TEXT PRIMARY KEY,
      system_prompt TEXT,
      status TEXT DEFAULT 'active',
      channels JSONB DEFAULT '[]'::jsonb,
      settings JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sib_chatbot_interactions (
      id BIGSERIAL PRIMARY KEY,
      bot_id TEXT NOT NULL,
      session_id TEXT,
      user_id TEXT,
      response_time_ms INTEGER,
      provider TEXT,
      intent TEXT,
      success BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sib_bot_interactions_bot_id ON sib_chatbot_interactions(bot_id);
    CREATE INDEX IF NOT EXISTS idx_sib_bot_interactions_created ON sib_chatbot_interactions(created_at DESC);
  `);
}

ensureTables().catch(err => console.warn('[sib-chatbots] table init error:', err.message));

// Compose admin auth middleware
const authAdmin = [authUser, requireRole('admin')];

// SIB FastAPI base URL
const SIB_API_URL = process.env.SIB_API_URL || 'http://localhost:8001';

/**
 * SIB Chatbots API
 * Connects admin dashboard chatbots to SIB FastAPI botlets
 */

// ==================== Chatbot Types ====================

const CHATBOT_TYPES = {
  'health-bot': {
    id: 'health-bot',
    name: 'Health Assistant',
    description: 'AI-powered health consultation bot powered by Dr. iSHA',
    sibEndpoint: '/chat',
    botletType: 'chat',
    capabilities: ['general_health_queries', 'symptom_analysis', 'health_advice', 'medication_info'],
    systemPrompt: `You are Dr. iSHA's Health Assistant, a warm and caring AI medical helper.
Your role is to:
- Answer general health questions with empathy
- Provide health information and wellness tips
- Guide users to appropriate medical resources
- Be reassuring but always recommend professional consultation for serious concerns`
  },
  'appointment-bot': {
    id: 'appointment-bot',
    name: 'Appointment Manager',
    description: 'Automated appointment booking and reminders',
    sibEndpoint: '/task',
    botletType: 'task',
    capabilities: ['appointment_booking', 'reminders', 'rescheduling', 'cancellation'],
    systemPrompt: `You are Dr. iSHA's Appointment Manager, a helpful scheduling assistant.
Your role is to:
- Help users book, reschedule, or cancel appointments
- Send appointment reminders
- Check doctor availability
- Manage follow-up scheduling
- Be efficient, clear, and helpful`
  },
  'emergency-bot': {
    id: 'emergency-bot',
    name: 'Emergency Dispatcher',
    description: 'Emergency response and triage coordination',
    sibEndpoint: '/triage',
    botletType: 'emergency',
    capabilities: ['emergency_triage', 'urgency_assessment', 'emergency_guidance', 'ambulance_dispatch'],
    systemPrompt: `You are Dr. iSHA's Emergency Triage System, a critical care coordinator.
Your role is to:
- Quickly assess emergency situations
- Provide immediate safety guidance
- Coordinate with emergency services
- Never delay - prioritize patient safety
- Use triage colors (RED/ORANGE/YELLOW/GREEN/BLUE) for urgency`
  }
};

// ==================== Helper Functions ====================

async function callSIB(endpoint, data, timeout = 30000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${SIB_API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SIB API error: ${response.status} - ${error}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('SIB API request timeout');
    }
    throw error;
  }
}

// ==================== Routes ====================

/**
 * @route   GET /api/sib-chatbots/list
 * @desc    Get list of available chatbots with their capabilities
 * @access  Admin/Team
 */
router.get('/list', async (req, res) => {
  try {
    const bots = Object.values(CHATBOT_TYPES).map(bot => ({
      id: bot.id,
      name: bot.name,
      description: bot.description,
      botletType: bot.botletType,
      capabilities: bot.capabilities,
      status: 'active'
    }));

    res.json({
      success: true,
      chatbots: bots
    });
  } catch (error) {
    console.error('Error listing chatbots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/sib-chatbots/health
 * @desc    Check SIB and chatbot system health
 * @access  Admin/Team
 */
router.get('/health', async (req, res) => {
  try {
    // Check SIB health
    const sibHealth = await fetch(`${SIB_API_URL}/health`);
    const sibStatus = await sibHealth.json();

    res.json({
      success: true,
      sib: {
        status: sibStatus.status || 'unknown',
        uptime: sibStatus.uptime_seconds,
        requestCount: sibStatus.request_count
      },
      chatbots: Object.keys(CHATBOT_TYPES).map(id => ({
        id,
        status: 'active'
      }))
    });
  } catch (error) {
    console.error('SIB health check failed:', error);
    res.json({
      success: false,
      sib: {
        status: 'offline',
        error: error.message
      },
      chatbots: Object.keys(CHATBOT_TYPES).map(id => ({
        id,
        status: 'degraded'
      }))
    });
  }
});

/**
 * @route   POST /api/sib-chatbots/:botId/chat
 * @desc    Send message to specific chatbot
 * @access  Admin/Team
 */
router.post('/:botId/chat', async (req, res) => {
  try {
    const { botId } = req.params;
    const { message, conversationId, userId, patientData } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const botConfig = CHATBOT_TYPES[botId];
    if (!botConfig) {
      return res.status(404).json({
        success: false,
        error: `Chatbot ${botId} not found`
      });
    }

    const sessionId = `admin:${req.userRole}:${req.user.id}:${String(conversationId || 'default').slice(0, 100)}`;
    const t0 = Date.now();
    const unifiedResponse = await unifiedConversationService.processMessage({
      message,
      channel: 'admin-chat',
      sessionId,
      identifier: `admin-chat:${req.user.id}`,
      userContext: {
        userId:req.user.id,
        callerRole:req.userRole,
        patientData,
        botId,
        botType: botConfig.botletType
      }
    });
    const responseTimeMs = Date.now() - t0;

    pool.query(
      `INSERT INTO sib_chatbot_interactions (bot_id, session_id, user_id, response_time_ms, provider, intent, success)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [botId, sessionId, userId || null, responseTimeMs, unifiedResponse.provider || null, unifiedResponse.intentType || null]
    ).catch(() => {});

    // Format response
    res.json({
      success: true,
      botId,
      botName: botConfig.name,
      response: {
        message: unifiedResponse.response || 'No response from AI',
        provider: unifiedResponse.provider || 'unified',
        latency: unifiedResponse.latency_ms,
        urgency: unifiedResponse.urgency_level,
        triageColor: unifiedResponse.triage_color,
        actions: unifiedResponse.actions || unifiedResponse.recommended_actions,
        metadata: {
          model: unifiedResponse.model,
          contextUsed: unifiedResponse.context_used,
          riskAssessment: unifiedResponse.risk_assessment,
          safetyAlerts: unifiedResponse.safety_alerts,
          intentType: unifiedResponse.intentType,
          action: unifiedResponse.action,
          redirectUrl: unifiedResponse.redirectUrl
        }
      },
      conversationId: unifiedResponse.sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    pool.query(
      `INSERT INTO sib_chatbot_interactions (bot_id, session_id, success) VALUES ($1, $2, FALSE)`,
      [req.params.botId, req.body?.conversationId || null]
    ).catch(() => {});
    console.error(`Chatbot ${req.params.botId} error:`, error);
    
    // Provide fallback response for emergency bot
    if (req.params.botId === 'emergency-bot' && error.message.includes('timeout')) {
      return res.json({
        success: true,
        botId: 'emergency-bot',
        botName: 'Emergency Dispatcher',
        response: {
          message: '🚨 EMERGENCY NOTICE: The AI system is temporarily unavailable. For emergencies, please call 108 (ambulance) or 112 immediately. Do not wait for this system.',
          urgency: 'HIGH',
          triageColor: 'RED',
          actions: ['Call 108 immediately', 'Go to nearest emergency room', 'Do not delay']
        },
        fallback: true
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
      botId: req.params.botId
    });
  }
});

/**
 * @route   POST /api/sib-chatbots/health-bot/analyze-symptoms
 * @desc    Symptom analysis via Health Assistant bot
 * @access  Admin/Team
 */
router.post('/health-bot/analyze-symptoms', async (req, res) => {
  try {
    const { symptoms, patientInfo, conversationId } = req.body;

    if (!symptoms) {
      return res.status(400).json({
        success: false,
        error: 'Symptoms are required'
      });
    }

    const response = await callSIB('/query', {
      question: `Analyze these symptoms: ${symptoms}`,
      patient_data: patientInfo,
      include_context: true
    });

    res.json({
      success: true,
      analysis: {
        answer: response.answer,
        possibleConditions: response.conditions || [],
        recommendations: response.recommendations || [],
        urgency: response.urgency || 'moderate',
        latency: response.latency_ms
      },
      conversationId
    });

  } catch (error) {
    console.error('Symptom analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/sib-chatbots/emergency-bot/triage
 * @desc    Emergency triage assessment
 * @access  Admin/Team
 */
router.post('/emergency-bot/triage', async (req, res) => {
  try {
    const { symptoms, vitalSigns, patientInfo, location } = req.body;

    if (!symptoms) {
      return res.status(400).json({
        success: false,
        error: 'Symptoms are required for triage'
      });
    }

    const response = await callSIB('/triage', {
      symptoms,
      vital_signs: vitalSigns,
      patient_info: patientInfo,
      location
    });

    res.json({
      success: true,
      triage: {
        urgencyLevel: response.urgency_level,
        triageColor: response.triage_color,
        assessment: response.assessment,
        immediateActions: response.immediate_actions,
        recommendations: response.recommendations,
        estimatedResponseTime: response.response_time,
        shouldCallEmergency: response.call_emergency || false
      }
    });

  } catch (error) {
    console.error('Emergency triage error:', error);
    
    // Always provide emergency guidance even on error
    res.json({
      success: false,
      error: error.message,
      fallbackGuidance: {
        message: 'System temporarily unavailable. For emergencies, call 108 or 112 immediately.',
        urgencyLevel: 'UNKNOWN',
        immediateActions: ['Call 108 for ambulance', 'Call 112 for emergency', 'Go to nearest hospital']
      }
    });
  }
});

/**
 * @route   POST /api/sib-chatbots/appointment-bot/book
 * @desc    Book appointment via Appointment Manager bot
 * @access  Admin/Team
 */
router.post('/appointment-bot/book', async (req, res) => {
  try {
    const { 
      patientId, 
      doctorId, 
      preferredDate, 
      preferredTime, 
      reason, 
      appointmentType 
    } = req.body;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: 'Patient ID is required'
      });
    }

    // Create task in SIB for appointment booking
    const taskResponse = await callSIB('/task/create', {
      title: `Book appointment: ${reason || 'General consultation'}`,
      description: `Appointment request for patient ${patientId}`,
      patient_id: patientId,
      task_type: 'appointment',
      priority: 'medium',
      metadata: {
        doctor_id: doctorId,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        appointment_type: appointmentType || 'consultation'
      }
    });

    res.json({
      success: true,
      task: taskResponse,
      message: 'Appointment booking request created'
    });

  } catch (error) {
    console.error('Appointment booking error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/sib-chatbots/:botId/stats
 * @desc    Get chatbot statistics
 * @access  Admin
 */
router.get('/:botId/stats', authAdmin, async (req, res) => {
  try {
    const { botId } = req.params;
    const botConfig = CHATBOT_TYPES[botId];

    if (!botConfig) {
      return res.status(404).json({
        success: false,
        error: `Chatbot ${botId} not found`
      });
    }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS interactions,
         COUNT(*) FILTER (WHERE success = TRUE)::int AS successes,
         COUNT(DISTINCT session_id) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS active_conversations,
         ROUND(AVG(response_time_ms)) AS avg_response_time_ms
       FROM sib_chatbot_interactions
       WHERE bot_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [botId]
    );
    const row = rows[0];
    const stats = {
      botId,
      botName: botConfig.name,
      interactions: row.interactions,
      accuracy: row.interactions > 0
        ? parseFloat(((row.successes / row.interactions) * 100).toFixed(1))
        : null,
      avgResponseTime: row.avg_response_time_ms
        ? `${(row.avg_response_time_ms / 1000).toFixed(1)}s`
        : null,
      activeConversations: row.active_conversations,
      period: 'last_24h'
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error(`Get ${req.params.botId} stats error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/sib-chatbots/:botId/config
 * @desc    Update chatbot configuration
 * @access  Admin
 */
router.put('/:botId/config', authAdmin, async (req, res) => {
  try {
    const { botId } = req.params;
    const { status, systemPrompt, channels, settings } = req.body;

    const botConfig = CHATBOT_TYPES[botId];
    if (!botConfig) {
      return res.status(404).json({
        success: false,
        error: `Chatbot ${botId} not found`
      });
    }

    if (systemPrompt) {
      botConfig.systemPrompt = systemPrompt;
    }

    await pool.query(
      `INSERT INTO sib_chatbot_configs (bot_id, system_prompt, status, channels, settings, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
       ON CONFLICT (bot_id) DO UPDATE SET
         system_prompt = COALESCE(EXCLUDED.system_prompt, sib_chatbot_configs.system_prompt),
         status        = COALESCE(EXCLUDED.status, sib_chatbot_configs.status),
         channels      = COALESCE(EXCLUDED.channels, sib_chatbot_configs.channels),
         settings      = COALESCE(EXCLUDED.settings, sib_chatbot_configs.settings),
         updated_at    = NOW()`,
      [
        botId,
        systemPrompt || null,
        status || 'active',
        JSON.stringify(channels || []),
        JSON.stringify(settings || {})
      ]
    );

    res.json({
      success: true,
      message: `Configuration updated for ${botConfig.name}`,
      config: {
        id: botId,
        name: botConfig.name,
        status: status || 'active',
        channels: channels || [],
        settings
      }
    });

  } catch (error) {
    console.error(`Update ${req.params.botId} config error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
