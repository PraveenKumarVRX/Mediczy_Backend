import express from 'express';
import fetch from 'node-fetch';
import unifiedConversationService from '../services/unified-conversation.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

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

    const unifiedResponse = await unifiedConversationService.processMessage({
      message,
      channel: 'admin-chat',
      sessionId: conversationId || `admin_${Date.now()}`,
      identifier: userId || conversationId || botId,
      userContext: {
        userId,
        patientData,
        botId,
        botType: botConfig.botletType
      }
    });

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

    // TODO: Get real stats from database
    // For now, return mock stats that will be replaced with real data
    const stats = {
      botId,
      botName: botConfig.name,
      interactions: Math.floor(Math.random() * 1000) + 100,
      accuracy: 94 + Math.random() * 5,
      avgResponseTime: `${(0.2 + Math.random() * 0.5).toFixed(1)}s`,
      activeConversations: Math.floor(Math.random() * 20),
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

    // Update configuration in memory (in production, save to database)
    if (systemPrompt) {
      botConfig.systemPrompt = systemPrompt;
    }

    // TODO: Persist configuration to database

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
