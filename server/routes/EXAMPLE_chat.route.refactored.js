/**
 * EXAMPLE: Chat Route Refactored for SIB Unified Task Router
 * ===========================================================
 * 
 * This is an example of how to refactor existing routes to use SIB
 * 
 * Before: Routes handled chat directly with database operations
 * After: All chat operations route through SIB unified task router
 * 
 * Benefits:
 * ✅ Medical NLP (MedSpaCy) processing for all messages
 * ✅ Automatic context from PostgreSQL
 * ✅ Emergency detection and safety filtering
 * ✅ Audit logging
 * ✅ Risk assessment
 */

import express from 'express';
import { getSIBTaskProxy } from '../services/sib-task-proxy.js';
import { verifyAuth } from '../middleware/auth.middleware.js';
import { sibTaskRouterMiddleware, sibHealthCheck } from '../middleware/sib-task-router.middleware.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Apply SIB middleware to all routes in this file
router.use(sibTaskRouterMiddleware);

/**
 * POST /api/chat
 * 
 * Send message to Dr. iSHA (Dr. iSHA AI Doctor Chat)
 * 
 * Before: Direct medicalAI service call with Groq
 * After: Through SIB unified task router with full medical NLP pipeline
 * 
 * Request:
 * {
 *   "message": "I have severe chest pain",
 *   "includeRisk": true,
 *   "includeRetrieval": true,
 *   "sessionId": "session_123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "task_type": "chat",
 *   "status": "completed",
 *   "data": {
 *     "response": "Dr. iSHA's response...",
 *     "entities": [{"entity": "chest pain", "type": "PROBLEM"}],
 *     "provider": "groq",
 *     "latency": { "total": 1234, "llm": 1200, "database": 20 }
 *   }
 * }
 */
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { message, includeRisk = false, includeRetrieval = true, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info('💬 Chat request', {
      userId: req.user.id,
      patientId: req.user.patientId,
      messageLength: message.length,
      includeRisk
    });

    // Execute chat through SIB unified task router
    const result = await req.sib.chat(
      message,
      req.user.id,           // userId
      req.user.patientId,    // patientId
      {
        includeRisk,
        includeRetrieval,
        sessionId,
        conversationContext: req.body.context  // Optional: previous context
      }
    );

    // Log response quality
    if (result.success) {
      logger.info('✅ Chat response generated', {
        responseLength: result.data?.response?.length,
        entitiesFound: result.data?.entities?.length || 0,
        latency: result.data?.latency?.total
      });
    } else {
      logger.warn('⚠️ Chat response failed', {
        error: result.error,
        status: result.status
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('❌ Chat endpoint error', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      details: error.message
    });
  }
});

/**
 * POST /api/chat/medical-consult
 * 
 * Specialized medical consultation
 * 
 * Request:
 * {
 *   "symptoms": "Fever, cough, fatigue",
 *   "medicalHistory": { "diabetes": true, "hypertension": false },
 *   "vitals": { "temp": 38.5, "heartRate": 95 }
 * }
 */
router.post('/medical-consult', verifyAuth, async (req, res) => {
  try {
    const { symptoms, medicalHistory, vitals } = req.body;

    if (!symptoms) {
      return res.status(400).json({ error: 'Symptoms are required' });
    }

    logger.info('🏥 Medical consultation request', {
      userId: req.user.id,
      symptoms: symptoms.substring(0, 100)
    });

    // Execute medical consultation through SIB
    const result = await req.sib.medicalConsult(
      symptoms,
      medicalHistory || {},
      req.user.id,
      req.user.patientId,
      {
        vitals,
        includeRisk: true,
        includeRetrieval: true
      }
    );

    res.json(result);
  } catch (error) {
    logger.error('❌ Medical consultation error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to process medical consultation',
      details: error.message
    });
  }
});

/**
 * GET /api/chat/history
 * 
 * Retrieve chat history for current user/patient
 * 
 * Note: This is a READ operation, does NOT go through task router
 * Direct database query is fine for reads
 */
