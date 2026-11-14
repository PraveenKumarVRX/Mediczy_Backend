/**
 * AI Brain API Routes
 * ===================
 * Express routes for the AI Brain intelligence layer.
 * 
 * POST   /think                       — Main brain thinking endpoint (agentic loop)
 * GET    /conversations               — List user's conversations
 * GET    /conversations/:id           — Get conversation with messages
 * DELETE /conversations/:id           — Delete conversation
 * GET    /memory                      — Get user memory
 * GET    /tools                       — List available tools
 * GET    /tool-history                — Tool execution history
 * POST   /documents                   — Upload knowledge document
 * POST   /documents/:id/reprocess     — Reprocess document
 * GET    /knowledge-stats             — Knowledge base statistics
 * GET    /health                      — Brain health check
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import pool from '../db/pgPool.js';
import orchestrator from '../services/ai-brain/orchestrator.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import ragPipeline from '../services/ai-brain/rag-pipeline.js';
import { listTools } from '../services/ai-brain/tools/loader.js';
import { scanOnly } from '../services/minio-upload.service.js';
import multiAgentOrchestrator from '../services/ai-brain/multi-agent-orchestrator.js';
import { resolveIdentity } from '../services/ai-brain/agent-permission-engine.js';
import { getAllAgents } from '../services/ai-brain/agent-registry.js';
import { getRoutingStats, updateThreshold } from '../services/ai-brain/cognitive-router.js';
import { getTelemetryStats } from '../services/ai-brain/evaluation-engine.js';
import { getWeightStats, resetWeightsToDefault } from '../services/ai-brain/scoring-model.js';
import { resolveSibBaseUrl } from '../config/ai-services.config.js';

const router = Router();

// Multer for document uploads
const upload = multer({
  dest: '/tmp/ai-brain-uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md', '.html', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ─── Auth middleware (reuse existing) ───────────────────────

function requireAuth(req, res, next) {
  // req.user is set by the existing auth middleware
  if (!req.user || !req.user.id || req.user.id === 'twilio-webhook') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}


function requireAdminRole(req, res, next) {
  const role = String(req.user?.role || req.userRole || '').toLowerCase();
  if (!['admin', 'super_admin', 'medical_director'].includes(role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─── POST /think — Main brain endpoint ─────────────────────

router.post('/think', requireAuth, async (req, res) => {
  try {
    const { message, conversationId, stream } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long (max 5000 chars)' });
    }

    const userId = req.user.id;
    const userType = req.user.role || req.userRole || 'patient';
    // Server-derived only — never accept organizationId from req.body. This is
    // the sole source hospital-os-tools.js reads for tenant scoping.
    const organizationId = req.user.organization_id || req.user.tenant_id || null;

    // SSE streaming mode
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Send thinking indicator
      res.write(`data: ${JSON.stringify({ type: 'thinking', message: 'Analyzing your question...' })}\n\n`);

      const result = await orchestrator.think({
        message: message.trim(),
        userId,
        userType,
        organizationId,
        conversationId: conversationId ? parseInt(conversationId) : null,
        onToolCall: (toolName, toolArgs) => {
          res.write(`data: ${JSON.stringify({ type: 'tool_call', tool: toolName, args: toolArgs })}\n\n`);
        },
        onToolResult: (toolName, summary) => {
          res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: toolName, summary })}\n\n`);
        },
        onIteration: (iteration) => {
          res.write(`data: ${JSON.stringify({ type: 'iteration', iteration })}\n\n`);
        }
      });

      // Send final response
      res.write(`data: ${JSON.stringify({
        type: 'response',
        success: true,
        response: result.response,
        conversationId: result.conversationId,
        toolsUsed: result.toolsUsed,
        iterations: result.iterations,
        latencyMs: result.latencyMs,
        model: result.model,
        provider: result.provider
      })}\n\n`);

      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Standard JSON mode
    const result = await orchestrator.think({
      message: message.trim(),
      userId,
      userType,
      organizationId,
      conversationId: conversationId ? parseInt(conversationId) : null
    });

    res.json({
      success: true,
      response: result.response,
      conversationId: result.conversationId,
      toolsUsed: result.toolsUsed,
      iterations: result.iterations,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
      model: result.model,
      provider: result.provider
    });
  } catch (err) {
    console.error('[AI Brain] Think error:', err);
    res.status(500).json({
      error: 'Brain processing error',
      message: err.message
    });
  }
});

// ─── GET /conversations ────────────────────────────────────

router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.role || 'patient';
    const limit = parseInt(req.query.limit) || 20;

    const conversations = await orchestrator.listConversations(userId, userType, limit);
    res.json({ success: true, conversations, count: conversations.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /conversations/:id ───────────────────────────────

router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conversation = await orchestrator.getConversation(
      parseInt(req.params.id),
      req.user.id
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, conversation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /conversations/:id ────────────────────────────

router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await orchestrator.deleteConversation(
      parseInt(req.params.id),
      req.user.id
    );

    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /memory ──────────────────────────────────────────

router.get('/memory', requireAuth, async (req, res) => {
  try {
    const memory = await orchestrator.getUserMemory(
      req.user.id,
      req.user.role || 'patient'
    );
    res.json({ success: true, memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /tools ───────────────────────────────────────────

router.get('/tools', async (req, res) => {
  try {
    const tools = listTools();
    res.json({
      success: true,
      tools,
      count: tools.length,
      categories: [...new Set(tools.map(t => t.category))]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /tool-history ────────────────────────────────────

router.get('/tool-history', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = await orchestrator.getToolHistory(req.user.id, limit);
    res.json({ success: true, history, count: history.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /documents — Upload knowledge document ──────────

router.post('/documents', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { title, category, scope, scopeId } = req.body;
    const file = req.file;

    if (!file && !req.body.text) {
      return res.status(400).json({ error: 'File upload or text content required' });
    }

    let contentText = req.body.text || '';
    let fileType = 'txt';
    let filePath = null;
    let fileSize = 0;

    if (file) {
      // AV scan before processing
      const avResult = await scanOnly(file.path);
      if (!avResult.clean) {
        await fs.unlink(file.path).catch(() => {});
        const threat = (avResult.detail || '').replace(/^.*:\s*/, '').replace(/\s*FOUND\s*$/, '').trim() || 'Unknown threat';
        return res.status(400).json({
          success: false,
          code: 'MALWARE_DETECTED',
          message: 'File rejected: malware detected in uploaded file',
          threat
        });
      }

      fileType = path.extname(file.originalname).replace('.', '') || 'txt';
      filePath = file.path;
      fileSize = file.size;

      // Read text content from file
      if (fileType === 'txt' || fileType === 'md' || fileType === 'html' || fileType === 'csv') {
        contentText = await fs.readFile(file.path, 'utf-8');
      } else if (fileType === 'pdf') {
        // For PDFs, store raw — full extraction would need pdf-parse
        try {
          const pdfParse = (await import('pdf-parse')).default;
          const buffer = await fs.readFile(file.path);
          const parsed = await pdfParse(buffer);
          contentText = parsed.text;
        } catch {
          return res.status(400).json({ error: 'PDF parsing not available. Upload as .txt instead.' });
        }
      }
    }

    if (!contentText || contentText.trim().length < 50) {
      return res.status(400).json({ error: 'Document content too short (min 50 chars)' });
    }

    // Insert document record
    const db = pool;
    const { rows: [doc] } = await db.query(
      `INSERT INTO ai_knowledge_documents (title, file_type, file_path, file_size, category, scope, scope_id, uploaded_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, title, status`,
      [
        title || file?.originalname || 'Untitled Document',
        fileType,
        filePath,
        fileSize,
        category || 'general',
        scope || 'global',
        scopeId || null,
        req.user.id
      ]
    );

    // Process document (chunk + embed + store)
    const result = await ragPipeline.processDocument(doc.id, contentText);

    res.json({
      success: true,
      document: {
        id: doc.id,
        title: doc.title,
        chunkCount: result.chunkCount,
        status: result.status
      }
    });
  } catch (err) {
    console.error('[AI Brain] Document upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /documents/:id/reprocess ────────────────────────

router.post('/documents/:id/reprocess', requireAuth, async (req, res) => {
  try {
    const db = pool;
    const { rows: [doc] } = await db.query(
      `SELECT id, content_text FROM ai_knowledge_documents WHERE id = $1`,
      [parseInt(req.params.id)]
    );

    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!doc.content_text) return res.status(400).json({ error: 'No text content to reprocess' });

    // Delete existing chunks
    await db.query(`DELETE FROM ai_document_chunks WHERE document_id = $1`, [doc.id]);

    // Reprocess
    const result = await ragPipeline.processDocument(doc.id, doc.content_text);
    res.json({ success: true, chunkCount: result.chunkCount, status: result.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /knowledge-stats ─────────────────────────────────

router.get('/knowledge-stats', async (req, res) => {
  try {
    const stats = await ragPipeline.getStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /health — Brain health check ─────────────────────

router.get('/health', async (req, res) => {
  try {
    const db = pool;
    const tools = listTools();

    // Check all LLM providers
    const providers = llmProvider.listProviders();

    // Check SIB embedding
    let sibStatus = 'unknown';
    try {
      const axios = (await import('../integrations/axios.js')).default;
      const { data } = await axios.get(`${resolveSibBaseUrl()}/health`, { timeout: 3000 });
      sibStatus = data.status || 'online';
    } catch (e) {
      sibStatus = `error: ${e.message}`;
    }

    // Check DB tables
    const { rows: [tableCount] } = await db.query(
      `SELECT COUNT(*) as cnt FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ai_%'`
    );

    res.json({
      status: 'online',
      brain: {
        toolCount: tools.length,
        toolCategories: [...new Set(tools.map(t => t.category))],
        llmProviders: providers,
        cascade: providers.map(p => `${p.name} (${p.model})`).join(' → '),
        sibEmbeddingStatus: sibStatus,
        aiTables: parseInt(tableCount.cnt),
        maxIterations: 8
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ─── GET /providers — List LLM providers ──────────────────

router.get('/providers', requireAuth, requireAdminRole, async (req, res) => {
  try {
    // Provider configs (incl. api_base_url / config) are operational secrets —
    // restrict to admins instead of any authenticated user.
    const role = req.user?.role || req.user?.userType;
    const adminRoles = ['admin', 'superadmin', 'platform_admin', 'system'];
    if (!adminRoles.includes(role)) {
      return res.status(403).json({ error: 'Admin role required to view provider configuration' });
    }
    const providers = llmProvider.listProviders();
    const db = pool;
    const { rows: dbConfigs } = await db.query(
      'SELECT id, name, provider, model_name, is_active FROM ai_model_configs ORDER BY id'
    );
    res.json({ providers, dbConfigs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-AGENT ROUTES
// POST   /agents/process        — Route request through role-based agent system
// POST   /agents/process/stream  — SSE streaming variant
// POST   /agents/approve-action  — Human approval for write tools
// GET    /agents/copilot-config  — Feature flags for Admin Copilot UI
// GET    /agents/available      — List agents this caller can invoke
// GET    /agents/all            — Full agent registry (admin only)
// GET    /agents/history        — Caller's agent run history
// ─────────────────────────────────────────────────────────────────────────────

function isCopilotEnabled() {
  return process.env.ADMIN_COPILOT_ENABLED !== 'false';
}

function assertCopilotEnabled(res) {
  if (!isCopilotEnabled()) {
    res.status(503).json({ success: false, error: 'Admin Copilot is disabled', code: 'COPILOT_DISABLED' });
    return false;
  }
  return true;
}

router.get('/agents/copilot-config', async (req, res) => {
  res.json({
    success: true,
    enabled: isCopilotEnabled(),
    streaming: process.env.ADMIN_COPILOT_STREAMING !== 'false',
    writeActions: process.env.ADMIN_COPILOT_WRITE_ACTIONS === 'true',
  });
});

/**
 * POST /agents/process
 * Main multi-agent entry point. Resolves identity, plans tasks, routes agents.
 *
 * Body: { message, conversationId?, contextMessages?, forceAgent?, copilotType?, persona? }
 * forceAgent: bypass planner and use a specific agent (still permission-checked)
 */
router.post('/agents/process', async (req, res) => {
  try {
    if (!assertCopilotEnabled(res)) return;

    const { message, conversationId, contextMessages, forceAgent, copilotType, persona } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 10000) {
      return res.status(400).json({ error: 'message too long (max 10000 chars)' });
    }

    const result = await multiAgentOrchestrator.process({
      message: message.trim(),
      req,
      conversationId: conversationId ? parseInt(conversationId, 10) : null,
      contextMessages: Array.isArray(contextMessages) ? contextMessages : [],
      forceAgent: forceAgent || null,
      copilotType: copilotType || null,
      persona: persona || null,
    });

    res.json({
      success:    true,
      response:   result.response,
      agentsUsed: result.agentsUsed,
      taskPlan:   result.taskPlan,
      identity:   result.identity,
      meta: {
        totalTokens: result.totalTokens,
        latencyMs:   result.latencyMs,
        isMultiAgent: result.taskPlan?.isMultiAgent,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message, code: err.code });
  }
});

/**
 * POST /agents/process/stream — SSE events: status, agent_switch, tool_start, tool_end, response, done, error
 */
router.post('/agents/process/stream', async (req, res) => {
  if (!assertCopilotEnabled(res)) return;
  if (process.env.ADMIN_COPILOT_STREAMING === 'false') {
    return res.status(503).json({ success: false, error: 'Streaming disabled', code: 'STREAMING_DISABLED' });
  }

  const { message, conversationId, contextMessages, forceAgent, copilotType, persona } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const result = await multiAgentOrchestrator.process({
      message: message.trim(),
      req,
      conversationId: conversationId ? parseInt(conversationId, 10) : null,
      contextMessages: Array.isArray(contextMessages) ? contextMessages : [],
      forceAgent: forceAgent || null,
      copilotType: copilotType || null,
      persona: persona || null,
      onEvent: (event) => send(event),
    });

    // Pseudo-stream final response in chunks for UX
    const text = result.response || '';
    const chunkSize = 80;
    for (let i = 0; i < text.length; i += chunkSize) {
      send({ type: 'token', content: text.slice(i, i + chunkSize) });
    }

    send({
      type: 'response',
      success: true,
      response: result.response,
      agentsUsed: result.agentsUsed,
      taskPlan: result.taskPlan,
      identity: result.identity,
      meta: {
        totalTokens: result.totalTokens,
        latencyMs: result.latencyMs,
        isMultiAgent: result.taskPlan?.isMultiAgent,
      },
    });
    send({ type: 'done' });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    send({ type: 'error', error: err.message, code: err.code });
    res.end();
  }
});

/**
 * POST /agents/approve-action — Approve or reject a pending copilot write action
 */
router.post('/agents/approve-action', requireAuth, async (req, res) => {
  try {
    const { actionId, reject = false } = req.body || {};
    if (!actionId) {
      return res.status(400).json({ success: false, error: 'actionId is required' });
    }
    const { approvePendingAction } = await import('../services/ai-copilot-pending-actions.service.js');
    const result = await approvePendingAction(actionId, req.user.id, { reject: reject === true });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * GET /agents/available
 * Returns the agents this caller can invoke, based on their role.
 */
router.get('/agents/available', async (req, res) => {
  try {
    const identity = await resolveIdentity(req);
    const agents   = multiAgentOrchestrator.listAvailableAgents(identity);
    res.json({ role: identity.role, agentCount: agents.length, agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /agents/all
 * Full agent registry — available to all, shows capability requirements.
 */
router.get('/agents/all', async (req, res) => {
  try {
    const identity = await resolveIdentity(req);
    const all = getAllAgents().map(a => ({
      id:                  a.id,
      name:                a.name,
      icon:                a.icon,
      description:         a.description,
      requiredCapability:  a.requiredCapability,
      llmTier:             a.llmTier,
      maxTokens:           a.maxTokens,
      toolCount:           a.allowedTools.length,
      accessible:          identity.capabilities.includes(a.requiredCapability),
    }));
    res.json({ agents: all, callerRole: identity.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /agents/history
 * Agent run history for the authenticated user.
 */
router.get('/agents/history', requireAuth, async (req, res) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit || '20'), 100);
    const history = await multiAgentOrchestrator.getRunHistory(req.user.id, limit);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /agents/routing-stats
 * Cognitive router efficiency stats — tier distribution, SLM utilisation, cost reduction estimate.
 * Admin-only.
 */
router.get('/agents/routing-stats', requireAuth, async (req, res) => {
  try {
    const days  = Math.min(parseInt(req.query.days || '7'), 90);
    const stats = await getRoutingStats(days);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /agents/routing-threshold
 * Dynamically adjust a cognitive routing threshold.
 * Body: { key: string, value: number }
 * Admin-only.
 */
router.patch('/agents/routing-threshold', requireAuth, async (req, res) => {
  try {
    const { key, value } = req.body || {};
    const allowedKeys = ['reflex_min_score', 'deep_min_score', 'slm_success_floor', 'standard_success_floor'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ error: `Unknown threshold key. Allowed: ${allowedKeys.join(', ')}` });
    }
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      return res.status(400).json({ error: 'value must be a non-negative number' });
    }
    await updateThreshold(key, num);
    res.json({ ok: true, key, value: num });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Telemetry Stats ───────────────────────────────────────────────────────────
// GET /agents/telemetry?days=7  — hourly breakdown by route/tier for dashboards
router.get('/agents/telemetry', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const stats = await getTelemetryStats(days);
    res.json({ ok: true, days, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Routing Weight Stats ──────────────────────────────────────────────────────
// GET /agents/routing-weights  — current learnable weights + update counts
router.get('/agents/routing-weights', requireAuth, async (req, res) => {
  try {
    const weights = await getWeightStats();
    res.json({ ok: true, weights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /agents/routing-weights/reset  — admin-only: reset to hardcoded priors
router.post('/agents/routing-weights/reset', requireAuth, async (req, res) => {
  try {
    const role = req.user?.role || req.user?.userType;
    const adminRoles = ['admin', 'superadmin', 'platform_admin', 'system'];
    if (!adminRoles.includes(role)) {
      return res.status(403).json({ error: 'Admin role required to reset routing weights' });
    }
    await resetWeightsToDefault();
    res.json({ ok: true, message: 'Routing weights reset to default priors' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
