/**
 * Module Copilot API — unified copilot for every hospital module
 * POST /api/v3/module-copilot/chat
 * GET  /api/v3/module-copilot/modules
 */
import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { hospitalContextFromToken } from '../middleware/hospitalContext.middleware.js';
import moduleCopilot from '../services/module-copilot.service.js';

const router = express.Router();

router.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && (req.path.startsWith('/chat') || req.path === '/modules')) {
    return hospitalContextFromToken(req, res, next);
  }
  return authUser(req, res, next);
});

router.get('/modules', (_req, res) => {
  res.json({ success: true, modules: moduleCopilot.listModules() });
});

router.post('/chat', async (req, res) => {
  try {
    const { moduleId, message, context, conversationHistory } = req.body;
    if (!moduleId) return res.status(400).json({ success: false, message: 'moduleId required' });
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'message required' });

    const result = await moduleCopilot.chat({
      moduleId,
      message: message.trim(),
      context: context || {},
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      req,
    });

    res.json({
      success: true,
      response: result.response,
      agentsUsed: result.agentsUsed,
      moduleId: result.moduleId,
      copilotLabel: result.copilotLabel,
      samd: result.samd,
      meta: { latencyMs: result.latencyMs, totalTokens: result.totalTokens },
    });
  } catch (e) {
    console.error('[module-copilot]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
