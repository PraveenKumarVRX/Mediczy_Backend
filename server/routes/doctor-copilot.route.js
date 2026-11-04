import pool from '../db/pgPool.js';
import { canAccessPatient } from '../services/patient-access.service.js';
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
import qualityGates from '../services/ai-quality-gates.service.js';

const router = express.Router();
const requireDoctor = requireRole(['doctor', 'admin', 'assistant', 'nurse', 'team','medical_director']);
// Roles allowed to reach the clinical-decision-support path specifically.
// requireDoctor above gates the gateway itself (administrative + clinical
// callers both authenticate here); this second, narrower check decides
// which of those callers may be routed to /medical-ai/consult's clinical
// mode rather than the administrative /voice-assistant/agent path.
const CLINICAL_ROLES = ['doctor','medical_director'];

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
  req.chatTraceId=traceId;
  const text = String(req.body?.message || req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, error: 'message or text is required', traceId });
  }

  let mode = classifyDoctorCopilotPath(text, req.body?.mode || 'auto');
  // Keyword classification alone must never grant clinical-path access —
  // downgrade to the administrative path for any caller who isn't a
  // clinical role, regardless of what the message text contains.
  if (mode === 'clinical' && !CLINICAL_ROLES.includes(req.user?.role)) {
    mode = 'agent';
  }
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
      const selected=context.currentPatient;
      let patientUid=context.patientUid || selected?.unique_id || selected?.uniqueId || selected?.uid;
      if (!patientUid && selected?.id) {
        // Private compatibility adapter: this chart path historically uses users.id.
        if (!(await canAccessPatient(req,selected.id))) return res.status(403).json({error:'Patient access denied',traceId});
        const {rows}=await pool.query('SELECT unique_id FROM users WHERE id=$1',[selected.id]);
        patientUid=rows[0]?.unique_id;
        if(!patientUid) return res.status(503).json({error:'Registered chart identity unavailable',traceId});
      }
      qualityGates.logCopilotConversation({
        patientId: patientUid || null,
        userId: req.user?.id,
        role: req.user?.role,
        source: 'doctor-copilot/chat',
        traceId,
      }).catch(() => {}); // audit logging must never block the clinical workflow
      await delegateToRouter(medicalAIRouter, '/consult', req, res, {
        query: text,
        sessionId:/^chat_[a-f0-9]{32}$/.test(req.body?.sessionId||'') ? req.body.sessionId : undefined,
        language: req.body?.language || 'en',
        userContext: {
          ...(patientUid ? {patientUid} : {}),
          channel:'doctor_copilot',
        },
      });
      return;
    }

    await delegateToRouter(voiceAssistantRouter, '/agent', req, res, {
      text,
      history,
      context,
      language: req.body?.language || 'en',
      pendingAction: req.body?.pendingAction || null,
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
