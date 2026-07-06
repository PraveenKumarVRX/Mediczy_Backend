/**
 * Unified Doctor Copilot Gateway (AI-PLATFORM-001)
 * POST /api/doctor-copilot/chat — single doctor AI entry with enriched context
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import voiceAssistantRouter from './voice-assistant.route.js';
import medicalAIRouter from './medical-ai.route.js';
import {
  buildCopilotSessionId,
  enrichDoctorCopilotContext,
  normalizeCopilotHistory,
  classifyDoctorCopilotPath,
  createTraceId,
  delegateToRouter,
  getCopilotMeta,
} from '../services/doctor-copilot.service.js';

const router = express.Router();
const requireDoctor = requireRole(['doctor', 'admin', 'assistant', 'nurse', 'team']);

router.get('/health', authUser, requireDoctor, (_req, res) => {
  res.json({
    success: true,
    service: 'doctor-copilot',
    initiative: 'AI-PLATFORM-001',
    endpoints: {
      chat: 'POST /api/doctor-copilot/chat',
      layerMap: 'GET /api/doctor-copilot/layer-map',
    },
  });
});

router.get('/layer-map', authUser, requireDoctor, async (_req, res) => {
  const { getAiLayerMapSummary } = await import('../services/ai-layer-map.service.js');
  res.json({ success: true, data: getAiLayerMapSummary() });
});

router.post('/chat', authUser, requireDoctor, async (req, res) => {
  const traceId = createTraceId();
  const text = String(req.body?.message || req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, error: 'message or text is required', traceId });
  }

  const mode = classifyDoctorCopilotPath(text, req.body?.mode || 'auto');
  const history = normalizeCopilotHistory(req.body?.history);
  const context = enrichDoctorCopilotContext(req.user, req.body?.context || {});
  const sessionId = buildCopilotSessionId(req.user.id, req.body?.sessionId);

  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson({
    ...payload,
    traceId,
    ...getCopilotMeta(mode),
  });

  try {
    if (mode === 'clinical') {
      await delegateToRouter(medicalAIRouter, '/consult', req, res, {
        query: text,
        sessionId,
        language: req.body?.language || 'en',
        userContext: {
          ...context,
          conversationHistory: history,
          sessionId,
        },
      });
      return;
    }

    await delegateToRouter(voiceAssistantRouter, '/agent', req, res, {
      text,
      history,
      context,
    });
  } catch (error) {
    console.error('[DoctorCopilot] gateway error', { traceId, error: error.message });
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Doctor copilot temporarily unavailable',
        traceId,
        ...getCopilotMeta(mode),
      });
    }
  }
});

export default router;