router.get('/history', verifyAuth, async (req, res) => {
  try {
    const { limit = 20, offset = 0, sessionId } = req.query;

    logger.info('📜 Fetching chat history', {
      userId: req.user.id,
      limit,
      offset
    });

    // Note: This is a READ operation - can query database directly
    // The SIB task router is for write/processing operations
    
    // TODO: Implement based on existing chat history repository
    // const history = await chatRepository.getHistory(
    //   req.user.patientId,
    //   { limit: parseInt(limit), offset: parseInt(offset), sessionId }
    // );

    res.json({
      success: true,
      data: {
        messages: [],  // TODO: Fetch from DB
        total: 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error('❌ Chat history error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chat history',
      details: error.message
    });
  }
});

/**
 * POST /api/chat/risk-assessment
 * 
 * Get risk assessment based on conversation
 * 
 * Request:
 * {
 *   "symptoms": "Chest pain, shortness of breath",
 *   "medicalHistory": { "hypertension": true },
 *   "vitals": { "bloodPressure": "160/100" }
 * }
 */
router.post('/risk-assessment', verifyAuth, async (req, res) => {
  try {
    const { symptoms, medicalHistory, vitals } = req.body;

    logger.info('⚠️ Risk assessment request', {
      userId: req.user.id,
      symptoms: symptoms?.substring(0, 100)
    });

    // Build patient data for assessment
    const patientData = {
      symptoms: symptoms || '',
      medical_history: medicalHistory || {},
      vitals: vitals || {},
      demographics: {
        age: req.user.age,
        gender: req.user.gender
      }
    };

    // Execute risk assessment through SIB Bayesian Network
    const result = await req.sib.assessRisk(
      patientData,
      req.user.patientId,
      req.user.id
    );

    res.json(result);
  } catch (error) {
    logger.error('❌ Risk assessment error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to assess risk',
      details: error.message
    });
  }
});

/**
 * POST /api/chat/emergency-check
 * 
 * Emergency detection from message
 * 
 * This is critical - checks for emergency conditions automatically
 * 
 * Request:
 * {
 *   "message": "I can't breathe and my chest hurts"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "is_emergency": true,
 *     "alerts": ["Severe chest pain", "Respiratory distress"]
 *   }
 * }
 */
router.post('/emergency-check', verifyAuth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info('🚨 Emergency check requested', {
      userId: req.user.id,
      messageLength: message.length
    });

    // Execute emergency detection through SIB
    const result = await req.sib.detectEmergency(
      message,
      req.user.patientId,
      req.user.id
    );

    // If emergency detected, log it prominently
    if (result.success && result.data?.is_emergency) {
      logger.error('🚨 EMERGENCY DETECTED', {
        userId: req.user.id,
        alerts: result.data.alerts,
        timestamp: new Date().toISOString()
      });

      // TODO: Send emergency notification to doctors/hospital
      // await emergencyNotificationService.sendAlert({
      //   patientId: req.user.patientId,
      //   message,
      //   alerts: result.data.alerts
      // });
    }

    res.json(result);
  } catch (error) {
    logger.error('❌ Emergency check error', { error: error.message });
    
    // Even on error, treat as potential emergency
    res.status(500).json({
      success: false,
      error: 'Failed to check for emergency',
      details: error.message,
      warning: 'Could not verify if this is an emergency. Please call emergency services if experiencing severe symptoms.'
    });
  }
});

/**
 * DELETE /api/chat/session/:sessionId
 * 
 * Archive a chat session
 */
router.delete('/session/:sessionId', verifyAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info('📁 Archiving chat session', {
      sessionId,
      userId: req.user.id
    });

    // TODO: Implement session archival
    // Could be a task: 'archive_session'

    res.json({
      success: true,
      message: 'Session archived'
    });
  } catch (error) {
    logger.error('❌ Session archival error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to archive session',
      details: error.message
    });
  }
});

export default router;

/**
 * MIGRATION CHECKLIST:
 * 
 * ✅ Chat endpoint routes through SIB task router
 * ✅ Medical consultation uses SIB with medical history
 * ✅ Risk assessment uses Bayesian Network
 * ✅ Emergency detection automatic
 * ✅ All operations logged
 * ✅ User context passed to SIB
 * ✅ Error handling includes fallbacks
 * 
 * TODO: Implement remaining endpoints:
 * - [ ] History endpoint (read from PostgreSQL)
 * - [ ] Session archival
 * - [ ] User preferences
 * - [ ] Follow-up reminders
 */
